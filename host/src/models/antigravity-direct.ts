import { NO_TOOLS, type ModelRequest, type ModelRunner, type ModelUsage, type Tools } from "./model-call.js";
import { agyModel } from "./antigravity.js";
import { antigravityBody, cacheKey, conversationOf } from "./wire.js";
import { antigravityToken, readEvents, refusal, Refused, Used } from "./direct.js";

const HOST = "https://daily-cloudcode-pa.googleapis.com";

/** One part of a Gemini turn: text, a thought, a function call or its response. Sent back exactly as it came. */
type Part = Record<string, unknown> & { text?: string; thought?: boolean; functionCall?: { name?: string; id?: string; args?: Record<string, unknown> } };

interface GeminiUsage {
  promptTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
}

const MOST_ROUNDS = 8;
/** How long to wait before asking again when the gateway says it has no capacity. */
const BUSY_WAITS = [2_000, 6_000, 15_000];

/**
 * Gemini through the Antigravity gateway its own app calls, on the same Google sign-in (docs/adr/0023). The host's
 * system prompt is Gemini's system instruction, where `agy` could only put it at the head of the user's message, and
 * Story lookups are function calls answered here, which `agy` could not offer at all. The gateway cannot combine
 * Google Search with function calls in one request, so a call here does not search the web.
 */
export class AntigravityDirectRunner implements ModelRunner {
  readonly canLookUp = { story: true, web: false };
  private project: Promise<string> | null = null;
  /** Schemas the gateway refused to hold Gemini to, by their hash: asked for in words from then on. */
  private readonly tooLarge = new Set<string>();

  constructor(
    private readonly version: string = "2.32.2",
    private readonly token: () => string = () => antigravityToken(),
    private readonly post: typeof fetch = fetch,
    private readonly wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))
  ) {}

  async run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal, tools: Tools = NO_TOOLS, onUsage?: (usage: ModelUsage) => void, onWire?: (body: unknown) => void): Promise<string> {
    const token = this.token();
    const project = await this.projectFor(token, signal);
    const conversation = conversationOf(request);
    const schemaKey = conversation.schema ? cacheKey("schema", JSON.stringify(conversation.schema)) : null;
    const used = new Used();
    for (;;) {
      const inText = schemaKey !== null && this.tooLarge.has(schemaKey);
      const body = antigravityBody(conversation, agyModel(request.model), project, tools, inText);
      const inner = body.request as { contents: { role: string; parts: Part[] }[] };
      const contents = [...inner.contents];
      try {
        for (let round = 0; ; round++) {
          const sent = { ...body, request: { ...inner, contents } };
          onWire?.(sent);
          const { parts, usage } = await this.stream(sent, token, signal, onText);
          if (usage) onUsage?.(used.add(usage.promptTokenCount, usage.cachedContentTokenCount, usage.candidatesTokenCount, usage.thoughtsTokenCount));
          const calls = parts.filter(part => part.functionCall);
          const text = parts.filter(part => !part.thought && typeof part.text === "string").map(part => part.text).join("");
          if (calls.length === 0 || round >= MOST_ROUNDS) return conversation.schema ? unfenced(text) : text.trim();
          contents.push({ role: "model", parts });
          contents.push({ role: "user", parts: calls.map(({ functionCall }) => ({
            functionResponse: {
              name: functionCall?.name,
              ...(functionCall?.id ? { id: functionCall.id } : {}),
              response: { output: tools.use(String(functionCall?.name), functionCall?.args ?? {}) }
            }
          })) });
        }
      } catch (error) {
        // Checked live: the Chronicler's schema is refused with "too many states for serving". Ask for it in words.
        if (schemaKey !== null && !inText && error instanceof Refused && error.status === 400 && /too many states|schema/i.test(error.message)) {
          this.tooLarge.add(schemaKey);
          continue;
        }
        throw error;
      }
    }
  }

  private headers(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": `antigravity/hub/${this.version} (aidev_client; os_type=darwin; arch=arm64)`
    };
  }

  /** The Google Cloud project the account's requests run under, found once. */
  private projectFor(token: string, signal: AbortSignal): Promise<string> {
    this.project ??= (async () => {
      const response = await this.post(`${HOST}/v1internal:loadCodeAssist`, { method: "POST", signal, headers: this.headers(token), body: JSON.stringify({ metadata: { ideType: "ANTIGRAVITY" } }) });
      if (!response.ok) throw await refusal("Antigravity", response);
      const loaded = await response.json() as { cloudaicompanionProject?: string | { id?: string } };
      const project = typeof loaded.cloudaicompanionProject === "string" ? loaded.cloudaicompanionProject : loaded.cloudaicompanionProject?.id;
      if (!project) throw new Error("Antigravity did not say which project this account uses");
      return project;
    })();
    this.project.catch(() => { this.project = null; });
    return this.project;
  }

  private async stream(body: unknown, token: string, signal: AbortSignal, onText: (delta: string) => void) {
    let response: Response;
    // "No capacity available for model … on the server" comes and goes within seconds (seen twice on 17 November 2026).
    for (let attempt = 0; ; attempt++) {
      response = await this.post(`${HOST}/v1internal:streamGenerateContent?alt=sse`, {
        method: "POST", signal, headers: { ...this.headers(token), Accept: "text/event-stream" }, body: JSON.stringify(body)
      });
      if (response.status !== 503 || attempt >= BUSY_WAITS.length) break;
      await this.wait(BUSY_WAITS[attempt] ?? 0);
      if (signal.aborted) throw new Error("Antigravity: stopped");
    }
    if (!response.ok) throw await refusal("Antigravity", response);
    const parts: Part[] = [];
    let usage: GeminiUsage | null = null;
    let blocked: string | null = null;
    await readEvents(response, event => {
      const answer = event.response as { candidates?: { content?: { parts?: Part[] }; finishReason?: string }[]; usageMetadata?: GeminiUsage } | undefined;
      const candidate = answer?.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        parts.push(part);
        if (!part.thought && typeof part.text === "string" && part.text) onText(part.text);
      }
      if (candidate?.finishReason && !["STOP", "MAX_TOKENS"].includes(candidate.finishReason)) blocked = candidate.finishReason;
      usage = answer?.usageMetadata ?? usage;
    });
    if (blocked && !parts.some(part => part.text || part.functionCall)) throw new Error(`Antigravity stopped: ${blocked}`);
    return { parts: merged(parts), usage: usage as GeminiUsage | null };
  }
}

/** Streamed text arrives in pieces; consecutive pieces of the same kind are one part when the turn is sent back. */
function merged(parts: Part[]): Part[] {
  const out: Part[] = [];
  for (const part of parts) {
    const last = out.at(-1);
    const plain = (candidate: Part | undefined) => candidate && typeof candidate.text === "string" && Object.keys(candidate).every(key => key === "text" || key === "thought");
    if (last && plain(last) && plain(part) && Boolean(last.thought) === Boolean(part.thought)) last.text = `${last.text ?? ""}${part.text ?? ""}`;
    else out.push({ ...part });
  }
  return out;
}

function unfenced(answer: string): string {
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(answer.trim());
  return (fenced?.[1] ?? answer).trim();
}
