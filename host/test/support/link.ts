import { Catalog } from "../../src/models/catalog.js";
import { setEditsEveryReply } from "../../src/models/jobs.js";
import { SCRIPTED_OFFERS, scriptedRunners } from "../../src/models/runners.js";
import type { AddressInfo } from "node:net";
import { Engine } from "../../src/engine/engine.js";
import { buildLink } from "../../src/link/server.js";
import { Pairing } from "../../src/link/pairing.js";
import { Models, type ModelRequest, type ModelRunner } from "../../src/models/model-call.js";
import { fakeChronicleAnswer, fakeDirectorAnswer, fakeEditorAnswer, fakeFoldAnswer, fakeRephraseAnswer, fakeWeaveAnswer, fakeWriterAnswer } from "../../src/models/fake.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { CONTRACT_VERSION } from "../../src/protocol/generated/contract.js";
import type { StoryEvent } from "../../src/protocol/generated/link.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { freshHome, openHome } from "./host.js";
import { malfoyProblemStoryFile, writeStoryFile } from "./story-files.js";

/**
 * A model whose words come out only when the test lets them, so a test can drop a connection in the middle of a
 * Reply and know exactly where.
 */
export class GatedRunner implements ModelRunner {
  private permits = 0;
  private waiting: (() => void) | null = null;
  constructor(private readonly words: string[]) {}

  /** Lets [count] more words out. */
  release(count = 1): void {
    this.permits += count;
    const wake = this.waiting;
    this.waiting = null;
    wake?.();
  }

  async run(_request: ModelRequest, onText: (delta: string) => void): Promise<string> {
    for (const word of this.words) {
      while (this.permits === 0) await new Promise<void>(resolve => (this.waiting = resolve));
      this.permits--;
      onText(word);
    }
    return this.words.join("");
  }

  /** Waits until the model has used every word it was allowed and is waiting for the next. */
  async ready(): Promise<void> {
    while (this.waiting === null) await new Promise(resolve => setTimeout(resolve, 2));
  }
}

/** A model that answers as [inner] does, except that while held, its next call waits until the test lets it go. */
export class HeldRunner implements ModelRunner {
  private gate: Promise<void> | null = null;
  private open: (() => void) | null = null;
  constructor(private readonly inner: ModelRunner) {}

  hold(): void {
    this.gate = new Promise(resolve => (this.open = resolve));
  }

  release(): void {
    this.open?.();
    this.gate = null;
    this.open = null;
  }

  async run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<string> {
    if (this.gate) await this.gate;
    return this.inner.run(request, onText, signal);
  }
}

/**
 * Models where [actor] writes the Replies, and a scripted Writer, Editor, Chronicler, Weaver, Director and Folder do
 * their jobs, keeping every rule.
 */
export function withWriter(actor: ModelRunner, writer: ModelRunner = new ScriptedRunner([], fakeWriterAnswer), editor: ModelRunner = new ScriptedRunner([], fakeEditorAnswer)): ModelRunner {
  const rephraser = new ScriptedRunner([], fakeRephraseAnswer);
  const chronicler = new ScriptedRunner([], fakeChronicleAnswer);
  const weaver = new ScriptedRunner([], fakeWeaveAnswer);
  const director = new ScriptedRunner([], fakeDirectorAnswer);
  const folder = new ScriptedRunner([], fakeFoldAnswer);
  const runners: Record<string, ModelRunner> = { writer, rephraser, editor, chronicler, weaver, director, folder };
  return { canLookUp: { story: true, web: true }, run: async (request, onText, signal, tools) => {
    if ((request.facts as { composing?: boolean } | undefined)?.composing) {
      const plan = JSON.parse(await writer.run({ ...request, agent: "writer" }, () => {}, signal, tools)) as object;
      const reply = await actor.run(request, onText, signal, tools);
      return /<scene_state>/i.test(reply) ? reply : `${reply}\n\n<scene_state>\n${JSON.stringify(plan)}\n</scene_state>`;
    }
    return (runners[request.agent] ?? actor).run(request, onText, signal, tools);
  } };
}

