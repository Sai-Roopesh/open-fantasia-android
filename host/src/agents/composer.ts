import { readFileSync } from "node:fs";
import type { Models } from "../models/model-call.js";
import type { Choice, Entry } from "../story/entries.js";
import type { ModelChoice, State } from "../story/state.js";
import { asTurns, momentsPart, recallFacts, say, section, splitMoveNote } from "../context/lens.js";
import { nameIndex, namedIn } from "../story/names.js";
import { minutesOf, parseStoryTime, sayDate, sayTime } from "../time.js";
import { playersPart } from "./deciding.js";
import { LONG_SCENE, openingOf, parseComposedAnswer, planFromMeta, recordDue, type ComposerAsk, type ScenePlan } from "./scene-state.js";
import { BUDGETS, runAgent } from "./step.js";

export { LONG_SCENE, parseComposedAnswer, planFromMeta, recordDue, type ComposerAsk, type ScenePlan };

const PROMPT = readFileSync(new URL("./COMPOSER.md", import.meta.url), "utf8");

/** Natural, target-based length guidance paired 1-to-1 with provider verbosity. */
export const REPLY_LENGTH_GUIDE = {
  short: "Write around 140–200 words (1–2 paragraphs). Keep the beat crisp and grounded, then stop where the player's next choice belongs.",
  medium: "Write around 240–340 words (2–4 paragraphs). Give the moment room for subtext and physical detail without padding, then stop where the player's next choice belongs.",
  full: "Write around 380–520 words. Give the beat room for atmosphere, physical detail, and real emotional movement without padding or rushing past the player's next choice."
} as const;

export const REPLY_VERBOSITY = {
  short: "low",
  medium: "medium",
  full: "high"
} as const;

/**
 * Who Layer 2 (standing) covers: pinned to Leads + the Scene's opening cast so Turn 0 never mutates mid-Scene when a
 * supporting character walks in or is mentioned — preserving 92%+ KV-cache hits across the entire Scene.
 */
function presentFor(ask: ComposerAsk): string[] {
  const opening = openingOf(ask.state);
  if (opening === "day_view") return [...new Set([...ask.state.leads, ...(ask.choice?.who ?? ask.state.scene?.here ?? [])])];
  const opened = ask.scene.find(entry => entry.payload.kind === "scene_opened");
  const initialWho = opened?.payload.kind === "scene_opened" ? opened.payload.who : ask.state.scene?.here ?? [];
  return [...new Set([...ask.state.leads, ...initialWho])];
}

/** People currently present (who entered mid-Scene) or named in the Move who are not already in Layer 2's static cast. */
function mentionedPart(ask: ComposerAsk, standing: string[]): string | null {
  const pc = ask.state.playerCharacter;
  const known = new Set([pc, ...standing]);
  const midSceneHere = openingOf(ask.state) === "day_view" ? [] : ask.state.scene?.here ?? [];
  const extra = [...new Set([...midSceneHere, ...namedIn(ask.move, nameIndex(Object.values(ask.state.people)))])].filter(name => !known.has(name));
  if (!extra.length) return null;
  const lines = extra.map(name => {
    const now = ask.state.truth.now[name];
    const life = ask.state.lives[name];
    const detail = [
      now ? now.now : ask.state.people[name]?.whoTheyAre ?? "",
      life && (life.where || life.doing) ? `Lately: ${[life.where ? `at ${life.where}` : "", life.doing ?? ""].filter(Boolean).join(", ")}.` : ""
    ].filter(Boolean).join(" ");
    return `- ${name}: ${detail}`;
  });
  return section("mentioned", lines.join("\n"));
}

function longRunPart(state: State): string | null {
  return state.plan ? section("long_run", [
    `Toward ${state.plan.toward}, a ${state.plan.phase} Stretch.`,
    ...state.plan.arcs.map(arc => `- ${arc.arc}: now ${arc.now}; may move to ${arc.next}; not yet ${arc.notYet}`),
    `Premise: ${state.plan.premise}`
  ].join("\n")) : null;
}

function describeChoice(state: State, choice: Choice): string {
  const parts = [choice.kind === "follow" ? `follow ${choice.who.join(", ")}` : choice.kind === "somewhere" ? `go to ${choice.place}` : choice.kind === "skip" ? "skip ahead" : `go to ${choice.place ?? "what is on"}`];
  const at = choice.at ? parseStoryTime(choice.at) : null;
  if (at) parts.push(`on ${sayDate(at, state.dayOne, true)} at ${sayTime(at)}`);
  if (choice.who.length && choice.kind !== "follow") parts.push(`with ${choice.who.join(", ")}`);
  return parts.join(" ");
}

/**
 * Compact mid-scene delta emitted on the current Move turn ONLY when location, departed cast, or a material time jump
 * happened on the immediately preceding beat (or after `scene_recorded` trimmed history) — keeping ordinary steady
 * turns 100% bare (max KV-cache) while preventing state drift after transitions.
 */
