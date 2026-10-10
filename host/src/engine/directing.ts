import type { DirectorAsk, SceneSoFar } from "../agents/director.js";
import { recalledBond } from "../agents/recall.js";
import type { Mac } from "../mac.js";
import { bondsOn } from "../story/bonds.js";
import { engagementsOn } from "../story/engagements.js";
import type { DirectorPlan, Entry, PlannedScene } from "../story/entries.js";
import type { Landmark } from "../story/state.js";
import { worldOn } from "../story/world.js";
import { minutesOf, parseStoryTime } from "../time.js";
import { summariesOn } from "../views/scene.js";

/** Someone besides the Leads whose Bond has this many turns has history enough for the Director to plan around. */
const LONG_BOND = 5;

/** A Path's plan for the long run: the newest the Director wrote on it, and how far the Stretch has gone. */
export interface CurrentPlan {
  entry: Entry<DirectorPlan>;
  /** Scenes closed on the Path since the plan was written. */
  scenesSince: number;
  /** The Scenes that matter still ahead of the clock, in order. */
  ahead: PlannedScene[];
  /** Every Scene that matters has passed, or the Stretch's days have (story-in-stretches design decision 1). */
  runItsCourse: boolean;
}

/**
 * The plan a Path from [head] follows (openspec long-run: The Director shapes the long run), or null before the
 * Director has planned on it. A plan hangs off the entry that closed the Scene it followed (docs/adr/0007), so a Path
 * rewound to before that Scene's end does not have it.
 */
export function currentPlan(mac: Mac, head: string): CurrentPlan | null {
  // A plan from before Stretches (its Scenes a count) is no plan: the Director plans afresh (docs/adr/0010).
  const entry = (mac.tree.recordsOn(head, "director_plan") as Entry<DirectorPlan>[]).filter(record => Array.isArray(record.payload.scenes)).at(-1);
  if (!entry?.parentId) return null;
  const path = mac.tree.pathTo(head);
  const from = path.findIndex(item => item.id === entry.parentId);
  const scenesSince = path.slice(from + 1).filter(item => item.payload.kind === "scene_closed").length;
  const now = parseStoryTime(mac.states.at(head).clock);
  const ahead = entry.payload.scenes.filter(scene => {
    const at = parseStoryTime(scene.at);
    return !now || !at || minutesOf(at) > minutesOf(now);
  });
  const daysPassed = now !== null && now.day > entry.payload.until;
  return { entry, scenesSince, ahead, runItsCourse: daysPassed || ahead.length === 0 };
}

/** The plan the Writer reads (design decision 4), and how many of its Scenes that matter are ahead; null before the first. */
export function planForWriter(mac: Mac, head: string): { plan: DirectorPlan; scenesLeft: number } | null {
  const plan = currentPlan(mac, head);
  return plan ? { plan: plan.entry.payload, scenesLeft: plan.ahead.length } : null;
}

/** The Writer rated a Scene this high or higher: a confrontation, a revelation, or a change that cannot be undone. */
export const PEAK = 4;

/** Why a plan is due at a Scene's end (openspec long-run: The Director shapes the long run), and what to ask. */
export interface DueDirection {
  reason: "no plan yet" | "the Stretch has run its course" | "a Scene peaked" | "a Landmark passed" | "the last plan failed";
  /** The entry that closed the Scene the plan follows, which it hangs off (docs/adr/0007). */
  closing: Entry;
  ask: DirectorAsk;
}

/** Whether any Landmark's time falls after [from] and up to [until]. */
export function landmarkPassed(landmarks: Landmark[], from: string, until: string): boolean {
  const start = parseStoryTime(from);
  const end = parseStoryTime(until);
  if (!start || !end) return false;
  return landmarks.some(landmark => {
    const at = parseStoryTime(landmark.at);
    return at !== null && minutesOf(at) > minutesOf(start) && minutesOf(at) <= minutesOf(end);
  });
}

/**
 * Whether the Director plans now, after the latest Scene on the Path at [head] ended (design decision 2): when there is
 * no plan yet, the plan has run its course, the Scene peaked, a Landmark passed since the plan, or the last attempt
 * failed, at the Scene end [failedAt]. Null when no Scene has ended, the latest end already has its plan or already
 * failed to get one, or nothing calls for one: the Director is the most expensive model, and a stretch is several
 * Scenes long.
 */
export function directionDue(mac: Mac, head: string, failedAt: string | null): DueDirection | null {
  const path = mac.tree.pathTo(head);
  const closingAt = path.findLastIndex(entry => entry.payload.kind === "scene_closed");
  if (closingAt < 0) return null;
  const closing = path[closingAt];
  if (!closing) return null;
  const plan = currentPlan(mac, closing.id);
  if (plan?.entry.parentId === closing.id || failedAt === closing.id) return null;
  const owed = failedAt !== null;
  const scenes = scenesTo(mac, path.slice(0, closingAt + 1), head);
  const afterPeak = (scenes.at(-1)?.peak ?? 0) >= PEAK;
  const state = mac.states.at(closing.id);
  const reason: DueDirection["reason"] | null = !plan ? "no plan yet"
    : afterPeak ? "a Scene peaked"
    : plan.runItsCourse ? "the Stretch has run its course"
    : landmarkPassed(state.landmarks, mac.states.at(plan.entry.parentId ?? closing.id).clock, state.clock) ? "a Landmark passed"
    : owed ? "the last plan failed"
    : null;
  if (!reason) return null;
  const bonds = bondsOn(mac, closing.id);
  const others = [...bonds].filter(([who, bond]) => !state.leads.includes(who) && bond.turns.length >= LONG_BOND).map(([who, bond]) => recalledBond(who, bond));
  return { reason, closing, ask: { state, world: worldOn(mac, closing.id), scenes, previous: plan?.entry.payload ?? null, afterPeak, bonds: { leads: state.leads.map(who => recalledBond(who, bonds.get(who))), others }, engagementsOn: engagementsOn(mac, closing.id, state.clock) } };
}

/** Every Scene on [path], with what the Chronicler said of it, its peak, and whether an Arc moved in it. */
function scenesTo(mac: Mac, path: Entry[], head: string): SceneSoFar[] {
  const summaries = summariesOn(mac, head);
  const scenes: (SceneSoFar & { id: string })[] = [];
  for (const entry of path) {
    const payload = entry.payload;
    if (payload.kind === "scene_opened") scenes.push({ id: entry.id, number: payload.number, title: payload.title, summary: summaries.get(entry.id) ?? null, peak: null, arcMoved: false });
    else if (payload.kind === "beat_note") {
      const scene = scenes.at(-1);
      if (!scene) continue;
      scene.peak = Math.max(scene.peak ?? 0, payload.intensity);
      scene.arcMoved ||= payload.arcMoved;
    }
  }
  return scenes.map(({ id: _id, ...scene }) => scene);
}
