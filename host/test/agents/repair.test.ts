import { describe, expect, it } from "vitest";
import { answerWithOneRepair, type Checked } from "../../src/agents/repair.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { nightTrain } from "../support/stories.js";

const SONNET = { provider: "claude", model: "claude-sonnet-5-5" } as const;

/**
 * A check that keeps the numbers it is given and drops the odd ones, part by part (lasting-records design decision 3):
 * an answer that is not a list of numbers is unusable; an odd number is left out, and said why.
 */
function check(raw: unknown): Checked<number[]> {
  const numbers = (raw as { n?: unknown } | null)?.n;
  if (!Array.isArray(numbers) || numbers.some(item => typeof item !== "number")) return { ok: false, problems: ["answer: a list of numbers"] };
  const dropped = numbers.filter(item => item % 2 === 1).map(item => `${item} is odd; leave it out`);
  return { ok: true, value: numbers.filter(item => item % 2 === 0), dropped };
}

async function ask(...answers: unknown[]) {
  const { mac } = nightTrain();
  const runner = new ScriptedRunner(answers.map(answer => ({ answer: JSON.stringify(Array.isArray(answer) ? { n: answer } : { said: answer }) })));
  const result = await answerWithOneRepair(new Models(mac.db, { claude: runner }), { agent: "chronicler", model: SONNET, system: "s", prompt: "p", schema: { type: "object" }, traceId: "t", storyId: null },
    check, reason => new Error(reason), new AbortController().signal).then(value => value, (error: Error) => error);
  return { result, runner };
}

describe("asking an agent once more (lasting-records design decision 3)", () => {
  it("takes a clean answer at once", async () => {
    const { result, runner } = await ask([2, 4]);
    expect(result).toMatchObject({ value: [2, 4], dropped: [] });
    expect(runner.requests).toHaveLength(1);
  });

  it("asks again with what an unusable answer got wrong", async () => {
    const { result, runner } = await ask("no", [2]);
    expect(result).toMatchObject({ value: [2], dropped: [] });
    expect(runner.requests[1]!.prompt).toContain("- answer: a list of numbers");
  });

  it("asks a partly bad answer to be repaired, and keeps the repair when it lost less", async () => {
    const { result, runner } = await ask([2, 3, 5], [2, 4, 5]);
    expect(runner.requests[1]!.prompt).toContain("- 3 is odd; leave it out");
    expect(result).toMatchObject({ value: [2, 4], dropped: ["5 is odd; leave it out"] });
  });

  it("keeps the first answer's good parts when the repair is worse or unusable", async () => {
    expect((await ask([2, 3], [1, 3, 5])).result).toMatchObject({ value: [2], dropped: ["3 is odd; leave it out"] });
    expect((await ask([2, 3], "no")).result).toMatchObject({ value: [2], dropped: ["3 is odd; leave it out"] });
  });

  it("fails only when no answer is usable", async () => {
    const { result } = await ask("no", "still no");
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain("a list of numbers");
  });
});
