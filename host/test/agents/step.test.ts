import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AgentFailed, BUDGETS, runAgent, type Budget, type Checked, type ToolKit } from "../../src/agents/step.js";
import { AntigravityRunner } from "../../src/models/antigravity.js";
import { Models, NO_LOOKUPS_LEFT, type ModelRequest, type ModelRunner } from "../../src/models/model-call.js";
import { ScriptedRunner, type Script } from "../../src/models/scripted.js";
import type { ModelChoice } from "../../src/story/state.js";
import { freshHome } from "../support/host.js";
import { ledger } from "./ledger.js";

const SONNET: ModelChoice = { provider: "claude", model: "claude-sonnet-5-5" };
const SOL: ModelChoice = { provider: "codex", model: "gpt-6.1-sol" };

/**
 * A check that keeps the even numbers it is given (one-truth design decision 5): an answer that is not a list of
 * numbers is unusable and is sent back; an odd number is only left out, and said why.
 */
function check(raw: unknown): Checked<number[]> {
  const numbers = (raw as { n?: unknown } | null)?.n;
  if (!Array.isArray(numbers) || numbers.some(item => typeof item !== "number")) return { ok: false, problems: ["answer: a list of numbers"] };
  return { ok: true, value: numbers.filter(item => item % 2 === 0), dropped: numbers.filter(item => item % 2 === 1).map(item => `${item} is odd; it is left out`) };
}

const numbers = (...n: number[]): Script => ({ answer: JSON.stringify({ n }) });
const words = (said: string): Script => ({ answer: JSON.stringify({ said }) });

/** A model that never answers: it waits until its call is given up. */
class Silent implements ModelRunner {
  readonly requests: ModelRequest[] = [];
  readonly reasons: unknown[] = [];
  run(request: ModelRequest, _onText: (delta: string) => void, signal: AbortSignal): Promise<string> {
    this.requests.push(request);
    return new Promise((_, reject) => signal.addEventListener("abort", () => {
      this.reasons.push(signal.reason);
      reject(signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason)));
    }, { once: true }));
  }
}

function models(claude: ModelRunner, codex: ModelRunner = new ScriptedRunner()) {
  const mac = freshHome();
  return { mac, models: new Models(mac.db, { claude, codex }) };
}

async function ask(given: Models, choices: ModelChoice[] = [SONNET, SOL], options: { budget?: Budget; signal?: AbortSignal; tools?: ToolKit } = {}) {
  return runAgent(given, choices, { agent: "chronicler", system: "s", prompt: "p", schema: { type: "object" }, traceId: "t", storyId: null, ...(options.tools ? { tools: options.tools } : {}) }, check, options.budget ?? { turns: 1, ms: 5_000 }, options.signal ?? new AbortController().signal)
    .then(value => value, (error: unknown) => error);
}

