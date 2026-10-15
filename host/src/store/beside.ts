import { randomUUID } from "node:crypto";
import type { Mac } from "../mac.js";
import type { Beside, SteeringNote } from "../story/beside.js";
import type { Reaction, State } from "../story/state.js";
import type { Db } from "./db.js";

/**
 * What the Story learns about the player, kept beside the Story and not on a Path (docs/adr/0020): a Story's Taste,
 * brief, reactions and steering notes, and the player's own Taste, which every Story starts with. A Redo, another
 * Path or a Rewind never takes any of it back; the player edits or deletes it instead. The tables are made the first
 * time they are used.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS taste (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  story_id TEXT REFERENCES stories(id) ON DELETE CASCADE,
  line TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS taste_story ON taste(story_id);

CREATE TABLE IF NOT EXISTS briefs (
  story_id TEXT PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
  more TEXT NOT NULL,
  less TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reactions (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  scene INTEGER NOT NULL,
  title TEXT NOT NULL,
  reaction TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY (story_id, scene)
);

CREATE TABLE IF NOT EXISTS steering_notes (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  written_at TEXT NOT NULL,
  answered_by INTEGER
);
CREATE INDEX IF NOT EXISTS steering_notes_story ON steering_notes(story_id);
`;

/** How many lessons each Taste keeps, the Story's and the player's own (openspec long-run: Taste is short, readable and the player's). */
export const TASTE_LINES = 10;

/** Whose Taste: the Story's own, or the player's own across every Story. */
export type TasteScope = "story" | "player";

type Store = Pick<Mac, "db">;

const made = new WeakSet<Db>();

function tables({ db }: Store): Db {
  if (!made.has(db)) {
    db.exec(SCHEMA);
    made.add(db);
  }
  return db;
}

/** The player's own Taste is kept with no Story. */
const owner = (storyId: string, scope: TasteScope): string | null => (scope === "player" ? null : storyId);

/** Everything the Story has learned from the player, for every agent that writes for it and for Backstage. */
export function besideOf(store: Store, storyId: string): Beside {
  const db = tables(store);
  const brief = db.prepare("SELECT more, less FROM briefs WHERE story_id = ?").get(storyId) as { more: string; less: string } | undefined;
  const reactions = db.prepare("SELECT scene, title, reaction, note FROM reactions WHERE story_id = ? ORDER BY scene").all(storyId) as Reaction[];
  const notes = db.prepare("SELECT id, text, written_at AS writtenAt, answered_by AS answeredBy FROM steering_notes WHERE story_id = ? ORDER BY written_at, rowid").all(storyId) as SteeringNote[];
  return {
    taste: tasteOf(store, storyId, "story"),
    playerTaste: tasteOf(store, storyId, "player"),
    brief: brief ? { more: JSON.parse(brief.more) as string[], less: JSON.parse(brief.less) as string[] } : { more: [], less: [] },
    reactions,
    notes
  };
}

/** A Taste's lessons, oldest first. */
export function tasteOf(store: Store, storyId: string, scope: TasteScope): string[] {
  const rows = tables(store).prepare("SELECT line FROM taste WHERE story_id IS ? ORDER BY seq").all(owner(storyId, scope)) as { line: string }[];
  return rows.map(row => row.line);
}

/** Adds a lesson to a Taste, unless it is there already; past ten lines, the oldest goes. */
export function learnLesson(store: Store, storyId: string, scope: TasteScope, line: string): void {
  const db = tables(store);
  const who = owner(storyId, scope);
  const words = line.trim();
  if (!words || tasteOf(store, storyId, scope).includes(words)) return;
  db.transaction(() => {
    db.prepare("INSERT INTO taste (story_id, line) VALUES (?, ?)").run(who, words);
    db.prepare("DELETE FROM taste WHERE story_id IS ? AND seq NOT IN (SELECT seq FROM taste WHERE story_id IS ? ORDER BY seq DESC LIMIT ?)").run(who, who, TASTE_LINES);
  })();
}

/** Deletes a lesson; false when the Taste has no such line. */
export function forgetLesson(store: Store, storyId: string, scope: TasteScope, line: string): boolean {
  return tables(store).prepare("DELETE FROM taste WHERE story_id IS ? AND line = ?").run(owner(storyId, scope), line).changes > 0;
}

