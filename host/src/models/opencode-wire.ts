import type { OfferedModel } from "./catalog.js";
import type { Conversation } from "./wire.js";
import { cacheKey, geminiSchema, schemaInWords } from "./wire.js";
import type { ToolSpec } from "./model-call.js";
import { strict } from "./codex.js";

type Schema = Record<string, unknown>;

export type OpencodeApi = "chat-completions" | "messages" | "responses" | "generate-content";

export interface OpencodeRoute {
  api: OpencodeApi;
  explicitCache?: boolean;
}

/** One model entry returned by `GET https://opencode.ai/inference/go/v1/models`. */
export interface OpencodeGoModel {
  id: string;
  name?: string;
  type?: string;
  recommended_api?: string;
  api?: Record<string, unknown>;
  capabilities?: {
    reasoning?: { supported?: boolean; effort?: string[] };
    cache?: { implicit?: boolean; explicit?: { ttl?: string[] } | boolean };
  };
  cost?: { text?: { input?: { price?: number } } };
  go?: { monthly_usage?: { go?: number }; featured?: boolean };
}

/** Resolves the streaming API family for an OpenCode Go model entry from `/inference/go/v1/models`. */
export function routeOfModel(model: OpencodeGoModel): OpencodeRoute {
  const apis = Object.keys(model.api ?? {});
  const pick = (candidate: string | undefined): OpencodeApi | null => {
    if (candidate === "chat-completions" || candidate === "messages" || candidate === "responses" || candidate === "generate-content") return candidate;
    if (candidate === "interactions" && apis.includes("generate-content")) return "generate-content";
    return null;
  };
  const api = pick(model.recommended_api) ?? apis.map(pick).find((found): found is OpencodeApi => found !== null) ?? inferOpencodeApi(model.id);
  return { api, explicitCache: Boolean(model.capabilities?.cache?.explicit) };
}

/** Filters out free-only/non-chat models from `/inference/go/v1/models`, sorting featured and higher-allowance models first. */
export function opencodeGoModels(listed: readonly OpencodeGoModel[]): OfferedModel[] {
  return listed
    .filter(model => {
      if (model.type && model.type !== "chat") return false;
      if (model.id.endsWith("-free")) return false;
      return (model.go?.monthly_usage?.go ?? 0) > 0 && (model.cost?.text?.input?.price ?? 0) > 0;
    })
    .sort((left, right) => {
      const feat = Number(Boolean(right.go?.featured)) - Number(Boolean(left.go?.featured));
      return feat !== 0 ? feat : (right.go?.monthly_usage?.go ?? 0) - (left.go?.monthly_usage?.go ?? 0);
    })
    .map(model => {
      const efforts = (model.capabilities?.reasoning?.effort ?? []).filter(effort => effort !== "none" && effort !== "minimal");
      const defaultEffort = efforts.includes("medium") ? "medium" : efforts.includes("high") ? "high" : efforts[0] ?? null;
      return { id: model.id, aliases: [], name: model.name?.trim() || model.id, efforts, defaultEffort };
    });
}

const EPHEMERAL = { type: "ephemeral" } as const;

/** Models on chat-completions whose upstream rejects explicit `cache_control` blocks (they use implicit prefix caching). */
const IMPLICIT_ONLY_CHAT = /^(glm|zhipu|kimi-k3)/i;

/** Splits a layered Story system prompt at `\n</people>` into `[Story Bible, jobSuffix]` for cross-agent KV caching. */
export function splitStorySystem(system: string): string[] {
  const marker = "\n</people>";
  const at = system.indexOf(marker);
  if (at >= 0) {
    const split = at + marker.length;
    const bible = system.slice(0, split);
    const tail = system.slice(split).trim();
    if (tail) return [bible, tail];
  }
  return [system];
}

