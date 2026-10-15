import { randomUUID } from "node:crypto";
import { storyTools } from "../agents/tools/story.js";
import type { Db } from "../store/db.js";
import type { ModelChoice } from "../story/state.js";

/** Which job a call is for (CONTEXT.md: Who writes the Story). */
export type Agent = "actor" | "writer" | "editor" | "chronicler" | "weaver" | "director" | "folder" | "judge";

/**
 * What a call may look things up in (docs/adr/0018): the Story on one Path, as of its head, and the web. Plain data,
 * kept with the call; the tools themselves are made for it when it runs.
 */
export interface ToolKit {
  story: { storyId: string; head: string } | null;
  web: boolean;
}

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
  /** What it may look up. None when not set, or when its model can use no tools. */
  tools?: ToolKit;
  /** How many turns it may take, its lookups and its answer together; one when not set. */
  turns?: number;
  traceId: string;
  storyId: string | null;
}

export interface ModelAnswer {
  callId: string;
  text: string;
  /** The answer read as JSON, when the request carried a schema. Checking it against the schema is the caller's. */
  json?: unknown;
  /** What the call looked up, a line each, in order. */
  lookups: string[];
}

/** One of the Story's tools, as a model is told of it: its name, what it is for, and what it takes. */
export interface ToolSpec {
  name: string;
  description: string;
  params: Record<string, { type: "string" | "integer"; description: string; optional?: boolean }>;
}

/**
 * A call's tools, ready to use (docs/adr/0018): the Story's, which run here, and whether the provider may use its own
 * web search and fetch. Every lookup is kept with the call. Once its lookups are used up, no more are made, and the
 * model is told to answer with what it has.
 */
export interface Tools {
  story: ToolSpec[];
  web: boolean;
  /** Runs one of the Story's tools: its answer in prose, or why there is none. */
  use(name: string, args: Record<string, unknown>): string;
  /** Asks for a lookup the provider makes itself, said in a line: kept and allowed while lookups are left. */
  ask(line: string): boolean;
  /** Keeps a lookup the provider made without asking (Codex searches the web on its own), said in a line. */
  made(line: string): void;
}

/** What a model is told when it asks for one lookup more than its step allows. */
export const NO_LOOKUPS_LEFT = "No lookups are left in this step. Answer now, with what you have.";

/** A web lookup said in a line, the same whichever provider made it. */
export const webLookup = {
  searched: (query: string) => `searched the web for “${query}”`,
  read: (url: string) => `read ${url}`
};

/** A call with nothing to look up. */
export const NO_TOOLS: Tools = { story: [], web: false, use: name => `There is no tool called ${name}.`, ask: () => false, made: () => {} };

/** What a provider's models can use. */
export interface CanLookUp {
  story: boolean;
  web: boolean;
}

/** How one provider runs a call. It streams words through [onText] as they come, and returns the whole answer. */
export interface ModelRunner {
  /** The tools its models can use. A runner that does not say can use none, and its calls run without them. */
  readonly canLookUp?: CanLookUp;
  run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal, tools?: Tools): Promise<string>;
}

/** Why a model call failed, in words the player can read; the cause stays in the call's record. */
export class ModelCallFailed extends Error {
  constructor(message: string, readonly callId: string) {
    super(message);
  }
}

/** The model answered, but not with JSON: an answer that cannot be used, which one repair may set right. */
export class NotJson extends ModelCallFailed {
  constructor(message: string, callId: string, readonly text: string) {
    super(message, callId);
  }
}

/**
 * Every model call the host makes goes through here and is kept: the exact request, the answer or the error, what it
 * looked up, and when (docs/adr/0004). That is what makes "why did she say that?" answerable, and what `fantasia
 * trace` shows.
 */
export class Models {
  constructor(
    private readonly db: Db,
    private readonly runners: Partial<Record<ModelChoice["provider"], ModelRunner>>
  ) {}

