import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { OfferedModel } from "./catalog.js";
import type { ModelRequest, ModelRunner } from "./model-call.js";

type Message = { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message?: string } };
type Listener = (method: string, params: Record<string, unknown>) => void;

/**
 * One `codex app-server` (codex-cli 0.160.0): JSON-RPC over stdio, many conversations in one process. Requests are
 * answered by id; notifications go to whoever listens for their thread. A request from the server, to approve a
 * command or a file change, is refused: the agents use no tools.
 */
class AppServer {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly listeners = new Map<string, Listener>();
  private nextId = 1;
  /** Why the process is gone, once it is. */
  exited: string | null = null;
  readonly ready: Promise<void>;

  constructor(command: readonly string[], cwd: string, env: Record<string, string>, private readonly onExit: () => void) {
    const [program = "codex", ...rest] = command;
    this.child = spawn(program, rest, { cwd, env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    this.child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-2000); });
    this.child.on("error", error => this.end(`Codex could not start: ${error.message}`));
    this.child.on("exit", code => this.end(`Codex stopped (exit ${code ?? "signal"})${stderr.trim() ? `: ${lastLine(stderr)}` : ""}`));
    createInterface({ input: this.child.stdout }).on("line", line => this.receive(line));
    this.ready = this.request("initialize", { clientInfo: { name: "open-fantasia", title: "Open Fantasia", version: "0.1.0" } })
      .then(() => this.notify("initialized"));
  }

  request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (this.exited) return Promise.reject(new Error(this.exited));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject });
      this.write({ id, method, params });
    });
  }

  listen(threadId: string, listener: Listener): () => void {
    this.listeners.set(threadId, listener);
    return () => this.listeners.delete(threadId);
  }

  close(): void {
    this.child.kill();
  }

  private notify(method: string): void {
    this.write({ method });
  }

  private write(message: Message): void {
    if (!this.exited) this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receive(line: string): void {
    let message: Message;
    try { message = JSON.parse(line) as Message; } catch { return; }
    if (message.id !== undefined && message.method) {
      this.write({ id: message.id, error: { message: "Open Fantasia's agents use no tools." } } as Message);
      return;
    }
    if (message.id !== undefined) {
      const waiting = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) waiting?.reject(new Error(message.error.message ?? "Codex refused the request"));
      else waiting?.resolve(message.result);
      return;
    }
    const threadId = message.params?.threadId;
    if (message.method && message.params && typeof threadId === "string") this.listeners.get(threadId)?.(message.method, message.params);
  }

  private end(reason: string): void {
    if (this.exited) return;
    this.exited = reason;
    for (const waiting of this.pending.values()) waiting.reject(new Error(reason));
    this.pending.clear();
    for (const listener of this.listeners.values()) listener("process/exited", { reason });
    this.onExit();
  }
}

/**
 * Codex, through one long-running `codex app-server` on the player's ChatGPT subscription (docs/adr/0005). Each call
 * is a fresh ephemeral thread whose only instructions are the system prompt, in a read-only sandbox in an empty
 * folder, with approvals never given: the call is exactly what the engine sent. Words stream from the agent's message
 * deltas; the answer is its finished message.
 */
export class CodexRunner implements ModelRunner {
  private server: AppServer | null = null;
  private readonly workdir: string;

  constructor(home: string, private readonly command: readonly string[] = ["codex", "app-server"], private readonly env: Record<string, string> = {}) {
    this.workdir = join(home, "codex-workdir");
    mkdirSync(this.workdir, { recursive: true });
  }