describe("an agent's step (one-truth design decision 4)", () => {
  it("takes a usable answer at once, and keeps what it left out without a second call", async () => {
    const claude = new ScriptedRunner([numbers(2, 3)]);
    const result = await ask(models(claude).models);
    expect(result).toMatchObject({ value: [2], dropped: ["3 is odd; it is left out"], model: SONNET });
    expect(claude.requests).toHaveLength(1);
  });

  it("sends an unusable answer back once, with the answer and what is wrong, and takes the repair", async () => {
    const claude = new ScriptedRunner([words("no"), numbers(2)]);
    const { mac, models: given } = models(claude);
    const result = await ask(given);
    expect(result).toMatchObject({ value: [2], dropped: [], model: SONNET });
    expect(claude.requests).toHaveLength(2);
    expect(claude.requests[1]!.prompt).toBe("p\n<previous_answer>\n{\"said\":\"no\"}\n</previous_answer>\nThat answer could not be used:\n- answer: a list of numbers\nReturn one corrected, complete answer.");
    // The refused answer is kept, with why, in the Mac's record of every call.
    const errors = mac.db.prepare("SELECT error FROM calls ORDER BY rowid").all() as { error: string | null }[];
    expect(errors.map(row => row.error)).toEqual(["Refused: answer: a list of numbers", null]);
  });

  it("goes to the second model, with the first prompt, when the repair is unusable too", async () => {
    const claude = new ScriptedRunner([words("no"), words("still no")]);
    const codex = new ScriptedRunner([numbers(4)]);
    const result = await ask(models(claude, codex).models);
    expect(result).toMatchObject({ value: [4], model: SOL });
    expect(claude.requests).toHaveLength(2);
    expect(codex.requests.map(request => [request.model, request.prompt])).toEqual([[SOL, "p"]]);
  });

  it("sends an answer that is not JSON back once, like any unusable answer, before the second model", async () => {
    const claude = new ScriptedRunner([{ answer: "Here is the record: n = 2" }, numbers(2)]);
    const codex = new ScriptedRunner([numbers(4)]);
    const result = await ask(models(claude, codex).models);
    expect(result).toMatchObject({ value: [2], model: SONNET });
    expect(claude.requests[1]!.prompt).toContain("Here is the record: n = 2");
    expect(claude.requests[1]!.prompt).toContain("- the answer was not JSON; answer with one JSON object in the format, nothing else");
    expect(codex.requests).toHaveLength(0);
  });

  it("goes straight to the second model when a call fails, without a repair", async () => {
    const claude = new ScriptedRunner([{ fail: "overloaded" }]);
    const codex = new ScriptedRunner([numbers(2)]);
    const result = await ask(models(claude, codex).models);
    expect(result).toMatchObject({ value: [2], model: SOL });
    expect(claude.requests).toHaveLength(1);
    expect(codex.requests).toHaveLength(1);
  });

  it("gives up a call that takes too long, and asks the second model", async () => {
    const claude = new Silent();
    const codex = new ScriptedRunner([numbers(6)]);
    const result = await ask(models(claude, codex).models, [SONNET, SOL], { budget: { turns: 1, ms: 30 } });
    expect(result).toMatchObject({ value: [6], model: SOL });
    expect(claude.requests).toHaveLength(1);
    expect(String(claude.reasons[0])).toContain("no answer in 0 seconds");
  });

  it("fails with every reason only when neither model gave a usable answer", async () => {
    const claude = new ScriptedRunner([words("no"), words("still no")]);
    const codex = new ScriptedRunner([{ fail: "the service is down" }]);
    const result = await ask(models(claude, codex).models);
    expect(result).toBeInstanceOf(AgentFailed);
    expect((result as AgentFailed).message).toBe("claude-sonnet-5-5: answer: a list of numbers | claude-sonnet-5-5: answer: a list of numbers | gpt-6.1-sol: the service is down");
    expect(claude.requests).toHaveLength(2);
    expect(codex.requests).toHaveLength(1);
  });

  it("asks a model once when the second model is the same one", async () => {
    const claude = new ScriptedRunner([words("no"), words("still no"), numbers(2)]);
    const result = await ask(models(claude).models, [SONNET, SONNET]);
    expect(result).toBeInstanceOf(AgentFailed);
    expect(claude.requests).toHaveLength(2);
  });

  it("stops at once, without the second model, when the work is called off", async () => {
    const claude = new Silent();
    const codex = new ScriptedRunner([numbers(2)]);
    const controller = new AbortController();
    const pending = ask(models(claude, codex).models, [SONNET, SOL], { signal: controller.signal });
    await new Promise(resolve => setImmediate(resolve));
    controller.abort(new Error("the player went back"));
    const result = await pending;
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(AgentFailed);
    expect(codex.requests).toHaveLength(0);
  });
});

