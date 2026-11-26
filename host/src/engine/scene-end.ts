import type { Mac } from "../mac.js";
import { directionDue, planFollows } from "../agents/director.js";
import { foldDue } from "../agents/folder.js";
import { endedAct, outlineDue, type OutlineAsk } from "../agents/outline.js";
import { movesDue, type Missed, type WeaveAsk } from "../agents/weaver.js";
import { besideOf } from "../store/beside.js";
import { nothingBeside, type Beside } from "../story/beside.js";
import type { Entry } from "../story/entries.js";
import { missedBetween } from "../story/day.js";
import { currentAct, type Outline } from "../story/outline.js";
import type { SceneEndStep, State } from "../story/state.js";
import { minutesOf, parseStoryTime } from "../time.js";

/** A span shorter than this, with nothing in it, moves nothing and needs no call. */
const EMPTY_SPAN_MINUTES = 60;

/** The Folder folds at most this many times at one Scene's end. */
const MAX_FOLDS = 4;
/** As many lookups as the Outline keeps with it (agents/outline.ts). */
const OUTLINE_LOOKUPS = 40;

/**
 * The next step a closed Scene's end owes, in order (docs/adr/0016; the-storys-mind design decision 5): the
 * Chronicler; the Director, who reconsiders the Outline after every Scene (or writes it, when the Story still has
 * none) and plans the next Stretch when one is due; the Weaver; the Folder when an Act has ended, or The Story So Far
 * has grown past its limit. Null when every step is done, and for a Scene still open: the Outline is never changed
 * between exchanges (openspec the-outline: The Outline is reconsidered after every Scene).
 */
export function nextStep(state: State): SceneEndStep | null {
  const scene = state.scene;
  if (!scene?.closed) return null;
  const done = (step: SceneEndStep) => scene.ended.includes(step);
  if (!done("chronicler")) return "chronicler";
  // Whether the Outline is owed does not turn on the steering notes, only how deep it goes; so none are read here.
  if (!done("weaver") && !done("director") && (outlineDue(state, nothingBeside()) || directionDue(state))) return "director";
  if (!done("weaver")) return "weaver";
  // The Folder folds until nothing is due, so sparse play never piles paragraphs up; a few folds at most at one end.
  if (scene.ended.filter(step => step === "folder").length < MAX_FOLDS && foldDue(state)) return "folder";
  return null;
}

/**
 * The step a Story's queue owes: the next step of its Scene's end, or, on a Story with no Outline yet, the Director's
 * first Outline, written before any Scene's end can run (openspec the-outline: Every Story has an Outline to its end).
 */
export function owedStep(state: State): SceneEndStep | null {
  return nextStep(state) ?? (state.outline ? null : "director");
}

/**
 * Whether a Stretch plan follows [outline] in the Director's step (the Outline's `planFollows`): only while the Scene's
 * end still owes that step, and a plan is due once the Outline is kept. The first Outline, written while a Scene is
 * still open, ends no step.
 */
export function planFollowsAt(state: State, outline: Omit<Outline, "version">): boolean {
  const scene = state.scene;
  if (!scene?.closed || scene.ended.includes("director") || scene.ended.includes("weaver")) return false;
  return planFollows(state, outline);
}

/** The deep pass that follows a focused one which found the Scene turned the Story: the current Act, re-planned. */
export function turnedAsk(state: State, turned: string): OutlineAsk {
  const scene = state.scene;
  const which = scene ? `Scene ${scene.number}, ${scene.title},` : "The Scene";
  const said = turned.trim().replace(/[;,]$/, "");
  return { why: "deep", reason: `${which} turned the Story: ${/[.!?]$/.test(said) ? said : `${said}.`}` };
}

/**
 * The Act the Director is rethinking in a deep pass, for the Scene's end's line (openspec presence: Between Scenes is
 * quiet, and shows progress): the current Act, or the next when the current one has ended; none for the first Outline,
 * or a focused revision.
 */
export function rethinkingOf(state: State, ask: OutlineAsk): string | null {
  if (ask.why === "start" || ask.why === "focused") return null;
  if (ask.why === "act-ended") {
    const ended = endedAct(state);
    return state.outline?.acts.find(act => act.number > (ended?.number ?? 0))?.title ?? null;
  }
  return currentAct(state.outline)?.title ?? null;
}

/**
 * What a deep pass that followed a focused one looked up, with the focused pass's, newest first: the Outline keeps both
 * (openspec the-outline: The Director plans by working the plan through). [kept] is the deep pass's Outline's own list.
 */
export function lookedUpBoth(kept: string[], deep: string[], focused: string[]): string[] {
  return [...new Set([...deep, ...focused, ...kept])].slice(0, OUTLINE_LOOKUPS);
}

