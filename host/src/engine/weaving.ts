import { currentPlan, PEAK } from "./directing.js";
import type { WeaveAsk } from "../agents/weaver.js";
import type { Mac } from "../mac.js";
import type { Entry, Happening, SceneOpened, WorldMoved } from "../story/entries.js";
import { sceneSpans } from "../story/spans.js";
import { worldOn } from "../story/world.js";
import { onAhead } from "../story/day.js";
import { engagementsKept, engagementsOn, occurrencesBetween } from "../story/engagements.js";
import { samePlace } from "../story/places.js";
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
  return {
    state,
    world: worldOn(mac, due.through.id),
    scene: due.entries,
    from: due.from,
    until: due.until,
    inScene: peopleIn(due.scene, due.entries),
    // The Writer rated the Scene that ended at a peak: the Story's next pick is a quiet one (openspec long-run).
    afterPeak: due.entries.some(entry => entry.payload.kind === "beat_note" && entry.payload.intensity >= PEAK),
    stillOn: onAhead(mac, due.through.id, due.until).filter(item => !item.engagement),
    // An Engagement whose time the Scene ran past, away from its place, was missed (engagements design decision 4).
    missed: missedEngagements(mac, due.through.id, due.from, due.until),
    engagementsOn: engagementsOn(mac, due.through.id, due.until),
    ...stretchAfter(mac, due.through.id, due.until)
  };
}

/**
 * The Director's Stretch as the Weaver follows it (docs/adr/0010): its next Scene that matters after [until], or null
 * when none is left; the Leads' off-screen moves not yet made under it; and the time they must be made by, its last
 * Scene that matters. Nothing before the Director has planned on this Path.
 */
function stretchAfter(mac: Mac, head: string, until: string): Pick<WeaveAsk, "stretch"> {
  const plan = currentPlan(mac, head);
  if (!plan) return {};
  const end = parseStoryTime(until);
  const next = plan.entry.payload.scenes.find(scene => {
    const at = parseStoryTime(scene.at);
    return at && end && minutesOf(at) > minutesOf(end);
  });
  const made = new Set(mac.tree.recordsOn(head, "world_moved")
    .filter(record => record.seq > plan.entry.seq)
    .flatMap(record => (record.payload as WorldMoved).happened.flatMap(item => (item.move ? [item.move] : []))));
  const moves = plan.entry.payload.leads.filter(lead => lead.scene === null && !made.has(lead.who));
  return { stretch: { next: next ?? null, moves, movesBy: plan.entry.payload.scenes.at(-1)?.at ?? null } };
}

/**
 * Whether a Scene's end moves nothing (story-in-stretches design decision 4): under an hour since the World last stood,
 * with nothing on in it (no Happening, no Engagement), no Landmark, no Lead's move due, no peak to rest after, and no new Scene that matters to
 * offer. The Day View then keeps what is still ahead.
 */
export function emptySpan(ask: WeaveAsk): boolean {
  const from = parseStoryTime(ask.from);
  const until = parseStoryTime(ask.until);
  if (!from || !until || minutesOf(until) - minutesOf(from) >= QUIET_GAP_MINUTES || ask.afterPeak) return false;
  const within = (at: string) => { const time = parseStoryTime(at); return time !== null && minutesOf(time) > minutesOf(from) && minutesOf(time) <= minutesOf(until); };
  if ((ask.stillOn ?? []).some(item => within(item.at))) return false;
  // An Engagement in the span is something on: kept or missed, the World answers it.
  if ((ask.engagementsOn ?? []).some(on => within(on.next))) return false;
  if (ask.state.landmarks.some(landmark => within(landmark.at))) return false;
  const stretch = ask.stretch;
  const by = stretch?.movesBy ? parseStoryTime(stretch.movesBy) : null;
  if ((stretch?.moves?.length ?? 0) > 0 && by !== null && minutesOf(until) >= minutesOf(by)) return false;
  if (stretch?.next && !(ask.stillOn ?? []).some(item => item.scene === stretch.next?.id)) return false;
  return true;
}

/**
 * Every time an Engagement fell from [from] up to [until] on the Path at [head] that he did not keep (engagements
 * design decision 4), as a Happening to go on without him. He kept a time when the choice that opened a Scene was for
 * it, or when a Scene at its place ran over it.
 */
export function missedEngagements(mac: Mac, head: string, from: string, until: string): Happening[] {
  const path = mac.tree.pathTo(head);
  const scenes = sceneSpans(path).map((span, index, spans) => {
    const next = spans[index + 1];
    const ends = next ? next.opened.payload.at : mac.states.at(head).clock;
    return { place: span.opened.payload.place, from: minutesAt(span.opened.payload.at), until: minutesAt(ends) };
  });
  const chosen = path.flatMap(entry => (entry.payload.kind === "move" && entry.payload.choice?.engagement ? [`${entry.payload.choice.engagement}@${entry.payload.choice.at}`] : []));
  return engagementsKept(mac, head).flatMap(engagement => occurrencesBetween(engagement, from, until).flatMap(at => {
    const minutes = minutesAt(at);
    const kept = chosen.includes(`${engagement.id}@${at}`) || scenes.some(scene => samePlace(scene.place, engagement.place) && scene.from <= minutes && minutes <= scene.until);
    return kept ? [] : [{ id: `e-${engagement.id}-${at.replace(/\W+/g, "")}`, at, place: engagement.place, what: engagement.what, who: engagement.who, expected: engagement.expected, pick: false, engagement: engagement.id, every: engagement.every }];
  }));
}

const minutesAt = (at: string) => {
  const time = parseStoryTime(at);
  return time ? minutesOf(time) : 0;
};

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
  // What was on in the Gap goes on without him: the Weaver's Happenings, and every time an Engagement fell in it.
  const offered = onAhead(mac, move.parentId, from).filter(item => {
    const at = parseStoryTime(item.at);
    const chosen = item.at === until && item.place === choice.place;
    return !item.engagement && at !== null && minutesOf(at) < minutesOf(end) && !chosen;
  });
  const missed = [...offered, ...missedEngagements(mac, move.parentId, from, until)].sort((left, right) => minutesAt(left.at) - minutesAt(right.at));
  // The Leads' off-screen moves can be made in a Gap as anywhere (docs/adr/0010); one that is due keeps a short Gap.
  const stretch = stretchAfter(mac, move.parentId, until);
  const by = stretch.stretch?.movesBy ? parseStoryTime(stretch.stretch.movesBy) : null;
  const movesDue = (stretch.stretch?.moves?.length ?? 0) > 0 && by !== null && minutesOf(end) >= minutesOf(by);
  if (missed.length === 0 && !movesDue && minutesOf(end) - minutesOf(start) < QUIET_GAP_MINUTES) return null;
  return { state, world, scene: [move], from, until, inScene: [], gap: true, missed, ...stretch };
}
