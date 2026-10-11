import { readFileSync } from "node:fs";
import type { Models } from "../models/model-call.js";
import type { DirectorPlan } from "../story/entries.js";
import type { ArcStep, LeadMove, ModelChoice, NewThing, Person, PlannedScene, RoadmapPoint, State } from "../story/state.js";
import { formatDate, formatStoryTime, minutesOf, parseStoryTime, sayDate } from "../time.js";
import { engagementsAhead } from "../story/day.js";
import { calendarPart, castPart, factsPart, join, nowPart, say, section, steeringPart, storyPart, storySoFarPart, threadsPart } from "../context/lens.js";
import { matches, namer, nullable, oneOf, peopleEnum, text } from "./format.js";
import { nameIndex, storyName } from "./names.js";
import { runAgent, TIMEOUT_MS, type Checked } from "./step.js";

const PROMPT = readFileSync(new URL("./DIRECTOR.md", import.meta.url), "utf8");

/**
 * A Stretch runs three to six days, with two to five Scenes that matter (openspec long-run: The Director shapes the
 * long run). A plan keeps the first five; one is enough to keep it, so a Scene left out never costs a second call.
 */
export const STRETCH_DAYS = { min: 3, max: 6 } as const;
export const SCENES = { min: 1, max: 5 } as const;
/** A Scene at this intensity peaked (openspec long-run: Rest is deliberate). */
export const PEAK = 5;
/** How many recent Scenes the Director sees the pace of. */
const PACE = 8;

export type DirectorRecord = Omit<DirectorPlan, "kind" | "reason" | "afterScene" | "callId" | "model" | "dropped">;

interface Raw {
  days: number;
  toward: string;
  landmark: string | null;
  phase: "build" | "peak" | "rest";
  scenes: { id: string; date: string; time: string; place: string; who: string[]; for: string; offer: string; headline: string; lead: string | null; engagement: string | null; quiet: boolean }[];
  new: { kind: NewThing["kind"]; what: string; scene: string | null; person: { name: string; who_they_are: string; appearance: string } | null }[];
  leads: { who: string; move: string; scene: string | null }[];
  arcs: { arc: string; now: string; next: string; not_yet: string }[];
  roadmap: { arc: string; by: string; stands: string }[];
  premise: string;
}

/**
 * Why a plan is due at a Scene's end (openspec long-run: The Director shapes the long run), or null: no plan yet, the
 * Stretch is over, the Scene peaked, its Landmark passed, or the player went off the plan.
 */
export function directionDue(state: State): string | null {
  const plan = state.plan;
  if (!plan) return "There is no plan yet: this is the Story's first.";
  const now = parseStoryTime(state.clock);
  if (!now) return null;
  const minutes = (at: string) => minutesOf(parseStoryTime(at) ?? now);
  const last = state.curve.at(-1);
  if (last && last.peak >= PEAK && plan.afterScene < last.scene) return `Scene ${last.scene}, ${last.title}, peaked: give the characters a breath, then build again.`;
  const passedBy = plan.scenes.find(scene => !state.played.includes(scene.id) && minutes(scene.at) < minutesOf(now));
  if (passedBy) return `The player went off the plan: ${passedBy.headline} (${say(state, passedBy.at)}) passed without him. Plan from where the story now is.`;
  const landmark = plan.landmark ? state.landmarks.find(item => item.name === plan.landmark) : undefined;
  if (landmark && minutes(landmark.at) <= minutesOf(now)) return `${landmark.name} has passed.`;
  if (now.day > plan.until || plan.scenes.every(scene => state.played.includes(scene.id))) return "The last Stretch has run its course.";
  return null;
}

