import { describe, expect, it } from "vitest";
import { ModelCallFailed, Models, type ModelRequest } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { ledger } from "../agents/ledger.js";
import { freshHome, openHome } from "../support/host.js";

const request: ModelRequest = {
  agent: "actor",
  model: { provider: "claude", model: "claude-opus-5-5" },
  system: "You write the people around the player.",
  prompt: "The Move: I sit down.",
  traceId: "trace-1",
  storyId: null
};

describe("model calls", () => {
  it("keeps the exact request and answer of every call", async () => {
    const { db } = freshHome();
    const models = new Models(db, { claude: new ScriptedRunner([{ answer: "She moves her bag off the seat." }]) });
    const words: string[] = [];
    const answer = await models.call(request, word => words.push(word));
    expect(words.join("")).toBe("She moves her bag off the seat.");
    const row = db.prepare("SELECT * FROM calls WHERE id = ?").get(answer.callId) as { request: string; answer: string; trace_id: string; error: string | null };
    expect(JSON.parse(row.request)).toEqual(request);
    expect(row.answer).toBe("She moves her bag off the seat.");
    expect(row.trace_id).toBe("trace-1");
    expect(row.error).toBeNull();
  });

  it("keeps the reason a call failed", async () => {
    const { db } = freshHome();
    const models = new Models(db, { claude: new ScriptedRunner([{ fail: "Claude is overloaded" }]) });
    const failure = await models.call(request).catch(error => error as ModelCallFailed);
    expect(failure).toBeInstanceOf(ModelCallFailed);
    const row = db.prepare("SELECT error, answer FROM calls WHERE id = ?").get((failure as ModelCallFailed).callId) as { error: string; answer: string | null };
    expect(row).toEqual({ error: "Claude is overloaded", answer: null });
  });

  it("answers in JSON when the request carries a schema, and keeps what the prompt was written from", async () => {
    const { db } = freshHome();
    const models = new Models(db, { claude: new ScriptedRunner([{ answer: "{\"note\": \"Meera looks up.\", \"intensity\": 2}" }]) });
    const schema = { type: "object", required: ["note"], properties: { note: { type: "string" }, intensity: { type: "integer" } } };
    const answer = await models.call({ ...request, agent: "writer", schema, facts: { clock: "Day 1 23:10" } });
    expect(answer.json).toEqual({ note: "Meera looks up.", intensity: 2 });
    const row = db.prepare("SELECT request FROM calls WHERE id = ?").get(answer.callId) as { request: string };
    expect(JSON.parse(row.request)).toMatchObject({ schema, facts: { clock: "Day 1 23:10" } });
  });

  it("fails a call asked for JSON that answers with something else, and keeps what it said", async () => {
    const { db } = freshHome();
    const models = new Models(db, { claude: new ScriptedRunner([{ answer: "Meera looks up." }]) });
    const failure = await models.call({ ...request, schema: { type: "object" } }).then(() => null, (error: unknown) => error as ModelCallFailed);
    expect(failure).toBeInstanceOf(ModelCallFailed);
    expect(failure!.message).toMatch(/not JSON/);
    const row = db.prepare("SELECT answer, error FROM calls WHERE id = ?").get((failure as ModelCallFailed).callId) as { answer: string; error: string };
    expect(row.answer).toBe("Meera looks up.");
  });

  it("keeps what a call looked up, a line each, even when the call then fails (docs/adr/0018)", async () => {
    const story = ledger();
    story.move("I ask about the egg.");
    story.reply("\"Hagrid has a dragon egg,\" Hermione whispers.");
    const tools = { story: { storyId: story.storyId, head: story.head() }, web: true };
    const models = new Models(story.mac.db, { claude: new ScriptedRunner([
      { lookUp: [{ tool: "read_person", args: { name: "Hermione" } }], then: { answer: "Meera looks up." } },
      { lookUp: [{ tool: "web_search", args: { query: "dragon eggs" } }], then: { fail: "Claude is overloaded" } }
    ]) });
    const answer = await models.call({ ...request, tools, turns: 4 });
    expect(answer.lookups).toEqual(["read Hermione Granger's history"]);
    const failure = await models.call({ ...request, tools, turns: 4 }).catch(error => error as ModelCallFailed);
    const rows = story.mac.db.prepare("SELECT lookups, error FROM calls ORDER BY rowid").all() as { lookups: string | null; error: string | null }[];
    expect(rows).toEqual([{ lookups: "[\"read Hermione Granger's history\"]", error: null }, { lookups: "[\"searched the web for “dragon eggs”\"]", error: "Claude is overloaded" }]);
    expect(models.lookedUp((failure as ModelCallFailed).callId)).toEqual(["searched the web for “dragon eggs”"]);
  });

  it("gives a store from before lookups the column for them", () => {
    const { home, db } = freshHome();
    db.exec("ALTER TABLE calls DROP COLUMN lookups");
    db.close();
    const reopened = openHome(home);
    const columns = (reopened.db.prepare("PRAGMA table_info(calls)").all() as { name: string }[]).map(column => column.name);
    expect(columns).toContain("lookups");
  });

  it("fails a provider it has no way to reach", async () => {
    const { db } = freshHome();
    const models = new Models(db, {});
    await expect(models.call(request)).rejects.toThrow(/No way to reach claude/);
  });
});
