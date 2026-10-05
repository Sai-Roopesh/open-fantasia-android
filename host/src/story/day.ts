import type { DayChoices, Happening as DayHappening, Skip } from "../protocol/generated/link.js";
import type { Mac } from "../mac.js";
import { formatStoryTime, laterTimes, minutesOf, parseStoryTime, sayStoryTime, sayTime, type StoryTime } from "../time.js";
import type { Happening, WorldMoved } from "./entries.js";
import type { State } from "./state.js";

/** At most this many Happenings are on at once (openspec day-view: Up to four Happenings). */
const MAX_ON = 4;

/**
 * Every Happening offered on the Path to [head] that is still ahead of [from]: what was on stays on, whether or not
 * the latest record offered it again. Oldest first, each once.
 */
export function onAhead(mac: Mac, head: string, from: string): Happening[] {
  const now = parseStoryTime(from);
  const seen = new Set<string>();
  return mac.tree.recordsOn(head, "world_moved").flatMap(entry => (entry.payload as WorldMoved).happenings).filter(item => {
    const at = parseStoryTime(item.at);
    if (!now || !at || minutesOf(at) < minutesOf(now) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * What is on from the Day View's time (openspec day-view: Up to four Happenings): what the Weaver offered for the
 * Scene that closed and what was on already and is still ahead, the Story's pick first, at most four; nothing until
 * the World has moved on.
 */
export function todayOn(mac: Mac, head: string, state: State): DayHappening[] {
  const now = parseStoryTime(state.clock);
  const latest = mac.tree.recordsOn(head, "world_moved").at(-1)?.payload as WorldMoved | undefined;
  if (!latest || !now || latest.scene !== state.scene?.openedBy) return [];
  const pick = latest.happenings.find(item => item.pick)?.id;
  const minutes = (at: string) => {
    const time = parseStoryTime(at);
    return time ? minutesOf(time) : 0;
  };
  const on = onAhead(mac, head, state.clock)
    .map(item => ({ ...item, pick: item.id === pick }))
    .sort((left, right) => Number(right.pick) - Number(left.pick) || minutes(left.at) - minutes(right.at))
    .slice(0, MAX_ON);
  return on.flatMap(item => {
    const at = parseStoryTime(item.at);
    if (!at) return [];
    const time = at.day === now.day ? sayTime(at) : at.day === now.day + 1 ? `Tomorrow ${sayTime(at)}` : sayStoryTime(at, state.dayOneWeekday);
    return [{ id: item.id, at: item.at, time, place: item.place, what: item.what, who: item.who, expected: item.expected, pick: item.pick }];
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
    // On the Day View's own day a time is said without the day, as a Happening's is.
    const say = (at: StoryTime) => at.day === now.day ? sayTime(at) : sayStoryTime(at, state.dayOneWeekday);
    for (const later of laterTimes(now, state.dayOneWeekday)) {
      skips.push({ label: later.label, in_sentence: later.inSentence, at: formatStoryTime(later.at), time: say(later.at) });
    }
    const landmark = state.landmarks
      .flatMap(item => {
        const at = parseStoryTime(item.at);
        return at && minutesOf(at) > minutesOf(now) ? [{ item, at }] : [];
      })
      .sort((left, right) => minutesOf(left.at) - minutesOf(right.at))[0];
    if (landmark) skips.push({ label: landmark.item.name, in_sentence: landmark.item.name, at: landmark.item.at, time: say(landmark.at) });
  }
  return { follow, places: state.world.places.map(place => place.name), skips };
}
