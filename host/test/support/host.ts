import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "../../src/store/db.js";
import { States } from "../../src/store/states.js";
import { Tree } from "../../src/store/tree.js";

/** A throwaway Mac: its own folder and database, so every test starts from nothing and leaves nothing behind. */
export function freshHome(): { home: string; db: Db; tree: Tree; states: States } {
  const home = mkdtempSync(join(tmpdir(), "fantasia-home-"));
  const db = openDb(join(home, "fantasia.db"));
  const tree = new Tree(db);
  return { home, db, tree, states: new States(db, tree) };
}