export function directorFormat(state: State) {
  const engagements = engagementsAhead(state).map((_, index) => `E${index + 1}`);
  return {
    type: "object",
    additionalProperties: false,
    required: ["days", "toward", "landmark", "phase", "scenes", "new", "leads", "arcs", "roadmap", "premise"],
    properties: {
      days: { type: "integer", minimum: STRETCH_DAYS.min, maximum: STRETCH_DAYS.max },
      toward: text,
      landmark: { anyOf: [oneOf(state.landmarks.map(landmark => landmark.name)), { type: "null" }] },
      phase: { type: "string", enum: ["build", "peak", "rest"] },
      scenes: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "date", "time", "place", "who", "for", "offer", "headline", "lead", "engagement", "quiet"], properties: {
        id: text, date: oneOf(stretchDates(state)), time: { ...text, description: "HH:MM" }, place: text,
        who: { type: "array", items: peopleEnum(state) }, for: text, offer: text, headline: text,
        lead: { anyOf: [oneOf(state.leads), { type: "null" }] }, engagement: { anyOf: [oneOf(engagements), { type: "null" }] }, quiet: { type: "boolean" }
      } } },
      new: { type: "array", items: { type: "object", additionalProperties: false, required: ["kind", "what", "scene", "person"], properties: {
        kind: { type: "string", enum: ["person", "secret", "threat", "mystery", "place"] }, what: text, scene: { type: ["string", "null"] },
        person: nullable({ type: "object", additionalProperties: false, required: ["name", "who_they_are", "appearance"], properties: { name: text, who_they_are: text, appearance: { type: "string" } } })
      } } },
      leads: { type: "array", items: { type: "object", additionalProperties: false, required: ["who", "move", "scene"], properties: { who: oneOf(state.leads), move: text, scene: { type: ["string", "null"] } } } },
      arcs: { type: "array", items: { type: "object", additionalProperties: false, required: ["arc", "now", "next", "not_yet"], properties: { arc: oneOf(state.arcs), now: text, next: text, not_yet: text } } },
      roadmap: { type: "array", items: { type: "object", additionalProperties: false, required: ["arc", "by", "stands"], properties: { arc: oneOf(state.arcs), by: text, stands: text } } },
      premise: text
    }
  } as const;
}

/** The dates a Stretch from today may use, as agents write them: "1991-09-06", or "Day 6" without a calendar. */
export function stretchDates(state: State): string[] {
  const today = parseStoryTime(state.clock)?.day ?? 1;
  return Array.from({ length: STRETCH_DAYS.max }, (_, offset) => formatDate(today + offset, state.dayOne));
}

/** The Story's Landmarks from today on, soonest first. */
function landmarksAhead(state: State) {
  const day = parseStoryTime(state.clock)?.day ?? 0;
  const at = (landmark: { at: string }) => parseStoryTime(landmark.at);
  return state.landmarks
    .filter(landmark => (at(landmark)?.day ?? 0) >= day)
    .sort((left, right) => minutesOf(at(left) ?? { day: 0, minuteOfDay: 0 }) - minutesOf(at(right) ?? { day: 0, minuteOfDay: 0 }));
}

/** The run: today, where the Story ends, and the next two Landmarks. */
function theRun(state: State): string {
  const now = parseStoryTime(state.clock);
  if (!now) return "";
  const ahead = landmarksAhead(state);
  const end = ahead.at(-1);
  const dates = stretchDates(state).map((date, offset) => `${date} (${sayDate({ day: now.day + offset, minuteOfDay: 0 }, state.dayOne)})`);
  return [`Today is ${sayDate(now, state.dayOne, true)}.`, `The dates a Stretch from today can use: ${dates.join(", ")}.`, end ? `The Story runs to ${end.name}, ${say(state, end.at)}.` : "", ahead.length ? `Next: ${ahead.slice(0, 2).map(landmark => `${landmark.name}, ${say(state, landmark.at)}`).join("; then ")}.` : ""].filter(Boolean).join(" ");
}

