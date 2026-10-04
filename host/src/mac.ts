import { join } from "node:path";
import { openDb, type Db } from "./store/db.js";
import { States } from "./store/states.js";
import { Tree } from "./store/tree.js";

/** The Mac's Story store and where it keeps its files: what every part of the host is given to work with. */
export interface Mac {
  home: string;
  db: Db;
  tree: Tree;
  states: States;
}

export function openMac(home: string): Mac {
  const db = openDb(join(home, "fantasia.db"));
  const tree = new Tree(db);
  return { home, db, tree, states: new States(db, tree) };
}
