import type { Mac } from "../mac.js";
import { formatStoryTime, minutesOf, parseStoryTime } from "../time.js";
import type { Chronicle, Engagement, Entry, WorldMoved } from "./entries.js";

const WEEK = 7 * 24 * 60;

/** An Engagement still on, and its next time at or after the clock it was asked for. */
export interface OnEngagement {
  engagement: Engagement;
  next: string;
}

/**
 * Every Engagement on the Path at [head] (docs/adr/0011): those the Chronicler recorded from a Scene's page and those
 * a line of Meanwhile carried, in the order of the Path, with each Scene's moves and call-offs applied. Read in the
 * order of the entries their records hang off, so a Scene recorded late never undoes a later one.
 */
export function engagementsKept(mac: Mac, head: string): Engagement[] {
  const position = new Map(mac.tree.pathTo(head).map((entry, index) => [entry.id, index]));
  const records = [...mac.tree.recordsOn(head, "chronicle"), ...mac.tree.recordsOn(head, "world_moved")]
    .sort((left, right) => (position.get(left.parentId ?? "") ?? 0) - (position.get(right.parentId ?? "") ?? 0) || left.seq - right.seq);
  const kept = new Map<string, Engagement>();
  for (const record of records as Entry<Chronicle | WorldMoved>[]) {
    const payload = record.payload;
    if (payload.kind === "chronicle") {
      for (const made of payload.engagements ?? []) kept.set(made.id, made);
      for (const change of payload.changed ?? []) {
        const engagement = kept.get(change.engagement);
        if (!engagement) continue;
        if (change.to === "off") kept.delete(change.engagement);
        else kept.set(change.engagement, { ...engagement, at: change.to });
      }
    } else {
      for (const line of payload.meanwhile) if (line.engagement) kept.set(line.engagement.id, line.engagement);
    }
  }
  return [...kept.values()];
}

/** The first time [engagement] is on at or after [clock]: its own time, or, for a weekly one, that hour a week on. */
export function nextTime(engagement: Engagement, clock: string): string | null {
  const at = parseStoryTime(engagement.at);
  const now = parseStoryTime(clock);
  if (!at || !now) return null;
  if (minutesOf(at) >= minutesOf(now)) return engagement.at;
  if (engagement.every !== "week") return null;
  const weeks = Math.ceil((minutesOf(now) - minutesOf(at)) / WEEK);
  return formatStoryTime({ day: at.day + 7 * weeks, minuteOfDay: at.minuteOfDay });
}

/** What is on at [clock] on the Path at [head]: each Engagement not yet past, with its next time, soonest first. */
export function engagementsOn(mac: Mac, head: string, clock: string): OnEngagement[] {
  return engagementsKept(mac, head)
    .flatMap(engagement => {
      const next = nextTime(engagement, clock);
      return next ? [{ engagement, next }] : [];
    })
    .sort((left, right) => minutesAt(left.next) - minutesAt(right.next));
}

function minutesAt(at: string): number {
  const time = parseStoryTime(at);
  return time ? minutesOf(time) : 0;
}

/** Every time [engagement] is on from [from] up to, but not at, [until]: what a span passes over. */
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
