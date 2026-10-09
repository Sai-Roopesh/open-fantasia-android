import type { ModelRequest, Models } from "../models/model-call.js";

/**
 * What a check of an agent's answer says: the value to use, with the parts it left out and why; or, when nothing in
 * it is usable, every problem one repair could fix (lasting-records design decision 3).
 */
export type Checked<T> = { ok: true; value: T; dropped?: string[] } | { ok: false; problems: string[] };

/** An agent could not give an answer the Story can use, in words the player can read. */
export class AgentFailed extends Error {}

function repairSection(answer: unknown, problems: string[]): string {
  return [
    "",
    "<previous_answer>",
    JSON.stringify(answer),
    "</previous_answer>",
    "That answer could not be used:",
    ...problems.map(problem => `- ${problem}`),
    "Return one corrected, complete answer. Keep everything the problems do not touch."
  ].join("\n");
}

/**
 * Asks an agent once, checks its answer, and asks once more with the answer and every problem named when the check
 * refuses it or left parts out (docs/adr/0004; lasting-records design decision 3). Keeps whichever usable answer lost
 * less, with what it left out. A refused call is kept with why it was refused. Throws [fail] with the reasons only when
 * no answer is usable.
 */
export async function answerWithOneRepair<T>(
  models: Models,
  request: ModelRequest,
  check: (answer: unknown) => Checked<T>,
  fail: (reason: string) => Error,
  signal: AbortSignal
): Promise<{ value: T; callId: string; dropped: string[] }> {
  let repair: { answer: unknown; problems: string[] } | null = null;
  let best: { value: T; callId: string; dropped: string[] } | null = null;
  let reason = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let answer;
    try {
      answer = await models.call({ ...request, prompt: repair ? request.prompt + repairSection(repair.answer, repair.problems) : request.prompt }, () => {}, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      reason = error instanceof Error ? error.message : String(error);
      repair = null;
      continue;
    }
    const checked = check(answer.json);
    if (checked.ok) {
      const dropped = checked.dropped ?? [];
      const better = !best || dropped.length < best.dropped.length;
      // Only an answer not used is marked refused: one kept with parts left out is a record, not a failure.
      if (better && best) models.refuse(best.callId, `replaced by its repair, which left less out: ${best.dropped.join("; ")}`);
      else if (!better) models.refuse(answer.callId, `its repair left more out than the first answer: ${dropped.join("; ")}`);
      if (better) best = { value: checked.value, callId: answer.callId, dropped };
      if (dropped.length === 0) return best!;
      repair = { answer: answer.json, problems: dropped };
      continue;
    }
    models.refuse(answer.callId, checked.problems.join("; "));
    repair = { answer: answer.json, problems: checked.problems };
    reason = checked.problems.join("; ");
  }
  if (best) return best;
  throw fail(reason);
}
