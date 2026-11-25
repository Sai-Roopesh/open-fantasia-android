import { apply } from "../story/reducer.js";
import type { Entry } from "../story/entries.js";
import type { State } from "../story/state.js";
import type { Db } from "./db.js";
import type { Tree } from "./tree.js";

/** How many entries may pass before the State is saved again, so working it out never replays far. */
export const SAVE_EVERY = 50;
/** Bounded in-memory LRU cache of immutable folded States (entries never change, so State at entryId is pure). */
const MAX_MEM = 64;

export class States {
  private readonly mem = new Map<string, State>();

  constructor(private readonly db: Db, private readonly tree: Tree) {}

  at(entryId: string): State {
    const cached = this.mem.get(entryId);
    if (cached) {
      this.mem.delete(entryId);
      this.mem.set(entryId, cached);
      return cached;
    }
    const path = this.tree.pathTo(entryId);
    if (path.length === 0) throw new Error(`No entry ${entryId}`);
    const saved = this.nearestSaved(path);
    let state = saved?.state ?? null;
    path.slice((saved?.index ?? -1) + 1).forEach((entry, offset) => {
      const index = (saved?.index ?? -1) + 1 + offset;
      state = apply(state, entry);
      if (this.worthSaving(entry, index)) this.save(entry.id, state);
    });
    if (state === null) throw new Error(`No State at ${entryId}: its Path has no entries`);
    this.remember(entryId, state);
    return state;
  }

  forget(): void {
    this.mem.clear();
    this.db.prepare("DELETE FROM states").run();
  }

  private remember(entryId: string, state: State): void {
    this.mem.set(entryId, state);
    if (this.mem.size > MAX_MEM) {
      const oldest = this.mem.keys().next().value;
      if (oldest !== undefined) this.mem.delete(oldest);
    }
  }

  private nearestSaved(path: Entry[]): { index: number; state: State } | null {
    for (let index = path.length - 1; index >= 0; index--) {
      const entry = path[index];
      const hit = entry ? this.mem.get(entry.id) : undefined;
      if (hit) return { index, state: hit };
    }
    const windowStart = Math.max(0, path.length - SAVE_EVERY - 5);
    const ids = path.slice(windowStart).map(entry => entry.id);
    if (ids.length > 0) {
      const rows = this.db.prepare(`SELECT entry_id, state FROM states WHERE entry_id IN (${ids.map(() => "?").join(", ")})`).all(...ids) as { entry_id: string; state: string }[];
      const found = new Map(rows.map(row => [row.entry_id, row.state]));
      for (let index = path.length - 1; index >= windowStart; index--) {
        const entry = path[index];
        const raw = entry ? found.get(entry.id) : undefined;
        if (raw) return { index, state: JSON.parse(raw) as State };
      }
    }
    const lookup = this.db.prepare("SELECT state FROM states WHERE entry_id = ?");
    for (let index = windowStart - 1; index >= 0; index--) {
      const entry = path[index];
      const row = entry && (lookup.get(entry.id) as { state: string } | undefined);
      if (row) return { index, state: JSON.parse(row.state) as State };
    }
    return null;
  }

  private worthSaving(entry: Entry, index: number): boolean {
    return entry.payload.kind === "story_set_up" || entry.payload.kind === "scene_opened" || index % SAVE_EVERY === 0;
  }

  private save(entryId: string, state: State): void {
    this.db.prepare("INSERT OR REPLACE INTO states (entry_id, state) VALUES (?, ?)").run(entryId, JSON.stringify(state));
  }
}