/** Fallback API inference from model ID when `/inference/go/v1/models` metadata hasn't been fetched yet. */
export function inferOpencodeApi(modelId: string): OpencodeApi {
  const id = modelId.toLowerCase();
  if (id.startsWith("claude-") || id.startsWith("qwen") || id === "minimax-m3") return "messages";
  if (id.startsWith("gemini-")) return "generate-content";
  if (id.startsWith("gpt-") || id.startsWith("grok-") || id.startsWith("muse-")) return "responses";
  return "chat-completions";
}

function parameters(spec: ToolSpec): Schema {
  return {
    type: "object",
    properties: Object.fromEntries(Object.entries(spec.params).map(([name, param]) => [name, { type: param.type, description: param.description }])),
    required: Object.entries(spec.params).filter(([, param]) => !param.optional).map(([name]) => name)
  };
}

/** OpenAI Responses body (`grok-4.7`, `gpt-*-luna`, `muse-spark-*`): split `developer` messages + `prompt_cache_key`. */
export function opencodeResponsesBody(conversation: Conversation, model: string, tools: { story: ToolSpec[] }, schemaInText = false): Schema {
  const asked = conversation.schema && schemaInText ? schemaInWords(conversation.schema) : null;
  const toolList = tools.story.map(spec => ({
    type: "function",
    name: spec.name,
    description: spec.description,
    strict: false,
    parameters: { ...parameters(spec), additionalProperties: false }
  }));
  const text: Schema = {};
  if (conversation.schema && !schemaInText) {
    text.format = { type: "json_schema", name: "answer", strict: true, schema: strict(conversation.schema as never) };
  }
  return {
    model,
    instructions: "",
    input: [
      ...splitStorySystem(conversation.system).map(part => ({
        type: "message",
        role: "developer",
        content: [{ type: "input_text", text: part }]
      })),
      ...conversation.turns.map((turn, index) => ({
        type: "message",
        role: turn.role,
        content: [{
          type: turn.role === "user" ? "input_text" : "output_text",
          text: asked && index === conversation.turns.length - 1 ? `${turn.text}\n\n${asked}` : turn.text
        }]
      }))
    ],
    stream: true,
    store: false,
    parallel_tool_calls: false,
    prompt_cache_key: cacheKey(model, conversation.system, conversation.cacheScope),
    ...(conversation.effort ? { reasoning: { effort: conversation.effort } } : {}),
    ...(toolList.length ? { tools: toolList, tool_choice: "auto" } : {}),
    ...(Object.keys(text).length ? { text } : {})
  };
}

/**
 * OpenAI Chat Completions body (`glm-5.3`, `deepseek-v4*`, `kimi-k3*`, `mimo-v2.6*`, `minimax-m3.1-flash`, `hy4`, `step-5`, `longcat-2.5`).
 * Keeps system split at `</people>` and history strictly append-only; stamps `cache_control` breakpoints only on models
 * that accept explicit cache markers (skipping `glm*` / `kimi-k3*` which rely on implicit prefix caching + session stickiness).
 */
export function opencodeChatBody(
  conversation: Conversation,
  model: string,
  tools: { story: ToolSpec[] },
  schemaInText = false,
  explicitCache = false
): Schema {
  const stamp = explicitCache && !IMPLICIT_ONLY_CHAT.test(model);
  const asked = conversation.schema && schemaInText ? schemaInWords(conversation.schema) : null;
  const sysParts = splitStorySystem(conversation.system);
  const prefixTurn = conversation.turns.length >= 2 ? conversation.turns.length - 2 : -1;
  const messages: Schema[] = [
    ...sysParts.map(part => ({
      role: "system",
      content: stamp ? [{ type: "text", text: part, cache_control: EPHEMERAL }] : part
    })),
    ...conversation.turns.map((turn, index) => {
      const content = asked && index === conversation.turns.length - 1 ? `${turn.text}\n\n${asked}` : turn.text;
      return {
        role: turn.role,
        content: stamp && index === prefixTurn ? [{ type: "text", text: content, cache_control: EPHEMERAL }] : content
      };
    })
  ];
  const toolList = tools.story.map((spec, index) => ({
    type: "function",
    function: {
      name: spec.name,
      description: spec.description,
      parameters: { ...parameters(spec), additionalProperties: false }
    },
    ...(stamp && index === tools.story.length - 1 ? { cache_control: EPHEMERAL } : {})
  }));
  return {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(conversation.effort ? { reasoning_effort: conversation.effort } : {}),
    ...(toolList.length ? { tools: toolList, tool_choice: "auto", parallel_tool_calls: false } : {}),
    ...(conversation.schema && !schemaInText
      ? { response_format: { type: "json_schema", json_schema: { name: "answer", strict: true, schema: strict(conversation.schema as never) } } }
      : {})
  };
}

