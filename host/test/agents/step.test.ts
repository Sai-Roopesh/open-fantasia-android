import { describe, expect, it } from "vitest";
import { AgentFailed, runAgent, type Checked } from "../../src/agents/step.js";
import { Models, type ModelRequest, type ModelRunner } from "../../src/models/model-call.js";
import { ScriptedRunner, type Script } from "../../src/models/scripted.js";
import type { ModelChoice } from "../../src/story/state.js";
import { freshHome } from "../support/host.js";

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

async function ask(given: Models, choices: ModelChoice[] = [SONNET, SOL], options: { timeoutMs?: number; signal?: AbortSignal } = {}) {
  return runAgent(given, choices, { agent: "chronicler", system: "s", prompt: "p", schema: { type: "object" }, traceId: "t", storyId: null }, check, options.timeoutMs ?? 5_000, options.signal ?? new AbortController().signal)
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
    const result = await ask(models(claude, codex).models, [SONNET, SOL], { timeoutMs: 30 });
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
