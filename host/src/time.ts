// The Story Clock: a day number and a time of day, written "Day N HH:MM". Calendar dates are left out because a
// Story's days are its own; a Story may say which weekday Day 1 is, so people know it is the weekend.

export type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

const WEEK: readonly Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const SPELLING = /^Day ([1-9][0-9]{0,4}) ([01][0-9]|2[0-3]):([0-5][0-9])$/;

export interface StoryTime {
  readonly day: number;
  readonly minuteOfDay: number;
}

export function parseStoryTime(text: string): StoryTime | null {
  const match = SPELLING.exec(text.trim());
  if (!match) return null;
  return { day: Number(match[1]), minuteOfDay: Number(match[2]) * 60 + Number(match[3]) };
}

/** Minutes since Day 1 00:00, for comparing and counting Story times. */
export function minutesOf(time: StoryTime): number {
  return (time.day - 1) * 24 * 60 + time.minuteOfDay;
}

export function formatStoryTime(time: StoryTime): string {
  const hour = Math.floor(time.minuteOfDay / 60);
  const minute = time.minuteOfDay % 60;
  return `Day ${time.day} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** A Scene that ends from this time of night on ends the Player Character's day (openspec day-view). */
const BEDTIME = 22 * 60;
/** Before this time of morning, the night has not ended. */
const NIGHT_ENDS = 5 * 60;
/** When the Player Character is next free to choose after a night: woken, through his morning, breakfast done. */
const WAKING = 7 * 60 + 30;

/**
 * When the Player Character is next free to choose after a Scene that ended at [ended]: then, or, when it ended late
 * and he would go to bed, the next morning (openspec day-view: The Day View opens when the Player Character is next
 * free to choose).
 */
export function nextFreeAfter(ended: string): string {
  const time = parseStoryTime(ended);
  if (!time) return ended;
  if (time.minuteOfDay >= BEDTIME) return formatStoryTime({ day: time.day + 1, minuteOfDay: WAKING });
  if (time.minuteOfDay < NIGHT_ENDS) return formatStoryTime({ day: time.day, minuteOfDay: WAKING });
  return ended;
}

/** An evening skip: "This evening" lands here. */
const EVENING = 18 * 60;

/**
 * The later times the Day View offers to skip to from [now] (openspec day-view: Skip to later): this evening, while it
 * is still to come; tomorrow morning; the weekend's first morning, when the Story knows its weekdays and it is a
 * weekday now. The next Landmark is the Story's, and is added by whoever knows the Landmarks.
 */
export function laterTimes(now: StoryTime, dayOneWeekday: Weekday | null): { label: string; at: StoryTime }[] {
  const times: { label: string; at: StoryTime }[] = [];
  if (now.minuteOfDay < EVENING) times.push({ label: "This evening", at: { day: now.day, minuteOfDay: EVENING } });
  times.push({ label: "Tomorrow", at: { day: now.day + 1, minuteOfDay: WAKING } });
  const weekday = weekdayOf(now.day, dayOneWeekday);
  if (weekday && weekday !== "saturday" && weekday !== "sunday") {
    const toSaturday = (WEEK.indexOf("saturday") - WEEK.indexOf(weekday) + 7) % 7;
    if (toSaturday > 1) times.push({ label: "The weekend", at: { day: now.day + toSaturday, minuteOfDay: WAKING } });
  }
  return times;
}

/** The weekday a Story day falls on, when the Story says which weekday Day 1 is. */
export function weekdayOf(day: number, dayOneWeekday: Weekday | null): Weekday | null {
  if (!dayOneWeekday) return null;
  return WEEK[(WEEK.indexOf(dayOneWeekday) + day - 1) % 7] ?? null;
}

/** How people say a Story day: "Friday", or "Day 3" when the weekday is unknown. */
export function sayDay(time: StoryTime, dayOneWeekday: Weekday | null): string {
  const weekday = weekdayOf(time.day, dayOneWeekday);
  return weekday ? weekday.charAt(0).toUpperCase() + weekday.slice(1) : `Day ${time.day}`;
}

/** How people say a time of day: "9:40 pm". */
export function sayTime(time: StoryTime): string {
  const hour = Math.floor(time.minuteOfDay / 60);
  const minute = time.minuteOfDay % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

/** How people say a Story time: "Friday 9:40 pm", or "Day 3 9:40 pm" when the weekday is unknown. */
export function sayStoryTime(time: StoryTime, dayOneWeekday: Weekday | null): string {
  return `${sayDay(time, dayOneWeekday)} ${sayTime(time)}`;
}
