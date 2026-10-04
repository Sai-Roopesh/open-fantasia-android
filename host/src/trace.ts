import { randomUUID } from "node:crypto";
import type { Db } from "./store/db.js";

export function newTraceId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Every request from the phone is kept with its trace id: what was asked and how it ended. The app shows the id
 * with any failure, and `fantasia trace <id>` shows the request, its outcome and every model call it made
 * (openspec mac-link: Looking up a failure).
 */
export class Traces {
  constructor(private readonly db: Db) {}

  begin(id: string, method: string, path: string, request: unknown): void {
    this.db.prepare("INSERT OR REPLACE INTO traces (id, method, path, request, started_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, method, path, request === undefined ? null : JSON.stringify(request), new Date().toISOString());
  }

  end(id: string, status: number, outcome: string): void {
    this.db.prepare("UPDATE traces SET status = ?, outcome = ?, finished_at = ? WHERE id = ?").run(status, outcome, new Date().toISOString(), id);
  }

  /** Everything known about a trace, written for a person reading it in a terminal. */
  describe(id: string): string | null {
    const trace = this.db.prepare("SELECT * FROM traces WHERE id = ?").get(id) as
      { method: string; path: string; request: string | null; status: number | null; outcome: string | null; started_at: string; finished_at: string | null } | undefined;
    const calls = this.db.prepare("SELECT * FROM calls WHERE trace_id = ? ORDER BY started_at").all(id) as
      { id: string; agent: string; provider: string; model: string; request: string; answer: string | null; error: string | null; started_at: string; finished_at: string | null }[];
    if (!trace && calls.length === 0) return null;
    const lines: string[] = [`Trace ${id}`];
    if (trace) {
      lines.push(`  ${trace.method} ${trace.path} at ${trace.started_at}`);
      if (trace.request) lines.push(`  Asked: ${trace.request}`);
      lines.push(`  Ended: ${trace.status ?? "still running"} ${trace.outcome ?? ""}`.trimEnd());
    }
    for (const call of calls) {
      const request = JSON.parse(call.request) as { system: string; prompt: string };
      lines.push(
        "",
        `  ${call.agent} call ${call.id} on ${call.provider} ${call.model}, ${call.started_at} to ${call.finished_at ?? "still running"}`,
        call.error ? `  Failed: ${call.error}` : `  Answered: ${call.answer ?? ""}`,
        "  System prompt:",
        indent(request.system),
        "  Prompt:",
        indent(request.prompt)
      );
    }
    return lines.join("\n");
  }
}

function indent(text: string): string {
  return text.split("\n").map(line => `    ${line}`).join("\n");
}
