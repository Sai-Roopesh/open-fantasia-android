import { mkdtempSync } from "node:fs";
import { emptyUpdate } from "../../src/story/truth.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openDb, STATE_SHAPE } from "../../src/store/db.js";
import { Tree } from "../../src/store/tree.js";
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
    expect(state.dayOne).toBe("1991-09-06");
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

  it("gives a store from before Paths could branch the new Path columns, with Main as it was", () => {
    const file = join(mkdtempSync(join(tmpdir(), "fantasia-old-")), "fantasia.db");
    const old = new Database(file);
    old.exec(`
      CREATE TABLE stories (id TEXT PRIMARY KEY, title TEXT NOT NULL, folder TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE entries (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, story_id TEXT NOT NULL, parent_id TEXT, kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE paths (id TEXT PRIMARY KEY, story_id TEXT NOT NULL, name TEXT NOT NULL, head_entry_id TEXT NOT NULL, is_current INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT INTO stories VALUES ('s', 'T', '/x', 'then');
      INSERT INTO entries (id, story_id, parent_id, kind, payload, created_at) VALUES ('root', 's', NULL, 'scene_opened', '{}', 'then');
      INSERT INTO paths VALUES ('main', 's', 'Main', 'root', 1, 'then', 'later');
    `);
    old.close();
    const tree = new Tree(openDb(file));
    expect(tree.currentPath("s")).toEqual({ id: "main", storyId: "s", name: "Main", headEntryId: "root", isCurrent: true, createdAt: "then", updatedAt: "later",
      origin: "main", forkedAt: null, opened: true, named: false });
  });

  it("sets a Story made before the Ledger aside, unlisted and kept as it was, while a new one is listed", () => {
    const file = join(mkdtempSync(join(tmpdir(), "fantasia-old-")), "fantasia.db");
    const old = new Database(file);
    old.exec(`
      CREATE TABLE stories (id TEXT PRIMARY KEY, title TEXT NOT NULL, folder TEXT NOT NULL, created_at TEXT NOT NULL);
      INSERT INTO stories VALUES ('old', 'The Night Train to Kalka', '/x', 'then');
    `);
    old.close();
    const db = openDb(file);
    db.prepare("INSERT INTO stories (id, title, folder, created_at) VALUES ('new', 'The Malfoy Problem', '/y', 'now')").run();
    expect(db.prepare("SELECT id, before_ledger FROM stories ORDER BY id").all()).toEqual([{ id: "new", before_ledger: 0 }, { id: "old", before_ledger: 1 }]);
    // Opened again, nothing more is set aside.
    db.close();
    expect(openDb(file).prepare("SELECT id FROM stories WHERE before_ledger = 0").all()).toEqual([{ id: "new" }]);
  });

  it("keeps a Scene's record on the Path: the State at an entry has only what the Path to it holds", () => {
    const { tree, states, opened } = storyWithScene();
    const model = { provider: "claude", model: "claude-sonnet-5-5" } as const;
    const move = tree.append("s", opened.id, { kind: "move", text: "I wave." });
    const reply = tree.append("s", move.id, { kind: "reply", text: "She waves back.", callId: "c", model });
    const closed = tree.append("s", reply.id, { kind: "scene_closed", by: "player" });
    const chronicle = tree.append("s", closed.id, {
      kind: "chronicle", truth: emptyUpdate(), scene: 1, summary: "She waved back.", paragraph: "He waved; she waved back.", told: [], known: [], bonds: [], engagements: [], changed: [], dropped: [],
      moments: [{ what: "She waves back.", quotes: [{ entry: reply.id, text: "She waves back." }], there: ["Draconia Malfoy"], weight: 2 }], callId: "c", model
    });
    expect(tree.pathTo(chronicle.id).map(entry => entry.payload.kind)).toEqual(["story_set_up", "scene_opened", "move", "reply", "scene_closed", "chronicle"]);
    expect(states.at(chronicle.id).recorded).toEqual([{ number: 1, title: "The insult", summary: "She waved back.", dropped: [] }]);
    expect(states.at(chronicle.id).facts.map(fact => fact.what)).toEqual(["She waves back."]);
    // The Scene before its end has none of it, and nor does a Redo's new branch under the Move.
    expect(states.at(closed.id)).toMatchObject({ recorded: [], facts: [] });
    const redo = tree.append("s", move.id, { kind: "redo", direction: null, remember: false });
    expect(states.at(redo.id)).toMatchObject({ recorded: [], facts: [] });
  });
});