  /**
   * Makes one call, streaming its words through [onText]. [onLookup] hears each lookup, said in the line that is kept,
   * as it is made: before the web is searched or read, and as one of the Story's tools answers.
   */
  async call(
    request: ModelRequest,
    onText: (delta: string) => void = () => {},
    signal: AbortSignal = new AbortController().signal,
    onLookup: (line: string) => void = () => {}
  ): Promise<ModelAnswer> {
    const callId = randomUUID();
    const runner = this.runners[request.model.provider];
    // A model that can use no tools is called without them: its job runs on what its prompt gives it (docs/adr/0018).
    const kit = usable(request.tools, runner?.canLookUp);
    const sent: ModelRequest = { ...request };
    delete sent.tools;
    if (kit) sent.tools = kit;
    this.db
      .prepare("INSERT INTO calls (id, trace_id, story_id, agent, provider, model, request, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(callId, request.traceId, request.storyId, request.agent, request.model.provider, request.model.model, JSON.stringify(sent), new Date().toISOString());
    const lookups: string[] = [];
    try {
      if (!runner) throw new Error(`No way to reach ${request.model.provider} models is set up on this Mac`);
      const text = await runner.run(sent, onText, signal, kit ? this.tools(kit, request.turns ?? 1, lookups, onLookup) : NO_TOOLS);
      if (!text.trim()) throw new Error(`${request.model.model} returned nothing`);
      if (!request.schema) {
        this.finish(callId, text, null, lookups);
        return { callId, text, lookups };
      }
      const json = readJson(text);
      if (json === undefined) {
        this.finish(callId, text, `${request.model.model} answered with something that is not JSON`, lookups);
        throw new NotJson(`${request.model.model} answered with something that is not JSON`, callId, text);
      }
      this.finish(callId, text, null, lookups);
      return { callId, text, json, lookups };
    } catch (error) {
      if (error instanceof ModelCallFailed) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.finish(callId, null, message, lookups);
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

  /** What a call looked up, a line each, so a plan or a Reply can be explained. */
  lookedUp(callId: string): string[] {
    const row = this.db.prepare("SELECT lookups FROM calls WHERE id = ?").get(callId) as { lookups: string | null } | undefined;
    return row?.lookups ? JSON.parse(row.lookups) as string[] : [];
  }

  /**
   * The call's tools: the Story's over its Path, and the web when it may. Each lookup takes a turn and the answer takes
   * the last, so a call of [turns] makes at most one lookup fewer.
   */
  private tools(kit: ToolKit, turns: number, kept: string[], onLookup: (line: string) => void): Tools {
    const story = kit.story ? storyTools(this.db, kit.story.storyId, kit.story.head) : [];
    const left = () => kept.length < Math.max(0, turns - 1);
    const keep = (line: string) => {
      kept.push(line);
      onLookup(line);
    };
    return {
      story: story.map(({ name, description, params }) => ({ name, description, params })),
      web: kit.web,
      use: (name, args) => {
        const tool = story.find(item => item.name === name);
        if (!tool) return `There is no tool called ${name}.`;
        if (!left()) return NO_LOOKUPS_LEFT;
        try {
          const { answer, line } = tool.run(args);
          keep(line);
          return answer;
        } catch (error) {
          return `That lookup failed: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
      ask: line => {
        if (!left()) return false;
        keep(line);
        return true;
      },
      made: keep
    };
  }

  private finish(callId: string, answer: string | null, error: string | null, lookups: string[]): void {
    this.db.prepare("UPDATE calls SET answer = ?, error = ?, lookups = ?, finished_at = ? WHERE id = ?")
      .run(answer, error, lookups.length ? JSON.stringify(lookups) : null, new Date().toISOString(), callId);
  }
}

/** The part of [kit] a provider's models can use, or null when that is nothing. */
function usable(kit: ToolKit | undefined, can: CanLookUp | undefined): ToolKit | null {
  if (!kit || !can) return null;
  const story = can.story ? kit.story : null;
  const web = can.web && kit.web;
  return story || web ? { story, web } : null;
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
