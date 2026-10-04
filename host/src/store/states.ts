import { apply } from "../story/reducer.js";
import type { Entry } from "../story/entries.js";
import type { State } from "../story/state.js";
import type { Db } from "./db.js";
import type { Tree } from "./tree.js";

/** How many entries may pass before the State is saved again, so working it out never replays far. */
export const SAVE_EVERY = 50;

/**
 * Works out the State at any entry: the nearest saved State among its ancestors, with the entries after it
 * applied. States are saved at every Scene's opening and every SAVE_EVERY entries. They are a cache: forget()
 * throws them all away and nothing is lost, because the entries are the truth.
 */
export class States {
  constructor(private readonly db: Db, private readonly tree: Tree) {}

  at(entryId: string): State {
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
    return state;
  }

  forget(): void {
    this.db.prepare("DELETE FROM states").run();
  }

  private nearestSaved(path: Entry[]): { index: number; state: State } | null {
    const lookup = this.db.prepare("SELECT state FROM states WHERE entry_id = ?");
    for (let index = path.length - 1; index >= 0; index--) {
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