function sceneDeltaPart(state: State, scene: Entry[]): string | null {
  const current = state.scene;
  if (!current || current.closed) return null;
  const notes = scene.filter((entry): entry is Entry & { payload: Extract<Entry["payload"], { kind: "beat_note" }> } => entry.payload.kind === "beat_note");
  const last = notes.at(-1);
  if (!last) return null;
  const prev = notes.at(-2);
  const movedNow = Boolean(last.payload.place);
  const leftNow = last.payload.goes;
  const prevClock = parseStoryTime(prev?.payload.clock ?? current.at);
  const nowClock = parseStoryTime(last.payload.clock);
  const jumpedNow = prevClock && nowClock && (nowClock.day !== prevClock.day || minutesOf(nowClock) - minutesOf(prevClock) >= 30);
  const lines = [
    movedNow ? `Now at: ${current.place}.` : "",
    leftNow.length ? `Left the scene: ${leftNow.join(", ")}.` : "",
    jumpedNow ? `Current time: ${say(state, state.clock)}.` : ""
  ].filter(Boolean);
  return lines.length ? section("scene_now", lines.join(" ")) : null;
}

/**
 * Emits `<scene_controls>` on the active Move turn ONLY when `focus` or `linger` changed since the last Reply (or on
 * Turn 1 when Linger is on) — so steady-state turns stay 100% bare (max KV-cache) and mid-scene toggles never bust
 * Turn 0.
 */
function sceneControlsPart(state: State, scene: Entry[]): string | null {
  const current = state.scene;
  if (!current || current.closed) return null;
  const lastReplyAt = scene.findLastIndex(entry => entry.payload.kind === "reply");
  const sinceReply = lastReplyAt >= 0 ? scene.slice(lastReplyAt + 1) : scene;
  const focusChanged = sinceReply.some(entry => entry.payload.kind === "focus_set");
  const lingerChanged = sinceReply.some(entry => entry.payload.kind === "linger_set");
  const lines = [
    focusChanged && current.focus ? `Focus is on ${current.focus}.` : focusChanged && !current.focus ? "Focus cleared." : "",
    (lingerChanged || lastReplyAt < 0) && current.linger ? "Linger is on: hold the moment without forcing a payoff." : lingerChanged && !current.linger ? "Linger is off." : ""
  ].filter(Boolean);
  return lines.length ? section("scene_controls", lines.join("\n")) : null;
}

function composerFacts(ask: ComposerAsk) {
  return {
    opening: openingOf(ask.state),
    clock: ask.state.clock,
    title: ask.state.scene?.title ?? null,
    place: ask.state.scene?.place ?? null,
    here: ask.state.scene?.here ?? [],
    beats: ask.state.scene && !ask.state.scene.closed ? ask.state.scene.beats : [],
    direction: ask.state.pendingDirection,
    choice: ask.choice
  };
}

