import type { ModelRequest, Models } from "../models/model-call.js";

/** What a check of an agent's answer says: the value to use, or every problem one repair could fix. */
export type Checked<T> = { ok: true; value: T } | { ok: false; problems: string[] };

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
 * refuses it (docs/adr/0004). A refused call is kept with why it was refused. Throws [fail] with the reasons when no
 * usable answer comes back.
 */
export async function answerWithOneRepair<T>(
  models: Models,
  request: ModelRequest,
  check: (answer: unknown) => Checked<T>,
  fail: (reason: string) => Error,
  signal: AbortSignal
): Promise<{ value: T; callId: string }> {
  let repair: { answer: unknown; problems: string[] } | null = null;
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
    if (checked.ok) return { value: checked.value, callId: answer.callId };
    models.refuse(answer.callId, checked.problems.join("; "));
    repair = { answer: answer.json, problems: checked.problems };
    reason = checked.problems.join("; ");
  }
  throw fail(reason);
}