export function directorPrompt(state: State, reason: string): { system: string; prompt: string } {
  const recent = [...state.recentPlans, ...(state.plan ? [state.plan.scenes] : [])].slice(-3);
  const plan = state.plan;
  return {
    system: join([PROMPT, storyPart(state)]),
    prompt: join([
      nowPart(state),
      section("the_run", theRun(state)),
      steeringPart(state),
      section("pace", state.curve.slice(-PACE).map(item => `- Scene ${item.scene}, ${item.title}: ${item.peak}`).join("\n")),
      storySoFarPart(state),
      castPart(state, [], "omniscient"),
      calendarPart(state, "omniscient"),
      threadsPart(state),
      factsPart(state, "omniscient", []),
      section("recent_stretches", recent.map((scenes, index) => `Stretch ${index + 1}:\n${scenes.map(scene => `- ${scene.headline} (${scene.place}; ${scene.who.join(", ") || "nobody else"})`).join("\n")}`).join("\n")),
      plan ? section("last_plan", [...plan.arcs.map(arc => `- ${arc.arc}: was ${arc.now}; next ${arc.next}; not yet ${arc.notYet}`), ...plan.roadmap.map(point => `- Roadmap: ${point.arc}, by ${point.by}: ${point.stands}`)].join("\n")) : null,
      section("task", `${reason} Plan the next Stretch, from today, ${(() => { const now = parseStoryTime(state.clock); return now ? sayDate(now, state.dayOne, true) : state.clock; })()}.`)
    ])
  };
}

