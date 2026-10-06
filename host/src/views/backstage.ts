import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import type { BackstageDay, BackstageView } from "../protocol/generated/link.js";
import { worldOn } from "../story/world.js";
import { minutesOf, parseStoryTime, sayDay, sayTime } from "../time.js";

/** How many days of what happened off-screen Backstage keeps. */
const DAYS = 7;

/**
 * Backstage (openspec outside-the-scene: Backstage shows everything else, only when visited): what happened off-screen
 * that the Player Character does not know, by day, newest first; the Threads and where each stands; every Life; the
 * Writer's plan for the Scene he is in; and Taste. Read only when the screen is opened, and never shown anywhere else.
 */
export function backstageView(mac: Mac, storyId: string, traceId: string): BackstageView {
  const path = mac.tree.currentPath(storyId);
  if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
  const state = mac.states.at(path.headEntryId);
  const world = worldOn(mac, path.headEntryId);
  const now = parseStoryTime(state.clock);
  const days: BackstageDay[] = [];
  for (const item of world.happened.filter(happened => !happened.knownTo.includes(state.playerCharacter))) {
    const at = parseStoryTime(item.at);
    if (!at || (now && at.day <= now.day - DAYS)) continue;
    const day = sayDay(at, state.dayOneWeekday);
    let group = days.find(entry => entry.day === day);
    if (!group) days.push(group = { day, items: [] });
    group.items.push({ time: sayTime(at), what: item.what, known_to: item.knownTo });
  }
  // Newest day first; within a day, in the order it happened.
  const dayOf = (day: BackstageDay) => world.happened.find(item => {
    const at = parseStoryTime(item.at);
    return at && sayDay(at, state.dayOneWeekday) === day.day;
  });
  days.sort((left, right) => minutesOf(parseStoryTime(dayOf(right)?.at ?? "") ?? { day: 0, minuteOfDay: 0 }) - minutesOf(parseStoryTime(dayOf(left)?.at ?? "") ?? { day: 0, minuteOfDay: 0 }));
  const scene = state.scene;
  return {
    story_id: storyId,
    offscreen: days,
    threads: world.threads.map(thread => ({ name: thread.name, now: thread.now })),
    lives: world.lives.map(life => ({ who: life.who, where: life.where, doing: life.doing })),
    writer: scene && !scene.closed ? { call: scene.call, purpose: scene.purpose, beats: scene.beats.map(beat => ({ text: beat.text, status: beat.status })), exit: scene.exit } : null,
    taste: state.taste,
    trace_id: traceId
  };
}
