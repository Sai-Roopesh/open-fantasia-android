import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Models } from "../models/model-call.js";
import type { ArcStep, DirectorPlan } from "../story/entries.js";
import type { ModelChoice, State } from "../story/state.js";
import type { World } from "../story/world.js";
import { parseStoryTime, sayStoryTime } from "../time.js";
import { answerWithOneRepair, type Checked } from "./repair.js";

/**
 * The Director: plans the long run in stretches that build, peak and rest around the Arcs and Landmarks (openspec
 * long-run). It sees everything, as the Writer does, and its plan reaches the Story only through the Writer
 * (docs/adr/0004).
 */

const PROMPT = readFileSync(new URL("./DIRECTOR.md", import.meta.url), "utf8");

export const MAX_STRETCH = 6;

const text = { type: "string", minLength: 1 } as const;

/** The Director's answer, as the provider is asked to give it. */
export const DIRECTOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["toward", "landmark", "phase", "scenes", "arcs", "premise"],
  properties: {
    toward: { ...text, description: "What the stretch builds toward, in the story's words." },
    landmark: { type: ["string", "null"], description: "The Landmark it builds toward, named as the story names it, or null." },
    phase: { type: "string", enum: ["build", "peak", "rest"] },
    scenes: { type: "integer", minimum: 1, maximum: MAX_STRETCH },
    arcs: {
      type: "array",
      description: "One row per Arc, named as the story names it.",
      items: { type: "object", additionalProperties: false, required: ["arc", "now", "next", "not_yet"], properties: { arc: text, now: text, next: text, not_yet: text } }
    },
    premise: { ...text, description: "Which kinds of Scene in this stretch serve the Premise, and which leave it alone." }
  }
} as const;

type RawPlan = Omit<DirectorPlan, "kind" | "callId" | "model">;

const ajv = new Ajv2020({ strict: false, allErrors: true });
const matchesSchema = ajv.compile<RawPlan>(DIRECTOR_SCHEMA);

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
}

/** The Director could not give a plan the Story can use. */
export class DirectorFailed extends Error {}

/** Checks the Director's answer against the Story, and returns the plan, or every problem a repair could fix. */
export function checkPlan(ask: DirectorAsk, raw: unknown): Checked<RawPlan> {
  if (!matchesSchema(raw)) {
    return { ok: false, problems: (matchesSchema.errors ?? []).map(error => `${error.instancePath.replace(/^\//, "").replace(/\//g, ".") || "answer"}: ${error.message ?? "is not as the schema says"}`) };
  }
  // Part by part (lasting-records design decision 3): a row for an Arc the Story lacks is left out, an Arc with no row
  // holds where the last plan left it, and a Landmark that is not the Story's is none; rest after a peak is the plan's.
  const dropped: string[] = [];
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const arcs: ArcStep[] = [];
  for (const arc of ask.state.arcs) {
    const row = raw.arcs.find(item => same(item.arc, arc));
    if (row) arcs.push({ arc, now: row.now.trim(), next: row.next.trim(), not_yet: row.not_yet.trim() });
    else {
      const last = ask.previous?.arcs.find(item => same(item.arc, arc));
      dropped.push(`arcs: no row for the Arc "${arc}"; it holds where it is`);
      arcs.push({ arc, now: last?.now ?? "where the last Scenes left it", next: "nothing; let the last step settle", not_yet: last?.not_yet ?? "any step at all" });
    }
  }
  for (const row of raw.arcs) if (!ask.state.arcs.some(arc => same(arc, row.arc))) dropped.push(`arcs: "${row.arc}" is not one of the story's Arcs`);
  const landmark = raw.landmark === null ? null : ask.state.landmarks.find(item => same(item.name, raw.landmark ?? ""))?.name;
  if (landmark === undefined) dropped.push(`landmark: "${raw.landmark}" is not one of the story's Landmarks (${ask.state.landmarks.map(item => item.name).join(", ") || "it has none"}); name one exactly, or null`);
  if (ask.afterPeak && raw.phase !== "rest") return { ok: false, problems: [`phase: the Scene that just ended peaked, so this stretch is a rest, not a ${raw.phase}`, ...dropped] };
  return { ok: true, value: { toward: raw.toward.trim(), landmark: landmark ?? null, phase: raw.phase, scenes: raw.scenes, arcs, premise: raw.premise.trim() }, dropped };
}

function section(tag: string, body: string): string | null {
  if (!body.trim()) return null;
  return `<${tag}>\n${body.trim()}\n</${tag.split(" ")[0]}>`;
}

function say(state: State, at: string): string {
  const time = parseStoryTime(at);
  return time ? `${at} (${sayStoryTime(time, state.dayOneWeekday)})` : at;
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
    section("scenes_so_far", scenesSoFar.join("\n")),
    section("threads", threads.join("\n")),
    previous ? section("last_plan", [
      `Phase: ${previous.phase}, toward ${previous.toward}${previous.landmark ? ` (the Landmark ${previous.landmark})` : ""}, ${previous.scenes} Scenes.`,
      ...previous.arcs.map(arc => `- ${arc.arc}: was ${arc.now}; next ${arc.next}; not yet ${arc.not_yet}`),
      `Premise: ${previous.premise}`
    ].join("\n")) : null,
    section("task", [
      "Plan the next stretch.",
      ask.afterPeak ? "The Scene that just ended peaked: this stretch is a rest." : "",
      previous ? "Judge where each Arc stands from the Scenes since the last plan, not from what the last plan hoped." : "This is the story's first plan."
    ].filter(Boolean).join(" "))
  ].filter(part => part !== null).join("\n\n");
  const facts = { arcs: state.arcs, landmarks: state.landmarks.map(landmark => landmark.name), afterPeak: ask.afterPeak, scenes: scenes.length };
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