/** The exact combined writing request, shared by the engine and CLI prompt inspection. */
export function composerCall(ask: ComposerAsk, again?: { draft: string; notes: string[] }) {
  const { state } = ask;
  const standing = presentFor(ask);
  const moments = recallFacts(state, standing);
  const opening = openingOf(state);
  const { move: moveBody, note: inlineNote } = splitMoveNote(ask.move);
  const instructions = [PROMPT.trim(), playersPart(state.playerCharacter), REPLY_LENGTH_GUIDE[state.replyLength]].join("\n\n");

  const chosen = opening === "day_view" && ask.choice?.scene ? state.plan?.scenes.find(item => item.id === ask.choice?.scene) : undefined;
  const sceneThatMatters = chosen
    ? section("scene_that_matters", [
        `${chosen.for}${chosen.lead ? ` It is about ${chosen.lead}.` : ""}`,
        ...(state.plan?.leads ?? []).filter(lead => lead.scene === chosen.id).map(lead => `${lead.who}'s move in it: ${lead.move}`)
      ].join("\n"))
    : null;
  const dayViewTask = opening === "day_view"
    ? section("task", ask.choice ? `The player chose at the Day View: ${describeChoice(state, ask.choice)}. Open the Scene it begins.` : "The last Scene has closed: this Move opens a new Scene.")
    : null;

  const moveAt = ask.path?.findLastIndex(entry => entry.payload.kind === "move") ?? -1;
  const redo = ask.path?.slice(moveAt + 1).findLast(entry => entry.payload.kind === "redo");
  const rejected = state.pendingDirection && redo?.payload.kind === "redo" ? redo.payload.rejected : undefined;
  const revision = rejected
    ? section("revision", `The player is revising this rejected draft. It is not canon. Apply the current correction in context, preserving what fits. Without a new correction, try a different handling of the same Move while honoring active Directions.\n\n${rejected.text}`)
    : null;
  const sentBack = again
    ? section("sent_back", [
        "Your Reply was read before the player saw it, and sent back to be written again. What breaks it:",
        ...again.notes.map(note => `- ${note}`),
        "",
        "Rewrite the Reply cleanly, mending what it was sent back for while keeping what worked.",
        "",
        "It read:",
        again.draft
      ].join("\n"))
    : null;

  const extra: (string | null)[] = [
    dayViewTask,
    sceneThatMatters,
    opening === "day_view" ? section("now", `It is ${say(state, state.clock)}.`) : null,
    sceneDeltaPart(state, ask.scene),
    sceneControlsPart(state, ask.scene),
    mentionedPart(ask, standing),
    inlineNote ? section("director_note", `Author direction for this Reply (obey fully in the scene; never speak aloud or treat as dialogue):\n${inlineNote}`) : null,
    state.pendingDirection?.text ? section("direction", `Redo direction: ${state.pendingDirection.text}`) : null,
    revision,
    sentBack
  ];
  const staticStanding: (string | null)[] = [longRunPart(state), momentsPart(state, moments)];
  const flatMoment: (string | null)[] = [
    ...staticStanding,
    dayViewTask,
    sceneThatMatters,
    mentionedPart(ask, standing),
    state.scene && !state.scene.closed && state.scene.linger ? section("scene_controls", "Linger is on: hold the moment without forcing a payoff.") : sceneControlsPart(state, ask.scene),
    section(`move by="${state.playerCharacter}"`, moveBody || ask.move),
    inlineNote ? section("director_note", `Author direction for this Reply (obey fully in the scene; never speak aloud or treat as dialogue):\n${inlineNote}`) : null,
    state.pendingDirection?.text ? section("direction", `Redo direction: ${state.pendingDirection.text}`) : null,
    revision,
    sentBack
  ];
  const call = asTurns(state, ask.beside, "writer", standing, ask.scene, flatMoment, instructions, { text: moveBody || ask.move, extra, staticStanding });
  const head = ask.path?.at(-1);
  return {
    system: call.system,
    prompt: call.prompt,
    conversation: call.turns,
    verbosity: REPLY_VERBOSITY[state.replyLength],
    facts: { ...composerFacts(ask), ...(again ? { rewriting: true } : { composing: true }) },
    tools: { story: head ? { storyId: head.storyId, head: head.id } : null, web: false },
    moments
  };
}

/**
 * One unconstrained free-text generation owns the prose first and appends compact `<scene_state>` bookkeeping at the
 * tail (no strict JSON schema constraint choking creative prose); the Editor / code check remains independent.
 */
export async function composeReply(models: Models, choices: ModelChoice[], ask: ComposerAsk, storyId: string, traceId: string, signal: AbortSignal, onLookup?: (line: string) => void) {
  const call = composerCall(ask);
  return runAgent<{ plan: ScenePlan; reply: string }>(models, choices, {
    system: call.system, prompt: call.prompt, conversation: call.conversation, verbosity: call.verbosity, facts: call.facts, tools: call.tools, agent: "actor", traceId, storyId
  }, answer => {
    if (typeof answer !== "string" || !answer.trim()) return { ok: false, problems: ["reply: write the complete Reply"] };
    const { reply, meta } = parseComposedAnswer(answer);
    if (!reply) return { ok: false, problems: ["reply: write the complete Reply"] };
    const planned = planFromMeta(ask, meta);
    if (!planned.ok) return planned;
    return { ok: true, value: { plan: planned.plan, reply }, dropped: planned.dropped };
  }, BUDGETS.composer, signal, onLookup);
}

/**
 * Rewrites a draft that failed the code or Editor check using the exact same cached system prompt, tools, and
 * multi-turn prefix as `composeReply`, preserving any one-shot Redo direction and stripping `<scene_state>`.
 */
export async function rewriteComposedReply(
  models: Models,
  choices: ModelChoice[],
  ask: ComposerAsk,
  again: { draft: string; notes: string[] },
  storyId: string,
  traceId: string,
  signal: AbortSignal
): Promise<{ text: string; callId: string; model: ModelChoice }> {
  const call = composerCall(ask, again);
  const { value, callId, model } = await runAgent<string>(models, choices, {
    system: call.system, prompt: call.prompt, conversation: call.conversation, verbosity: call.verbosity, facts: call.facts, tools: call.tools, agent: "actor", traceId, storyId
  }, answer => {
    if (typeof answer !== "string" || !answer.trim()) return { ok: false, problems: ["reply: write the complete Reply"] };
    const { reply } = parseComposedAnswer(answer);
    return reply ? { ok: true, value: reply } : { ok: false, problems: ["reply: write the complete Reply"] };
  }, { turns: 2, ms: BUDGETS.composer.ms }, signal);
  return { text: value, callId, model };
}
