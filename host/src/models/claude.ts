import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createSdkMcpServer, query, startup, tool, type HookCallback, type ModelInfo, type Options, type SDKMessage, type WarmQuery } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { OfferedModel } from "./catalog.js";
import { NO_LOOKUPS_LEFT, NO_TOOLS, webLookup, type ModelRequest, type ModelRunner, type ToolSpec, type Tools } from "./model-call.js";

/** How many warm processes may wait at once; more than this and the least recently wanted is closed. */
const MAX_WARM = 4;

/** The SDK's own web tools, which a call that may use the web is given. */
const WEB = ["WebSearch", "WebFetch"];

/** The in-process server of the Story's tools: the model sees them as mcp__story__<name>. */
const STORY = "story";

/** Where a process's tools reach the call that took it: set when it is taken, before it is asked anything. */
export interface Calling {
  tools: Tools;
}

/** A warm process, and the call it answers once taken. */
interface Warm {
  handle: Promise<WarmQuery>;
  calling: Calling;
}

/**
 * Claude, through the Claude Agent SDK on the player's subscription (docs/adr/0005). A call goes to a process
 * that has already started and finished its handshake, so it pays only the model's own time; as soon as one is
 * taken, the next is started for the same model and system prompt. Each process answers one call and is closed:
 * no conversation is kept between calls, so every call is exactly what the engine sent. A call that may look things
 * up gets the Story's tools, run here, and the SDK's web search and fetch, within its turns (docs/adr/0018).
 */
export class ClaudeRunner implements ModelRunner {
  readonly canLookUp = { story: true, web: true };
  private readonly warm = new Map<string, Warm>();
  private readonly workdir: string;

  constructor(home: string, private readonly token: () => string | null) {
    // One fixed, empty working directory outside any repository: the CLI folds its working directory and git state
    // into the conversation, and a different one would miss the prompt cache.
    this.workdir = join(home, "claude-workdir");
    mkdirSync(this.workdir, { recursive: true });
  }

  async run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal, tools: Tools = NO_TOOLS): Promise<string> {
    // A warm process is started with its system prompt, schema, turns and tools, so all are part of what it is for.
    const key = JSON.stringify([request.model, request.system, request.schema ?? null, request.turns ?? 1, tools.story.map(spec => spec.name), tools.web]);
    const warm = this.take(key) ?? this.start(request, tools);
    warm.calling.tools = tools;
    this.prewarm(key, request, tools);
    const handle = await warm.handle;
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

  /** What Claude offers this subscription, from the SDK itself (models-screen design decision 4). */
  async listModels(): Promise<OfferedModel[]> {
    const listing = query({ prompt: never(), options: { cwd: this.workdir, settingSources: [], persistSession: false, tools: [], env: this.environment() } });
    try {
      return claudeModels(await listing.supportedModels());
    } finally {
      listing.close();
    }
  }

  /** Closes every warm process, for shutting the host down. */
  close(): void {
    for (const warm of this.warm.values()) void warm.handle.then(handle => handle.close(), () => {});
    this.warm.clear();
  }

  private take(key: string): Warm | null {
    const warm = this.warm.get(key) ?? null;
    this.warm.delete(key);
    return warm;
  }

  private prewarm(key: string, request: ModelRequest, tools: Tools): void {
    this.warm.set(key, this.start(request, tools));
    while (this.warm.size > MAX_WARM) {
      const oldest = this.warm.keys().next().value as string;
      void this.take(oldest)?.handle.then(handle => handle.close(), () => {});
    }
  }

  /** A process for a call like [request], with the tools a call like it has; whichever call takes it lends it its own. */
  private start(request: ModelRequest, tools: Tools): Warm {
    const calling: Calling = { tools: NO_TOOLS };
    return { handle: startup({ options: claudeOptions(request, tools, calling, this.workdir, this.environment()) }), calling };
  }

  /** Only what the CLI needs: an API key in the environment would outrank the subscription token. */
  private environment(): Record<string, string> {
    const token = this.token();
    if (!token) throw new Error("No Claude token is stored on this Mac. Run `fantasia claude-token` once.");
    return {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      HOME: process.env.HOME ?? "",
      CLAUDE_CODE_OAUTH_TOKEN: token,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1"
    };
  }
}

