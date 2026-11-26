import type { Models } from "../models/model-call.js";
import type { Beside } from "../story/beside.js";
import type { DirectorPlan } from "../story/entries.js";
import { currentAct, type Outline } from "../story/outline.js";
import { tiers } from "../story/relevance.js";
import type { ArcStep, LeadMove, ModelChoice, NewThing, PlannedScene, RoadmapPoint, State } from "../story/state.js";
import { formatDate, formatStoryTime, minutesOf, parseStoryTime, sayDate } from "../time.js";
import { engagementsAhead } from "../story/day.js";
import { say, section } from "../context/lens.js";
import { matches, namer, nullable, oneOf, peopleEnum, text } from "./format.js";
import { nameIndex, storyName } from "../story/names.js";
import { directorCall, landmarksAhead } from "./outline.js";
import { BUDGETS, runAgent, type Checked } from "./step.js";

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

/**
 * What a Scene that matters serves in the Outline (openspec the-outline: Each Stretch is the next step of the current
 * Act): the turn of the current Act it moves, and the people whose own Lives it is about.
 */
/** A Scene that matters, with what it serves. */
export type StretchScene = PlannedScene;

/** Something the Stretch brings in: always a setup the Outline means to pay off, by its id. */
export type BroughtIn = NewThing;

export type DirectorRecord = Omit<DirectorPlan, "kind" | "reason" | "afterScene" | "callId" | "model" | "dropped">;

interface Raw {
  days: number;
  toward: string;
  landmark: string | null;
  phase: "build" | "peak" | "rest";
  scenes: { id: string; date: string; time: string; place: string; who: string[]; serves: { turn: string | null; lives: string[] }; for: string; offer: string; headline: string; lead: string | null; engagement: string | null; quiet: boolean }[];
  new: { setup: string; kind: NewThing["kind"]; scene: string | null; person: { name: string; who_they_are: string; appearance: string } | null }[];
  leads: { who: string; move: string; scene: string | null }[];
  arcs: { arc: string; now: string; next: string; not_yet: string }[];
  roadmap: { arc: string; by: string; stands: string }[];
  premise: string;
}

/**
 * Why a plan is due at a Scene's end (openspec long-run: The Director shapes the long run), or null: no plan yet, the
 * Outline was re-planned since the plan, the Stretch is over, the Scene peaked, its Landmark passed, or the player went
 * off the plan.
 */
export function directionDue(state: State): string | null {
  const plan = state.plan;
  if (!plan) return "There is no plan yet: this is the Story's first.";
  const now = parseStoryTime(state.clock);
  if (!now) return null;
  const minutes = (at: string) => minutesOf(parseStoryTime(at) ?? now);
  const outline = state.outline;
  if (outline?.deep && outline.revisedAfter > plan.afterScene) return `The Outline was re-planned after Scene ${outline.revisedAfter}: plan the Stretch as the next step of ${currentAct(outline)?.title ?? "the current Act"} as it now stands.`;
  const last = state.curve.at(-1);
  if (last && last.peak >= PEAK && plan.afterScene < last.scene) return `Scene ${last.scene}, ${last.title}, peaked: give the characters a breath, then build again.`;
  const passedBy = plan.scenes.find(scene => !state.played.includes(scene.id) && minutes(scene.at) < minutesOf(now));
  if (passedBy) return `The player went off the plan: ${passedBy.headline} (${say(state, passedBy.at)}) passed without him. Plan from where the story now is.`;
  const landmark = plan.landmark ? state.landmarks.find(item => item.name === plan.landmark) : undefined;
  if (landmark && minutes(landmark.at) <= minutesOf(now)) return `${landmark.name} has passed.`;
  if (now.day > plan.until || plan.scenes.every(scene => state.played.includes(scene.id))) return "The last Stretch has run its course.";
  return null;
}

/**
 * Whether a Stretch plan follows [outline] in the same step of a Scene's end (the Outline's `planFollows`): whether one
 * is due once the Outline is kept. A deep re-plan always calls for one.
 */
export function planFollows(state: State, outline: Omit<Outline, "version">): boolean {
  return directionDue({ ...state, outline: { ...outline, version: (state.outline?.version ?? 0) + 1 } }) !== null;
}

/** The current Act's turns a Stretch can still serve. */
function turnsAhead(state: State): string[] {
  return currentAct(state.outline)?.turns.filter(turn => turn.state === "ahead").map(turn => turn.id) ?? [];
}

