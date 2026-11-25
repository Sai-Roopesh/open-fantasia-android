import type { OfferedModel } from "./catalog.js";
import { withoutAddedNulls } from "./codex.js";
import { opencodeApiKey, readEvents, refusal, Refused, Used } from "./direct.js";
import { NO_TOOLS, type ModelRequest, type ModelRunner, type ModelUsage, type Tools } from "./model-call.js";
import {
  inferOpencodeApi,
  opencodeChatBody,
  opencodeGeminiBody,
  opencodeGoModels,
  opencodeMessagesBody,
  opencodeResponsesBody,
  routeOfModel,
  type OpencodeGoModel,
  type OpencodeRoute
} from "./opencode-wire.js";
export { opencodeGoModels, routeOfModel, type OpencodeGoModel };
import { cacheKey, conversationOf, type Conversation } from "./wire.js";

const BASE = "https://opencode.ai/inference/go";
const MODELS_ENDPOINT = `${BASE}/v1/models`;
const USER_AGENT = "open-fantasia/1.0";

type Item = Record<string, unknown> & { type?: string };

interface OpencodeCostBlock {
  allowance?: number;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache_read?: number;
    cache_write_5m?: number;
    cache_write_1h?: number;
  };
}

interface OpencodeUsage {
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  prompt_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
  promptTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  opencode?: OpencodeCostBlock;
}

const MOST_ROUNDS = 8;
const BUSY_WAITS = [2_000, 6_000, 15_000];

/**
 * Direct OpenCode Go runner that routes every model to its native Go API family (`chat-completions`, `messages`,
 * `responses`, or `generate-content`) with optimal KV-cache prefix layout, custom `User-Agent`, and per-Story
 * `x-opencode-session` sticky routing.
 */
export class OpencodeDirectRunner implements ModelRunner {
  readonly canLookUp = { story: true, web: false };
  private readonly tooLarge = new Set<string>();
  private readonly routes = new Map<string, OpencodeRoute>();

