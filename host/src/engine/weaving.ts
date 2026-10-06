import { PEAK } from "./directing.js";
import type { WeaveAsk } from "../agents/weaver.js";
import type { Mac } from "../mac.js";
import type { Entry, SceneOpened, WorldMoved } from "../story/entries.js";
import { sceneSpans } from "../story/spans.js";
import { worldOn } from "../story/world.js";
import { onAhead } from "../story/day.js";
import { minutesOf, parseStoryTime } from "../time.js";

/** A Scene's end the Weaver owes: the Scene, the entry its record hangs off, and the span to move the World over. */
export interface DueWeave {
  scene: Entry<SceneOpened>;
  entries: Entry[];
  through: Entry;
  from: string;
  until: string;
}

/**
 * The Scene's end on the Path to [head] the Weaver owes, if any: the latest Scene that has ended (closed, or left by
 * the Move that opened the next) when it has no record yet. An older Scene passed without one is not woven after
 * the fact; the next span starts from where the World last stood. The span runs from there (or, before the Weaver has
 * ever run, the Scene's start) to when the Player Character is next free to choose, or to the next Scene's start.
 */
export function dueWeave(mac: Mac, head: string): DueWeave | null {
  const path = mac.tree.pathTo(head);
  const spans = sceneSpans(path);
  const woven = new Set(mac.tree.recordsOn(head, "world_moved").map(entry => (entry.payload as WorldMoved).scene));
  for (const [index, span] of [...spans.entries()].reverse()) {
    const entries = path.slice(span.start, span.end);
    const closed = entries.find(entry => entry.payload.kind === "scene_closed");
    const next = spans[index + 1];
    const until = closed ? mac.states.at(closed.id).clock : next?.opened.payload.at;
    if (until === undefined) continue;
    if (woven.has(span.opened.id)) return null;
    const through = closed ?? (entries.at(-1) as Entry);
    const from = worldOn(mac, through.id).until ?? span.opened.payload.at;
    return { scene: span.opened, entries, through, from, until };
  }
  return null;
}

/** Everyone who was in a Scene at some point, besides the Player Character. */
function peopleIn(opened: Entry<SceneOpened>, entries: Entry[]): string[] {
  return [...new Set([
    ...opened.payload.who,
    ...entries.flatMap(entry => (entry.payload.kind === "beat_note" ? entry.payload.here : []))
  ])];
}

/** What the Weaver reads for a due Scene's end: the Story, the World before, the Scene and who was in it. */
export function weaveAsk(mac: Mac, due: DueWeave): WeaveAsk {
  const state = mac.states.at(due.through.id);
  const path = mac.tree.pathTo(due.through.id);
  // The Scene that ended and the one before it: with no Lead in either, the Story's pick leans toward one
  // (openspec day-view: Lead absence is felt, not counted).
  const lastTwo = sceneSpans(path).slice(-2).map(span => peopleIn(span.opened, path.slice(span.start, span.end)));
  const leadless = state.leads.length > 0 && lastTwo.length === 2 && lastTwo.every(people => !people.some(name => state.leads.includes(name)));
  return {
    state,
    world: worldOn(mac, due.through.id),
    scene: due.entries,
    from: due.from,
    until: due.until,
    inScene: peopleIn(due.scene, due.entries),
    leadless,
    // The Writer rated the Scene that ended at a peak: the Story's next pick is a quiet one (openspec long-run).
    afterPeak: due.entries.some(entry => entry.payload.kind === "beat_note" && entry.payload.intensity >= PEAK),
    stillOn: onAhead(mac, due.through.id, due.until)
  };
}

/** A Gap shorter than this with nothing on in it passes without the Weaver: nothing in it will reach anyone. */
const QUIET_GAP_MINUTES = 60;

/**
 * The Gap a choice at the Day View leaves (openspec day-view: The Gap is the player's), as the Weaver reads it: from
 * where the World stands to the time chosen, with the choice's Move as how he spent it and what was on in it, which
 * goes on without him. Null when there is no Gap, or a short one with nothing on in it.
 */
export function gapAsk(mac: Mac, move: Entry): WeaveAsk | null {
  if (move.payload.kind !== "move" || !move.parentId) return null;
  const choice = move.payload.choice;
  const until = choice?.at;
  if (!choice || !until) return null;
  const state = mac.states.at(move.id);
  const world = worldOn(mac, move.id);
  const from = world.until ?? state.clock;
  const start = parseStoryTime(from);
  const end = parseStoryTime(until);
  if (!start || !end || minutesOf(end) <= minutesOf(start)) return null;
  const missed = onAhead(mac, move.parentId, from).filter(item => {
    const at = parseStoryTime(item.at);
    const chosen = item.at === until && item.place === choice.place;
    return at !== null && minutesOf(at) < minutesOf(end) && !chosen;
  });
  if (missed.length === 0 && minutesOf(end) - minutesOf(start) < QUIET_GAP_MINUTES) return null;
  return { state, world, scene: [move], from, until, inScene: [], gap: { missed } };
}