/** A Mac with the Harry Potter Story imported, listening on a free port, and a paired phone's token. */
export async function runningMac(actor: ModelRunner = new ScriptedRunner(), writer?: ModelRunner, options: { home?: string | undefined } = {}) {
  const mac = options.home ? openHome(options.home) : freshHome();
  const storyId = options.home ? (mac.db.prepare("SELECT id FROM stories").get() as { id: string }).id : imported(mac);
  // These scenarios were written for every Reply being edited; a Mac's default no longer does that (docs/adr/0024).
  if (!options.home) setEditsEveryReply(mac.home, true);
  // The same scripted models stand in for every provider; the Mac's record of each call says which it went to.
  const engine = new Engine(mac, new Models(mac.db, scriptedRunners(withWriter(actor, writer))));
  const pairing = new Pairing(mac.db);
  const catalog = await offeredCatalog(mac.home);
  const app = buildLink({ mac, engine, pairing, catalog, hostId: "mac-1", hostName: "Test Mac" });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const invite = pairing.invite({ hostId: "mac-1", hostName: "Test Mac", addresses: ["127.0.0.1"], port: 0, fingerprint: "test" });
  const paired = await fetch(`${base}/pair`, { method: "POST", headers: { "content-type": "application/json", "fantasia-contract": String(CONTRACT_VERSION) }, body: JSON.stringify({ code: invite.code, device_name: "Pixel" }) });
  const { device_token: token } = await paired.json() as { device_token: string };
  const headers = { "content-type": "application/json", "fantasia-contract": String(CONTRACT_VERSION), authorization: `Bearer ${token}` };
  const call = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  return { mac, engine, pairing, catalog, app, base, token, headers, call, storyId, close: () => app.close() };
}

export interface ReceivedEvent {
  id: string;
  event: StoryEvent;
}

/** Reads a Story's event stream, collecting events until it is closed; [path] is the Path the phone is showing. */
export function openStream(base: string, storyId: string, headers: Record<string, string>, lastEventId: string | null = null, path: string | null = null, head: string | null = null) {
  const abort = new AbortController();
  const received: ReceivedEvent[] = [];
  const done = (async () => {
    const query = [path ? `path=${encodeURIComponent(path)}` : null, head ? `head=${encodeURIComponent(head)}` : null].filter(Boolean).join("&");
    const response = await fetch(`${base}/stories/${storyId}/events${query ? `?${query}` : ""}`, { headers: { ...headers, ...(lastEventId ? { "last-event-id": lastEventId } : {}) }, signal: abort.signal });
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    try {
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        buffer += value;
        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const id = /^id: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (id && data) received.push({ id, event: JSON.parse(data) as StoryEvent });
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") throw error;
    }
  })();
  return {
    received,
    close: async () => {
      abort.abort();
      await done.catch(() => {});
    },
    until: async (predicate: (events: ReceivedEvent[]) => boolean) => {
      for (let waited = 0; !predicate(received); waited += 5) {
        if (waited > 5_000) throw new Error(`Timed out waiting on the stream; got ${JSON.stringify(received.map(event => event.id))}`);
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
  };
}

function imported(mac: ReturnType<typeof freshHome>): string {
  const result = importStoryFile(writeStoryFile(malfoyProblemStoryFile()), mac);
  if (!result.ok) throw new Error("import failed");
  return result.storyId;
}

/** What the three providers offer in the tests. */
export const OFFERED = SCRIPTED_OFFERS;

/** A catalog that has asked every provider and been given [OFFERED]. */
export async function offeredCatalog(home: string): Promise<Catalog> {
  const catalog = new Catalog(home, {
    claude: async () => OFFERED.claude,
    codex: async () => OFFERED.codex,
    antigravity: async () => OFFERED.antigravity,
    opencode: async () => OFFERED.opencode
  });
  await catalog.refresh();
  return catalog;
}