  constructor(
    private readonly apiKey: () => string = () => opencodeApiKey(),
    private readonly post: typeof fetch = fetch,
    private readonly wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))
  ) {}

  async run(
    request: ModelRequest,
    onText: (delta: string) => void,
    signal: AbortSignal,
    tools: Tools = NO_TOOLS,
    onUsage?: (usage: ModelUsage) => void,
    onWire?: (body: unknown) => void
  ): Promise<string> {
    const key = this.apiKey();
    const route = this.routes.get(request.model.model) ?? { api: inferOpencodeApi(request.model.model) };
    const conversation = conversationOf(request);
    const session = cacheKey(request.model.model, conversation.system, conversation.cacheScope);
    const schemaKey = conversation.schema ? cacheKey(request.model.model, JSON.stringify(conversation.schema)) : null;
    const used = new Used();
    for (;;) {
      const inText = schemaKey !== null && this.tooLarge.has(schemaKey);
      try {
        const text = route.api === "messages"
          ? await this.runMessages(conversation, request.model.model, key, session, signal, tools, onText, used, onUsage, onWire)
          : route.api === "chat-completions"
            ? await this.runChat(conversation, request.model.model, key, session, signal, tools, inText, Boolean(route.explicitCache), onText, used, onUsage, onWire)
            : route.api === "generate-content"
              ? await this.runGemini(conversation, request.model.model, key, session, signal, tools, inText, onText, used, onUsage, onWire)
              : await this.runResponses(conversation, request.model.model, key, session, signal, tools, inText, onText, used, onUsage, onWire);
        const clean = conversation.schema ? unfenced(text) : text;
        const strictMode = conversation.schema && !inText && route.api !== "messages" && route.api !== "generate-content";
        return strictMode ? withoutAddedNulls(clean, conversation.schema as never) : clean;
      } catch (error) {
        if (schemaKey !== null && !inText && error instanceof Refused && error.status === 400 && /schema|response_format|text\.format|structured/i.test(error.message)) {
          this.tooLarge.add(schemaKey);
          continue;
        }
        throw error;
      }
    }
  }

  /** Lists all paid/Go chat models available on the caller's OpenCode Go workspace and records their native API routes. */
  async listModels(signal?: AbortSignal): Promise<OfferedModel[]> {
    const key = this.apiKey();
    const response = await this.post(MODELS_ENDPOINT, {
      method: "GET",
      ...(signal ? { signal } : {}),
      headers: { Authorization: `Bearer ${key}`, "User-Agent": USER_AGENT }
    });
    if (!response.ok) throw await refusal("OpenCode Go", response);
    const data = await response.json() as { data?: OpencodeGoModel[] };
    const entries = data.data ?? [];
    for (const entry of entries) this.routes.set(entry.id, routeOfModel(entry));
    const listed = opencodeGoModels(entries);
    if (listed.length === 0) throw new Error("OpenCode Go returned no models");
    return listed;
  }

  private recordUsage(used: Used, usage: OpencodeUsage | null, onUsage?: (usage: ModelUsage) => void): void {
    if (!usage) return;
    const counts = usageCounts(usage);
    const total = used.add(counts.input, counts.cached, counts.output, counts.reasoning);
    const allowance = usage.opencode?.allowance;
    onUsage?.(typeof allowance === "number" ? { ...total, allowance } : total);
  }

  private async openStream(url: string, body: unknown, key: string, session: string, signal: AbortSignal, extraHeaders: Record<string, string> = {}): Promise<Response> {
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      response = await this.post(url, {
        method: "POST", signal, body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream",
          "User-Agent": USER_AGENT, "x-opencode-session": `ses_${session}`, "session-id": session, ...extraHeaders
        }
      });
      if ((response.status !== 503 && response.status !== 429) || attempt >= BUSY_WAITS.length) break;
      await this.wait(BUSY_WAITS[attempt] ?? 0);
      if (signal.aborted) throw new Error("OpenCode Go: stopped");
    }
    if (!response.ok) throw await refusal("OpenCode Go", response);
    return response;
  }

  private async runResponses(
    conversation: Conversation, model: string, key: string, session: string, signal: AbortSignal,
    tools: Tools, inText: boolean, onText: (delta: string) => void, used: Used,
    onUsage?: (usage: ModelUsage) => void, onWire?: (body: unknown) => void
  ): Promise<string> {
    const body = opencodeResponsesBody(conversation, model, tools, inText);
    const input = [...(body.input as Item[])];
    for (let round = 0; ; round++) {
      const sent = { ...body, input };
      onWire?.(sent);
      const response = await this.openStream(`${BASE}/openai/v1/responses`, sent, key, session, signal);
      const items: Item[] = [];
      let streamed = "", usage: OpencodeUsage | null = null, failed: string | null = null;
      await readEvents(response, event => {
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") { streamed += event.delta; onText(event.delta); }
        else if (event.type === "response.output_item.done" && event.item && typeof event.item === "object") items.push(event.item as Item);
        else if (event.type === "response.completed" || event.type === "response.incomplete") {
          const done = event.response as { usage?: OpencodeUsage; incomplete_details?: { reason?: string } } | undefined;
          usage = done?.usage ?? usage;
          if (event.type === "response.incomplete") failed = `the answer stopped early (${done?.incomplete_details?.reason ?? "incomplete"})`;
        } else if (event.type === "response.failed" || event.type === "error") {
          const error = (event.response as { error?: { message?: string } } | undefined)?.error ?? (event as { message?: string });
          failed = error.message ?? "the call failed";
        }
      });
      if (failed) throw new Error(`OpenCode Go: ${failed}`);
      this.recordUsage(used, usage, onUsage);
      const calls = items.filter(item => item.type === "function_call");
      if (calls.length === 0 || round >= MOST_ROUNDS) {
        const said = items.filter(item => item.type === "message")
          .flatMap(item => (item.content as { type?: string; text?: string }[] | undefined) ?? [])
          .filter(part => part.type === "output_text").map(part => part.text ?? "").join("");
        return said || streamed;
      }
      input.push(...items.filter(item => item.type !== "message").map(({ id: _id, ...rest }) => rest));
      for (const call of calls) input.push({ type: "function_call_output", call_id: call.call_id, output: tools.use(String(call.name), parseArgs(call.arguments)) });
    }
  }

  private async runChat(
    conversation: Conversation, model: string, key: string, session: string, signal: AbortSignal,
    tools: Tools, inText: boolean, explicitCache: boolean, onText: (delta: string) => void, used: Used,
    onUsage?: (usage: ModelUsage) => void, onWire?: (body: unknown) => void
  ): Promise<string> {
    const body = opencodeChatBody(conversation, model, tools, inText, explicitCache);
    const messages = [...(body.messages as Item[])];
    for (let round = 0; ; round++) {
      const sent = { ...body, messages };
      onWire?.(sent);
      const response = await this.openStream(`${BASE}/openai/v1/chat/completions`, sent, key, session, signal);
      let streamed = "", usage: OpencodeUsage | null = null;
      const calls = new Map<number, { id: string; name: string; arguments: string }>();
      await readEvents(response, event => {
        if (event.usage && typeof event.usage === "object") usage = event.usage as OpencodeUsage;
        const delta = (event.choices as { delta?: Record<string, unknown> }[] | undefined)?.[0]?.delta;
        if (!delta) return;
        if (typeof delta.content === "string" && delta.content) { streamed += delta.content; onText(delta.content); }
        for (const piece of (delta.tool_calls as { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] | undefined) ?? []) {
          const idx = piece.index ?? 0;
          const entry = calls.get(idx) ?? { id: "", name: "", arguments: "" };
          if (piece.id) entry.id = piece.id;
          if (piece.function?.name) entry.name += piece.function.name;
          if (piece.function?.arguments) entry.arguments += piece.function.arguments;
          calls.set(idx, entry);
        }
      });
      this.recordUsage(used, usage, onUsage);
      const list = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, call]) => call).filter(call => call.name);
      if (list.length === 0 || round >= MOST_ROUNDS) return streamed;
      messages.push({ role: "assistant", content: streamed || null, tool_calls: list.map(c => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } })) });
      for (const call of list) messages.push({ role: "tool", tool_call_id: call.id, content: tools.use(call.name, parseArgs(call.arguments)) });
    }
  }

  private async runMessages(
    conversation: Conversation, model: string, key: string, session: string, signal: AbortSignal,
    tools: Tools, onText: (delta: string) => void, used: Used,
    onUsage?: (usage: ModelUsage) => void, onWire?: (body: unknown) => void
  ): Promise<string> {
    const body = opencodeMessagesBody(conversation, model, tools);
    const messages = [...(body.messages as Item[])];
    for (let round = 0; ; round++) {
      const sent = { ...body, messages };
      onWire?.(sent);
      const response = await this.openStream(`${BASE}/anthropic/v1/messages`, sent, key, session, signal, { "anthropic-version": "2023-06-01" });
      let streamed = "", usage: OpencodeUsage = {};
      const blocks = new Map<number, { type: string; id: string | undefined; name: string | undefined; text: string; json: string }>();
      await readEvents(response, event => {
        if (event.type === "message_start") usage = { ...usage, ...((event.message as { usage?: OpencodeUsage } | undefined)?.usage ?? {}) };
        else if (event.type === "message_delta" && event.usage && typeof event.usage === "object") usage = { ...usage, ...(event.usage as OpencodeUsage) };
        else if (event.type === "content_block_start" && typeof event.index === "number") {
          const b = event.content_block as { type?: string; id?: string; name?: string } | undefined;
          blocks.set(event.index, { type: b?.type ?? "", id: b?.id, name: b?.name, text: "", json: "" });
        } else if (event.type === "content_block_delta" && typeof event.index === "number") {
          const entry = blocks.get(event.index);
          const delta = event.delta as { type?: string; text?: string; partial_json?: string } | undefined;
          if (entry && delta?.type === "text_delta" && typeof delta.text === "string") { entry.text += delta.text; streamed += delta.text; onText(delta.text); }
          else if (entry && delta?.type === "input_json_delta" && typeof delta.partial_json === "string") entry.json += delta.partial_json;
        }
      });
      this.recordUsage(used, Object.keys(usage).length ? usage : null, onUsage);
      const calls = [...blocks.values()].filter(block => block.type === "tool_use" && block.name);
      if (calls.length === 0 || round >= MOST_ROUNDS) return streamed;
      messages.push({ role: "assistant", content: [...(streamed ? [{ type: "text", text: streamed }] : []), ...calls.map(c => ({ type: "tool_use", id: c.id, name: c.name, input: parseArgs(c.json) }))] });
      messages.push({ role: "user", content: calls.map(c => ({ type: "tool_result", tool_use_id: c.id, content: tools.use(c.name ?? "", parseArgs(c.json)) })) });
    }
  }

  private async runGemini(
    conversation: Conversation, model: string, key: string, session: string, signal: AbortSignal,
    tools: Tools, inText: boolean, onText: (delta: string) => void, used: Used,
    onUsage?: (usage: ModelUsage) => void, onWire?: (body: unknown) => void
  ): Promise<string> {
    const body = opencodeGeminiBody(conversation, tools, inText);
    const contents = [...(body.contents as Item[])];
    const url = `${BASE}/google/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    for (let round = 0; ; round++) {
      const sent = { ...body, contents };
      onWire?.(sent);
      const response = await this.openStream(url, sent, key, session, signal);
      let streamed = "", usage: OpencodeUsage | null = null;
      const calls: { name: string; args: Record<string, unknown> }[] = [];
      await readEvents(response, event => {
        if (event.usageMetadata && typeof event.usageMetadata === "object") usage = event.usageMetadata as OpencodeUsage;
        for (const part of ((event.candidates as { content?: { parts?: Item[] } }[] | undefined)?.[0]?.content?.parts) ?? []) {
          if (!part.thought && typeof part.text === "string" && part.text) { streamed += part.text; onText(part.text); }
          const call = part.functionCall as { name?: string; args?: Record<string, unknown> } | undefined;
          if (call?.name) calls.push({ name: call.name, args: call.args ?? {} });
        }
      });
      this.recordUsage(used, usage, onUsage);
      if (calls.length === 0 || round >= MOST_ROUNDS) return streamed;
      contents.push({ role: "model", parts: calls.map(c => ({ functionCall: { name: c.name, args: c.args } })) });
      contents.push({ role: "user", parts: calls.map(c => ({ functionResponse: { name: c.name, response: { result: tools.use(c.name, c.args) } } })) });
    }
  }
}

function parseArgs(raw: unknown): Record<string, unknown> {
  try { return JSON.parse(String(raw || "{}")) as Record<string, unknown>; } catch { return {}; }
}

function usageCounts(usage: OpencodeUsage): { input: number; cached: number; output: number; reasoning: number } {
  const oc = usage.opencode?.tokens;
  const cached = usage.input_tokens_details?.cached_tokens
    ?? usage.prompt_tokens_details?.cached_tokens
    ?? usage.cache_read_input_tokens
    ?? usage.cachedContentTokenCount
    ?? oc?.cache_read
    ?? 0;
  const rawInput = usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount;
  const input = usage.cache_read_input_tokens !== undefined || usage.cache_creation_input_tokens !== undefined
    ? (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
    : rawInput ?? ((oc?.input ?? 0) + cached + (oc?.cache_write_5m ?? 0) + (oc?.cache_write_1h ?? 0));
  const output = usage.output_tokens ?? usage.completion_tokens ?? usage.candidatesTokenCount ?? oc?.output ?? 0;
  const reasoning = usage.output_tokens_details?.reasoning_tokens
    ?? usage.completion_tokens_details?.reasoning_tokens
    ?? usage.thoughtsTokenCount
    ?? oc?.reasoning
    ?? 0;
  return { input, cached, output, reasoning };
}

function unfenced(answer: string): string {
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(answer.trim());
  return (fenced?.[1] ?? answer).trim();
}
