import type { OfferedModel } from "./catalog.js";
import { NO_TOOLS, type ModelRequest, type ModelRunner, type ModelUsage, type Tools } from "./model-call.js";
import { webSearchLine, withoutAddedNulls, type CodexWebSearch } from "./codex.js";
import { codexBody, conversationOf } from "./wire.js";
import { codexCredentials, readEvents, refusal, Used, type CodexCredentials } from "./direct.js";

const ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const MODELS_ENDPOINT = "https://chatgpt.com/backend-api/codex/models?client_version=1.0.0";

/** One model entry returned by `/backend-api/codex/models`. */
export interface CodexBackendModel {
  slug: string;
  display_name?: string;
  visibility?: string;
  default_reasoning_level?: string | null;
  supported_reasoning_levels?: { effort: string }[];
}

/** Codex's live backend model list, hidden internal entries omitted, formatted to match `codexModels`. */
export function codexBackendModels(listed: readonly CodexBackendModel[]): OfferedModel[] {
  return listed
    .filter(model => model.visibility !== "hide")
    .map(model => ({
      id: model.slug,
      aliases: [],
      name: (model.display_name ?? model.slug).replace(/-/g, " "),
      efforts: (model.supported_reasoning_levels ?? []).map(level => level.effort),
      defaultEffort: model.default_reasoning_level ?? null
    }));
}

/** A turn of a Responses conversation: a message, a tool call, its result, or reasoning to carry forward. */
type Item = Record<string, unknown> & { type?: string };

interface CodexUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

/** How many rounds of lookups a call may take before it must answer, whatever its turns say. */
const MOST_ROUNDS = 8;

/**
 * Codex models through the ChatGPT backend the Codex CLI itself calls, on the same sign-in (docs/adr/0023). The model
 * reads the host's system prompt as its instructions and nothing else: none of the agent harness the app-server adds,
 * which on 17 November 2026 was 13,112 characters of skills, an agent-team prompt, the user's global AGENTS.md and the
 * date, more than the request it was carrying. Story lookups are function calls answered here.
 */
export class CodexDirectRunner implements ModelRunner {
  readonly canLookUp = { story: true, web: true };

  constructor(
    private readonly credentials: () => CodexCredentials = () => codexCredentials(),
    private readonly post: typeof fetch = fetch
  ) {}

  async run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal, tools: Tools = NO_TOOLS, onUsage?: (usage: ModelUsage) => void, onWire?: (body: unknown) => void): Promise<string> {
    const { token, accountId } = this.credentials();
    const conversation = conversationOf(request);
    const body = codexBody(conversation, request.model.model, tools);
    const input = [...(body.input as Item[])];
    const used = new Used();
    for (let round = 0; ; round++) {
      const sent = { ...body, input };
      onWire?.(sent);
      const { items, text, usage } = await this.stream(sent, token, accountId, signal, onText);
      if (usage) onUsage?.(used.add(usage.input_tokens, usage.input_tokens_details?.cached_tokens, usage.output_tokens, usage.output_tokens_details?.reasoning_tokens));
      for (const item of items) {
        const line = item.type === "web_search_call" ? webSearchLine(item as CodexWebSearch) : null;
        if (line) tools.made(line);
      }
      const calls = items.filter(item => item.type === "function_call");
      if (calls.length === 0 || round >= MOST_ROUNDS) {
        return conversation.schema ? withoutAddedNulls(text, conversation.schema as never) : text;
      }
      // The backend keeps nothing between requests (store: false), so the whole turn is sent back, ids removed.
      input.push(...items.filter(item => item.type !== "message").map(({ id: _id, ...rest }) => rest));
      for (const call of calls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(String(call.arguments ?? "{}")) as Record<string, unknown>; } catch { /* Empty arguments ask for nothing in particular. */ }
        input.push({ type: "function_call_output", call_id: call.call_id, output: tools.use(String(call.name), args) });
      }
    }
  }

  /** Lists all latest Codex models directly from the ChatGPT Codex backend (including models newer than the installed CLI). */
  async listModels(signal?: AbortSignal): Promise<OfferedModel[]> {
    const { token, accountId } = this.credentials();
    const response = await this.post(MODELS_ENDPOINT, {
      method: "GET",
      ...(signal ? { signal } : {}),
      headers: {
        Authorization: `Bearer ${token}`,
        "chatgpt-account-id": accountId,
        originator: "open-fantasia"
      }
    });
    if (!response.ok) throw await refusal("Codex", response);
    const data = await response.json() as { models?: CodexBackendModel[] };
    const listed = codexBackendModels(data.models ?? []);
    if (listed.length === 0) throw new Error("Codex returned no models");
    return listed;
  }

  private async stream(body: unknown, token: string, accountId: string, signal: AbortSignal, onText: (delta: string) => void) {
    const response = await this.post(ENDPOINT, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "chatgpt-account-id": accountId,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        originator: "open-fantasia",
        // The backend reads its prompt cache only for a request that names a session: without this header an
        // identical 11,000-token request was read uncached every time; with it, 10,880 came from the cache.
        "session-id": String((body as { prompt_cache_key?: string }).prompt_cache_key ?? "")
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw await refusal("Codex", response);
    const items: Item[] = [];
    let streamed = "";
    let usage: CodexUsage | null = null;
    let failed: string | null = null;
    await readEvents(response, event => {
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        streamed += event.delta;
        onText(event.delta);
      } else if (event.type === "response.output_item.done" && event.item && typeof event.item === "object") {
        items.push(event.item as Item);
      } else if (event.type === "response.completed" || event.type === "response.incomplete") {
        const done = event.response as { usage?: CodexUsage; incomplete_details?: { reason?: string } } | undefined;
        usage = done?.usage ?? usage;
        if (event.type === "response.incomplete") failed = `the answer stopped early (${done?.incomplete_details?.reason ?? "incomplete"})`;
      } else if (event.type === "response.failed" || event.type === "error") {
        const error = (event.response as { error?: { message?: string } } | undefined)?.error ?? (event as { message?: string });
        failed = error.message ?? "the call failed";
      }
    });
    if (failed) throw new Error(`Codex: ${failed}`);
    const said = items.filter(item => item.type === "message")
      .flatMap(item => (item.content as { type?: string; text?: string }[] | undefined) ?? [])
      .filter(part => part.type === "output_text").map(part => part.text ?? "").join("");
    return { items, text: said || streamed, usage: usage as CodexUsage | null };
  }
}
