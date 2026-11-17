import type { Db } from "./db.js";
import type { Beside } from "../story/beside.js";
import type { ModelChoice } from "../story/state.js";

export interface Draft { text: string; callId: string; model: ModelChoice; beside: Beside; rewrites: number }

/** Durable intermediate work, separate from the played Story. Recovery never pays to regenerate a checked draft. */
export class Drafts {
  constructor(private readonly db: Db) {
    db.exec("CREATE TABLE IF NOT EXISTS reply_drafts (note_id TEXT PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE, draft TEXT NOT NULL)");
  }
  get(note: string): Draft | null {
    const row = this.db.prepare("SELECT draft FROM reply_drafts WHERE note_id = ?").get(note) as { draft: string } | undefined;
    return row ? JSON.parse(row.draft) as Draft : null;
  }
  save(note: string, draft: Draft): void {
    this.db.prepare("INSERT INTO reply_drafts (note_id, draft) VALUES (?, ?) ON CONFLICT(note_id) DO UPDATE SET draft = excluded.draft").run(note, JSON.stringify(draft));
  }
}
