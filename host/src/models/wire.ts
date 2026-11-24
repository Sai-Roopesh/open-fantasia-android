import { createHash, randomUUID } from "node:crypto";
import type { ModelRequest, ToolSpec } from "./model-call.js";
import { strict } from "./codex.js";

type Schema = Record<string, unknown>;

/**
 * One call as every provider is given it: the host's system prompt, its message, and what kind of answer it wants.
 * Every direct transport is built from this and nothing else, so what a model reads cannot depend on which tool
 * happened to carry it (docs/adr/0023).
 */
export interface Conversation {
  system: string;
  turns: { role: "user" | "assistant"; text: string }[];
  /** A JSON answer matching this schema; prose when not set. */
  schema?: Schema;
  effort?: string;
  /** Output verbosity sent to providers that support it (e.g. Codex `text.verbosity`). */
  verbosity: "low" | "medium" | "high";
  /** Optional Story scope for isolating per-Story KV-cache shards on the provider backend. */
  cacheScope?: string;
}

export function conversationOf(request: ModelRequest): Conversation {
  return {
    system: request.system,
    turns: request.conversation?.length ? request.conversation : [{ role: "user", text: request.prompt }],
    ...(request.schema ? { schema: request.schema } : {}),
    ...(request.model.effort ? { effort: request.model.effort } : {}),
    verbosity: request.verbosity ?? "medium",
    ...(request.storyId ? { cacheScope: request.storyId } : {})
  };
}

/** A stable UUID-formatted key for the system prompt (and Story shard when set), matching Codex CLI's session-id format. */
export function cacheKey(model: string, system: string, scope?: string): string {
  const hex = createHash("sha256").update(scope ? `${model}\n${scope}\n${system}` : `${model}\n${system}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The Story's tools as a function declaration's parameters. */
function parameters(spec: ToolSpec): Schema {
  return {
    type: "object",
    properties: Object.fromEntries(Object.entries(spec.params).map(([name, param]) => [name, { type: param.type, description: param.description }])),
    required: Object.entries(spec.params).filter(([, param]) => !param.optional).map(([name]) => name)
  };
}

/**
 * The body the ChatGPT Codex backend takes (`/backend-api/codex/responses`), as the Codex CLI itself sends it.
 *
 * The system prompt is placed in `input[0]` as a `developer` message with `instructions: ""` rather than top-level
 * `instructions`: empirically verified live on 25 Nov 2026 that `gpt-6.2-sol` and `gpt-6.2-astra` do not prefix-cache
 * large top-level `instructions` across multi-turn appends (dropping to ~20–29% cache hit), whereas sending the
 * system prompt as `input[0]` (`role: "developer"`) hits 92%+ KV cache on `gpt-6.2-*` and 92–98% on `gpt-6.1-sol`.
 */
export function codexBody(conversation: Conversation, model: string, tools: { story: ToolSpec[]; web: boolean }): Schema {
  const text: Schema = { verbosity: conversation.verbosity };
  if (conversation.schema) text.format = { type: "json_schema", name: "answer", strict: true, schema: strict(conversation.schema as never) };
  const toolList = [
    ...tools.story.map(spec => ({ type: "function", name: spec.name, description: spec.description, strict: false, parameters: { ...parameters(spec), additionalProperties: false } })),
    ...(tools.web ? [{ type: "web_search" }] : [])
  ];
  return {
    model,
    instructions: "",
    input: [
      { type: "message", role: "developer", content: [{ type: "input_text", text: conversation.system }] },
      ...conversation.turns.map(turn => ({
        type: "message",
        role: turn.role,
        content: [{ type: turn.role === "user" ? "input_text" : "output_text", text: turn.text }]
      }))
    ],
    stream: true,
    store: false,
    parallel_tool_calls: false,
    prompt_cache_key: cacheKey(model, conversation.system, conversation.cacheScope),
    ...(conversation.effort ? { reasoning: { effort: conversation.effort } } : {}),
    ...(toolList.length ? { tools: toolList, tool_choice: "auto", include: ["reasoning.encrypted_content"] } : {}),
    text
  };
}

/** What a model that cannot be held to a schema while it writes is asked for instead; the caller checks the answer. */
export const schemaInWords = (schema: Schema) => `Answer with one JSON object and nothing else, matching this JSON Schema:\n${JSON.stringify(schema)}`;

/**
 * The body the Antigravity gateway takes (`/v1internal:streamGenerateContent`), Gemini's own request inside it. A JSON
 * answer is held to its schema as Gemini writes; a schema the gateway finds too large to hold it to ([schemaInText])
 * is asked for in words at the end of the message instead, as `agy` always did.
 */
export function antigravityBody(conversation: Conversation, model: string, project: string, tools: { story: ToolSpec[] }, schemaInText = false): Schema {
  const generationConfig: Schema = {};
  if (conversation.schema) {
    generationConfig.responseMimeType = "application/json";
    if (!schemaInText) generationConfig.responseSchema = geminiSchema(conversation.schema);
  }
  const asked = conversation.schema && schemaInText ? schemaInWords(conversation.schema) : null;
  return {
    project,
    model,
    userAgent: "antigravity",
    requestType: "agent",
    requestId: `agent-${randomUUID()}`,
    request: {
      systemInstruction: { parts: [{ text: conversation.system }] },
      contents: conversation.turns.map((turn, index) => ({
        role: turn.role === "user" ? "user" : "model",
        parts: [{ text: asked && index === conversation.turns.length - 1 ? `${turn.text}\n\n${asked}` : turn.text }]
      })),
      ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
      ...(tools.story.length ? { tools: [{ functionDeclarations: tools.story.map(spec => ({ name: spec.name, description: spec.description, parameters: parameters(spec) })) }] } : {})
    }
  };
}

/**
 * A JSON Schema as Gemini's `responseSchema` takes it, an OpenAPI subset: a nullable type is `nullable`, and keywords
 * it rejects are dropped. Dropping a constraint only loosens what is asked for; the caller still checks the answer
 * against the full schema.
 */
export function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const source = schema as Schema;
  const out: Schema = {};
  for (const [key, value] of Object.entries(source)) {
    if (["additionalProperties", "$schema", "$id", "default", "examples", "const", "minLength", "maxLength"].includes(key)) continue;
    if (key === "type" && Array.isArray(value)) {
      const types = value.filter(type => type !== "null");
      if (types.length !== value.length) out.nullable = true;
      out.type = types[0] ?? "string";
    } else if (key === "oneOf") {
      out.anyOf = geminiSchema(value);
    } else if (key === "enum" && Array.isArray(value)) {
      const values = value.filter(item => item !== null);
      if (values.length !== value.length) out.nullable = true;
      out.enum = values;
    } else {
      out[key] = key === "properties"
        ? Object.fromEntries(Object.entries(value as Schema).map(([name, field]) => [name, geminiSchema(field)]))
        : geminiSchema(value);
    }
  }
  return out;
}
