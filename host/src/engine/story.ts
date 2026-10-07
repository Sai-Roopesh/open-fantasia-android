import { LinkError } from "../link/errors.js";
import type { ArcsSet, ClockSet, LandmarkDropped, LandmarkSet, PlaceSet, PremiseSet, ReplyLengthSet, StyleSet, TasteSet, WorldSet } from "../story/entries.js";
import type { State } from "../story/state.js";
import { formatStoryTime, minutesOf, parseStoryTime, type Weekday } from "../time.js";

// The checks an edit to the Story passes before it lands on the Path (editing-the-story design decision 2). Each
// returns the entry to write, tidied, or refuses with the reason in words the phone shows.

const refuse = (reason: string): never => { throw new LinkError("invalid", reason); };

const LENGTHS: readonly State["replyLength"][] = ["short", "medium", "full"];
const WEEK: readonly Weekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function premiseSet(premise: string): PremiseSet {
  return { kind: "premise_set", premise: premise.trim() || refuse("Say what the Story is for.") };
}

export function styleSet(style: string): StyleSet {
  return { kind: "style_set", style: style.trim() || refuse("Say how it is written.") };
}

export function replyLengthSet(length: string): ReplyLengthSet {
  const chosen = LENGTHS.find(each => each === length.trim().toLowerCase());
  return { kind: "reply_length_set", length: chosen ?? refuse("Say Short, Medium or Full.") };
}

export function arcsSet(arcs: string[]): ArcsSet {
  const tidied = arcs.map(arc => arc.trim());
  if (tidied.some(arc => !arc)) refuse("An Arc needs words.");
  const seen = new Set<string>();
  for (const arc of tidied) {
    const key = arc.toLocaleLowerCase();
    if (seen.has(key)) refuse("That Arc is already there.");
    seen.add(key);
  }
  return { kind: "arcs_set", arcs: tidied };
}

/**
 * Where the World stands on a Path: the later of the clock and the end of the World's latest record. Before it,
 * things on the Path have happened, or are about to with the span being played.
 */
export function worldStands(state: State, worldUntil: string | null): string {
  const clock = parseStoryTime(state.clock);
  const until = worldUntil ? parseStoryTime(worldUntil) : null;
  if (!clock) return state.clock;
  return until && minutesOf(until) > minutesOf(clock) ? formatStoryTime(until) : formatStoryTime(clock);
}

/** Whether a Landmark at [at] is not after where the World stands, and so has happened or is happening. */
export function passed(at: string, stands: string): boolean {
  const time = parseStoryTime(at);
  const now = parseStoryTime(stands);
  return time !== null && now !== null && minutesOf(time) <= minutesOf(now);
}

export function landmarkSet(state: State, stands: string, edit: { name: string; at: string; what: string }, creating: boolean): LandmarkSet {
  const name = edit.name.trim() || refuse("Give the Landmark a name.");
  const existing = state.landmarks.find(landmark => landmark.name === name);
  if (creating && existing) refuse(`${name} is already a Landmark.`);
  if (!creating && !existing) refuse(`The Story has no Landmark called ${name}.`);
  if (existing && passed(existing.at, stands)) refuse(`${name} has already happened on this Path.`);
  const what = edit.what.trim() || refuse(`Say what happens at ${name}.`);
  const at = parseStoryTime(edit.at) ?? refuse(`"${edit.at.trim()}" is not a time like "Day 40 10:00".`);
  if (passed(formatStoryTime(at), stands)) refuse("That time has passed on this Path.");
  return { kind: "landmark_set", landmark: { name, at: formatStoryTime(at), what } };
}

export function landmarkDropped(state: State, stands: string, name: string): LandmarkDropped {
  const existing = state.landmarks.find(landmark => landmark.name === name.trim()) ?? refuse(`The Story has no Landmark called ${name.trim()}.`);
  if (passed(existing.at, stands)) refuse(`${existing.name} has already happened on this Path.`);
  return { kind: "landmark_dropped", name: existing.name };
}

export function placeSet(state: State, edit: { name: string; description: string }, institution: boolean, creating: boolean): PlaceSet {
  const name = edit.name.trim() || refuse(institution ? "Give the institution a name." : "Give the place a name.");
  const mine = state.world[institution ? "institutions" : "places"].some(place => place.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const theirs = state.world[institution ? "places" : "institutions"].some(place => place.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  if (theirs) refuse(`${name} is already ${institution ? "a place" : "an institution"}.`);
  if (creating && mine) refuse(`${name} is already ${institution ? "an institution" : "a place"}.`);
  if (!creating && !mine) refuse(`The Story has no ${institution ? "institution" : "place"} called ${name}.`);
  const description = edit.description.trim() || refuse(`Say what ${name} is.`);
  return { kind: "place_set", place: { name, description }, institution };
}

export function worldSet(summary: string, history: string): WorldSet {
  return { kind: "world_set", summary: summary.trim() || refuse("Say what the World is."), history: history.trim() };
}

/** Moves the clock on; [weekday] left out keeps which weekday Day 1 was, and null says the Story does not say. */
export function clockSet(state: State, at: string, weekday?: string | null): ClockSet {
  const time = parseStoryTime(at) ?? refuse(`"${at.trim()}" is not a time like "Day 40 10:00".`);
  const now = parseStoryTime(state.clock);
  if (now && minutesOf(time) <= minutesOf(now)) refuse("The clock only moves on.");
  const day = weekday === undefined ? state.dayOneWeekday
    : weekday === null || !weekday.trim() ? null
    : WEEK.find(each => each === weekday.trim().toLowerCase()) ?? refuse(`"${weekday.trim()}" is not a day of the week.`);
  return { kind: "clock_set", clock: formatStoryTime(time), dayOneWeekday: day };
}

export function tasteReworded(state: State, line: string, text: string): TasteSet {
  const index = state.taste.indexOf(line);
  if (index < 0) refuse("Taste has no such line.");
  const words = text.trim() || refuse("Say the lesson, or delete it.");
  return { kind: "taste_set", lines: state.taste.map((lesson, at) => at === index ? words : lesson) };
}
