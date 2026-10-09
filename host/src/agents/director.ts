import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Models } from "../models/model-call.js";
import type { ArcStep, DirectorPlan, LeadMove, PlannedScene, RoadmapPoint } from "../story/entries.js";
import type { Landmark, ModelChoice, State } from "../story/state.js";
import type { World } from "../story/world.js";
import { minutesOf, parseStoryTime, sayStoryTime } from "../time.js";
import { nameIndex, storyName } from "./names.js";
import { type RecalledBond, sayBetween } from "./recall.js";
import { answerWithOneRepair, type Checked } from "./repair.js";

/**
 * The Director: plans the long run in stretches that build, peak and rest around the Arcs and Landmarks (openspec
 * long-run). It sees everything, as the Writer does, and its plan reaches the Story only through the Writer
 * (docs/adr/0004).
 */

const PROMPT = readFileSync(new URL("./DIRECTOR.md", import.meta.url), "utf8");

/** A Stretch runs five to nine days, with two to five Scenes that matter (story-in-stretches design decision 1). */
export const STRETCH_DAYS = { min: 5, max: 9 } as const;
export const SCENES_THAT_MATTER = { min: 2, max: 5 } as const;

const text = { type: "string", minLength: 1 } as const;

/** The Director's answer, as the provider is asked to give it. */
export const DIRECTOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["from", "until", "toward", "landmark", "phase", "scenes", "arcs", "leads", "roadmap", "premise"],
  properties: {
    from: { ...text, description: "The Stretch's first day, today: \"Day 6\"." },
    until: { ...text, description: "Its last day, five to nine days long: \"Day 12\"." },
    toward: { ...text, description: "What the Stretch builds toward, in the story's words." },
    landmark: { type: ["string", "null"], description: "The Landmark it builds toward, named as the story names it, or null." },
    phase: { type: "string", enum: ["build", "peak", "rest"] },
    scenes: {
      type: "array",
      minItems: SCENES_THAT_MATTER.min,
      maxItems: SCENES_THAT_MATTER.max,
      description: "The Scenes that matter in the Stretch, in order.",
      items: {
        type: "object", additionalProperties: false, required: ["id", "at", "place", "who", "for", "lead"],
        properties: { id: text, at: text, place: text, who: { type: "array", items: { type: "string" } }, for: text, lead: { type: ["string", "null"] } }
      }
    },
    arcs: {
      type: "array",
      description: "One row per Arc, named as the story names it.",
      items: { type: "object", additionalProperties: false, required: ["arc", "now", "next", "not_yet"], properties: { arc: text, now: text, next: text, not_yet: text } }
    },
    leads: {
      type: "array",
      description: "One move for each Lead: in one of the Scenes that matter (its id), or off-screen (null).",
      items: { type: "object", additionalProperties: false, required: ["who", "move", "scene"], properties: { who: text, move: text, scene: { type: ["string", "null"] } } }
    },
    roadmap: {
      type: "array",
      description: "For each Arc, where it should stand by each of the next two Landmarks.",
      items: { type: "object", additionalProperties: false, required: ["arc", "by", "stands"], properties: { arc: text, by: text, stands: text } }
    },
    premise: { ...text, description: "Which kinds of Scene in this Stretch serve the Premise, and which leave it alone." }
  }
} as const;

/** The plan as checked, before the Mac stores it. */
export type RawPlan = Omit<DirectorPlan, "kind" | "callId" | "model" | "dropped">;

