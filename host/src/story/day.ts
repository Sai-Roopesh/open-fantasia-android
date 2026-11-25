import type { DayChoices, Happening as DayHappening, Skip } from "../protocol/generated/link.js";
import { formatStoryTime, laterTimes, minutesOf, parseStoryTime, sayDay, sayStoryTime, sayTime, type StoryTime } from "../time.js";
import { samePlace } from "./places.js";
import type { Engagement, PlannedScene, State } from "./state.js";

/** At most this many Happenings are on at once (openspec day-view: Up to four Happenings). */
const MAX_ON = 4;
/** Something at an Engagement's place within this many minutes of its time is the same thing. */
const SAME_TIME_MINUTES = 60;
const WEEK = 7 * 24 * 60;

const minutesOrNull = (at: string): number | null => {
  const time = parseStoryTime(at);
  return time ? minutesOf(time) : null;
};

const minutesAt = (at: string) => minutesOrNull(at) ?? Infinity;

/** The first time [engagement] is on at or after [clock]: its own time, or a weekly one's that hour a week on. */
export function nextTime(engagement: Engagement, clock: string): string | null {
  const at = parseStoryTime(engagement.at);
  const now = parseStoryTime(clock);
  if (!at || !now) return null;
  if (minutesOf(at) >= minutesOf(now)) return engagement.at;
  if (engagement.every !== "week") return null;
  const weeks = Math.ceil((minutesOf(now) - minutesOf(at)) / WEEK);
  return formatStoryTime({ day: at.day + 7 * weeks, minuteOfDay: at.minuteOfDay });
}

/** Every time [engagement] is on from [from] up to, but not at, [until]. */
export function occurrencesBetween(engagement: Engagement, from: string, until: string): string[] {
  const end = parseStoryTime(until);
  const times: string[] = [];
  let next = nextTime(engagement, from);
  while (next && end) {
    const at = parseStoryTime(next);
    if (!at || minutesOf(at) >= minutesOf(end)) break;
    times.push(next);
    if (engagement.every !== "week") break;
    next = formatStoryTime({ day: at.day + 7, minuteOfDay: at.minuteOfDay });
  }
  return times;
}

/** His Engagements still on at [clock], each with its next time, soonest first. */
export function engagementsAhead(state: State, clock: string = state.clock): { engagement: Engagement; next: string }[] {
  return state.calendar
    .flatMap(engagement => {
      const next = nextTime(engagement, clock);
      return next && !state.kept.includes(`${engagement.id}@${next}`) ? [{ engagement, next }] : [];
    })
    .sort((left, right) => minutesAt(left.next) - minutesAt(right.next));
}

/**
 * The Engagements on between [from] and [until] that he was not at (openspec day-view: Missing something has
 * consequences): kept only by choosing them, or by a Scene at their place over their time.
 */
export function missedBetween(state: State, from: string, until: string, scenes: { place: string; from: string; until: string }[] = []): { engagement: Engagement; at: string }[] {
  return state.calendar.flatMap(engagement => occurrencesBetween(engagement, from, until).flatMap(at => {
    if (state.kept.includes(`${engagement.id}@${at}`)) return [];
    const there = scenes.some(scene => samePlace(scene.place, engagement.place) && minutesAt(scene.from) <= minutesAt(at) && minutesAt(at) <= minutesAt(scene.until));
    return there ? [] : [{ engagement, at }];
  }));
}

/** The plan's Scenes that matter still ahead of [clock] and not yet played, in order. */
export function plannedAhead(state: State, clock: string = state.clock): PlannedScene[] {
  const now = minutesOrNull(clock);
  if (now === null) return [];
  return (state.plan?.scenes ?? []).filter(scene => {
    const at = minutesOrNull(scene.at);
    return at !== null && !state.played.includes(scene.id) && at >= now;
  });
}

/** One offer on the Day View, before it is said for the phone. */
export interface Offer {
  id: string;
  at: string;
  place: string;
  what: string;
  who: string[];
  expected: boolean;
  pick: boolean;
  scene: string | null;
  engagement: string | null;
  every: "week" | null;
}

/**
 * What is on (one-truth design decision 7): the Story's pick, which is the plan's next Scene that matters, in the
 * Director's words; his Engagements; and what the World has on. Something at an Engagement's place within the hour is
 * the same thing, one card with the Engagement's mark. The pick first, then the rest by time, four at most, never
 * crowding out what he is expected at before the pick.
 */
