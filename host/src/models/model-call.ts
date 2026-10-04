import { randomUUID } from "node:crypto";
import type { Db } from "../store/db.js";
import type { ModelChoice } from "../story/state.js";

/** Which job a call is for (CONTEXT.md: Who writes the Story). */
export type Agent = "actor" | "writer" | "chronicler" | "weaver" | "director" | "judge";

/** One call to a model: who it is for, which model, and exactly what it is sent. */
export interface ModelRequest {
  agent: Agent;
  model: ModelChoice;
  /** What stays the same across a Scene, so the provider's prompt cache can hit (docs/adr/0005). */
  system: string;
  /** What changes every call. */
  prompt: string;
  /** When set, the answer is JSON matching this schema, and the provider is asked for exactly that. */
  schema?: Record<string, unknown>;
  /**
   * What the prompt was written from, as data: kept with the call so a trace shows it plainly, and read by a
   * scripted model that has to answer from it.
   */
  facts?: unknown;
  traceId: string;
  storyId: string | null;
}

export interface ModelAnswer {
  callId: string;
  text: string;
  /** The answer read as JSON, when the request carried a schema. Checking it against the schema is the caller's. */
  json?: unknown;
}

/** How one provider runs a call. It streams words through [onText] as they come, and returns the whole answer. */
export interface ModelRunner {
  run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<string>;
}

/** Why a model call failed, in words the player can read; the cause stays in the call's record. */
export class ModelCallFailed extends Error {
  constructor(message: string, readonly callId: string) {
    super(message);
  }
}

/**
 * Every model call the host makes goes through here and is kept: the exact request, the answer or the error,
 * and when (docs/adr/0004). That is what makes "why did she say that?" answerable, and what `fantasia trace`
 * shows.
 */
export class Models {
  constructor(
    private readonly db: Db,
    private readonly runners: Partial<Record<ModelChoice["provider"], ModelRunner>>
  ) {}

  async call(request: ModelRequest, onText: (delta: string) => void = () => {}, signal: AbortSignal = new AbortController().signal): Promise<ModelAnswer> {
    const callId = randomUUID();
    this.db
      .prepare("INSERT INTO calls (id, trace_id, story_id, agent, provider, model, request, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(callId, request.traceId, request.storyId, request.agent, request.model.provider, request.model.model, JSON.stringify(request), new Date().toISOString());
    const runner = this.runners[request.model.provider];
    try {
      if (!runner) throw new Error(`No way to reach ${request.model.provider} models is set up on this Mac`);
      const text = await runner.run(request, onText, signal);
      if (!text.trim()) throw new Error(`${request.model.model} returned nothing`);
      if (!request.schema) {
        this.finish(callId, text, null);
        return { callId, text };
      }
      const json = readJson(text);
      if (json === undefined) {
        this.finish(callId, text, `${request.model.model} answered with something that is not JSON`);
        throw new ModelCallFailed(`${request.model.model} answered with something that is not JSON`, callId);
      }
      this.finish(callId, text, null);
      return { callId, text, json };
    } catch (error) {
      if (error instanceof ModelCallFailed) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.finish(callId, null, message);
      throw new ModelCallFailed(message, callId);
    }
  }

  /** Records that a call's answer was refused by the check its caller made, and why. */
  refuse(callId: string, reason: string): void {
    this.db.prepare("UPDATE calls SET error = ? WHERE id = ?").run(`Refused: ${reason}`, callId);
  }

  /** Ties a finished call to the entry it produced, once that entry is written. */
  attach(callId: string, entryId: string): void {
    this.db.prepare("UPDATE calls SET entry_id = ? WHERE id = ?").run(entryId, callId);
  }

  private finish(callId: string, answer: string | null, error: string | null): void {
    this.db.prepare("UPDATE calls SET answer = ?, error = ?, finished_at = ? WHERE id = ?").run(answer, error, new Date().toISOString(), callId);
  }
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
