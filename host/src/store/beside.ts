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

CREATE TABLE IF NOT EXISTS path_reactions (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  scene INTEGER NOT NULL,
  scene_entry_id TEXT NOT NULL,
  title TEXT NOT NULL,
  reaction TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY (story_id, scene_entry_id)
);
CREATE INDEX IF NOT EXISTS path_reactions_story ON path_reactions(story_id);

CREATE TABLE IF NOT EXISTS steering_notes (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  written_at TEXT NOT NULL,
  answered_by INTEGER
);
CREATE INDEX IF NOT EXISTS steering_notes_story ON steering_notes(story_id);

CREATE TABLE IF NOT EXISTS note_answers (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  note_id TEXT NOT NULL REFERENCES steering_notes(id) ON DELETE CASCADE,
  outline_entry_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  PRIMARY KEY (story_id, note_id, outline_entry_id)
);
CREATE INDEX IF NOT EXISTS note_answers_story ON note_answers(story_id);
`;

/** Whose Taste: the Story's own, or the player's own across every Story. */
export type TasteScope = "story" | "player";

type Store = Pick<Mac, "db">;

const made = new WeakSet<Db>();

function tables({ db }: Store): Db {
  if (!made.has(db)) {
    db.transaction(() => {
    db.exec(SCHEMA);
    const columns = new Set((db.prepare("PRAGMA table_info(steering_notes)").all() as { name: string }[]).map(row => row.name));
    if (!columns.has("active")) db.exec("ALTER TABLE steering_notes ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
    if (!columns.has("source_entry")) db.exec("ALTER TABLE steering_notes ADD COLUMN source_entry TEXT");
    if (!columns.has("edited_at")) db.exec("ALTER TABLE steering_notes ADD COLUMN edited_at TEXT");
    if (!columns.has("remember")) {
      db.exec("ALTER TABLE steering_notes ADD COLUMN remember INTEGER NOT NULL DEFAULT 0");
      db.exec(`UPDATE steering_notes SET remember = 1 WHERE source_entry IS NOT NULL AND EXISTS (
        SELECT 1 FROM entries e WHERE e.id = steering_notes.source_entry AND json_extract(e.payload, '$.remember') = 1
      )`);
    }
    const tasteColumns = new Set((db.prepare("PRAGMA table_info(taste)").all() as { name: string }[]).map(row => row.name));
    if (!tasteColumns.has("active")) db.exec("ALTER TABLE taste ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
    if (!tasteColumns.has("source_note_id")) db.exec("ALTER TABLE taste ADD COLUMN source_note_id TEXT");
    // Recover only remembered Redo instructions (remember=1); unremembered Redo corrections (remember=0) are one-shot
    // for that single rewrite and must not persist into later Moves.
    db.exec(`DELETE FROM steering_notes WHERE source_entry IS NOT NULL AND remember = 0 AND edited_at IS NULL`);
    db.exec(`INSERT OR IGNORE INTO steering_notes (id, story_id, text, written_at, answered_by, source_entry, remember)
      SELECT id, story_id, json_extract(payload, '$.direction'), created_at, NULL, id, 1
      FROM entries
      WHERE kind = 'redo' AND json_extract(payload, '$.remember') = 1 AND length(trim(coalesce(json_extract(payload, '$.direction'), ''))) > 0`);
    // Retain old automatic paraphrases as history, rather than keeping a second, uneditable copy of a Direction
    // active after its original is archived. Explicitly authored Taste remains active.
    const aliases = db.prepare(`SELECT c.story_id AS storyId,
      CASE WHEN json_valid(c.answer) THEN json_extract(c.answer, '$.taste') END AS lesson,
      CASE WHEN json_valid(t.request) THEN json_extract(t.request, '$.direction') END AS direction
      FROM calls c JOIN traces t ON t.id = c.trace_id WHERE c.agent = 'writer' AND t.path LIKE '%/redo'`).all() as { storyId: string; lesson: string | null; direction: string | null }[];
    const find = db.prepare("SELECT id FROM steering_notes WHERE story_id = ? AND text = ? ORDER BY written_at DESC LIMIT 1");
    const retire = db.prepare("UPDATE taste SET active = 0, source_note_id = ? WHERE line = ? AND (story_id = ? OR story_id IS NULL) AND source_note_id IS NULL");
    for (const alias of aliases) if (typeof alias.lesson === "string" && typeof alias.direction === "string" && alias.lesson && alias.direction) {
      const note = find.get(alias.storyId, alias.direction.trim()) as { id: string } | undefined;
      if (note) retire.run(note.id, alias.lesson.trim(), alias.storyId);
    }
    })();
    made.add(db);
  }
  return db;
}

/** The player's own Taste is kept with no Story. */
const owner = (storyId: string, scope: TasteScope): string | null => (scope === "player" ? null : storyId);

/** Every entry id on the lineage from the Story's root to [headEntryId]. */
function lineageOf(db: Db, headEntryId: string): Set<string> {
  const rows = db.prepare(`
    WITH RECURSIVE path(id, parent_id) AS (
      SELECT id, parent_id FROM entries WHERE id = ?
      UNION ALL
      SELECT e.id, e.parent_id FROM entries e JOIN path ON path.parent_id = e.id
    )
    SELECT id FROM path
  `).all(headEntryId) as { id: string }[];
  return new Set(rows.map(row => row.id));
}

/**
 * Everything the Story has learned from the player, for every agent that writes for it and for Backstage.
 * When [headEntryId] is given, Redo-originated Directions (`source_entry` set) and per-Path Scene reactions are
 * filtered to that Path's ancestry so abandoned or sibling Paths never bleed into the active Path.
 */
export function besideOf(store: Store, storyId: string, headEntryId?: string | null): Beside {
  const db = tables(store);
  const ancestors = headEntryId ? lineageOf(db, headEntryId) : null;
  const brief = db.prepare("SELECT more, less FROM briefs WHERE story_id = ?").get(storyId) as { more: string; less: string } | undefined;
  const legacyReactions = db.prepare("SELECT scene, title, reaction, note FROM reactions WHERE story_id = ? ORDER BY scene").all(storyId) as Reaction[];
  const pathReactions = (db.prepare("SELECT scene, scene_entry_id AS sceneEntryId, title, reaction, note FROM path_reactions WHERE story_id = ? ORDER BY scene").all(storyId) as (Reaction & { sceneEntryId: string })[])
    .filter(row => !ancestors || ancestors.has(row.sceneEntryId));
  const byScene = new Map<number, Reaction>();
  for (const row of legacyReactions) byScene.set(row.scene, row);
  for (const row of pathReactions) byScene.set(row.scene, { scene: row.scene, title: row.title, reaction: row.reaction, note: row.note });
  const reactions = [...byScene.values()].sort((left, right) => left.scene - right.scene);
  const rawNotes = db.prepare("SELECT id, text, written_at AS writtenAt, answered_by AS answeredBy, active, source_entry AS sourceEntry, remember FROM steering_notes WHERE story_id = ? ORDER BY written_at, rowid").all(storyId) as (Omit<SteeringNote, "active"> & { active: number; sourceEntry: string | null; remember: number })[];
  const answerRows = db.prepare("SELECT note_id AS noteId, outline_entry_id AS outlineEntryId, version FROM note_answers WHERE story_id = ?").all(storyId) as { noteId: string; outlineEntryId: string; version: number }[];
  const answersByNote = new Map<string, { outlineEntryId: string; version: number }[]>();
  for (const row of answerRows) {
    const list = answersByNote.get(row.noteId);
    if (list) list.push(row);
    else answersByNote.set(row.noteId, [row]);
  }
  const notes = rawNotes
    // Never carry unremembered Redo corrections (sourceEntry != null && remember = 0) into subsequent turns.
    .filter(note => note.sourceEntry === null || note.remember === 1)
    .map(({ sourceEntry, remember: _remember, ...note }) => {
      const scoped = answersByNote.get(note.id);
      let answeredBy = note.answeredBy;
      if (scoped && scoped.length > 0) {
        if (ancestors) {
          const hit = scoped.filter(item => ancestors.has(item.outlineEntryId)).sort((a, b) => b.version - a.version)[0];
          answeredBy = hit ? hit.version : null;
        } else {
          answeredBy = Math.max(...scoped.map(item => item.version));
        }
      }
      return { ...note, answeredBy, active: note.active === 1, requiresPlan: sourceEntry === null };
    });
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
  const rows = tables(store).prepare("SELECT line FROM taste WHERE story_id IS ? AND active = 1 ORDER BY seq").all(owner(storyId, scope)) as { line: string }[];
  return rows.map(row => row.line);
}

/** Adds a lesson without silently discarding earlier instructions. */
export function learnLesson(store: Store, storyId: string, scope: TasteScope, line: string): void {
  const db = tables(store);
  const who = owner(storyId, scope);
  const words = line.trim();
  if (!words || tasteOf(store, storyId, scope).includes(words)) return;
  db.transaction(() => {
    db.prepare("INSERT INTO taste (story_id, line) VALUES (?, ?)").run(who, words);
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

/** The player's reaction to a played Scene, scoped to [sceneEntryId] when provided; null clears it. */
export function setReaction(store: Store, storyId: string, scene: number, reaction: Omit<Reaction, "scene"> | null, sceneEntryId?: string | null): void {
  const db = tables(store);
  if (sceneEntryId) {
    if (!reaction) db.prepare("DELETE FROM path_reactions WHERE story_id = ? AND scene_entry_id = ?").run(storyId, sceneEntryId);
    else db.prepare("INSERT INTO path_reactions (story_id, scene, scene_entry_id, title, reaction, note) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(story_id, scene_entry_id) DO UPDATE SET title = excluded.title, reaction = excluded.reaction, note = excluded.note")
      .run(storyId, scene, sceneEntryId, reaction.title, reaction.reaction, reaction.note);
    return;
  }
  if (!reaction) db.prepare("DELETE FROM reactions WHERE story_id = ? AND scene = ?").run(storyId, scene);
  else db.prepare("INSERT INTO reactions (story_id, scene, title, reaction, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(story_id, scene) DO UPDATE SET title = excluded.title, reaction = excluded.reaction, note = excluded.note")
    .run(storyId, scene, reaction.title, reaction.reaction, reaction.note);
}

/** A note steering the Outline, waiting for the Director at the next Scene's end. */
export function writeNote(store: Store, storyId: string, text: string, now: Date = new Date(), sourceEntry?: string, remember = false): SteeringNote {
  const note: SteeringNote = { id: sourceEntry ?? randomUUID(), text: text.trim(), writtenAt: now.toISOString(), answeredBy: null, active: true, requiresPlan: !sourceEntry };
  tables(store).prepare("INSERT OR IGNORE INTO steering_notes (id, story_id, text, written_at, answered_by, source_entry, remember) VALUES (?, ?, ?, ?, NULL, ?, ?)").run(note.id, storyId, note.text, note.writtenAt, sourceEntry ?? null, remember ? 1 : 0);
  return note;
}

/** Archives a Direction without losing its words; false when the Story has no such note. */
export function dropNote(store: Store, storyId: string, id: string): boolean {
  return tables(store).prepare("UPDATE steering_notes SET active = 0 WHERE story_id = ? AND id = ?").run(storyId, id).changes > 0;
}

/** Editing or disabling a Direction preserves its original text and provenance in the audit log. */
export function editNote(store: Store, storyId: string, id: string, text: string, active: boolean): boolean {
  const db = tables(store);
  db.exec("CREATE TABLE IF NOT EXISTS direction_edits (id INTEGER PRIMARY KEY, note_id TEXT NOT NULL, text TEXT NOT NULL, active INTEGER NOT NULL, edited_at TEXT NOT NULL)");
  return db.transaction(() => {
    db.prepare("INSERT INTO direction_edits (note_id, text, active, edited_at) SELECT id, text, active, ? FROM steering_notes WHERE story_id = ? AND id = ?").run(new Date().toISOString(), storyId, id);
    db.prepare("DELETE FROM note_answers WHERE story_id = ? AND note_id = ?").run(storyId, id);
    return db.prepare("UPDATE steering_notes SET text = ?, active = ?, edited_at = ?, answered_by = NULL WHERE story_id = ? AND id = ?").run(text.trim(), Number(active), new Date().toISOString(), storyId, id).changes > 0;
  })();
}

/**
 * Marks every waiting note as answered by the Outline of [version], scoped to [outlineEntryId]'s Path when provided so
 * answering a Backstage note on one Path does not suppress re-planning for it on a sibling Path.
 */
export function answerNotes(store: Store, storyId: string, version: number, outlineEntryId?: string | null): void {
  const db = tables(store);
  if (outlineEntryId) {
    const ancestors = lineageOf(db, outlineEntryId);
    const activeNotes = db.prepare("SELECT id FROM steering_notes WHERE story_id = ? AND active = 1 AND source_entry IS NULL").all(storyId) as { id: string }[];
    const existing = db.prepare("SELECT outline_entry_id AS outlineEntryId FROM note_answers WHERE story_id = ? AND note_id = ?");
    const insert = db.prepare("INSERT OR IGNORE INTO note_answers (story_id, note_id, outline_entry_id, version) VALUES (?, ?, ?, ?)");
    db.transaction(() => {
      for (const note of activeNotes) {
        const rows = existing.all(storyId, note.id) as { outlineEntryId: string }[];
        if (!rows.some(row => ancestors.has(row.outlineEntryId))) insert.run(storyId, note.id, outlineEntryId, version);
      }
    })();
    return;
  }
  db.prepare("UPDATE steering_notes SET answered_by = ? WHERE story_id = ? AND active = 1 AND answered_by IS NULL").run(version, storyId);
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