export function offersOn(state: State): Offer[] {
  const now = state.clock;
  const engagements: Offer[] = engagementsAhead(state).map(({ engagement, next }) => ({
    id: `e-${engagement.id}-${next.replace(/\W+/g, "")}`, at: next, place: engagement.place, what: engagement.what,
    who: engagement.who, expected: engagement.expected, pick: false, scene: null, engagement: engagement.id, every: engagement.every
  }));
  const next = plannedAhead(state)[0];
  const nowMin = minutesOrNull(now);
  const others: Offer[] = [
    ...(next ? [{ id: `p-${next.id}`, at: next.at, place: next.place, what: next.offer, who: next.who, expected: false, pick: true, scene: next.id, engagement: null, every: null }] : []),
    ...state.on.filter(item => { const at = minutesOrNull(item.at); return at !== null && nowMin !== null && at >= nowMin; }).map(item => ({ ...item, expected: false, pick: false, scene: null, engagement: null, every: null }))
  ];
  const kept: Offer[] = [];
  for (const offer of others) {
    const at = engagements.findIndex(on => samePlace(on.place, offer.place) && Math.abs(minutesAt(on.at) - minutesAt(offer.at)) <= SAME_TIME_MINUTES);
    const card = engagements[at];
    if (!card) {
      kept.push(offer);
      continue;
    }
    if (offer.pick) engagements[at] = { ...card, id: offer.id, pick: true, scene: offer.scene, what: offer.what, who: [...new Set([...card.who, ...offer.who])] };
  }
  const all = [...kept, ...engagements].sort((left, right) => minutesAt(left.at) - minutesAt(right.at));
  const pick = all.find(item => item.pick);
  const until = pick ? minutesAt(pick.at) : Infinity;
  const expected = all.filter(item => item !== pick && item.engagement && item.expected && minutesAt(item.at) <= until);
  const rest = all.filter(item => item !== pick && !expected.includes(item)).slice(0, Math.max(0, MAX_ON - (pick ? 1 : 0) - expected.length));
  return [...(pick ? [pick] : []), ...[...expected, ...rest].sort((left, right) => minutesAt(left.at) - minutesAt(right.at))];
}

/** The Day View's Happenings, said for the phone. */
export function todayOn(state: State): DayHappening[] {
  const now = parseStoryTime(state.clock);
  if (!now) return [];
  return offersOn(state).flatMap(item => {
    const at = parseStoryTime(item.at);
    if (!at) return [];
    const every = item.every === "week" ? sayDay(at, state.dayOne) : null;
    const time = every ? sayTime(at) : at.day === now.day ? sayTime(at) : at.day === now.day + 1 ? `Tomorrow ${sayTime(at)}` : sayStoryTime(at, state.dayOne);
    return [{ id: item.id, at: item.at, time, every, days_away: Math.max(0, at.day - now.day), scene: item.scene, place: item.place, what: item.what, who: item.who, expected: item.expected, pick: item.pick }];
  });
}

/**
 * What the Day View's other choices offer (openspec day-view: The player chooses where to be): the Leads and whoever
 * was in the Scene that ended, to follow; the Story's places; and the later times to skip to, the next Landmark last.
 */
export function dayChoicesOf(state: State): DayChoices {
  const pc = state.playerCharacter;
  const follow = [...new Set([...(state.scene?.here ?? []), ...state.leads])].filter(name => name !== pc);
  const now = parseStoryTime(state.clock);
  const skips: Skip[] = [];
  if (now) {
    const say = (at: StoryTime) => (at.day === now.day ? sayTime(at) : sayStoryTime(at, state.dayOne));
    for (const later of laterTimes(now, state.dayOne)) {
      skips.push({ label: later.label, in_sentence: later.inSentence, at: formatStoryTime(later.at), time: say(later.at), days_away: later.at.day - now.day });
    }
    const landmark = state.landmarks
      .flatMap(item => {
        const at = parseStoryTime(item.at);
        return at && minutesOf(at) > minutesOf(now) ? [{ item, at }] : [];
      })
      .sort((left, right) => minutesOf(left.at) - minutesOf(right.at))[0];
    if (landmark) skips.push({ label: landmark.item.name, in_sentence: landmark.item.name, at: landmark.item.at, time: say(landmark.at), days_away: landmark.at.day - now.day });
  }
  return { follow, places: state.world.places.map(place => place.name), skips };
}
