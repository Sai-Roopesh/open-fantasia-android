import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "../../src/store/db.js";
import { States } from "../../src/store/states.js";
import { Tree } from "../../src/store/tree.js";

/** A throwaway Mac: its own folder and database, so every test starts from nothing and leaves nothing behind. */
export function freshHome(): { home: string; db: Db; tree: Tree; states: States } {
  return openHome(mkdtempSync(join(tmpdir(), "fantasia-home-")));
}

/** A Mac's folder opened again, as a restarted host opens it. */
export function openHome(home: string): { home: string; db: Db; tree: Tree; states: States } {
  const db = openDb(join(home, "fantasia.db"));
  const tree = new Tree(db);
  return { home, db, tree, states: new States(db, tree) };
}

/** Which provider and model each call for [agent] went to, oldest first, from the Mac's record of every call. */
export function callsFor(db: Db, agent: string): { provider: string; model: string; effort: string | null }[] {
  return (db.prepare("SELECT provider, model, json_extract(request, '$.model.effort') AS effort FROM calls WHERE agent = ? ORDER BY rowid").all(agent) as { provider: string; model: string; effort: string | null }[]);
}