interface AnswerPlan {
  from: string;
  until: string;
  toward: string;
  landmark: string | null;
  phase: DirectorPlan["phase"];
  scenes: { id: string; at: string; place: string; who: string[]; for: string; lead: string | null }[];
  arcs: ArcStep[];
  leads: { who: string; move: string; scene: string | null }[];
  roadmap: RoadmapPoint[];
  premise: string;
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
const matchesSchema = ajv.compile<AnswerPlan>(DIRECTOR_SCHEMA);

/** The Landmarks after the clock, soonest first: the roadmap is written to the next two. */
export function nextLandmarks(state: State, count = 2): Landmark[] {
  const now = parseStoryTime(state.clock);
  return state.landmarks
    .flatMap(landmark => {
      const at = parseStoryTime(landmark.at);
      return at && (!now || minutesOf(at) > minutesOf(now)) ? [{ landmark, minutes: minutesOf(at) }] : [];
    })
    .sort((left, right) => left.minutes - right.minutes)
    .slice(0, count)
    .map(item => item.landmark);
}

/** One Scene so far, as the Director reads it. */
export interface SceneSoFar {
  number: number;
  title: string;
  /** What the Chronicler said happened, once it has. */
  summary: string | null;
  /** The highest intensity the Writer gave it. */
  peak: number | null;
  arcMoved: boolean;
}

/** What the Director is asked to plan from. */
export interface DirectorAsk {
  /** The State at the end of the Scene that just ended. */
  state: State;
  world: World;
  scenes: SceneSoFar[];
  /** The plan before this one, if there was one. */
  previous: DirectorPlan | null;
  /** The Scene that just ended peaked, so this stretch rests (openspec long-run: Rest is deliberate). */
  afterPeak: boolean;
  /** Every Lead's Bond, and the Bond of each person with five turns or more (lasting-records design decision 6). */
  bonds?: { leads: RecalledBond[]; others: RecalledBond[] };
}

/** The Director could not give a plan the Story can use. */
export class DirectorFailed extends Error {}

/**
 * Checks the Director's answer against the Story, part by part (lasting-records design decision 3; story-in-stretches
 * design decision 1): a Scene that matters outside the Stretch or before now, a name not in the Story, a row for an
 * Arc, a Lead or a Landmark that is not the Story's, is left out and said why; the days are kept to the Stretch's
 * bounds; an Arc with no row holds. Only an answer that does not match the schema, keeps no Scene that matters, or is
 * not a rest after a peak is refused.
 */
export function checkPlan(ask: DirectorAsk, raw: unknown): Checked<RawPlan> {
  if (!matchesSchema(raw)) {
    return { ok: false, problems: (matchesSchema.errors ?? []).map(error => `${error.instancePath.replace(/^\//, "").replace(/\//g, ".") || "answer"}: ${error.message ?? "is not as the schema says"}`) };
  }
  const { state } = ask;
  const dropped: string[] = [];
  const fatal: string[] = [];
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const pc = state.playerCharacter;
  const index = nameIndex(Object.values(state.people));
  const now = parseStoryTime(state.clock);
  const today = now?.day ?? 1;

  // The days: from today, five to nine days.
  const day = (value: string) => /^\s*day\s+(\d+)\s*$/i.exec(value)?.[1];
  const from = today;
  if (day(raw.from) === undefined || Number(day(raw.from)) !== today) dropped.push(`from: the Stretch starts today, Day ${today}, not ${raw.from.trim()}`);
  let until = Number(day(raw.until) ?? NaN);
  const length = until - from + 1;
  if (Number.isNaN(until)) {
    until = from + 6;
    dropped.push(`until: "${raw.until.trim()}" is not a day like "Day ${from + 6}"; the Stretch ends seven days on`);
  } else if (length > STRETCH_DAYS.max) {
    until = from + STRETCH_DAYS.max - 1;
    dropped.push(`until: the Stretch is ${length} days long; it runs five to nine days, so it ends by Day ${until}`);
  } else if (length < STRETCH_DAYS.min) {
    // Lengthened to five days, or to its last Scene that matters within nine.
    const last = Math.max(...raw.scenes.map(scene => parseStoryTime(scene.at)?.day ?? 0).filter(at => at <= from + STRETCH_DAYS.max - 1));
    until = Math.max(from + STRETCH_DAYS.min - 1, last);
    dropped.push(`until: the Stretch is ${length} days long; it runs five to nine days, so it now ends on Day ${until}`);
  }

  // The Scenes that matter: within the Stretch and after now, with the Story's people.
  const sceneIds = new Map<string, string>();
  const scenes: PlannedScene[] = raw.scenes.flatMap(scene => {
    const label = scene.id.trim();
    const at = parseStoryTime(scene.at);
    if (!at) return (dropped.push(`scenes: ${label} is at "${scene.at.trim()}", which is not a time like "Day ${from + 3} 14:00"`), []);
    if (at.day < from || at.day > until) return (dropped.push(`scenes: ${label} is at ${scene.at.trim()}, outside the Stretch (Day ${from} to Day ${until})`), []);
    if (now && minutesOf(at) <= minutesOf(now)) return (dropped.push(`scenes: ${label} is at ${scene.at.trim()}, before now (${state.clock})`), []);
    const who = [...new Set(scene.who.flatMap(name => {
      const known = storyName(index, name);
      if (!known) return (dropped.push(`scenes: ${label}, who: ${name.trim()} is not in the story`), []);
      if (known === pc) return (dropped.push(`scenes: ${label}, who: ${pc} is the player's character, who is always there; leave him out`), []);
      return [known];
    }))];
    const lead = scene.lead === null ? null : state.leads.find(name => name === storyName(index, scene.lead ?? "")) ?? null;
    if (scene.lead !== null && !lead) dropped.push(`scenes: ${label}, lead: ${scene.lead.trim()} is not a Lead; name one of the Leads (${state.leads.join(", ")}), or null`);
    const id = `s-${randomUUID().slice(0, 8)}`;
    sceneIds.set(label, id);
    return [{ id, at: scene.at.trim(), place: scene.place.trim(), who, for: scene.for.trim(), lead }];
  });
  if (scenes.length === 0) fatal.push(`scenes: none of the Scenes that matter can be kept; plan two to five within the Stretch`);

  // Each Arc's step: a row for an Arc the Story lacks is left out; an Arc with no row holds where it was.
  const arcs: ArcStep[] = [];
  for (const arc of state.arcs) {
    const row = raw.arcs.find(item => same(item.arc, arc));
    if (row) arcs.push({ arc, now: row.now.trim(), next: row.next.trim(), not_yet: row.not_yet.trim() });
    else {
      const last = ask.previous?.arcs.find(item => same(item.arc, arc));
      dropped.push(`arcs: no row for the Arc "${arc}"; it holds where it is`);
      arcs.push({ arc, now: last?.now ?? "where the last Scenes left it", next: "nothing; let the last step settle", not_yet: last?.not_yet ?? "any step at all" });
    }
  }
  for (const row of raw.arcs) if (!state.arcs.some(arc => same(arc, row.arc))) dropped.push(`arcs: "${row.arc}" is not one of the story's Arcs`);

  // Each Lead's move: on screen only in one of the plan's Scenes.
  const leads: LeadMove[] = [];
  for (const row of raw.leads) {
    const who = state.leads.find(name => name === storyName(index, row.who));
    if (!who) { dropped.push(`leads: ${row.who.trim()} is not a Lead`); continue; }
    if (leads.some(lead => lead.who === who)) { dropped.push(`leads: two moves for ${who}; give one`); continue; }
    let scene = row.scene === null ? null : sceneIds.get(row.scene.trim()) ?? null;
    if (row.scene !== null && !scene) {
      dropped.push(`leads: ${who}'s move is in ${row.scene.trim()}, which is not one of the Scenes that matter; it happens off-screen`);
      scene = null;
    }
    leads.push({ who, move: row.move.trim(), scene });
  }
  for (const lead of state.leads) if (!leads.some(row => row.who === lead)) dropped.push(`leads: no move for ${lead}; every Lead makes one this Stretch, on screen or off`);
  leads.sort((left, right) => state.leads.indexOf(left.who) - state.leads.indexOf(right.who));

  // The roadmap: each Arc by each of the next two Landmarks.
  const coming = nextLandmarks(state);
  const roadmap: RoadmapPoint[] = [];
  for (const row of raw.roadmap) {
    const arc = state.arcs.find(item => same(item, row.arc));
    const by = coming.find(item => same(item.name, row.by) || same(item.name.replace(/^the\s+/i, ""), row.by.replace(/^the\s+/i, "")));
    if (!arc) { dropped.push(`roadmap: "${row.arc.trim()}" is not one of the story's Arcs`); continue; }
    if (!by) { dropped.push(`roadmap: "${row.by.trim()}" is not one of the next two Landmarks (${coming.map(item => item.name).join(", ") || "there are none"})`); continue; }
    if (roadmap.some(point => point.arc === arc && point.by === by.name)) continue;
    roadmap.push({ arc, by: by.name, stands: row.stands.trim() });
  }
  for (const arc of state.arcs) {
    for (const landmark of coming) {
      if (!roadmap.some(point => point.arc === arc && point.by === landmark.name)) dropped.push(`roadmap: no row for the Arc "${arc}" by ${landmark.name}; say where it should stand by then`);
    }
  }

  const landmark = raw.landmark === null ? null : state.landmarks.find(item => same(item.name, raw.landmark ?? ""))?.name;
  if (landmark === undefined) dropped.push(`landmark: "${raw.landmark}" is not one of the story's Landmarks (${state.landmarks.map(item => item.name).join(", ") || "it has none"}); name one exactly, or null`);
  if (ask.afterPeak && raw.phase !== "rest") fatal.push(`phase: the Scene that just ended peaked, so this stretch is a rest, not a ${raw.phase}`);
  if (fatal.length) return { ok: false, problems: [...fatal, ...dropped] };
  return { ok: true, value: { from, until, toward: raw.toward.trim(), landmark: landmark ?? null, phase: raw.phase, scenes, arcs, leads, roadmap, premise: raw.premise.trim() }, dropped };
}

function section(tag: string, body: string): string | null {
  if (!body.trim()) return null;
  return `<${tag}>\n${body.trim()}\n</${tag.split(" ")[0]}>`;
}

function say(state: State, at: string): string {
  const time = parseStoryTime(at);
  return time ? `${at} (${sayStoryTime(time, state.dayOneWeekday)})` : at;
}

const NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** How far off [days] is, as a person says it: "in 9 days", "in 9 weeks", "in about two years". */
function away(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${days} days`;
  if (days < 365) return `in ${Math.round(days / 7)} weeks`;
  const years = Math.round(days / 365);
  return `in about ${NUMBERS[years] ?? years} year${years === 1 ? "" : "s"}`;
}

/**
 * The whole run, for pacing (story-in-stretches design decision 2): today, how far the Story's last Landmark is, and
 * the next two Landmarks, which the roadmap is written to.
 */
function theRun(state: State): string | null {
  const now = parseStoryTime(state.clock);
  if (!now) return null;
  const days = (at: string) => (parseStoryTime(at)?.day ?? now.day) - now.day;
  const last = state.landmarks.map(landmark => ({ landmark, day: parseStoryTime(landmark.at)?.day ?? 0 })).sort((left, right) => right.day - left.day)[0];
  const coming = nextLandmarks(state);
  return [
    `Today is Day ${now.day} (${sayStoryTime(now, state.dayOneWeekday)}).${last && last.day > now.day ? ` The Story runs to Day ${last.day}, ${away(last.day - now.day).replace(/^in /, "")} from now.` : ""}`,
    coming.length ? `Next: ${coming.map(landmark => `${landmark.name}, Day ${parseStoryTime(landmark.at)?.day} (${away(days(landmark.at))})`).join("; then ")}.` : "No Landmark is ahead.",
    coming.length ? `Write the roadmap for each Arc by ${coming.map(landmark => landmark.name).join(" and by ")}.` : ""
  ].filter(Boolean).join("\n");
}

/** The Story the Director plans for: the same for every call, so its prompt cache hits (docs/adr/0005). */
function storyPrompt(state: State): string {
  return [
    PROMPT,
    section("story", [
      `Title: ${state.title}`,
      `Premise: ${state.premise}`,
      `Style: ${state.style}`,
      state.world.summary ? `World: ${state.world.summary}` : "",
      state.arcs.length ? `Arcs:\n${state.arcs.map(arc => `- ${arc}`).join("\n")}` : "",
      state.landmarks.length ? `Landmarks:\n${state.landmarks.map(landmark => `- ${landmark.name}, ${say(state, landmark.at)}: ${landmark.what}`).join("\n")}` : ""
    ].filter(Boolean).join("\n")),
    section(`player_character name="${state.playerCharacter}"`, state.people[state.playerCharacter]?.whoTheyAre ?? ""),
    section("leads", state.leads.join(", "))
  ].filter(part => part !== null).join("\n\n");
}

/** The prompt for one plan: the story up to now, and what this plan must do. */
export function directorPrompt(ask: DirectorAsk): { system: string; prompt: string; facts: unknown } {
  const { state, scenes, previous } = ask;
  const scenesSoFar = scenes.map(scene => `- Scene ${scene.number}, ${scene.title}${scene.peak !== null ? ` (intensity ${scene.peak}${scene.arcMoved ? ", an Arc moved" : ""})` : ""}: ${scene.summary ?? "not yet recorded"}`);
  const threads = ask.world.threads.map(thread => `- ${thread.name}: ${thread.now}`);
  const prompt = [
    section("now", `It is ${say(state, state.clock)}. ${scenes.length} Scenes have been played.`),
    section("the_run", theRun(state) ?? ""),
    section("scenes_so_far", scenesSoFar.join("\n")),
    section("threads", threads.join("\n")),
    section("leads_between", sayBetween(ask.bonds?.leads ?? [])),
    section("between", sayBetween(ask.bonds?.others ?? [])),
    previous ? section("last_plan", [
      `Phase: ${previous.phase}, toward ${previous.toward}${previous.landmark ? ` (the Landmark ${previous.landmark})` : ""}, Day ${previous.from} to Day ${previous.until}.`,
      ...previous.scenes.map(scene => `- Scene that mattered, ${scene.at}, ${scene.place}: ${scene.for}`),
      ...previous.leads.map(lead => `- ${lead.who}'s move: ${lead.move}${lead.scene ? "" : " (off-screen)"}`),
      ...previous.arcs.map(arc => `- ${arc.arc}: was ${arc.now}; next ${arc.next}; not yet ${arc.not_yet}`),
      ...previous.roadmap.map(point => `- Roadmap: ${point.arc}, by ${point.by}: ${point.stands}`),
      `Premise: ${previous.premise}`
    ].join("\n")) : null,
    section("task", [
      `Plan the next Stretch, from today, Day ${parseStoryTime(state.clock)?.day ?? 1}.`,
      ask.afterPeak ? "The Scene that just ended peaked: this stretch is a rest." : "",
      previous ? "Judge where each Arc stands from the Scenes since the last plan, not from what the last plan hoped." : "This is the story's first plan."
    ].filter(Boolean).join(" "))
  ].filter(part => part !== null).join("\n\n");
  const facts = { arcs: state.arcs, landmarks: state.landmarks.map(landmark => landmark.name), afterPeak: ask.afterPeak, scenes: scenes.length, clock: state.clock, leads: state.leads, coming: nextLandmarks(state).map(landmark => landmark.name) };
  return { system: storyPrompt(state), prompt, facts };
}

/** Runs the Director once, checked and repaired once; throws DirectorFailed with the reasons. */
export function writePlan(models: Models, model: ModelChoice, ask: DirectorAsk, storyId: string, traceId: string, signal: AbortSignal): Promise<{ value: RawPlan; callId: string; dropped: string[] }> {
  const { system, prompt, facts } = directorPrompt(ask);
  return answerWithOneRepair(models,
    { agent: "director", model, system, prompt, schema: DIRECTOR_SCHEMA, facts, traceId, storyId },
    answer => checkPlan(ask, answer),
    reason => new DirectorFailed(`The Director could not plan: ${reason}`),
    signal);
}