/** Checks the plan: what the code can work out it sets right; only a plan with no Scene or nothing new is sent back. */
export function checkPlan(state: State, answer: unknown): Checked<DirectorRecord> {
  const format = matches<Raw>(directorFormat(state), answer);
  if (!format.ok) return format;
  const raw = format.value;
  const dropped: string[] = [];
  const now = parseStoryTime(state.clock);
  if (!now) return { ok: false, problems: ["the clock cannot be read"] };
  const days = Math.min(Math.max(raw.days, STRETCH_DAYS.min), STRETCH_DAYS.max);
  const from = now.day;
  const until = from + days - 1;
  const index = nameIndex(Object.values(state.people));

  // New people first, so the Scenes they enter in can name them.
  const people: DirectorRecord["people"] = [];
  const newThings: NewThing[] = [];
  for (const item of raw.new.slice(0, 2)) {
    let person: string | null = null;
    if (item.kind === "person") {
      const name = item.person?.name.trim() ?? "";
      if (!name || storyName(index, name) || people.length >= 1) {
        dropped.push(`new: ${name || "a person with no name"} cannot be brought in: ${name ? "the story already has them, or one new person is enough" : "give them a name"}`);
        continue;
      }
      people.push({ name, aliases: [], whoTheyAre: item.person?.who_they_are.trim() ?? "", known: null, appearance: item.person?.appearance.trim() ?? "", after: "", knows: [], voice: [], group: null });
      person = name;
    }
    newThings.push({ kind: item.kind, what: item.what.trim(), scene: item.scene?.trim() || null, person });
  }
  const extra = people.map(person => person.name);
  const named = namer(state, dropped, "scenes.who", extra);
  const shown = engagementsAhead(state);
  const labels = new Map<string, string>();
  const scenes: PlannedScene[] = raw.scenes.slice(0, SCENES.max).flatMap(scene => {
    const label = scene.id.trim();
    const time = /^(\d{1,2}):(\d{2})$/.exec(scene.time.trim());
    const offset = stretchDates(state).indexOf(scene.date.trim());
    let at = time && offset >= 0 ? formatStoryTime({ day: from + Math.min(offset, days - 1), minuteOfDay: Number(time[1]) * 60 + Number(time[2]) }) : null;
    let place = scene.place.trim();
    const engagement = scene.engagement ? shown[Number(scene.engagement.slice(1)) - 1] : undefined;
    if (engagement) {
      at = engagement.next;
      place = engagement.engagement.place;
    }
    const when = at ? parseStoryTime(at) : null;
    if (!engagement && offset < 0) return (dropped.push(`scenes: ${label} is on ${scene.date.trim()}, which is not one of the Stretch's dates`), []);
    if (!when || minutesOf(when) <= minutesOf(now)) return (dropped.push(`scenes: ${label} is not at a time after now`), []);
    const id = `s${(state.plan?.number ?? 0) + 1}.${labels.size + 1}`;
    labels.set(label, id);
    const brought = newThings.filter(thing => thing.scene === label && thing.person).map(thing => thing.person as string);
    return [{
      id, at: formatStoryTime(when), place, who: [...new Set([...named(scene.who), ...brought, ...(engagement?.engagement.who ?? [])])],
      for: scene.for.trim(), offer: scene.offer.trim(), headline: scene.headline.trim(), lead: scene.lead && state.leads.includes(scene.lead) ? scene.lead : null,
      engagement: engagement?.engagement.id ?? null, quiet: scene.quiet
    }];
  }).sort((left, right) => minutesOf(parseStoryTime(left.at) ?? now) - minutesOf(parseStoryTime(right.at) ?? now));
  if (scenes.length < SCENES.min) return { ok: false, problems: ["scenes: none of the Scenes that matter can be kept; plan two to five, each after now, within the Stretch"] };
  if (newThings.length === 0) return { ok: false, problems: ["new: bring at least one thing the player's character has not met: a person, a secret, a threat, a mystery or a place"] };
  for (const thing of newThings) thing.scene = thing.scene ? labels.get(thing.scene) ?? null : null;

  const leads: LeadMove[] = state.leads.map(who => {
    const row = raw.leads.find(item => item.who === who);
    if (!row) dropped.push(`leads: no move for ${who}`);
    return { who, move: row?.move.trim() ?? "goes about their own life", scene: row?.scene ? labels.get(row.scene.trim()) ?? null : null };
  });
  const arcs: ArcStep[] = state.arcs.map(arc => {
    const row = raw.arcs.find(item => item.arc === arc);
    const last = state.plan?.arcs.find(item => item.arc === arc);
    if (!row) dropped.push(`arcs: no row for "${arc}"; it holds where it is`);
    return row ? { arc, now: row.now.trim(), next: row.next.trim(), notYet: row.not_yet.trim() } : { arc, now: last?.now ?? "where the last Scenes left it", next: "nothing; let the last step settle", notYet: last?.notYet ?? "any step at all" };
  });
  const landmark = raw.landmark ? state.landmarks.find(item => item.name.toLocaleLowerCase() === raw.landmark?.trim().toLocaleLowerCase()) : undefined;
  if (raw.landmark && !landmark) dropped.push(`landmark: "${raw.landmark}" is not one of the Story's Landmarks; the Stretch builds toward none`);
  const roadmap: RoadmapPoint[] = raw.roadmap.filter(point => state.arcs.includes(point.arc)).map(point => ({ arc: point.arc, by: point.by.trim(), stands: point.stands.trim() }));
  return {
    ok: true, dropped,
    value: { from, until, toward: raw.toward.trim(), landmark: landmark?.name ?? null, phase: raw.phase, scenes, leads, arcs, roadmap, premise: raw.premise.trim(), newThings, people }
  };
}

export async function writePlan(models: Models, choices: ModelChoice[], state: State, reason: string, storyId: string, traceId: string, signal: AbortSignal): Promise<{ value: DirectorRecord; callId: string; model: ModelChoice; dropped: string[] }> {
  const { system, prompt } = directorPrompt(state, reason);
  return runAgent(models, choices, { agent: "director", system, prompt, schema: directorFormat(state), facts: { clock: state.clock, dates: stretchDates(state), reason, leads: state.leads, arcs: state.arcs, coming: landmarksAhead(state).slice(0, 2).map(landmark => landmark.name), plan: state.plan?.number ?? 0, afterPeak: (state.curve.at(-1)?.peak ?? 0) >= PEAK }, traceId, storyId }, answer => checkPlan(state, answer), TIMEOUT_MS.plan, signal);
}

void (null as unknown as Person);