/** The Outline's setups a Stretch may bring in: waiting, not planted, and not brought in by an earlier Stretch. */
export function setupsToBring(state: State) {
  return (state.outline?.setups ?? []).filter(setup => setup.state === "waiting" && setup.planted === null && !state.introduced.some(item => item.what === setup.what));
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
      scenes: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "date", "time", "place", "who", "serves", "for", "offer", "headline", "lead", "engagement", "quiet"], properties: {
        id: text, date: oneOf(stretchDates(state)), time: { ...text, description: "HH:MM" }, place: text,
        who: { type: "array", items: peopleEnum(state) },
        serves: { type: "object", additionalProperties: false, required: ["turn", "lives"], properties: { turn: { anyOf: [oneOf(turnsAhead(state)), { type: "null" }] }, lives: { type: "array", items: peopleEnum(state) } } },
        for: text, offer: text, headline: text,
        lead: { anyOf: [oneOf(state.leads), { type: "null" }] }, engagement: { anyOf: [oneOf(engagements), { type: "null" }] }, quiet: { type: "boolean" }
      } } },
      new: { type: "array", items: { type: "object", additionalProperties: false, required: ["setup", "kind", "scene", "person"], properties: {
        setup: oneOf(setupsToBring(state).map(setup => setup.id)),
        kind: { type: "string", enum: ["person", "secret", "threat", "mystery", "place"] }, scene: { type: ["string", "null"] },
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

/** The run: today, where the Story ends, and the next two Landmarks. */
function theRun(state: State): string {
  const now = parseStoryTime(state.clock);
  if (!now) return "";
  const ahead = landmarksAhead(state);
  const end = ahead.at(-1);
  const dates = stretchDates(state).map((date, offset) => `${date} (${sayDate({ day: now.day + offset, minuteOfDay: 0 }, state.dayOne)})`);
  return [`Today is ${sayDate(now, state.dayOne, true)}.`, `The dates a Stretch from today can use: ${dates.join(", ")}.`, end ? `The Story runs to ${end.name}, ${say(state, end.at)}.` : "", ahead.length ? `Next: ${ahead.slice(0, 2).map(landmark => `${landmark.name}, ${say(state, landmark.at)}`).join("; then ")}.` : ""].filter(Boolean).join(" ");
}

/** The task: why a plan is due, and that the Stretch is the next step of the current Act. */
function stretchTask(state: State, reason: string): string {
  const now = parseStoryTime(state.clock);
  const act = currentAct(state.outline);
  return [
    `${reason} Plan the next Stretch, from today, ${now ? sayDate(now, state.dayOne, true) : state.clock}.`,
    act ? `It is the next step of Act ${act.number}, ${act.title}: every Scene that matters serves one of its turns or someone's Life, and nothing enters but a setup the Outline means to pay off.` : ""
  ].filter(Boolean).join("\n");
}

/**
 * The Stretch's prompt, in the Director's four layers (the-storys-mind design decision 7), as it reads the Story for
 * the Outline: the Story, cached; where things stand, the Outline among it; the Scene that ended; then this moment: the
 * run, the pace, the last Stretches and the last plan, and the task.
 */
export function directorPrompt(state: State, beside: Beside, reason: string): { system: string; prompt: string } {
  const recent = [...state.recentPlans, ...(state.plan ? [state.plan.scenes] : [])].slice(-3);
  const plan = state.plan;
  return directorCall(state, beside, [
    section("the_run", theRun(state)),
    section("pace", state.curve.slice(-PACE).map(item => `- Scene ${item.scene}, ${item.title}: ${item.peak}`).join("\n")),
    section("recent_stretches", recent.map((scenes, index) => `Stretch ${index + 1}:\n${scenes.map(scene => `- ${scene.headline} (${scene.place}; ${scene.who.join(", ") || "nobody else"})`).join("\n")}`).join("\n")),
    plan ? section("last_plan", [...plan.arcs.map(arc => `- ${arc.arc}: was ${arc.now}; next ${arc.next}; not yet ${arc.notYet}`), ...plan.roadmap.map(point => `- Roadmap: ${point.arc}, by ${point.by}: ${point.stands}`)].join("\n")) : null,
    section("task", stretchTask(state, reason))
  ]);
}

/**
 * Checks the plan: what the code can work out it sets right. A Scene that serves no turn of the current Act and no
 * one's Life is left out, and so is anything new that is not a setup the Outline means to pay off (openspec
 * the-outline: Each Stretch is the next step of the current Act; Nothing enters without a payoff); only a plan with no
 * Scene it can keep is sent back.
 */
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

  // What it brings in first, so the Scenes a new person enters in can name them: only a setup still to bring in.
  const bringable = new Map(setupsToBring(state).map(setup => [setup.id.toLocaleLowerCase(), setup]));
  const setups = new Map((state.outline?.setups ?? []).map(setup => [setup.id.toLocaleLowerCase(), setup]));
  const people: DirectorRecord["people"] = [];
  const newThings: BroughtIn[] = [];
  for (const item of raw.new) {
    const key = item.setup.trim().toLocaleLowerCase();
    const setup = bringable.get(key);
    if (!setup) {
      const known = setups.get(key);
      dropped.push(known ? `new: ${known.id} (${known.what}) is already in the Story, or no longer waiting; it is not brought in again` : `new: "${item.setup.trim()}" is not a setup the Outline means to pay off; nothing enters without one`);
      continue;
    }
    bringable.delete(key);
    let person: string | null = null;
    if (item.kind === "person") {
      const name = item.person?.name.trim() ?? "";
      if (!name || storyName(index, name) || people.some(other => other.name === name)) {
        dropped.push(`new: ${name || "a person with no name"} cannot be brought in: ${name ? "the story already has them" : "give them a name"}`);
        continue;
      }
      people.push({ name, aliases: [], whoTheyAre: item.person?.who_they_are.trim() ?? "", known: null, appearance: item.person?.appearance.trim() ?? "", after: "", knows: [], voice: [], group: null });
      person = name;
    }
    newThings.push({ setup: setup.id, kind: item.kind, what: setup.what, scene: item.scene?.trim() || null, person });
  }
  const extra = people.map(person => person.name);
  const named = namer(state, dropped, "scenes.who", extra);
  const lived = namer(state, dropped, "scenes.serves.lives", extra);
  const turns = new Map(turnsAhead(state).map(id => [id.toLocaleLowerCase(), id]));
  const shown = engagementsAhead(state);
  const labels = new Map<string, string>();
  const scenes: StretchScene[] = raw.scenes.slice(0, SCENES.max).flatMap(scene => {
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
    const wanted = scene.serves.turn?.trim() ?? "";
    const turn = wanted ? turns.get(wanted.toLocaleLowerCase()) ?? null : null;
    if (wanted && !turn) dropped.push(`scenes: ${label} serves "${wanted}", which is not a turn of the current Act still ahead`);
    const serves = { turn, lives: lived(scene.serves.lives) };
    if (!serves.turn && serves.lives.length === 0) return (dropped.push(`scenes: ${label} serves no turn of the current Act and no one's Life; it is not planned`), []);
    const id = `s${(state.plan?.number ?? 0) + 1}.${labels.size + 1}`;
    labels.set(label, id);
    const brought = newThings.filter(thing => thing.scene === label && thing.person).map(thing => thing.person as string);
    return [{
      id, at: formatStoryTime(when), place, who: [...new Set([...named(scene.who), ...brought, ...(engagement?.engagement.who ?? [])])], serves,
      for: scene.for.trim(), offer: scene.offer.trim(), headline: scene.headline.trim(), lead: scene.lead && state.leads.includes(scene.lead) ? scene.lead : null,
      engagement: engagement?.engagement.id ?? null, quiet: scene.quiet
    }];
  }).sort((left, right) => minutesOf(parseStoryTime(left.at) ?? now) - minutesOf(parseStoryTime(right.at) ?? now));
  if (scenes.length < SCENES.min) return { ok: false, problems: ["scenes: none of the Scenes that matter can be kept; plan two to five, each after now, within the Stretch, each serving a turn of the current Act or someone's Life"] };
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

/** What a scripted Director plans from: the dates, the Leads and Arcs, the turns and Lives it can serve, what it may bring in. */
function planFacts(state: State, reason: string) {
  const { close, movers, others } = tiers(state);
  return {
    job: "stretch", clock: state.clock, dates: stretchDates(state), reason, leads: state.leads, arcs: state.arcs,
    coming: landmarksAhead(state).slice(0, 2).map(landmark => landmark.name), plan: state.plan?.number ?? 0,
    afterPeak: (state.curve.at(-1)?.peak ?? 0) >= PEAK, turns: turnsAhead(state),
    lives: [...close, ...movers, ...others].filter(name => state.people[name]).slice(0, 6),
    setups: setupsToBring(state).map(setup => ({ id: setup.id, what: setup.what }))
  };
}

/**
 * Plans the next Stretch as the next step of the current Act (openspec the-outline; long-run: The Director shapes the
 * long run around Arcs and Landmarks), in the Director's focused budget, with the Story's tools.
 */
export async function writePlan(models: Models, choices: ModelChoice[], state: State, beside: Beside, reason: string, story: { storyId: string; head: string }, traceId: string, signal: AbortSignal): Promise<{ value: DirectorRecord; callId: string; model: ModelChoice; dropped: string[]; lookups: string[] }> {
  const { system, prompt } = directorPrompt(state, beside, reason);
  return runAgent(models, choices, {
    agent: "director", system, prompt, schema: directorFormat(state), facts: planFacts(state, reason), tools: { story, web: false }, traceId, storyId: story.storyId
  }, answer => checkPlan(state, answer), BUDGETS.directorFocused, signal);
}
