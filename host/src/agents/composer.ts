import { readFileSync } from "node:fs";
import type { Models } from "../models/model-call.js";
import type { ModelChoice } from "../story/state.js";
import { section } from "../context/lens.js";
import { actorInstructions } from "./actor.js";
import { checkWriter, writerCall, writerFacts, writerFormat, type WriterAsk, type WriterPlan } from "./writer.js";
import { runAgent } from "./step.js";

const PROMPT = readFileSync(new URL("./COMPOSER.md", import.meta.url), "utf8");

/** The exact combined writing request, shared by the engine and CLI prompt inspection. */
export function composerCall(ask: WriterAsk) {
  const instructions = actorInstructions(ask.state).replace("Write prose only, with no headings, notes or lists.", "Write the prose in the reply field, with no headings, notes or lists inside it.");
  const call = writerCall(ask, PROMPT + "\n\n" + instructions);
  const base = writerFormat(ask.state, call.moments);
  const schema = { ...base, required: [...base.required, "reply"], properties: { ...base.properties, reply: { type: "string", minLength: 1, description: "The complete playable Reply, in natural prose. Its metadata is scaffolding, not a script to explain." } } };
  const moveAt = ask.path?.findLastIndex(entry => entry.payload.kind === "move") ?? -1;
  const redo = ask.path?.slice(moveAt + 1).findLast(entry => entry.payload.kind === "redo");
  const rejected = ask.state.pendingDirection && redo?.payload.kind === "redo" ? redo.payload.rejected : undefined;
  const head = ask.path?.at(-1);
  const prompt = call.prompt + (rejected ? "\n\n" + section("revision", `The player is revising this rejected draft. It is not canon. Apply the current correction in context, preserving what fits. Without a new correction, try a different handling of the same Move while honoring active Directions.\n\n${rejected.text}`) : "");
  return { system: call.system, prompt, schema, facts: { ...writerFacts(ask), composing: true },
    tools: { story: head ? { storyId: head.storyId, head: head.id } : null, web: true }, moments: call.moments };
}

/** One strong-model generation owns both the creative choice and the prose; the Editor remains independent. */
export async function composeReply(models: Models, choices: ModelChoice[], ask: WriterAsk, storyId: string, traceId: string, signal: AbortSignal, onLookup?: (line: string) => void) {
  const { moments, ...call } = composerCall(ask);
  return runAgent<{ plan: WriterPlan; reply: string }>(models, choices, {
    ...call, agent: "actor", traceId, storyId
  }, answer => {
    if (!answer || typeof answer !== "object" || !("reply" in answer) || typeof answer.reply !== "string" || !answer.reply.trim()) return { ok: false, problems: ["reply: write the complete Reply"] };
    const { reply, ...raw } = answer;
    const checked = checkWriter(ask, moments, raw);
    return checked.ok ? { ...checked, value: { plan: checked.value, reply: reply.trim() } } : checked;
  }, { turns: 6, ms: 240_000 }, signal, onLookup);
}
