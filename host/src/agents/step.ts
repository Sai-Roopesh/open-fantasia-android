import { NotJson, type ModelRequest, type Models } from "../models/model-call.js";
import type { ModelChoice } from "../story/state.js";

/**
 * What a check of an agent's answer says (one-truth design decision 5): the value, with the parts it left out and
 * why; or, when nothing in it is usable, the problems one repair could fix. Only an unusable answer is sent back.
 */
export type Checked<T> = { ok: true; value: T; dropped?: string[] } | { ok: false; problems: string[] };

/** An agent could not give an answer the Story can use, on its model or its second one. */
export class AgentFailed extends Error {}

/** How long each kind of call may take before it is given up and the second model tried. */
export const TIMEOUT_MS = { quick: 90_000, record: 240_000, plan: 300_000 } as const;

function repairSection(answer: unknown, problems: string[]): string {
  return ["", "<previous_answer>", JSON.stringify(answer), "</previous_answer>", "That answer could not be used:", ...problems.map(problem => `- ${problem}`), "Return one corrected, complete answer."].join("\n");
}

/** A signal that aborts on [outer] or after [ms]. */
function withTimeout(outer: AbortSignal, ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`no answer in ${Math.round(ms / 1000)} seconds`)), ms);
  const stop = () => controller.abort(outer.reason);
  outer.addEventListener("abort", stop, { once: true });
  return { signal: controller.signal, done: () => { clearTimeout(timer); outer.removeEventListener("abort", stop); } };
}

/**
 * Runs one agent's call (one-truth design decision 4): on its model, with a timeout; an answer that cannot be used is
 * sent back once with what is wrong; a call that fails or runs out of time goes to the second model, which gets the
 * same. Parts left out are kept with the answer and never cost a second call. Throws [AgentFailed] with every reason
 * only when neither model gave a usable answer.
 */
export async function runAgent<T>(
  models: Models,
  choices: ModelChoice[],
  request: Omit<ModelRequest, "model">,
  check: (answer: unknown) => Checked<T>,
  timeoutMs: number,
  signal: AbortSignal
): Promise<{ value: T; callId: string; model: ModelChoice; dropped: string[] }> {
  const reasons: string[] = [];
  const tried = new Set<string>();
  for (const model of choices) {
    const key = `${model.provider}/${model.model}`;
    if (tried.has(key)) continue;
    tried.add(key);
    let repair: { answer: unknown; problems: string[] } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const timed = withTimeout(signal, timeoutMs);
      let answer;
      try {
        answer = await models.call({ ...request, model, prompt: repair ? request.prompt + repairSection(repair.answer, repair.problems) : request.prompt }, () => {}, timed.signal);
      } catch (error) {
        if (signal.aborted) throw error;
        reasons.push(`${model.model}: ${error instanceof Error ? error.message : String(error)}`);
        // An answer that is not JSON is unusable, not a failed call: it is sent back once, like any other.
        if (error instanceof NotJson && !repair) {
          repair = { answer: error.text.slice(0, 2000), problems: ["the answer was not JSON; answer with one JSON object in the format, nothing else"] };
          continue;
        }
        break;
      } finally {
        timed.done();
      }
      const checked = check(answer.json);
      if (checked.ok) return { value: checked.value, callId: answer.callId, model, dropped: checked.dropped ?? [] };
      models.refuse(answer.callId, checked.problems.join("; "));
      reasons.push(`${model.model}: ${checked.problems.join("; ")}`);
      if (repair) break;
      repair = { answer: answer.json, problems: checked.problems };
    }
  }
  throw new AgentFailed(reasons.join(" | ") || "no model could be reached");
}
