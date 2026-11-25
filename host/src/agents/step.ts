import { NotJson, type ModelRequest, type Models } from "../models/model-call.js";
import type { ModelChoice } from "../story/state.js";

export type { ToolKit } from "../models/model-call.js";

/**
 * What a check of an agent's answer says (one-truth design decision 5): the value, with the parts it left out and
 * why; or, when nothing in it is usable, the problems one repair could fix. Only an unusable answer is sent back.
 */
export type Checked<T> = { ok: true; value: T; dropped?: string[] } | { ok: false; problems: string[] };

/** An agent could not give an answer the Story can use, on its model or its second one. */
export class AgentFailed extends Error {}

/**
 * What one step may spend (docs/adr/0018): model turns, its lookups and its answer together, and how long each call
 * may take before it is given up and the second model tried.
 */
export interface Budget {
  turns: number;
  ms: number;
}

/** Each job's tight lookup & time budget (lean turns prevent runaway token loops while preserving tool lookups). */
export const BUDGETS: Record<"composer" | "editor" | "chronicler" | "weaver" | "directorFocused" | "directorDeep" | "folder", Budget> = {
  composer: { turns: 4, ms: 240_000 },
  editor: { turns: 1, ms: 90_000 },
  chronicler: { turns: 4, ms: 300_000 },
  weaver: { turns: 4, ms: 300_000 },
  directorFocused: { turns: 3, ms: 300_000 },
  directorDeep: { turns: 8, ms: 420_000 },
  folder: { turns: 1, ms: 180_000 }
};

function repairSection(answer: unknown, problems: string[]): string {
  const shown = typeof answer === "string" ? answer : JSON.stringify(answer);
  return ["", "<previous_answer>", shown, "</previous_answer>", "That answer could not be used:", ...problems.map(problem => `- ${problem}`), "Return one corrected, complete answer."].join("\n");
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
 * Runs one agent's step (one-truth design decision 4; the-storys-mind design decision 4): on its model, in the turns
 * and time of its [budget], with the tools of its request where the model can use them; an answer that cannot be used
 * is sent back once with what is wrong; a call that fails or runs out of time goes to the second model, which gets the
 * same. Parts left out are kept with the answer and never cost a second call; what the answering call looked up is
 * kept with it, and returned. [onLookup] hears each lookup of any of its calls as it is made, so the player can be
 * told the step is looking back. Throws [AgentFailed] with every reason only when neither model gave a usable answer.
 */
export async function runAgent<T>(
  models: Models,
  choices: ModelChoice[],
  request: Omit<ModelRequest, "model" | "turns">,
  check: (answer: unknown) => Checked<T>,
  budget: Budget,
  signal: AbortSignal,
  onLookup: (line: string) => void = () => {}
): Promise<{ value: T; callId: string; model: ModelChoice; dropped: string[]; lookups: string[] }> {
  const reasons: string[] = [];
  const tried = new Set<string>();
  for (const model of choices) {
    const key = `${model.provider}/${model.model}`;
    if (tried.has(key)) continue;
    tried.add(key);
    let repair: { answer: unknown; problems: string[] } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const timed = withTimeout(signal, budget.ms);
      let answer;
      try {
        const suffix = repair ? repairSection(repair.answer, repair.problems) : "";
        const prompt = suffix ? request.prompt + suffix : request.prompt;
        const conversation = suffix && request.conversation?.length
          ? request.conversation.map((turn, index, list) => (index === list.length - 1 ? { ...turn, text: turn.text + suffix } : turn))
          : request.conversation;
        answer = await models.call({ ...request, model, prompt, ...(conversation ? { conversation } : {}), turns: budget.turns }, () => {}, timed.signal, onLookup);
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
      const checked = check(request.schema ? answer.json : answer.text);
      if (checked.ok) return { value: checked.value, callId: answer.callId, model, dropped: checked.dropped ?? [], lookups: answer.lookups };
      models.refuse(answer.callId, checked.problems.join("; "));
      reasons.push(`${model.model}: ${checked.problems.join("; ")}`);
      if (repair) break;
      repair = { answer: request.schema ? answer.json : answer.text, problems: checked.problems };
    }
  }
  throw new AgentFailed(reasons.join(" | ") || "no model could be reached");
}
