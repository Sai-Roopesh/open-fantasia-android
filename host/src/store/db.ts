import Database from "better-sqlite3";

export type Db = Database.Database;

/**
 * The Story store (docs/adr/0003). Entries are the Story: written once and never changed, which a trigger
 * enforces, so no bug can rewrite history. Paths are the only rows that move, and only their head. States are a
 * cache of the reducer's work and can be deleted at any time.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  folder TEXT NOT NULL,
  created_at TEXT NOT NULL,
  before_ledger INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS entries (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES entries(id),
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_story ON entries(story_id);
CREATE INDEX IF NOT EXISTS entries_parent ON entries(parent_id);

CREATE TRIGGER IF NOT EXISTS entries_never_change BEFORE UPDATE ON entries
BEGIN
  SELECT RAISE(ABORT, 'An entry is never changed once written');
END;

CREATE TABLE IF NOT EXISTS paths (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  head_entry_id TEXT NOT NULL REFERENCES entries(id),
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'main',
  forked_at TEXT,
  opened INTEGER NOT NULL DEFAULT 1,
  named INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS paths_story ON paths(story_id);

CREATE TABLE IF NOT EXISTS states (
  entry_id TEXT PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
  state TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  story_id TEXT,
  entry_id TEXT,
  agent TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  request TEXT NOT NULL,
  answer TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  lookups TEXT
);
CREATE INDEX IF NOT EXISTS calls_trace ON calls(trace_id);
CREATE INDEX IF NOT EXISTS calls_entry ON calls(entry_id);

CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  request TEXT,
  status INTEGER,
  outcome TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  paired_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pairing_codes (
  code TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);
`;

/**
 * The shape of the State that saved States have. When the State gains or changes a field, this goes up, and the
 * saved States are thrown away the next time the store opens: they are a cache, and the entries are the truth.
 */
export const STATE_SHAPE = 10;

/**
 * What a Path card needs (openspec paths): how the Path began, the entry it branched from, whether the player has
 * been on it, and whether they named it. A store from before Paths could branch gains them in place, as Main.
 */
const PATH_COLUMNS: [string, string][] = [
  ["origin", "TEXT NOT NULL DEFAULT 'main'"],
  ["forked_at", "TEXT"],
  ["opened", "INTEGER NOT NULL DEFAULT 1"],
  ["named", "INTEGER NOT NULL DEFAULT 0"]
];

/**
 * A Story made before everything was on the Path (docs/adr/0015) cannot be read: it is kept as it was, unlisted, and
 * made again from its Story File.
 */
function setStoriesBeforeLedgerAside(db: Db): void {
  const has = new Set((db.prepare("PRAGMA table_info(stories)").all() as { name: string }[]).map(column => column.name));
  if (has.has("before_ledger")) return;
  db.exec("ALTER TABLE stories ADD COLUMN before_ledger INTEGER NOT NULL DEFAULT 0");
  db.exec("UPDATE stories SET before_ledger = 1");
}

function addPathColumns(db: Db): void {
  const has = new Set((db.prepare("PRAGMA table_info(paths)").all() as { name: string }[]).map(column => column.name));
  for (const [name, type] of PATH_COLUMNS) if (!has.has(name)) db.exec(`ALTER TABLE paths ADD COLUMN ${name} ${type}`);
}

/**
 * What a call looked up, a line each, as JSON (docs/adr/0018). A store from before agents could look things up gains
 * it in place.
 */
const CALL_COLUMNS: [string, string][] = [["lookups", "TEXT"], ["usage", "TEXT"], ["wire", "TEXT"]];

function addCallColumns(db: Db): void {
  const has = new Set((db.prepare("PRAGMA table_info(calls)").all() as { name: string }[]).map(column => column.name));
  for (const [name, type] of CALL_COLUMNS) if (!has.has(name)) db.exec(`ALTER TABLE calls ADD COLUMN ${name} ${type}`);
}

export function openDb(file: string): Db {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  addPathColumns(db);
  addCallColumns(db);
  setStoriesBeforeLedgerAside(db);
  if (db.pragma("user_version", { simple: true }) !== STATE_SHAPE) {
    db.exec("DELETE FROM states");
    db.pragma(`user_version = ${STATE_SHAPE}`);
  }
  return db;
}