  async run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw new Error(`Codex ${request.model.model}: stopped`);
    const server = this.started();
    await server.ready;
    const { thread } = await server.request<{ thread: { id: string } }>("thread/start", {
      model: request.model.model,
      baseInstructions: request.system,
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      cwd: this.workdir
    });
    return await new Promise<string>((resolve, reject) => {
      let streamed = "";
      let message: string | null = null;
      let turnId: string | null = null;
      let failure: string | null = null;
      let abandoned = false;
      const interrupt = () => { if (turnId) void server.request("turn/interrupt", { threadId: thread.id, turnId }).catch(() => {}); };
      const finish = (error: Error | null) => {
        stop();
        signal.removeEventListener("abort", abandon);
        if (error) reject(error);
        else resolve(request.schema ? withoutAddedNulls(message ?? streamed, request.schema) : message ?? streamed);
      };
      const stop = server.listen(thread.id, (method, params) => {
        if (method === "item/agentMessage/delta" && typeof params.delta === "string") {
          streamed += params.delta;
          onText(params.delta);
        } else if (method === "item/completed") {
          const item = params.item as { type?: string; text?: string } | undefined;
          if (item?.type === "agentMessage" && typeof item.text === "string") message = item.text;
        } else if (method === "error") {
          const error = params.error as { message?: string } | undefined;
          if (params.willRetry !== true) failure = error?.message ?? failure;
        } else if (method === "turn/completed") {
          const turn = params.turn as { status?: string; error?: { message?: string } | null };
          if (turn.status === "completed") finish(message ?? streamed ? null : new Error(`Codex ${request.model.model} finished without an answer`));
          else finish(new Error(`Codex ${request.model.model}: ${turn.error?.message ?? failure ?? `the turn ${turn.status ?? "stopped"}`}`));
        } else if (method === "process/exited") {
          finish(new Error(String(params.reason)));
        }
      });
      // Abandoned before Codex said which turn it started, the turn is interrupted as soon as it says.
      const abandon = () => {
        abandoned = true;
        interrupt();
        finish(new Error(`Codex ${request.model.model}: stopped`));
      };
      if (signal.aborted) return abandon();
      signal.addEventListener("abort", abandon, { once: true });
      server.request<{ turn: { id: string } }>("turn/start", {
        threadId: thread.id,
        input: [{ type: "text", text: request.prompt }],
        model: request.model.model,
        ...(request.model.effort ? { effort: request.model.effort } : {}),
        ...(request.schema ? { outputSchema: strict(request.schema) } : {})
      }).then(started => {
        turnId = started.turn.id;
        if (abandoned) interrupt();
      }, (error: Error) => finish(error));
    });
  }

  /** What Codex offers this account, from its own model/list (models-screen design decision 4). */
  async listModels(): Promise<OfferedModel[]> {
    const server = this.started();
    await server.ready;
    const listed: CodexModel[] = [];
    let cursor: string | null = null;
    do {
      const page: { data: CodexModel[]; nextCursor?: string | null } = await server.request("model/list", cursor ? { cursor } : {});
      listed.push(...page.data);
      cursor = page.nextCursor ?? null;
    } while (cursor);
    return codexModels(listed);
  }

  /** Stops the app server, for shutting the host down. */
  close(): void {
    this.server?.close();
    this.server = null;
  }

  /** The running app server, or a new one when there is none or the last one stopped. */
  private started(): AppServer {
    if (this.server && !this.server.exited) return this.server;
    const server = new AppServer(this.command, this.workdir, this.env, () => { if (this.server === server) this.server = null; });
    this.server = server;
    return server;
  }
}

function lastLine(text: string): string {
  return text.trim().split("\n").at(-1) ?? "";
}

type Schema = { type?: string | string[]; properties?: Record<string, Schema>; required?: string[]; items?: Schema; anyOf?: Schema[]; [key: string]: unknown };

/**
 * The schema as Codex takes it: the API requires every object to list every key it has as required (checked live on
 * 6 October 2026). A key that was optional becomes required and able to be null, and comes back out of the answer
 * by [withoutAddedNulls], so the agent's own check sees the answer its schema describes.
 */
export function strict(schema: Schema): Schema {
  const out: Schema = { ...schema };
  if (schema.properties) {
    const required = schema.required ?? [];
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) =>
      [key, required.includes(key) ? strict(value) : nullable(strict(value))]));
    out.required = Object.keys(schema.properties);
  }
  if (schema.items) out.items = strict(schema.items);
  if (schema.anyOf) out.anyOf = schema.anyOf.map(strict);
  return out;
}

function nullable(schema: Schema): Schema {
  if (schema.anyOf) return schema.anyOf.some(option => [option.type].flat().includes("null")) ? schema : { ...schema, anyOf: [...schema.anyOf, { type: "null" }] };
  if (schema.type === undefined) return { anyOf: [schema, { type: "null" }] };
  const types = [schema.type].flat();
  return types.includes("null") ? schema : { ...schema, type: [...types, "null"] };
}

/** Drops the nulls [strict] made room for: a key the schema left optional, and that could not be null, answered null. */
export function withoutAddedNulls(answer: string, schema: Schema): string {
  let value: unknown;
  try { value = JSON.parse(answer); } catch { return answer; }
  return JSON.stringify(prune(value, schema));
}

function prune(value: unknown, schema: Schema): unknown {
  if (Array.isArray(value)) return schema.items ? value.map(item => prune(item, schema.items as Schema)) : value;
  if (value === null || typeof value !== "object" || !schema.properties) return value;
  const required = schema.required ?? [];
  const properties = schema.properties;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => !(item === null && properties[key] && !required.includes(key) && !acceptsNull(properties[key])))
    .map(([key, item]) => [key, properties[key] ? prune(item, properties[key]) : item]));
}

function acceptsNull(schema: Schema): boolean {
  return [schema.type].flat().includes("null") || (schema.anyOf ?? []).some(acceptsNull);
}

/** One model as Codex's model/list gives it, only what is read of it. */
export interface CodexModel {
  id: string;
  model: string;
  displayName: string;
  hidden: boolean;
  defaultReasoningEffort: string | null;
  supportedReasoningEfforts: { reasoningEffort: string }[];
}

/** Codex's models, its hidden ones left out, named as people write them ("GPT-6.1-Sol" is "GPT 6.1 Sol"). */
export function codexModels(listed: readonly CodexModel[]): OfferedModel[] {
  return listed.filter(model => !model.hidden).map(model => ({
    id: model.id,
    aliases: model.model === model.id ? [] : [model.model],
    name: model.displayName.replace(/-/g, " "),
    efforts: model.supportedReasoningEfforts.map(effort => effort.reasoningEffort),
    defaultEffort: model.defaultReasoningEffort
  }));
}

