import type { DayChoices, Happening as DayHappening, Skip } from "../protocol/generated/link.js";
import type { Mac } from "../mac.js";
import { formatStoryTime, laterTimes, minutesOf, parseStoryTime, sayDay, sayStoryTime, sayTime, type StoryTime } from "../time.js";
import { engagementsOn } from "./engagements.js";
import type { Happening, WorldMoved } from "./entries.js";
import { samePlace } from "./places.js";
import type { State } from "./state.js";

/** At most this many Happenings are on at once (openspec day-view: Up to four Happenings). */
const MAX_ON = 4;

/** An Engagement at the same place within this many minutes of a Weaver's Happening is the same thing. */
const SAME_TIME_MINUTES = 60;

const minutesAt = (at: string) => {
  const time = parseStoryTime(at);
  return time ? minutesOf(time) : 0;
};

/**
 * What is on along the Path to [head] from [from] (openspec day-view): every Happening the Weaver offered that is still
 * ahead, whether or not the latest record offered it again, and each Engagement's next time (docs/adr/0011). A
 * Weaver's Happening at an Engagement's place within the hour is the same thing, and one card stands for both: the
 * Engagement's time, place and mark, with the Happening's id, pick, Scene and words (play-check-fixes design decision
 * 1). Oldest first, each once.
 */
export function onAhead(mac: Mac, head: string, from: string): Happening[] {
  const now = parseStoryTime(from);
  const seen = new Set<string>();
  const engagements: Happening[] = engagementsOn(mac, head, from).map(({ engagement, next }) => ({
    id: `e-${engagement.id}-${next.replace(/\W+/g, "")}`, at: next, place: engagement.place, what: engagement.what, who: engagement.who,
    expected: engagement.expected, pick: false, engagement: engagement.id, every: engagement.every
  }));
  const offered = mac.tree.recordsOn(head, "world_moved").flatMap(entry => (entry.payload as WorldMoved).happenings).filter(item => {
    const at = parseStoryTime(item.at);
    if (!now || !at || minutesOf(at) < minutesOf(now) || seen.has(item.id)) return false;
    seen.add(item.id);
    const index = engagements.findIndex(on => samePlace(on.place, item.place) && Math.abs(minutesAt(on.at) - minutesOf(at)) <= SAME_TIME_MINUTES);
    const card = engagements[index];
    if (!card) return true;
    // The same thing: the latest Happening for it gives the card its id, pick, Scene and words, unless an earlier one
    // was the Scene that matters and this one is not.
    if (card.scene && !item.scene) return false;
    engagements[index] = { ...card, id: item.id, pick: item.pick, scene: item.scene ?? null, what: item.what, who: [...new Set([...card.who, ...item.who])] };
    return false;
  });
  return [...offered, ...engagements].sort((left, right) => minutesAt(left.at) - minutesAt(right.at));
}

/**
 * What is on from the Day View's time (openspec day-view: Up to four Happenings): the Story's pick first, then the rest
 * by time; at most four, the latest giving way first, never the pick or an expected Engagement before it. Nothing
 * until the World has moved on.
 */
export function todayOn(mac: Mac, head: string, state: State): DayHappening[] {
  const now = parseStoryTime(state.clock);
  const latest = mac.tree.recordsOn(head, "world_moved").at(-1)?.payload as WorldMoved | undefined;
  if (!latest || !now || latest.scene !== state.scene?.openedBy) return [];
  // The Story's pick: the latest weave's, or the Scene that matters it offered before and still ahead.
  const ahead = onAhead(mac, head, state.clock);
  const pickId = latest.happenings.find(item => item.pick)?.id ?? ahead.find(item => item.scene)?.id ?? ahead.findLast(item => item.pick && !item.engagement)?.id;
  const pick = ahead.find(item => item.id === pickId);
  const until = pick ? minutesAt(pick.at) : Infinity;
  const kept = ahead.filter(item => item !== pick && item.engagement && item.expected && minutesAt(item.at) <= until);
  const rest = ahead.filter(item => item !== pick && !kept.includes(item)).slice(0, Math.max(0, MAX_ON - (pick ? 1 : 0) - kept.length));
  const others = [...kept, ...rest].sort((left, right) => minutesAt(left.at) - minutesAt(right.at)).map(item => ({ ...item, pick: false }));
  const on = [...(pick ? [{ ...pick, pick: true }] : []), ...others];
  return on.flatMap(item => {
    const at = parseStoryTime(item.at);
    if (!at) return [];
    // A weekly Engagement says the day it repeats, and its hour (engagements design decision 6).
    const every = item.every === "week" ? sayDay(at, state.dayOneWeekday) : null;
    const time = every ? sayTime(at) : at.day === now.day ? sayTime(at) : at.day === now.day + 1 ? `Tomorrow ${sayTime(at)}` : sayStoryTime(at, state.dayOneWeekday);
    return [{ id: item.id, at: item.at, time, every, days_away: Math.max(0, at.day - now.day), scene: item.scene ?? null, place: item.place, what: item.what, who: item.who, expected: item.expected, pick: item.pick }];
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
    // On the Day View's own day a time is said without the day, as a Happening's is, and each says how many days off it
    // is, for the phone to say a week or more (openspec day-view: The player chooses where to be).
    const say = (at: StoryTime) => at.day === now.day ? sayTime(at) : sayStoryTime(at, state.dayOneWeekday);
    for (const later of laterTimes(now, state.dayOneWeekday)) {
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
