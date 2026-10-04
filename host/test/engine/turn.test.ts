import { describe, expect, it } from "vitest";
import { Engine, type OutgoingEvent } from "../../src/engine/engine.js";
import { LinkError } from "../../src/link/errors.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { sceneView } from "../../src/views/scene.js";
import { freshHome } from "../support/host.js";
import { withWriter } from "../support/link.js";
import { malfoyProblemStoryFile, writeStoryFile } from "../support/story-files.js";

function playable(actor = new ScriptedRunner()) {
  const mac = freshHome();
  const result = importStoryFile(writeStoryFile(malfoyProblemStoryFile()), mac);
  if (!result.ok) throw new Error("import failed");
  const engine = new Engine(mac, new Models(mac.db, { claude: withWriter(actor) }));
  const events: OutgoingEvent[] = [];
  engine.subscribe(result.storyId, event => events.push(event));
  const head = () => mac.tree.currentPath(result.storyId)!.headEntryId;
  return { mac, engine, actor, storyId: result.storyId, events, head };
}

describe("a turn", () => {
  // WHEN the Move is "I go to the pitch and nobody is there, then suddenly Draconia yanks me from behind and pins me to the stands"
  // THEN the Reply begins from Draconia holding him there, in her voice
  it("scenes › A Move can contain anything, and what it says has happened › The player writes Draconia's action", async () => {
    const actor = new ScriptedRunner([{ answer: "Her forearm is across his collarbone. \"Late again, Stray.\"" }]);
    const { mac, engine, storyId, head } = playable(actor);
    const move = "I go to the pitch and nobody is there, then suddenly Draconia yanks me from behind and pins me to the stands";
    const accepted = engine.move(storyId, move, head(), "trace-a");
    await engine.settled(storyId);
    // Between the Move and its Reply the Writer's Beat Note is written; the Story as played is the Move, then the Reply.
    const played = mac.tree.pathTo(head()).map(entry => entry.payload).filter(payload => payload.kind === "move" || payload.kind === "reply");
    expect(played.at(-2)).toEqual({ kind: "move", text: move });
    expect(played.at(-1)).toMatchObject({ kind: "reply", text: "Her forearm is across his collarbone. \"Late again, Stray.\"" });
    expect(actor.requests[0]!.prompt).toContain(move);
    expect(accepted.trace_id).toBe("trace-a");
  });

  // GIVEN the Actor's model fails while writing a Reply
  // THEN the Scene shows that the Reply failed, with Retry and another model
  // AND the player's Move is still there
  it("presence › Nothing fails silently › A model is down", async () => {
    const actor = new ScriptedRunner([{ fail: "Claude is overloaded" }, { answer: "She shrugs." }]);
    const { mac, engine, storyId, head, events } = playable(actor);
    engine.move(storyId, "I sit beside her.", head(), "trace-b");
    await engine.settled(storyId);

    const path = mac.tree.pathTo(head()).map(entry => entry.payload);
    expect(path.filter(payload => payload.kind === "move").at(-1)).toEqual({ kind: "move", text: "I sit beside her." });
    expect(path.at(-1)!.kind).not.toBe("reply");
    const view = sceneView(mac, engine, storyId, "trace-view");
    expect(view.turn).toEqual({ kind: "failed", reason: expect.stringContaining("Claude is overloaded"), trace_id: "trace-b" });
    expect(events.map(event => event.event.kind)).toContain("reply_failed");
    const call = mac.db.prepare("SELECT error FROM calls WHERE trace_id = 'trace-b' AND agent = 'actor'").get() as { error: string };
    expect(call.error).toBe("Claude is overloaded");

    engine.retry(storyId, "trace-c");
    await engine.settled(storyId);
    expect(mac.tree.entry(head())!.payload).toMatchObject({ kind: "reply", text: "She shrugs." });
    expect(sceneView(mac, engine, storyId, "trace-view").turn).toEqual({ kind: "idle" });
  });

  // GIVEN a Reply is still being written
  // WHEN the phone sends another Move
  // THEN the Mac refuses it with a reason and a trace id, and the app shows the reason
  it("mac-link › Every request is answered or refused with a reason › A refused Move", async () => {
    const { engine, storyId, head } = playable(new ScriptedRunner([{ answer: "A long reply that takes its time to arrive." }]));
    const before = head();
    engine.move(storyId, "I wave.", before, "trace-d");
    const refusal = (() => {
      try {
        engine.move(storyId, "I wave again.", head(), "trace-e");
        return null;
      } catch (error) {
        return error as LinkError;
      }
    })();
    expect(refusal).toBeInstanceOf(LinkError);
    expect(refusal!.code).toBe("busy");
    expect(refusal!.message).toMatch(/still being written/);
    await engine.settled(storyId);
  });

  it("refuses a Move written against a head the Story has moved past", async () => {
    const { engine, storyId, head } = playable();
    const stale = head();
    engine.move(storyId, "I wave.", stale, "trace-f");
    await engine.settled(storyId);
    expect(() => engine.move(storyId, "I wave again.", stale, "trace-g")).toThrow(expect.objectContaining({ code: "stale_head" }));
  });

  // GIVEN the player stopped on Saturday at 11:47 pm in the Story
  // WHEN they open it a week later
  // THEN it is still Saturday 11:47 pm, and nothing has happened since
  it("stories › Story time stands still while the player is away › A week away", async () => {
    const { mac, engine, storyId, head } = playable();
    const before = { head: head(), clock: mac.states.at(head()).clock, entries: mac.db.prepare("SELECT COUNT(*) AS n FROM entries").get() };
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(engine.isIdle(storyId)).toBe(true);
    expect({ head: head(), clock: mac.states.at(head()).clock, entries: mac.db.prepare("SELECT COUNT(*) AS n FROM entries").get() }).toEqual(before);
  });
});
