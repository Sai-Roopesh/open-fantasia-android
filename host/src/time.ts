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

export function formatStoryTime(time: StoryTime): string {
  const hour = Math.floor(time.minuteOfDay / 60);
  const minute = time.minuteOfDay % 60;
  return `Day ${time.day} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** The weekday a Story day falls on, when the Story says which weekday Day 1 is. */
export function weekdayOf(day: number, dayOneWeekday: Weekday | null): Weekday | null {
  if (!dayOneWeekday) return null;
  return WEEK[(WEEK.indexOf(dayOneWeekday) + day - 1) % 7] ?? null;
}

/** How people say a Story time: "Friday · 9:40 pm", or "Day 3 · 9:40 pm" when the weekday is unknown. */
export function sayStoryTime(time: StoryTime, dayOneWeekday: Weekday | null): string {
  const weekday = weekdayOf(time.day, dayOneWeekday);
  const day = weekday ? weekday.charAt(0).toUpperCase() + weekday.slice(1) : `Day ${time.day}`;
  const hour = Math.floor(time.minuteOfDay / 60);
  const minute = time.minuteOfDay % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${day} · ${twelve}:${String(minute).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`;
}
