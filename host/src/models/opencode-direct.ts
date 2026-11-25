import type { OfferedModel } from "./catalog.js";
import { withoutAddedNulls } from "./codex.js";
import { opencodeApiKey, readEvents, refusal, Refused, Used } from "./direct.js";
import { NO_TOOLS, type ModelRequest, type ModelRunner, type ModelUsage, type Tools } from "./model-call.js";
import { cacheKey, conversationOf, opencodeBody } from "./wire.js";

const ENDPOINT = "https://opencode.ai/inference/go/openai/v1/responses";
const MODELS_ENDPOINT = "https://opencode.ai/inference/go/v1/models";
const USER_AGENT = "open-fantasia/1.0";

type Item = Record<string, unknown> & { type?: string };

interface OpencodeUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
  opencode?: {
    allowance?: number;
    billing_source?: string;
    tokens?: {
      input?: number;
      output?: number;
      reasoning?: number;
      cache_read?: number;
      cache_write_5m?: number;
      cache_write_1h?: number;
    };
  };
}

/** One model entry returned by `GET https://opencode.ai/inference/go/v1/models`. */
export interface OpencodeGoModel {
  id: string;
  name?: string;
  type?: string;
  capabilities?: {
    reasoning?: { supported?: boolean; effort?: string[] };
  };
  cost?: { text?: { input?: { price?: number } } };
  go?: { monthly_usage?: { go?: number }; featured?: boolean };
}

const MOST_ROUNDS = 8;
const BUSY_WAITS = [2_000, 6_000, 15_000];

/**
 * Turns OpenCode Go's live `/inference/go/v1/models` list into Models screen options. Free-tier chat models are
 * omitted (OpenCode's gateway returns HTTP 403 for them outside OpenCode CLI). Featured and higher-allowance models
 * appear first.
 */
export function opencodeGoModels(listed: readonly OpencodeGoModel[]): OfferedModel[] {
  return listed
    .filter(model => {
      if (model.type && model.type !== "chat") return false;
      if (model.id.endsWith("-free")) return false;
      const allowance = model.go?.monthly_usage?.go ?? 0;
      const price = model.cost?.text?.input?.price ?? 0;
      return allowance > 0 && price > 0;
    })
    .sort((left, right) => {
      const feat = Number(Boolean(right.go?.featured)) - Number(Boolean(left.go?.featured));
      if (feat !== 0) return feat;
      return (right.go?.monthly_usage?.go ?? 0) - (left.go?.monthly_usage?.go ?? 0);
    })
    .map(model => {
      const efforts = (model.capabilities?.reasoning?.effort ?? []).filter(effort => effort !== "none" && effort !== "minimal");
      const defaultEffort = efforts.includes("medium") ? "medium" : efforts.includes("high") ? "high" : efforts[0] ?? null;
      return {
        id: model.id,
        aliases: [],
        name: model.name?.trim() || model.id,
        efforts,
        defaultEffort
      };
    });
}

/**
 * Direct OpenCode Go runner over the official Responses gateway (`https://opencode.ai/inference/go/openai/v1/responses`),
 * sending a custom `User-Agent` and stable per-Story `x-opencode-session` header as required by OpenCode Go docs.
 */
