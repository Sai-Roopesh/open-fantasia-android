import { randomUUID } from "node:crypto";
import type { Entry, Payload } from "../story/entries.js";
import type { Db } from "./db.js";

interface EntryRow {
  seq: number;
  id: string;
  story_id: string;
  parent_id: string | null;
  kind: string;
  payload: string;
  created_at: string;
}

interface PathRow {
  id: string;
  story_id: string;
  name: string;
  head_entry_id: string;
  is_current: number;
  created_at: string;
  updated_at: string;
}

export interface StoryPath {
  id: string;
  storyId: string;
  name: string;
  headEntryId: string;
  isCurrent: boolean;
  updatedAt: string;
}

function toEntry(row: EntryRow): Entry {
  return { seq: row.seq, id: row.id, storyId: row.story_id, parentId: row.parent_id, payload: JSON.parse(row.payload) as Payload, createdAt: row.created_at };
}

function toPath(row: PathRow): StoryPath {
  return { id: row.id, storyId: row.story_id, name: row.name, headEntryId: row.head_entry_id, isCurrent: row.is_current === 1, updatedAt: row.updated_at };
}

/**
 * The tree of entries and the Paths through it (docs/adr/0003). Writing is append-only; a Path moves by pointing
 * its head at a newer entry.
 */
export class Tree {
  constructor(private readonly db: Db, private readonly now: () => string = () => new Date().toISOString()) {}

  append(storyId: string, parentId: string | null, payload: Payload): Entry {
    const id = randomUUID();
    const createdAt = this.now();
    const result = this.db
      .prepare("INSERT INTO entries (id, story_id, parent_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, storyId, parentId, payload.kind, JSON.stringify(payload), createdAt);
    return { seq: Number(result.lastInsertRowid), id, storyId, parentId, payload, createdAt };
  }

  entry(id: string): Entry | null {
    const row = this.db.prepare("SELECT * FROM entries WHERE id = ?").get(id) as EntryRow | undefined;
    return row ? toEntry(row) : null;
  }

  /** The entries from the root to [headId], oldest first. */
  pathTo(headId: string): Entry[] {
    const rows = this.db.prepare(`
      WITH RECURSIVE path(id, parent_id, depth) AS (
        SELECT id, parent_id, 0 FROM entries WHERE id = ?
        UNION ALL
        SELECT e.id, e.parent_id, path.depth + 1 FROM entries e JOIN path ON path.parent_id = e.id
      )
      SELECT entries.* FROM entries JOIN path ON path.id = entries.id ORDER BY path.depth DESC
    `).all(headId) as EntryRow[];
    return rows.map(toEntry);
  }

  /**
   * The Chronicles a Path sees: those whose parent is on the Path from the root to [headId], in Path order (docs/adr/0007).
   * They hang off the Path, so walking it never meets one.
   */
  chroniclesOn(headId: string): Entry[] {
    const rows = this.db.prepare(`
      WITH RECURSIVE path(id, parent_id, depth) AS (
        SELECT id, parent_id, 0 FROM entries WHERE id = ?
        UNION ALL
        SELECT e.id, e.parent_id, path.depth + 1 FROM entries e JOIN path ON path.parent_id = e.id
      )
      SELECT c.* FROM entries c JOIN path ON c.parent_id = path.id
      WHERE c.kind = 'chronicle'
      ORDER BY path.depth DESC, c.seq
    `).all(headId) as EntryRow[];
    return rows.map(toEntry);
  }

  createPath(storyId: string, name: string, headEntryId: string, isCurrent: boolean): StoryPath {
    const id = randomUUID();
    const at = this.now();
    this.db
      .prepare("INSERT INTO paths (id, story_id, name, head_entry_id, is_current, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(id, storyId, name, headEntryId, isCurrent ? 1 : 0, at, at);
    return { id, storyId, name, headEntryId, isCurrent, updatedAt: at };
  }

  currentPath(storyId: string): StoryPath | null {
    const row = this.db.prepare("SELECT * FROM paths WHERE story_id = ? AND is_current = 1").get(storyId) as PathRow | undefined;
    return row ? toPath(row) : null;
  }

  path(id: string): StoryPath | null {
    const row = this.db.prepare("SELECT * FROM paths WHERE id = ?").get(id) as PathRow | undefined;
    return row ? toPath(row) : null;
  }

  /** Moves a Path's head, only from the head it is known to have: a Path that moved meanwhile is left alone. */
  moveHead(pathId: string, from: string, to: string): boolean {
    const result = this.db
      .prepare("UPDATE paths SET head_entry_id = ?, updated_at = ? WHERE id = ? AND head_entry_id = ?")
      .run(to, this.now(), pathId, from);
    return result.changes === 1;
  }

  /** Entries on [headId]'s path written after [afterSeq], oldest first: what a phone that saw [afterSeq] missed. */
  pathAfter(headId: string, afterSeq: number): Entry[] {
    return this.pathTo(headId).filter(entry => entry.seq > afterSeq);
  }
}