describe("an agent's step with lookups (docs/adr/0018; the-storys-mind design decision 4)", () => {
  const GEMINI: ModelChoice = { provider: "antigravity", model: "gemini-3.8-flash", effort: "high" };

  /** A Story played one exchange in: Hermione tells him about the egg. */
  function played() {
    const story = ledger();
    story.move("I ask Hermione what Hagrid is hiding.");
    story.reply("Hermione lowers her voice. \"Hagrid has a dragon egg in his hut, and he is keeping it warm in the fire.\"");
    return { story, tools: { story: { storyId: story.storyId, head: story.head() }, web: true } };
  }

  it("looks things up in the Story and on the web, answers from what it found, and keeps what it looked up with the call", async () => {
    const { story, tools } = played();
    const claude = new ScriptedRunner([{
      lookUp: [{ tool: "search_story", args: { words: "dragon egg" } }, { tool: "read_scene", args: { number: 1 } }, { tool: "web_search", args: { query: "Norwegian Ridgeback eggs" } }],
      // The answer depends on what the Story said: the egg was found.
      then: answers => numbers(answers[0]!.includes("Hagrid has a dragon egg") && answers[1]!.includes("I ask Hermione") ? 2 : 3)
    }]);
    const given = new Models(story.mac.db, { claude });
    const result = await ask(given, [SONNET], { tools, budget: BUDGETS.composer }) as Awaited<ReturnType<typeof runAgent<number[]>>>;
    expect(result.value).toEqual([2]);
    expect(result.lookups).toEqual([
      "searched the Story for “dragon egg”: 1 passage",
      "read Scene 1, “After curfew”",
      "searched the web for “Norwegian Ridgeback eggs”"
    ]);
    // Kept with the call, with the tools and turns it was given.
    expect(given.lookedUp(result.callId)).toEqual(result.lookups);
    const row = story.mac.db.prepare("SELECT request, lookups FROM calls WHERE id = ?").get(result.callId) as { request: string; lookups: string };
    expect(JSON.parse(row.lookups)).toEqual(result.lookups);
    expect(JSON.parse(row.request)).toMatchObject({ tools, turns: BUDGETS.composer.turns });
  });

  it("says each lookup as it is made, in order, so the player can be told it is looking back", async () => {
    const { story, tools } = played();
    const heard: string[] = [];
    const claude = new ScriptedRunner([{
      lookUp: [
        { tool: "read_person", args: { name: "Hermione" } }, { tool: "web_search", args: { query: "dragon eggs" } },
        { tool: "search_story", args: { words: "egg" } }, { tool: "read_scene", args: { number: 1 } }
      ],
      // Each lookup is heard before the next is made, and before the answer is written.
      then: answers => numbers(heard.length === 3 && answers[3] === NO_LOOKUPS_LEFT ? 2 : 3)
    }]);
    const request = { agent: "writer" as const, system: "s", prompt: "p", schema: { type: "object" }, traceId: "t", storyId: story.storyId, tools };
    const result = await runAgent(new Models(story.mac.db, { claude }), [SONNET], request, check, { turns: 4, ms: 5_000 }, new AbortController().signal, line => heard.push(line));
    expect(result.value).toEqual([2]);
    // The lookup refused for want of turns is not one.
    expect(heard).toEqual(["read Hermione Granger's history", "searched the web for “dragon eggs”", "searched the Story for “egg”: 1 passage"]);
    expect(result.lookups).toEqual(heard);
  });

  it("stops looking things up when its turns run out, and answers with what it has", async () => {
    const { story, tools } = played();
    const claude = new ScriptedRunner([{
      lookUp: [
        { tool: "search_story", args: { words: "egg" } }, { tool: "read_person", args: { name: "Hermione" } },
        { tool: "read_scene", args: { number: 1 } }, { tool: "web_search", args: { query: "dragon eggs" } }
      ],
      then: numbers(4)
    }]);
    const result = await ask(new Models(story.mac.db, { claude }), [SONNET], { tools, budget: { turns: 3, ms: 5_000 } }) as Awaited<ReturnType<typeof runAgent<number[]>>>;
    // Three turns: two lookups, and the answer.
    expect(result.value).toEqual([4]);
    expect(result.lookups).toEqual(["searched the Story for “egg”: 1 passage", "read Hermione Granger's history"]);
    expect(claude.looked.map(lookup => lookup.answer).slice(2)).toEqual([NO_LOOKUPS_LEFT, NO_LOOKUPS_LEFT]);
    expect(claude.requests).toHaveLength(1);
  });

  it("gives up a step that runs past its time, lookups and all, and asks the second model", async () => {
    const { story, tools } = played();
    const claude = new Silent();
    const codex = new ScriptedRunner([numbers(6)]);
    const result = await ask(new Models(story.mac.db, { claude, codex }), [SONNET, SOL], { tools, budget: { turns: 5, ms: 30 } });
    expect(result).toMatchObject({ value: [6], model: SOL, lookups: [] });
  });

  it("runs without tools on a model that has none, and its answer is taken", async () => {
    const { story, tools } = played();
    const home = mkdtempSync(join(tmpdir(), "fantasia-agy-"));
    const log = join(home, "received.jsonl");
    const agy = new AntigravityRunner(home, [process.execPath, fileURLToPath(new URL("../support/fakes/agy.mjs", import.meta.url))], { FAKE_AGY_LOG: log });
    try {
      const given = new Models(story.mac.db, { antigravity: agy });
      const request = { agent: "writer" as const, system: "You plan each Reply.", prompt: "Plan the Reply.", schema: { type: "object" }, traceId: "t", storyId: story.storyId, tools };
      const result = await runAgent(given, [GEMINI], request, answer => ({ ok: true, value: answer }), BUDGETS.composer, new AbortController().signal);
      expect(result).toMatchObject({ value: { note: "Meera looks up." }, model: GEMINI, lookups: [expect.stringContaining("prepared evidence:")] });
      // The call kept is the one made: without tools, which the model was never told of.
      const row = story.mac.db.prepare("SELECT request, lookups FROM calls WHERE id = ?").get(result.callId) as { request: string; lookups: string | null };
      expect(JSON.parse(row.request).tools).toBeUndefined();
      expect(JSON.parse(row.lookups ?? "[]")).toEqual([expect.stringContaining("prepared evidence:")]);
      const sent = JSON.parse(readFileSync(log, "utf8").trim().split("\n")[0]!) as { message: { message: { content: string } } };
      expect(sent.message.message.content).not.toMatch(/search_story|read_scene/);
    } finally {
      agy.close();
    }
  });

  it("gives a scripted model that has no tools none to use", async () => {
    const { story, tools } = played();
    const bare = new ScriptedRunner([{ lookUp: [{ tool: "search_story", args: { words: "egg" } }, { tool: "web_search", args: { query: "eggs" } }], then: numbers(2) }], undefined, { story: false, web: false });
    const result = await ask(new Models(story.mac.db, { claude: bare }), [SONNET], { tools, budget: BUDGETS.composer });
    expect(result).toMatchObject({ value: [2], lookups: [] });
    expect(bare.looked.map(lookup => lookup.answer)).toEqual(["There is no tool called search_story.", "There is no tool called web_search."]);
  });

  it("gives Codex the web and not the Story's tools", async () => {
    const { story, tools } = played();
    const codex = new ScriptedRunner([{ lookUp: [{ tool: "read_scene", args: { number: 1 } }, { tool: "web_search", args: { query: "Hogwarts as a university" } }], then: numbers(2) }], undefined, { story: false, web: true });
    const result = await ask(new Models(story.mac.db, { codex }), [SOL], { tools, budget: BUDGETS.composer });
    expect(result).toMatchObject({ value: [2], lookups: ["searched the web for “Hogwarts as a university”"] });
    expect(codex.requests[0]!.tools).toEqual({ story: null, web: true });
  });
});