export class OpencodeDirectRunner implements ModelRunner {
  readonly canLookUp = { story: true, web: false };
  /** Schemas a specific model rejected in strict `json_schema` mode: asked for in words on subsequent calls. */
  private readonly tooLarge = new Set<string>();

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
    const conversation = conversationOf(request);
    const schemaKey = conversation.schema ? cacheKey(request.model.model, JSON.stringify(conversation.schema)) : null;
    const used = new Used();
    for (;;) {
      const inText = schemaKey !== null && this.tooLarge.has(schemaKey);
      const body = opencodeBody(conversation, request.model.model, tools, inText);
      const input = [...(body.input as Item[])];
      let round = 0;
      try {
        for (; ; round++) {
          const sent = { ...body, input };
          onWire?.(sent);
          const { items, text, usage } = await this.stream(sent, key, signal, onText);
          if (usage) {
            const counts = usageCounts(usage);
            const total = used.add(counts.input, counts.cached, counts.output, counts.reasoning);
            const allowance = usage.opencode?.allowance;
            onUsage?.(typeof allowance === "number" ? { ...total, allowance } : total);
          }
          const calls = items.filter(item => item.type === "function_call");
          if (calls.length === 0 || round >= MOST_ROUNDS) {
            const clean = conversation.schema ? unfenced(text) : text;
            return conversation.schema && !inText ? withoutAddedNulls(clean, conversation.schema as never) : clean;
          }
          input.push(...items.filter(item => item.type !== "message").map(({ id: _id, ...rest }) => rest));
          for (const call of calls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(String(call.arguments ?? "{}")) as Record<string, unknown>; } catch { /* Empty arguments. */ }
            input.push({ type: "function_call_output", call_id: call.call_id, output: tools.use(String(call.name), args) });
          }
        }
      } catch (error) {
        if (round === 0 && schemaKey !== null && !inText && error instanceof Refused && error.status === 400 && /schema|response_format|text\.format|structured/i.test(error.message)) {
          this.tooLarge.add(schemaKey);
          continue;
        }
        throw error;
      }
    }
  }

  /** Lists all paid/Go chat models available on the caller's OpenCode Go workspace. */
  async listModels(signal?: AbortSignal): Promise<OfferedModel[]> {
    const key = this.apiKey();
    const response = await this.post(MODELS_ENDPOINT, {
      method: "GET",
      ...(signal ? { signal } : {}),
      headers: {
        Authorization: `Bearer ${key}`,
        "User-Agent": USER_AGENT
      }
    });
    if (!response.ok) throw await refusal("OpenCode Go", response);
    const data = await response.json() as { data?: OpencodeGoModel[] };
    const listed = opencodeGoModels(data.data ?? []);
    if (listed.length === 0) throw new Error("OpenCode Go returned no models");
    return listed;
  }

  private async stream(body: unknown, key: string, signal: AbortSignal, onText: (delta: string) => void) {
    const cacheId = String((body as { prompt_cache_key?: string }).prompt_cache_key ?? "");
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      response = await this.post(ENDPOINT, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "User-Agent": USER_AGENT,
          ...(cacheId ? { "x-opencode-session": `ses_${cacheId}`, "session-id": cacheId } : {})
        },
        body: JSON.stringify(body)
      });
      if ((response.status !== 503 && response.status !== 429) || attempt >= BUSY_WAITS.length) break;
      await this.wait(BUSY_WAITS[attempt] ?? 0);
      if (signal.aborted) throw new Error("OpenCode Go: stopped");
    }
    if (!response.ok) throw await refusal("OpenCode Go", response);
    const items: Item[] = [];
    let streamed = "";
    let usage: OpencodeUsage | null = null;
    let failed: string | null = null;
    await readEvents(response, event => {
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
        streamed += event.delta;
        onText(event.delta);
      } else if (event.type === "response.output_item.done" && event.item && typeof event.item === "object") {
        items.push(event.item as Item);
      } else if (event.type === "response.completed" || event.type === "response.incomplete") {
        const done = event.response as { usage?: OpencodeUsage; incomplete_details?: { reason?: string } } | undefined;
        usage = done?.usage ?? usage;
        if (event.type === "response.incomplete") failed = `the answer stopped early (${done?.incomplete_details?.reason ?? "incomplete"})`;
      } else if (event.type === "response.failed" || event.type === "error") {
        const error = (event.response as { error?: { message?: string } } | undefined)?.error ?? (event as { message?: string });
        failed = error.message ?? "the call failed";
      }
    });
    if (failed) throw new Error(`OpenCode Go: ${failed}`);
    const said = items.filter(item => item.type === "message")
      .flatMap(item => (item.content as { type?: string; text?: string }[] | undefined) ?? [])
      .filter(part => part.type === "output_text").map(part => part.text ?? "").join("");
    return { items, text: said || streamed, usage: usage as OpencodeUsage | null };
  }
}

function usageCounts(usage: OpencodeUsage): { input: number; cached: number; output: number; reasoning: number } {
  const oc = usage.opencode?.tokens;
  const cached = usage.input_tokens_details?.cached_tokens ?? oc?.cache_read ?? 0;
  const input = usage.input_tokens ?? ((oc?.input ?? 0) + cached + (oc?.cache_write_5m ?? 0) + (oc?.cache_write_1h ?? 0));
  const output = usage.output_tokens ?? oc?.output ?? 0;
  const reasoning = usage.output_tokens_details?.reasoning_tokens ?? oc?.reasoning ?? 0;
  return { input, cached, output, reasoning };
}

function unfenced(answer: string): string {
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(answer.trim());
  return (fenced?.[1] ?? answer).trim();
}
