import { describe, expect, it } from "vitest";
import { ModelCallFailed, Models, type ModelRequest } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { freshHome } from "../support/host.js";

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

  it("fails a provider it has no way to reach", async () => {
    const { db } = freshHome();
    const models = new Models(db, {});
    await expect(models.call(request)).rejects.toThrow(/No way to reach claude/);
  });
});
