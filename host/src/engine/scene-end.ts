import type { Mac } from "../mac.js";
import { directionDue } from "../agents/director.js";
import { foldDue } from "../agents/folder.js";
import { movesDue, type Missed, type WeaveAsk } from "../agents/weaver.js";
import type { Entry } from "../story/entries.js";
import { missedBetween, plannedAhead } from "../story/day.js";
import type { SceneEndStep, State } from "../story/state.js";
import { minutesOf, parseStoryTime } from "../time.js";

/** A span shorter than this, with nothing in it, moves nothing and needs no call. */
const EMPTY_SPAN_MINUTES = 60;

/**
 * The next step a closed Scene's end owes, in order (docs/adr/0016): the Chronicler; the Director when a plan is due;
 * the Weaver; the Folder when The Story So Far needs folding. Null when every step is done.
 */
const MAX_FOLDS = 4;

export function nextStep(state: State): SceneEndStep | null {
  const scene = state.scene;
  if (!scene?.closed) return null;
  const done = (step: SceneEndStep) => scene.ended.includes(step);
  if (!done("chronicler")) return "chronicler";
  if (!done("weaver") && !done("director") && directionDue(state)) return "director";
  if (!done("weaver")) return "weaver";
  // The Folder folds until nothing is due, so sparse play never piles paragraphs up; a few folds at most at one end.
  if (scene.ended.filter(step => step === "folder").length < MAX_FOLDS && foldDue(state)) return "folder";
  return null;
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
  const minutes = (at: string) => minutesOf(parseStoryTime(at) ?? { day: 1, minuteOfDay: 0 });
  const inSpan = (at: string) => minutes(at) >= minutes(from) && minutes(at) < minutes(until);
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
 * time passed before the Scene that the World never moved over (the clock moved on by hand, or a Move at the Day View
 * that went on ahead), the World catches up from where it stood.
 */
export function sceneEndWeave(mac: Mac, head: string, state: State): WeaveAsk {
  const scene = state.scene;
  const ended = scene?.endedAt ?? state.clock;
  const behind = scene !== null && before(state.worldAt, scene.at);
  const from = behind ? state.worldAt : ended;
  const there = scene ? [{ place: scene.place, from: scene.at, until: ended }] : [];
  return { state, from, until: state.clock, gap: false, scene: endedScene(mac, head, state), missed: missed(state, behind ? state.worldAt : scene?.at ?? from, state.clock, there, null) };
}

/** The Weaver's ask over a Gap: from where the World stood, or the Day View's time, to the time the choice set. */
export function gapWeave(state: State, move: Entry): WeaveAsk | null {
  if (move.payload.kind !== "move" || !move.payload.choice?.at) return null;
  const at = parseStoryTime(move.payload.choice.at);
  const now = parseStoryTime(state.clock);
  if (!at || !now || minutesOf(at) <= minutesOf(now)) return null;
  const from = before(state.worldAt, state.clock) ? state.worldAt : state.clock;
  return { state, from, until: move.payload.choice.at, gap: true, scene: [move], missed: missed(state, from, move.payload.choice.at, [], move.payload.choice.scene) };
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

void plannedAhead;
