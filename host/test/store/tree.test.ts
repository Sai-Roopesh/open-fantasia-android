import { describe, expect, it } from "vitest";
import { openDb, STATE_SHAPE } from "../../src/store/db.js";
import { apply } from "../../src/story/reducer.js";
import type { Entry } from "../../src/story/entries.js";
import { freshHome } from "../support/host.js";
import { malfoyProblemStoryFile } from "../support/story-files.js";

function storyWithScene() {
  const { db, tree, states } = freshHome();
  db.prepare("INSERT INTO stories (id, title, folder, created_at) VALUES ('s', 'T', '/x', 'now')").run();
  const setUp = tree.append("s", null, { kind: "story_set_up", storyFile: malfoyProblemStoryFile(), portraits: { "Draconia Malfoy": "draconia.png" } });
  const opened = tree.append("s", setUp.id, { kind: "scene_opened", number: 1, title: "The insult", place: "The Three Broomsticks", at: "Day 1 21:40", who: ["Draconia Malfoy"], prose: "She laughs.", startsAt: null, purpose: null, exit: null });
  return { db, tree, states, setUp, opened };
}

describe("the tree of entries", () => {
  it("never lets an entry change once written", () => {
    const { db, setUp } = storyWithScene();
    expect(() => db.prepare("UPDATE entries SET payload = '{}' WHERE id = ?").run(setUp.id)).toThrow(/never changed/);
  });

  it("reads a Path from its root to its head, oldest first", () => {
    const { tree, setUp, opened } = storyWithScene();
    const move = tree.append("s", opened.id, { kind: "move", text: "I raise my glass." });
    expect(tree.pathTo(move.id).map(entry => entry.id)).toEqual([setUp.id, opened.id, move.id]);
  });

  it("moves a Path's head only from the head it is known to have", () => {
    const { tree, opened } = storyWithScene();
    const path = tree.createPath("s", "Main", opened.id, true);
    const move = tree.append("s", opened.id, { kind: "move", text: "Hello." });
    expect(tree.moveHead(path.id, "someone-else", move.id)).toBe(false);
    expect(tree.moveHead(path.id, opened.id, move.id)).toBe(true);
    expect(tree.currentPath("s")?.headEntryId).toBe(move.id);
  });
});

describe("the reducer", () => {
  it("sets a Story up from its Story File", () => {
    const { setUp } = storyWithScene();
    const state = apply(null, setUp);
    expect(state.title).toBe("The Malfoy Problem");
    expect(state.leads).toEqual(["Draconia Malfoy", "Hermione Granger", "Harry Potter"]);
    expect(state.people["Draconia Malfoy"]?.portrait).toBe("draconia.png");
    expect(state.people["Crabbe"]?.group).toBe("Crabbe and Goyle");
    expect(state.clock).toBe("Day 1 21:40");
    expect(state.dayOneWeekday).toBe("friday");
    expect(state.scene).toBeNull();
  });

  it("opens a Scene and sets the clock to its time", () => {
    const { setUp, opened } = storyWithScene();
    const state = apply(apply(null, setUp), opened);
    expect(state.scene).toMatchObject({ number: 1, title: "The insult", place: "The Three Broomsticks", at: "Day 1 21:40", openedBy: opened.id });
  });

  it("refuses anything but a setup as a Story's first entry", () => {
    const { opened } = storyWithScene();
    expect(() => apply(null, opened)).toThrow(/begins with its setup/);
  });

  it("leaves the State as it was for a Move and a Reply", () => {
    const { setUp, opened } = storyWithScene();
    const before = apply(apply(null, setUp), opened);
    const move = { ...opened, payload: { kind: "move", text: "Hi." } } as Entry;
    expect(apply(before, move)).toEqual(before);
  });
});

describe("working out the State on a Path", () => {
  it("gives the same State after every saved State is thrown away", () => {
    const { tree, states, opened } = storyWithScene();
    let head = opened.id;
    for (let index = 0; index < 120; index++) {
      head = tree.append("s", head, index % 2 === 0
        ? { kind: "move", text: `Move ${index}` }
        : { kind: "reply", text: `Reply ${index}`, callId: `call-${index}`, model: { provider: "claude", model: "claude-opus-5-5" } }).id;
    }
    const cached = states.at(head);
    states.forget();
    expect(states.at(head)).toEqual(cached);
  });

  it("throws away saved States of an older shape when the store opens", () => {
    const { db, opened } = storyWithScene();
    db.prepare("INSERT OR REPLACE INTO states (entry_id, state) VALUES (?, ?)").run(opened.id, JSON.stringify({ an: "old shape" }));
    db.pragma("user_version = 1");
    const file = db.name;
    db.close();
    const reopened = openDb(file);
    expect(reopened.prepare("SELECT COUNT(*) AS n FROM states").get()).toEqual({ n: 0 });
    expect(reopened.pragma("user_version", { simple: true })).toBe(STATE_SHAPE);
  });

  it("reads a Beat Note written before a field was added as having it empty", () => {
    const { db, tree, opened } = storyWithScene();
    const move = tree.append("s", opened.id, { kind: "move", text: "I raise my glass." });
    // As the Writer's first version stored it: nothing in play and nobody going, because neither existed yet.
    const stored = { kind: "beat_note", plan: null, here: ["Draconia Malfoy"], beats: [], note: "She drinks.", call: "continue", intensity: 2, arcMoved: true, clock: "Day 1 21:41", taste: null, callId: "c", model: { provider: "claude", model: "claude-sonnet-5-5" } };
    db.prepare("INSERT INTO entries (id, story_id, parent_id, kind, payload, created_at) VALUES ('old-note', 's', ?, 'beat_note', ?, 'now')").run(move.id, JSON.stringify(stored));
    expect(tree.entry("old-note")?.payload).toMatchObject({ kind: "beat_note", inPlay: [], goes: [] });
    expect(tree.pathTo("old-note").at(-1)?.payload).toMatchObject({ inPlay: [], goes: [] });
  });

  it("keeps Chronicles beside the Path: a Path sees those whose parent is on it, and never walks one", () => {
    const { tree, opened } = storyWithScene();
    const model = { provider: "claude", model: "claude-sonnet-5-5" } as const;
    const chronicle = (parent: string, summary: string) => tree.append("s", parent, { kind: "chronicle", scene: opened.id, summary, moments: [], told: [], callId: "c", model });
    const move = tree.append("s", opened.id, { kind: "move", text: "I wave." });
    const reply = tree.append("s", move.id, { kind: "reply", text: "She waves back.", callId: "c", model });
    const early = chronicle(move.id, "early");
    const late = chronicle(reply.id, "late");
    const after = tree.append("s", reply.id, { kind: "move", text: "I sit." });

    expect(tree.chroniclesOn(after.id).map(entry => entry.id)).toEqual([early.id, late.id]);
    expect(tree.pathTo(after.id).some(entry => entry.payload.kind === "chronicle")).toBe(false);
    // A Path from an earlier entry inherits the Chronicles before it, and not those after.
    expect(tree.chroniclesOn(move.id).map(entry => entry.id)).toEqual([early.id]);
    // A Redo's new branch under the Move loses the Chronicle about the old Reply.
    const redo = tree.append("s", move.id, { kind: "redo", direction: null, remember: false });
    expect(tree.chroniclesOn(redo.id).map(entry => entry.id)).toEqual([early.id]);
  });
});
