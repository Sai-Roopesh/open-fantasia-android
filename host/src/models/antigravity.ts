import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { ModelChoice } from "../story/state.js";
import type { OfferedModel } from "./catalog.js";
import type { ModelRequest, ModelRunner } from "./model-call.js";

/** How many started processes may wait at once; more than this and the least recently wanted is stopped. */
const MAX_WARM = 2;

type StepUpdate = { step_type?: string; text_delta?: string };
type Result = { status?: string; response?: string; error?: string };

/**
 * Antigravity, through the `agy` CLI in print mode (docs/adr/0005; its terms were accepted by the player on 4 October
 * 2026). A process is started ahead of each call and waits for its one message on stdin, so a call pays only the
 * model's own time. `agy` has no system-prompt flag, so the system prompt leads the message; and its `--json-schema`
 * answers with a summary of its own work, so a schema is asked for in the message and checked by the caller, as
 * every provider's answer is (design decision 3 of the models-screen change).
 */
export class AntigravityRunner implements ModelRunner {
  private readonly warm = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly workdir: string;

  constructor(home: string, private readonly command: readonly string[] = ["agy"], private readonly env: Record<string, string> = {}) {
    this.workdir = join(home, "agy-workdir");
    mkdirSync(this.workdir, { recursive: true });
  }

  async run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<string> {
    const id = agyModel(request.model);
    if (signal.aborted) throw new Error(`Antigravity ${id}: stopped`);
    const child = this.take(id) ?? this.start(id);
    this.prewarm(id);
    const answer = await new Promise<string>((resolve, reject) => {
      let streamed = "";
      let result: Result | null = null;
      let said = "";
      const abandon = () => {
        child.kill();
        reject(new Error(`Antigravity ${id}: stopped`));
      };
      signal.addEventListener("abort", abandon, { once: true });
      createInterface({ input: child.stdout }).on("line", line => {
        let event: { event?: string; step_update?: StepUpdate; result?: Result };
        try { event = JSON.parse(line) as typeof event; } catch {
          if (line.trim()) said = line.trim().replace(/^error:\s*/, "");
          return;
        }
        if (event.event === "step_update" && event.step_update?.step_type === "agent_response" && event.step_update.text_delta) {
          streamed += event.step_update.text_delta;
          onText(event.step_update.text_delta);
        } else if (event.event === "result" && event.result) {
          result = event.result;
        }
      });
      child.stderr.on("data", (chunk: Buffer) => { if (chunk.toString().trim()) said = chunk.toString().trim().split("\n").at(-1) ?? said; });
      child.on("error", error => reject(new Error(`Antigravity could not start: ${error.message}`)));
      child.on("close", () => {
        signal.removeEventListener("abort", abandon);
        const done = result as Result | null;
        if (done?.status === "SUCCESS") resolve(done.response ?? streamed);
        else if (done) reject(new Error(`Antigravity ${id}: ${done.error || said || `the call ended ${done.status ?? "without a status"}`}`));
        else reject(new Error(`Antigravity ${id}: stopped without an answer${said ? ` (${said})` : ""}`));
      });
      child.stdin.end(`${JSON.stringify({ event: "user", message: { role: "user", content: message(request) } })}\n`);
    });
    return request.schema ? unfenced(answer) : answer.trim();
  }

  /** What Antigravity offers, from `agy models` (models-screen design decision 4). */
  async listModels(): Promise<OfferedModel[]> {
    const [program = "agy", ...leading] = this.command;
    const child = spawn(program, [...leading, "models"], { cwd: this.workdir, env: { ...process.env, ...this.env }, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { err += chunk.toString(); });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    const models = agyModels(out);
    if (code !== 0 || models.length === 0) throw new Error(`agy models: ${(err || out).trim().split("\n").at(-1) || `exit ${code ?? "signal"}`}`);
    return models;
  }

  /** Whether a process for this model is already started, waiting for its call. */
  warmFor(choice: ModelChoice): boolean {
    const child = this.warm.get(agyModel(choice));
    return child !== undefined && child.exitCode === null;
  }

  /** Stops every waiting process, for shutting the host down. */
  close(): void {
    for (const child of this.warm.values()) child.kill();
    this.warm.clear();
  }

  private take(id: string): ChildProcessWithoutNullStreams | null {
    const child = this.warm.get(id) ?? null;
    this.warm.delete(id);
    // One that stopped while it waited (signed out, updated) is no use; a fresh one says why if it stops again.
    return child && child.exitCode === null && child.signalCode === null ? child : null;
  }

  private prewarm(id: string): void {
    this.warm.set(id, this.start(id));
    while (this.warm.size > MAX_WARM) {
      const oldest = this.warm.keys().next().value as string;
      this.take(oldest)?.kill();
    }
  }

  private start(id: string): ChildProcessWithoutNullStreams {
    const [program = "agy", ...leading] = this.command;
    const child = spawn(program, [...leading,
      "--print=", "--input-format", "stream-json", "--output-format", "stream-json",
      "--model", id, "--disable-slash-commands", "--sandbox"
    ], { cwd: this.workdir, env: { ...process.env, ...this.env }, stdio: ["pipe", "pipe", "pipe"] });
    // A waiting process that fails to start is found out when its call takes it.
    child.on("error", () => {});
    return child;
  }
}

/** The id `agy` lists: the model and its effort together ("gemini-3.8-flash-high"), or the model alone. */
export function agyModel(choice: ModelChoice): string {
  return choice.effort ? `${choice.model}-${choice.effort}` : choice.model;
}

function message(request: ModelRequest): string {
  const parts = [request.system, request.prompt];
  if (request.schema) parts.push(`Answer with one JSON object and nothing else, matching this JSON Schema:\n${JSON.stringify(request.schema)}`);
  return parts.join("\n\n");
}

/** The JSON of an answer, without a code fence around it. */
function unfenced(answer: string): string {
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(answer.trim());
  return (fenced?.[1] ?? answer).trim();
}

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

/**
 * Antigravity's models from `agy models`, one per line, "id<TAB>name". Ids that differ only by an effort suffix
 * ("gemini-3.8-flash-high", "-medium", "-low") are one model with those efforts, lowest first.
 */
export function agyModels(listing: string): OfferedModel[] {
  const models = new Map<string, OfferedModel>();
  for (const line of listing.split("\n")) {
    const [id, name] = line.split("\t").map(part => part.trim());
    if (!id || !name) continue;
    const suffix = EFFORTS.find(effort => id.endsWith(`-${effort}`));
    const base = suffix ? id.slice(0, -(suffix.length + 1)) : id;
    const model = models.get(base) ?? { id: base, aliases: [], name: suffix ? name.replace(/\s*\([^)]*\)\s*$/, "") : name, efforts: [], defaultEffort: null };
    if (suffix) model.efforts = EFFORTS.filter(effort => effort === suffix || model.efforts.includes(effort));
    models.set(base, model);
  }
  return [...models.values()];
}