/**
 * What the SDK is started with for a call like [request]: no tools but the ones it may use, the web's search and
 * fetch and the Story's own through an in-process server whose tools answer for [calling]'s call, and its turns.
 */
export function claudeOptions(request: ModelRequest, tools: Tools, calling: Calling, cwd: string, env: Record<string, string>): Options {
  const options: Options = {
    model: request.model.model,
    systemPrompt: request.system,
    tools: tools.web ? [...WEB] : [],
    // Each lookup takes a turn, and the answer the last of the call's own. An answer in a schema comes back through a
    // tool the SDK checks, and the SDK asks again when the check fails: with one turn left there was no room for
    // that, and a Writer's call stopped with error_max_turns, so a schema has two more.
    maxTurns: (request.turns ?? 1) + (request.schema ? 2 : 0),
    persistSession: false,
    settingSources: [],
    includePartialMessages: true,
    cwd,
    env
  };
  if (tools.story.length) options.mcpServers = { [STORY]: storyServer(tools.story, calling) };
  if (tools.story.length || tools.web) {
    options.allowedTools = [...(tools.web ? WEB : []), ...tools.story.map(spec => `mcp__${STORY}__${spec.name}`)];
    // The Story's tools count themselves as they run; the web is counted, and refused once the call's lookups are
    // used up, before it is searched or read.
    if (tools.web) options.hooks = { PreToolUse: [{ matcher: WEB.join("|"), hooks: [webCounted(calling)] }] };
  }
  if (request.schema) options.outputFormat = { type: "json_schema", schema: request.schema };
  if (request.model.effort) options.effort = request.model.effort as NonNullable<Options["effort"]>;
  return options;
}

/** The Story's tools as an in-process server. */
function storyServer(specs: ToolSpec[], calling: Calling) {
  return createSdkMcpServer({ name: STORY, alwaysLoad: true, tools: storyToolsFor(specs, calling) });
}

/** The Story's tools as the SDK takes them: each one asks the call that took the process. */
export function storyToolsFor(specs: ToolSpec[], calling: Calling) {
  return specs.map(spec => tool(spec.name, spec.description, shape(spec), async args => ({ content: [{ type: "text" as const, text: calling.tools.use(spec.name, args) }] })));
}

/** A tool's parameters as the SDK takes them. */
function shape(spec: ToolSpec): Record<string, z.ZodType> {
  return Object.fromEntries(Object.entries(spec.params).map(([name, param]) => {
    const type = (param.type === "integer" ? z.number().int() : z.string()).describe(param.description);
    return [name, param.optional ? type.optional() : type];
  }));
}

/** Counts a web search or a page read as one of the call's lookups, and refuses it once they are used up. */
function webCounted(calling: Calling): HookCallback {
  return async input => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const asked = (input.tool_input ?? {}) as { query?: unknown; url?: unknown };
    const line = input.tool_name === "WebSearch" ? webLookup.searched(String(asked.query ?? "")) : webLookup.read(String(asked.url ?? ""));
    return calling.tools.ask(line)
      ? { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }
      : { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: NO_LOOKUPS_LEFT } };
  };
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

/** A prompt that never comes: the listing asks the SDK what it offers and is closed before any turn. */
async function* never(): AsyncGenerator<never> {
  await new Promise(() => {});
}

/**
 * Claude's models as its SDK lists them: the id it resolves to, its alias kept so an older setting still matches, and
 * the "Default (recommended)" row left out, since it is one of the others.
 */
export function claudeModels(infos: readonly ModelInfo[]): OfferedModel[] {
  const models = new Map<string, OfferedModel>();
  for (const info of infos) {
    if (info.value === "default") continue;
    const id = info.resolvedModel ?? info.value;
    const known = models.get(id);
    if (known) {
      if (!known.aliases.includes(info.value) && info.value !== id) known.aliases.push(info.value);
      continue;
    }
    models.set(id, {
      id,
      aliases: info.value === id ? [] : [info.value],
      name: info.displayName.replace(/^Claude\s+/, ""),
      efforts: info.supportsEffort ? [...(info.supportedEffortLevels ?? [])] : [],
      defaultEffort: null
    });
  }
  return [...models.values()];
}