/**
 * Anthropic Messages body (`claude-haiku-5-5`, `minimax-m3`, `qwen4-max`, `qwen3.8-*`, `qwen3.7-plus`).
 * Places up to 4 precision `cache_control: { type: "ephemeral" }` breakpoints:
 *   1. Story Bible (`system[0]`, shared across Composer / Chronicler / Director / Weaver)
 *   2. Job rules (`system[1]`)
 *   3. Last tool definition (`tools.at(-1)`)
 *   4. Penultimate conversation message (so every prior exchange in the Scene is 100% cached)
 */
export function opencodeMessagesBody(conversation: Conversation, model: string, tools: { story: ToolSpec[] }): Schema {
  const asked = conversation.schema ? schemaInWords(conversation.schema) : null;
  const sysParts = splitStorySystem(conversation.system);
  const system = sysParts.map(text => ({ type: "text", text, cache_control: EPHEMERAL }));
  const toolList = tools.story.map((spec, index) => ({
    name: spec.name,
    description: spec.description,
    input_schema: parameters(spec),
    ...(index === tools.story.length - 1 ? { cache_control: EPHEMERAL } : {})
  }));
  // Stamp breakpoint #4 on the completed turn immediately before the new Move (or on turn 0 when single-turn).
  const cacheTurn = conversation.turns.length >= 2 ? conversation.turns.length - 2 : 0;
  const messages = conversation.turns.map((turn, index) => {
    const text = asked && index === conversation.turns.length - 1 ? `${turn.text}\n\n${asked}` : turn.text;
    return {
      role: turn.role,
      content: index === cacheTurn ? [{ type: "text", text, cache_control: EPHEMERAL }] : text
    };
  });
  return {
    model,
    max_tokens: 16_384,
    stream: true,
    system,
    messages,
    ...(toolList.length ? { tools: toolList, tool_choice: { type: "auto", disable_parallel_tool_use: true } } : {}),
    ...(conversation.effort ? { output_config: { effort: conversation.effort } } : {})
  };
}

/**
 * Gemini native `generateContent` body (`gemini-4-argon`, 95% implicit cache-read discount).
 * Keeps `systemInstruction` split cleanly at `</people>` and `contents` strictly append-only.
 */
export function opencodeGeminiBody(conversation: Conversation, tools: { story: ToolSpec[] }, schemaInText = false): Schema {
  const asked = conversation.schema && schemaInText ? schemaInWords(conversation.schema) : null;
  const generationConfig: Schema = {};
  if (conversation.schema) {
    generationConfig.responseMimeType = "application/json";
    if (!schemaInText) generationConfig.responseSchema = geminiSchema(conversation.schema);
  }
  if (conversation.effort) {
    generationConfig.thinkingConfig = { thinkingLevel: conversation.effort.toUpperCase() };
  }
  return {
    systemInstruction: { parts: splitStorySystem(conversation.system).map(text => ({ text })) },
    contents: conversation.turns.map((turn, index) => ({
      role: turn.role === "user" ? "user" : "model",
      parts: [{ text: asked && index === conversation.turns.length - 1 ? `${turn.text}\n\n${asked}` : turn.text }]
    })),
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
    ...(tools.story.length
      ? { tools: [{ functionDeclarations: tools.story.map(spec => ({ name: spec.name, description: spec.description, parameters: parameters(spec) })) }] }
      : {})
  };
}
