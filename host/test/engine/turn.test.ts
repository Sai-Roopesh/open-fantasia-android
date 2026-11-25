import { describe, expect, it } from "vitest";
import { Engine, type OutgoingEvent } from "../../src/engine/engine.js";
import { LinkError } from "../../src/errors.js";
import { Models } from "../../src/models/model-call.js";
import { fakeWriterAnswer } from "../../src/models/fake.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { sceneView } from "../../src/views/scene.js";
import { setEditsEveryReply } from "../../src/models/jobs.js";
import { freshHome } from "../support/host.js";
import { withWriter } from "../support/link.js";
import { playable as scripted } from "../support/play.js";
import { malfoyProblemStoryFile, writeStoryFile } from "../support/story-files.js";

function playable(actor = new ScriptedRunner()) {
  const mac = freshHome();
  const result = importStoryFile(writeStoryFile(malfoyProblemStoryFile()), mac);
  if (!result.ok) throw new Error("import failed");
  // Every job's second model is GPT 6.1 Sol, on Codex: the same scripted models answer there too.
  const runner = withWriter(actor);
  const engine = new Engine(mac, new Models(mac.db, { claude: runner, codex: runner }));
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
    // The Actor's model and its second model both fail; Retry then writes the Reply.
    const actor = new ScriptedRunner([{ fail: "Claude is overloaded" }, { fail: "Claude is overloaded" }, { answer: "She shrugs." }]);
    const { mac, engine, storyId, head, events } = playable(actor);
    engine.move(storyId, "I sit beside her.", head(), "trace-b");
    await engine.settled(storyId);

    const path = mac.tree.pathTo(head()).map(entry => entry.payload);
    expect(path.filter(payload => payload.kind === "move").at(-1)).toEqual({ kind: "move", text: "I sit beside her." });
    expect(path.at(-1)!.kind).not.toBe("reply");
    const view = sceneView(mac, engine, storyId, "trace-view");
    expect(view.turn).toEqual({ kind: "failed", reason: expect.stringContaining("Claude is overloaded"), trace_id: "trace-b", job: "actor" });
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

/** What a turn told the phone, in order, from the Move on: each entry's kind, and each step as "turn_step:<step>". */
function told(events: OutgoingEvent[]): string[] {
  const from = events.findLastIndex(event => event.event.kind === "move");
  return events.slice(from).map(({ event }) => (event.kind === "turn_step" ? `turn_step:${event.turn_step}` : event.kind));
}

describe("a Reply arrives whole (docs/adr/0019, docs/adr/0024)", () => {
  // WHEN the player sends a Move
  // THEN one line says the Reply is being written, and the Reply appears whole, read by no second model first
  it("presence › A Reply arrives checked and whole › Watching a Reply come", async () => {
    const reply = "She sets down her glass and does not look at you.";
    const { mac, engine, storyId, head, events } = playable(new ScriptedRunner([{ answer: reply }]));
    // The line as a phone that reads the Scene would show it, the moment each step is said.
    const read: string[] = [];
    engine.subscribe(storyId, event => {
      if (event.event.kind === "turn_step") read.push(sceneView(mac, engine, storyId, "trace-read").turn.kind);
    });
    engine.move(storyId, "I raise my glass.", head(), "trace-w");
    await engine.settled(storyId);

    expect(told(events).filter(kind => kind !== "reply_delta")).toEqual(["move", "turn_step:writing", "reply"]);
    expect(read).toEqual(["writing"]);
    // Live prose deltas stream smoothly while writing (never leaking <scene_state>) before the final committed Reply.
    const streamed = events.filter(event => event.event.kind === "reply_delta").map(event => event.event.delta ?? "").join("");
    expect(streamed.length).toBeGreaterThan(0);
    expect(streamed).not.toContain("<scene_state>");
    expect(events.at(-1)!.event.passage).toEqual({ entry_id: head(), text: reply });
    const calls = mac.db.prepare("SELECT agent FROM calls WHERE trace_id = 'trace-w' ORDER BY rowid").all() as { agent: string }[];
    expect(calls.map(call => call.agent)).toEqual(["actor"]);
    expect(sceneView(mac, engine, storyId, "trace-read").turn).toEqual({ kind: "idle" });
  });

  // GIVEN the Mac is set to have every Reply edited
  // THEN the Editor reads it under the turn's trace, after the Actor and before the Reply is kept
  it("reads every Reply with the Editor first when the Mac is set to", async () => {
    const reply = "She sets down her glass and does not look at you.";
    const { mac, engine, storyId, head, events } = playable(new ScriptedRunner([{ answer: reply }]));
    setEditsEveryReply(mac.home, true);
    engine.move(storyId, "I raise my glass.", head(), "trace-e");
    await engine.settled(storyId);

    expect(told(events)).toEqual(["move", "turn_step:writing", "turn_step:checking", "reply"]);
    const calls = mac.db.prepare("SELECT agent, request FROM calls WHERE trace_id = 'trace-e' ORDER BY rowid").all() as { agent: string; request: string }[];
    expect(calls.map(call => call.agent)).toEqual(["actor", "editor"]);
    expect((JSON.parse(calls[1]!.request) as { prompt: string }).prompt).toContain(`<reply>\n${reply}\n</reply>`);
  });

  // GIVEN no Editor reads the Reply
  // THEN a draft that writes the Player Character's part is still caught, in code, and written again once
  it("still sends back a draft that writes the Player Character's part, with no Editor", async () => {
    const { mac, engine, storyId, head } = playable(new ScriptedRunner([
      { answer: "Roopesh tells her he has missed her." },
      { answer: "She waits for him to say something." }
    ]));
    engine.move(storyId, "I sit down.", head(), "trace-p");
    await engine.settled(storyId);
    const kept = mac.tree.entry(head())!.payload;
    expect(kept).toMatchObject({ kind: "reply", text: "She waits for him to say something." });
    expect(kept).not.toHaveProperty("note");
    const calls = mac.db.prepare("SELECT agent FROM calls WHERE trace_id = 'trace-p' ORDER BY rowid").all() as { agent: string }[];
    expect(calls.map(call => call.agent)).toEqual(["actor", "actor"]);
  });

  // GIVEN the Writer looks up how Hermione learned his secret before it plans the Reply
  // THEN the line says it is looking back, before it says the Reply is being written
  it("presence › A Reply arrives checked and whole › Looking something up", async () => {
    const { mac, engine, storyId, head, events, models } = scripted(malfoyProblemStoryFile(), {
      writer: [{ lookUp: [{ tool: "search_story", args: { words: "Hermione secret" } }], then: { from: fakeWriterAnswer } }]
    });
    const read: string[] = [];
    engine.subscribe(storyId, event => {
      if (event.event.kind === "turn_step") read.push(sceneView(mac, engine, storyId, "trace-read").turn.kind);
    });
    engine.move(storyId, "I ask Hermione how long she has known.", head(), "trace-l");
    await engine.settled(storyId);

    expect(told(events)).toEqual(["move", "turn_step:writing", "turn_step:looking_back", "turn_step:checking", "reply"]);
    expect(read).toEqual(["writing", "looking_back", "checking"]);
    // The lookup was the Writer's, made with the Story's own tools, and kept with its call.
    expect(models.writer.looked.map(lookup => lookup.tool)).toEqual(["search_story"]);
    const writer = mac.db.prepare("SELECT lookups FROM calls WHERE trace_id = 'trace-l' AND agent = 'actor'").get() as { lookups: string };
    expect(JSON.parse(writer.lookups)).toEqual([expect.stringContaining("searched the Story for “Hermione secret”")]);
    // A Reply that looks nothing up says nothing of looking back.
    engine.move(storyId, "I wait for her answer.", head(), "trace-m");
    await engine.settled(storyId);
    expect(told(events)).toEqual(["move", "turn_step:writing", "turn_step:checking", "reply"]);
  });
});

describe("a Reply the Editor could not read", () => {
  it("fails the turn with the reason when the Editor's model and its second model fail, and Retry writes and checks it again", async () => {
    const { engine, storyId, head, mac, models, view, events } = scripted(malfoyProblemStoryFile(), {
      actor: [{ answer: "Draconia laughs." }, { answer: "Draconia laughs, louder." }],
      editor: [{ fail: "Sonnet is overloaded" }, { fail: "Sonnet is overloaded" }]
    });
    engine.move(storyId, "I raise my glass.", head(), "trace-e");
    await engine.settled(storyId);
    // Nothing unread reaches the player: the Move waits on its Beat Note, and the turn says why it stopped.
    expect(mac.tree.entry(head())!.payload.kind).toBe("beat_note");
    expect(view().turn).toEqual({ kind: "failed", reason: expect.stringMatching(/^The Reply could not be checked: .*Sonnet is overloaded/), trace_id: "trace-e", job: "editor" });
    expect(events.at(-1)!.event.kind).toBe("reply_failed");
    expect(JSON.stringify(events)).not.toContain("Draconia laughs");

    engine.retry(storyId, "trace-r");
    await engine.settled(storyId);
    expect(mac.tree.entry(head())!.payload).toMatchObject({ kind: "reply", text: "Draconia laughs." });
    expect(models.editor.requests).toHaveLength(3);
    expect(view().turn).toEqual({ kind: "idle" });
  });
});

describe("the player can always write", () => {
  // GIVEN a Reply is being written
  // THEN the player can type in the composer, and sends once the Reply has appeared
  it("presence › The player can always write › Typing during a Reply", async () => {
    const { mac, engine, storyId, head, events } = playable(new ScriptedRunner([{ answer: "Draconia laughs." }, { answer: "Hermione does not." }]));
    const typed = "I wave at Hermione.";
    // At each step of the Reply under way, the phone shows it under way, and holds back the Move the player typed: the
    // Mac would refuse it with the reason, and nothing changes.
    const held: string[] = [];
    engine.subscribe(storyId, event => {
      if (event.event.kind !== "turn_step") return;
      const before = head();
      const turn = sceneView(mac, engine, storyId, "trace-read").turn.kind;
      try {
        engine.move(storyId, typed, before, "trace-early");
        held.push(`${turn}: sent`);
      } catch (error) {
        held.push(`${turn}: ${(error as LinkError).code}${head() === before ? "" : ", and the Story changed"}`);
      }
    });
    engine.move(storyId, "I raise my glass.", head(), "trace-1");
    await engine.settled(storyId);
    expect(held).toEqual(["writing: busy"]);
    expect(mac.tree.entry(head())!.payload).toMatchObject({ kind: "reply", text: "Draconia laughs." });

    // Once the Reply has appeared, the Move sends.
    const sent = engine.move(storyId, typed, head(), "trace-2");
    await engine.settled(storyId);
    expect(mac.tree.entry(sent.move_entry_id)!.payload).toEqual({ kind: "move", text: typed });
    expect(told(events).at(-1)).toBe("reply");
  });
});

