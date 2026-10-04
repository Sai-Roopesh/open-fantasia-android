import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { startup, type Options, type SDKMessage, type WarmQuery } from "@anthropic-ai/claude-agent-sdk";
import type { ModelRequest, ModelRunner } from "./model-call.js";

/** How many warm processes may wait at once; more than this and the least recently wanted is closed. */
const MAX_WARM = 4;

/**
 * Claude, through the Claude Agent SDK on the player's subscription (docs/adr/0005). A call goes to a process
 * that has already started and finished its handshake, so it pays only the model's own time; as soon as one is
 * taken, the next is started for the same model and system prompt. Each process answers one call and is closed:
 * no conversation is kept between calls, so every call is exactly what the engine sent.
 */
export class ClaudeRunner implements ModelRunner {
  private readonly warm = new Map<string, Promise<WarmQuery>>();
  private readonly workdir: string;

  constructor(home: string, private readonly token: () => string | null) {
    // One fixed, empty working directory outside any repository: the CLI folds its working directory and git state
    // into the conversation, and a different one would miss the prompt cache.
    this.workdir = join(home, "claude-workdir");
    mkdirSync(this.workdir, { recursive: true });
  }

  async run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<string> {
    // A warm process is started with its system prompt and answer schema, so both are part of what it is for.
    const key = JSON.stringify([request.model, request.system, request.schema ?? null]);
    const handle = await (this.take(key) ?? this.start(request));
    this.prewarm(key, request);
    signal.addEventListener("abort", () => handle.close(), { once: true });

    let streamed = "";
    let result: string | null = null;
    for await (const message of handle.query(request.prompt)) {
      const delta = textDelta(message);
      if (delta) {
        streamed += delta;
        onText(delta);
      }
      if (message.type === "result") {
        if (message.subtype !== "success" || message.is_error) throw new Error(failureOf(message));
        // Asked for a schema, Claude answers through a tool the SDK checks against it; that answer is the result.
        result = request.schema ? JSON.stringify(message.structured_output ?? null) : message.result;
      }
    }
    handle.close();
    return result ?? streamed;
  }

  /** Closes every warm process, for shutting the host down. */
  close(): void {
    for (const handle of this.warm.values()) void handle.then(warm => warm.close(), () => {});
    this.warm.clear();
  }

  private take(key: string): Promise<WarmQuery> | null {
    const handle = this.warm.get(key) ?? null;
    this.warm.delete(key);
    return handle;
  }

  private prewarm(key: string, request: ModelRequest): void {
    this.warm.set(key, this.start(request));
    while (this.warm.size > MAX_WARM) {
      const oldest = this.warm.keys().next().value as string;
      void this.take(oldest)?.then(warm => warm.close(), () => {});
    }
  }

  private start(request: ModelRequest): Promise<WarmQuery> {
    return startup({ options: this.options(request) });
  }

  private options(request: ModelRequest): Options {
    const token = this.token();
    if (!token) throw new Error("No Claude token is stored on this Mac. Run `fantasia claude-token` once.");
    const options: Options = {
      model: request.model.model,
      systemPrompt: request.system,
      tools: [],
      maxTurns: 1,
      persistSession: false,
      settingSources: [],
      includePartialMessages: true,
      cwd: this.workdir,
      // Only what the CLI needs: an API key in the environment would outrank the subscription token.
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? "",
        CLAUDE_CODE_OAUTH_TOKEN: token,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
        CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1"
      }
    };
    if (request.schema) options.outputFormat = { type: "json_schema", schema: request.schema };
    if (request.model.effort) options.effort = request.model.effort as NonNullable<Options["effort"]>;
    return options;
  }
}

/** The words a streamed message carries, if it is a text delta. */
function textDelta(message: SDKMessage): string | null {
  if (message.type !== "stream_event") return null;
  const event = message.event;
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") return event.delta.text;
  return null;
}

function failureOf(message: Extract<SDKMessage, { type: "result" }>): string {
  if (message.subtype === "success") return message.result || "Claude reported an error";
  return `Claude stopped: ${message.subtype}`;
}
