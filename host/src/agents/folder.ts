import type { Models } from "../models/model-call.js";
import type { ModelChoice, State, Told } from "../story/state.js";
import { join, say, section } from "../context/lens.js";
import { matches, text } from "./format.js";
import { runAgent, TIMEOUT_MS, type Checked } from "./step.js";

/** Past this many Scene paragraphs, the oldest Scenes are folded into a week (openspec living-world). */
export const KEEP_SCENES = 6;
/** Past this many weeks, the oldest four are folded into a chapter. */
export const KEEP_WEEKS = 8;
const CHAPTER_WEEKS = 4;
/** A week is this many story days. */
const WEEK_DAYS = 7;

/**
 * What the Folder folds next: the oldest weeks into a chapter; or the oldest week's Scenes into its recap, once all of
 * them are older than the newest few, so a week is told in one recap and not a Scene at a time; or, from a crowded
 * week of more than twice the Scenes kept, its Scenes older than the newest few; or nothing.
 */
export function foldDue(state: State): { into: "week" | "chapter"; parts: Told[] } | null {
  const { scenes, weeks } = state.storySoFar;
  if (weeks.length > KEEP_WEEKS) return { into: "chapter", parts: weeks.slice(0, CHAPTER_WEEKS) };
  const older = scenes.length - KEEP_SCENES;
  if (older <= 0) return null;
  const dayOf = (part: Told) => Number(/^Day (\d+)/.exec(part.from)?.[1] ?? 0);
  const first = dayOf(scenes[0] as Told);
  const after = scenes.findIndex(part => dayOf(part) >= first + WEEK_DAYS);
  const week = after < 0 ? scenes.length : after;
  if (week <= older) return { into: "week", parts: scenes.slice(0, week) };
  if (week > KEEP_SCENES * 2 && older >= KEEP_SCENES) return { into: "week", parts: scenes.slice(0, older) };
  return null;
}

export function folderPrompt(state: State, due: { into: "week" | "chapter"; parts: Told[] }): { system: string; prompt: string } {
  return {
    system: [
      "You keep The Story So Far of a long interactive story: the account every writer of the story reads before they work.",
      `Fold the ${due.into === "week" ? "Scenes below into one recap of their week, about one hundred and twenty words" : "weeks below into one chapter, about one hundred and fifty words"}, in the past tense.`,
      "Keep what still matters: who wanted what, what changed between people, promises, secrets found or kept, debts, what was left hanging. Let go of what led nowhere. Keep names exact.",
      "Invent nothing. Tell each thing you keep as the parts tell it: who did it, to whom, at what, on which day. Never sharpen it: a near miss stays a near miss, something sent at the stands is not sent at him, what happened once did not happen twice. When you cannot say it exactly in fewer words, leave it out.",
      "Return only the JSON object."
    ].join("\n"),
    prompt: join([
      section("story", `${state.title}. ${state.premise}`),
      section("parts", due.parts.map(part => `${part.scene ? `Scene ${part.scene.number}, ${part.scene.title}` : `${say(state, part.from)} to ${say(state, part.until)}`}: ${part.text}`).join("\n\n"))
    ])
  };
}

const FORMAT = { type: "object", additionalProperties: false, required: ["text"], properties: { text } } as const;

export function checkFold(answer: unknown): Checked<string> {
  const format = matches<{ text: string }>(FORMAT, answer);
  return format.ok ? { ok: true, value: format.value.text.trim() } : format;
}

export async function writeFold(models: Models, choices: ModelChoice[], state: State, due: { into: "week" | "chapter"; parts: Told[] }, storyId: string, traceId: string, signal: AbortSignal): Promise<{ value: string; callId: string; model: ModelChoice }> {
  const { system, prompt } = folderPrompt(state, due);
  return runAgent(models, choices, { agent: "folder", system, prompt, schema: FORMAT, facts: { into: due.into, parts: due.parts.length }, traceId, storyId }, checkFold, TIMEOUT_MS.quick, signal);
}