/** Rewords a lesson in its place; false when the Taste has no such line. */
export function rewordLesson(store: Store, storyId: string, scope: TasteScope, line: string, words: string): boolean {
  return tables(store).prepare("UPDATE taste SET line = ? WHERE story_id IS ? AND line = ?").run(words, owner(storyId, scope), line).changes > 0;
}

/** The brief as a whole: what the player wants more of and less of. */
export function setBrief(store: Store, storyId: string, brief: { more: string[]; less: string[] }): void {
  tables(store).prepare("INSERT INTO briefs (story_id, more, less) VALUES (?, ?, ?) ON CONFLICT(story_id) DO UPDATE SET more = excluded.more, less = excluded.less")
    .run(storyId, JSON.stringify(brief.more), JSON.stringify(brief.less));
}

/** The player's reaction to a played Scene, by its number; null clears it. */
export function setReaction(store: Store, storyId: string, scene: number, reaction: Omit<Reaction, "scene"> | null): void {
  const db = tables(store);
  if (!reaction) db.prepare("DELETE FROM reactions WHERE story_id = ? AND scene = ?").run(storyId, scene);
  else db.prepare("INSERT INTO reactions (story_id, scene, title, reaction, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(story_id, scene) DO UPDATE SET title = excluded.title, reaction = excluded.reaction, note = excluded.note")
    .run(storyId, scene, reaction.title, reaction.reaction, reaction.note);
}

/** A note steering the Outline, waiting for the Director at the next Scene's end. */
export function writeNote(store: Store, storyId: string, text: string, now: Date = new Date()): SteeringNote {
  const note: SteeringNote = { id: randomUUID(), text, writtenAt: now.toISOString(), answeredBy: null };
  tables(store).prepare("INSERT INTO steering_notes (id, story_id, text, written_at, answered_by) VALUES (?, ?, ?, ?, NULL)").run(note.id, storyId, note.text, note.writtenAt);
  return note;
}

/** Deletes a steering note; false when the Story has no such note. */
export function dropNote(store: Store, storyId: string, id: string): boolean {
  return tables(store).prepare("DELETE FROM steering_notes WHERE story_id = ? AND id = ?").run(storyId, id).changes > 0;
}

/** Marks every note still waiting as answered by the Outline of [version], once the Director has written it. */
export function answerNotes(store: Store, storyId: string, version: number): void {
  tables(store).prepare("UPDATE steering_notes SET answered_by = ? WHERE story_id = ? AND answered_by IS NULL").run(version, storyId);
}

/** Words that speak of the player or their character: "my character", "me", "I". */
const THE_PLAYER = /\b(i|i'm|me|my|mine|myself|the player)\b/i;
/** Words that point at one person in the World. */
const SOMEONE = /\b(she|her|hers|herself|he|him|his|himself)\b/i;

/**
 * Whose Taste a lesson the Writer kept belongs to (openspec long-run: Taste is short, readable and the player's): the
 * player's own only when it is about how they like to read and not about this World. Kept conservative, so the
 * Story's when in doubt: a lesson that names anyone or anything in the Story, or points at one person ("never write
 * her as a first-timer"), is the Story's; otherwise it is the player's when the Writer said so, or when it speaks of
 * the player and their character ("don't decide what my character feels").
 */
export function lessonScope(state: State, lesson: string, flag: TasteScope | null): TasteScope {
  if (flag === "story" || SOMEONE.test(lesson) || namesTheWorld(state, lesson)) return "story";
  return flag === "player" || THE_PLAYER.test(lesson) ? "player" : "story";
}

function namesTheWorld(state: State, lesson: string): boolean {
  const words = ` ${lesson.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, " ")} `;
  const says = (name: string) => {
    const said = name.toLowerCase().replace(/^the\s+/, "").replace(/[^\p{L}\p{N}']+/gu, " ").trim();
    return said.length > 2 && words.includes(` ${said} `);
  };
  const people = Object.values(state.people).flatMap(person => [person.name, ...person.aliases, ...person.name.split(/\s+/)]);
  const places = [...state.world.places, ...state.world.institutions, ...state.groups].map(place => place.name);
  return [...people, ...places, state.title].some(says);
}
