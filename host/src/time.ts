// The Story Clock: a day number and a time of day, written "Day N HH:MM", the Story's own bookkeeping. A Story with a
// calendar says which date Day 1 is (openspec stories: Story time is told as dates); every day is then a date, its
// weekday follows, and that is how anyone reads it.

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
 * is still to come; tomorrow morning; the weekend's first morning, when the Story has a calendar and it is a weekday
 * now; and next week, the same day a week on, on waking (story-in-stretches design decision 6). The next Landmark is
 * the Story's, and is added by whoever knows the Landmarks.
 */
export function laterTimes(now: StoryTime, dayOne: string | null): { label: string; inSentence: string; at: StoryTime }[] {
  const times: { label: string; inSentence: string; at: StoryTime }[] = [];
  if (now.minuteOfDay < EVENING) times.push({ label: "This evening", inSentence: "this evening", at: { day: now.day, minuteOfDay: EVENING } });
  times.push({ label: "Tomorrow", inSentence: "tomorrow", at: { day: now.day + 1, minuteOfDay: WAKING } });
  const weekday = weekdayOf(now.day, dayOne);
  if (weekday && weekday !== "saturday" && weekday !== "sunday") {
    const toSaturday = (WEEK.indexOf("saturday") - WEEK.indexOf(weekday) + 7) % 7;
    if (toSaturday > 1) times.push({ label: "The weekend", inSentence: "the weekend", at: { day: now.day + toSaturday, minuteOfDay: WAKING } });
  }
  times.push({ label: "Next week", inSentence: "next week", at: { day: now.day + 7, minuteOfDay: WAKING } });
  return times;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATED = /^(\d{4}-\d{2}-\d{2})[ T]([01][0-9]|2[0-3]):([0-5][0-9])$/;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** A calendar date "YYYY-MM-DD" as midnight UTC, or null when it is not one. */
function dateAt(date: string): Date | null {
  const match = DATE.exec(date.trim());
  if (!match) return null;
  const at = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return at.toISOString().slice(0, 10) === date.trim() ? at : null;
}

/** Whether [date] is a real calendar date, "YYYY-MM-DD". */
export function isDate(date: string): boolean {
  return dateAt(date) !== null;
}

/** The date a Story day falls on, when the Story has a calendar ([dayOne] is Day 1's date). */
export function dateOf(day: number, dayOne: string | null): Date | null {
  const first = dayOne ? dateAt(dayOne) : null;
  return first ? new Date(first.getTime() + (day - 1) * DAY_MS) : null;
}

/** The Story day a calendar date falls on, or null when the Story has no calendar or it is before Day 1. */
export function dayOfDate(date: string, dayOne: string | null): number | null {
  const first = dayOne ? dateAt(dayOne) : null;
  const at = dateAt(date);
  if (!first || !at) return null;
  const day = Math.round((at.getTime() - first.getTime()) / DAY_MS) + 1;
  return day >= 1 ? day : null;
}

/** The weekday a Story day falls on, when the Story has a calendar. */
export function weekdayOf(day: number, dayOne: string | null): Weekday | null {
  const date = dateOf(day, dayOne);
  return date ? WEEK[(date.getUTCDay() + 6) % 7] ?? null : null;
}

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** How people say a Story day in passing: "Friday", or "Day 3" when the Story has no calendar. */
export function sayDay(time: StoryTime, dayOne: string | null): string {
  const weekday = weekdayOf(time.day, dayOne);
  return weekday ? capital(weekday) : `Day ${time.day}`;
}

/** The date of a Story day: "Friday 6 September", with the year when asked, or "Day 3" when there is no calendar. */
export function sayDate(time: StoryTime, dayOne: string | null, withYear = false): string {
  const date = dateOf(time.day, dayOne);
  if (!date) return `Day ${time.day}`;
  return `${sayDay(time, dayOne)} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}${withYear ? ` ${date.getUTCFullYear()}` : ""}`;
}

/** How people say a time of day: "9:40 pm". */
export function sayTime(time: StoryTime): string {
  const hour = Math.floor(time.minuteOfDay / 60);
  const minute = time.minuteOfDay % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}

/** How the phone says a Story time in passing: "Friday 9:40 pm", or "Day 3 9:40 pm" when there is no calendar. */
export function sayStoryTime(time: StoryTime, dayOne: string | null): string {
  return `${sayDay(time, dayOne)} ${sayTime(time)}`;
}

/** A Story time in full, as agents read it: "Friday 6 September 1991, 9:40 pm", or "Day 3, 9:40 pm". */
export function sayFull(time: StoryTime, dayOne: string | null): string {
  return `${sayDate(time, dayOne, true)}, ${sayTime(time)}`;
}

/** A Story day's date as agents write it: "1991-09-06", or "Day 6" when there is no calendar. */
export function formatDate(day: number, dayOne: string | null): string {
  return dateOf(day, dayOne)?.toISOString().slice(0, 10) ?? `Day ${day}`;
}

/** A Story time as agents write it: "1991-09-06 21:40", or "Day 6 21:40" when there is no calendar. */
export function formatDated(time: StoryTime, dayOne: string | null): string {
  const clock = formatStoryTime(time).split(" ")[2];
  return `${formatDate(time.day, dayOne)} ${clock}`;
}

/** A Story time from what an agent wrote: a date and time, "1991-09-14 20:00", or the Story's own "Day N HH:MM". */
export function parseAnyTime(text: string, dayOne: string | null): StoryTime | null {
  const dated = DATED.exec(text.trim());
  if (dated) {
    const day = dayOfDate(dated[1] as string, dayOne);
    return day ? { day, minuteOfDay: Number(dated[2]) * 60 + Number(dated[3]) } : null;
  }
  return parseStoryTime(text);
}