/** The entries of the Scene that ended at [head], opening to close. */
export function endedScene(mac: Mac, head: string, state: State): Entry[] {
  const path = mac.tree.pathTo(head);
  const start = path.findIndex(entry => entry.id === state.scene?.startsAt);
  const closed = path.findLastIndex(entry => entry.payload.kind === "scene_closed");
  return start >= 0 ? path.slice(start, closed + 1) : [];
}

/** What was on between [from] and [until] that he was not at: Engagements, the plan's Scenes, and what was on. */
function missed(state: State, from: string, until: string, there: { place: string; from: string; until: string }[], chosen: string | null): Missed[] {
  const fromTime = parseStoryTime(from);
  const untilTime = parseStoryTime(until);
  const inSpan = (at: string) => {
    const parsed = parseStoryTime(at);
    return parsed !== null && fromTime !== null && untilTime !== null && minutesOf(parsed) >= minutesOf(fromTime) && minutesOf(parsed) < minutesOf(untilTime);
  };
  return [
    ...missedBetween(state, from, until, there).map(({ engagement, at }) => ({ at, place: engagement.place, what: engagement.what, who: engagement.who, expected: engagement.expected })),
    ...(state.plan?.scenes ?? []).filter(scene => !state.played.includes(scene.id) && scene.id !== chosen && inSpan(scene.at)).map(scene => ({ at: scene.at, place: scene.place, what: scene.headline, who: scene.who, expected: false })),
    ...state.on.filter(item => inSpan(item.at)).map(item => ({ at: item.at, place: item.place, what: item.what, who: item.who, expected: false }))
  ];
}

/** Whether Story time [left] is before [right]. */
function before(left: string, right: string): boolean {
  const a = parseStoryTime(left);
  const b = parseStoryTime(right);
  return a !== null && b !== null && minutesOf(a) < minutesOf(b);
}

/**
 * The Weaver's ask at a Scene's end: from when it ended to when he is next free, over everything he missed in it. When
 * time passed before the Scene that the World never moved over, OR when the Scene itself jumped forward across hours
 * or days (e.g., an in-scene time skip), the World catches up from `min(worldAt, scene.at)` so Landmarks and off-screen
 * lives during the skip are never silently erased.
 */
export function sceneEndWeave(mac: Mac, head: string, state: State): WeaveAsk {
  const scene = state.scene;
  const ended = scene?.endedAt ?? state.clock;
  const behind = scene !== null && before(state.worldAt, scene.at);
  const startTime = scene ? parseStoryTime(scene.at) : null;
  const endTime = parseStoryTime(ended);
  const longInSceneSpan = startTime !== null && endTime !== null && (endTime.day > startTime.day || minutesOf(endTime) - minutesOf(startTime) >= 240);
  const from = behind ? state.worldAt : longInSceneSpan && scene ? scene.at : ended;
  const there = scene ? [{ place: scene.place, from: scene.at, until: ended }] : [];
  const storyId = mac.tree.entry(head)?.storyId;
  return { state, ...(storyId ? { beside: besideOf(mac, storyId, head) } : {}), from, until: state.clock, gap: false, scene: endedScene(mac, head, state), missed: missed(state, behind ? state.worldAt : scene?.at ?? from, state.clock, there, null) };
}

/**
 * The Weaver's ask over a Gap: from where the World stood, or the Day View's time, to the time the choice set, lived
 * as the player's Move says, with what the Story has learned from the player.
 */
export function gapWeave(state: State, move: Entry, beside?: Beside): WeaveAsk | null {
  if (move.payload.kind !== "move" || !move.payload.choice?.at) return null;
  const at = parseStoryTime(move.payload.choice.at);
  const now = parseStoryTime(state.clock);
  if (!at || !now || minutesOf(at) <= minutesOf(now)) return null;
  const from = before(state.worldAt, state.clock) ? state.worldAt : state.clock;
  return { state, ...(beside ? { beside } : {}), from, until: move.payload.choice.at, gap: true, scene: [move], missed: missed(state, from, move.payload.choice.at, [], move.payload.choice.scene) };
}

/** A span with nothing in it: short, nothing missed, no Landmark, no Lead's move due, no new plan to set going. */
export function emptySpan(ask: WeaveAsk): boolean {
  const from = parseStoryTime(ask.from);
  const until = parseStoryTime(ask.until);
  if (!from || !until) return false;
  if (minutesOf(until) - minutesOf(from) >= EMPTY_SPAN_MINUTES) return false;
  if (ask.missed.length || movesDue(ask.state).length) return false;
  if (ask.state.plan && ask.state.plan.afterScene === ask.state.scene?.number) return false;
  return !ask.state.landmarks.some(landmark => {
    const at = parseStoryTime(landmark.at);
    return at && minutesOf(at) >= minutesOf(from) && minutesOf(at) < minutesOf(until);
  });
}
