import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Models } from "../models/model-call.js";
import type { Entry, Happened, Life, MeanwhileItem, ThreadNow } from "../story/entries.js";
import type { ModelChoice, State } from "../story/state.js";
import type { World } from "../story/world.js";
import { minutesOf, parseStoryTime, sayStoryTime } from "../time.js";
import { nameIndex } from "./names.js";
import { answerWithOneRepair, type Checked } from "./repair.js";

/**
 * The Weaver: moves the World on off-screen while the Player Character is elsewhere, and says what he learned of it
 * (docs/adr/0004: it alone writes Lives, Threads and Meanwhile). Code checks what it writes against the Story, and
 * makes sure nothing in Meanwhile is something he could not know (openspec day-view: Meanwhile shows only what the
 * Player Character knows).
 */

const PROMPT = readFileSync(new URL("./WEAVER.md", import.meta.url), "utf8");

const MAX_MEANWHILE = 6;
/** How far back what happened is shown to the Weaver, so it can go on from it. */
const LATELY_MINUTES = 24 * 60;
const WEAVER_EXCHANGES = 12;

const text = { type: "string", minLength: 1 } as const;
const names = { type: "array", items: { type: "string" } } as const;

/** The Weaver's answer, as the provider is asked to give it. */
export const WEAVER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lives", "threads", "happened", "meanwhile"],
  properties: {
    lives: {
      type: "array",
      description: "Only the Lives that moved: a person's or a Group's.",
      items: { type: "object", additionalProperties: false, required: ["who", "where", "doing", "after"], properties: { who: text, where: text, doing: text, after: text } }
    },
    threads: {
      type: "array",
      description: "Only the Threads that moved or began.",
      items: { type: "object", additionalProperties: false, required: ["name", "now"], properties: { name: text, now: text } }
    },
    happened: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "what", "at", "where", "known_to", "landmark"],
        properties: { id: text, what: text, at: { ...text, description: "A story time in the span, \"Day N HH:MM\"." }, where: text, known_to: names, landmark: { type: ["string", "null"] } }
      }
    },
    meanwhile: {
      type: "array",
      description: "What the player's character learned, at most six lines.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "how", "happened", "told_by"],
        properties: { text, how: { type: "string", enum: ["seen", "told", "rumour"] }, happened: text, told_by: { type: ["string", "null"] } }
      }
    }
  }
} as const;

interface RawWeave {
  lives: { who: string; where: string; doing: string; after: string }[];
  threads: { name: string; now: string }[];
  happened: { id: string; what: string; at: string; where: string; known_to: string[]; landmark: string | null }[];
  meanwhile: { text: string; how: "seen" | "told" | "rumour"; happened: string; told_by: string | null }[];
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
const matchesSchema = ajv.compile<RawWeave>(WEAVER_SCHEMA);

/** What the Weaver is asked to move on. */
export interface WeaveAsk {
  /** The State at the Scene's last entry. */
  state: State;
  /** The World as it stood before. */
  world: World;
  /** The Scene that ended, its entries in order. */
  scene: Entry[];
  /** The span of Story time to move the World over. */
  from: string;
  until: string;
  /** Everyone who was in the Scene, besides the Player Character. */
  inScene: string[];
}

/** What the Weaver wrote, checked, with every name as the Story keeps it and what happened given ids of its own. */
export interface WeaveRecord {
  lives: Life[];
  threads: ThreadNow[];
  happened: Happened[];
  meanwhile: MeanwhileItem[];
}

/** The Weaver could not give a record the Story can use. */
export class WeaverFailed extends Error {}

/** The Landmarks whose time falls in the span: after [from], up to and with [until]. */
function landmarksIn(ask: WeaveAsk): State["landmarks"] {
  const from = parseStoryTime(ask.from);
  const until = parseStoryTime(ask.until);
  if (!from || !until) return [];
  return ask.state.landmarks.filter(landmark => {
    const at = parseStoryTime(landmark.at);
    return at !== null && minutesOf(at) > minutesOf(from) && minutesOf(at) <= minutesOf(until);
  });
}

/** Checks the Weaver's answer against the Story and the span, and returns the record, or every problem a repair could fix. */
export function checkWeave(ask: WeaveAsk, raw: unknown): Checked<WeaveRecord> {
  if (!matchesSchema(raw)) {
    return { ok: false, problems: (matchesSchema.errors ?? []).map(error => `${error.instancePath.replace(/^\//, "").replace(/\//g, ".") || "answer"}: ${error.message ?? "is not as the schema says"}`) };
  }
  const { state } = ask;
  const pc = state.playerCharacter;
  const problems: string[] = [];
  const people = nameIndex(Object.values(state.people));
  const groups = new Map(state.groups.map(group => [group.name.toLocaleLowerCase(), group.name]));
  const named = (name: string) => groups.get(name.trim().toLocaleLowerCase()) ?? people.get(name.trim().toLocaleLowerCase()) ?? null;

  // Lives: a person's or a Group's, never the Player Character's; a person in a Group lives through the Group.
  const lives: Life[] = [];
  for (const life of raw.lives) {
    const who = named(life.who);
    const group = who ? state.people[who]?.group : null;
    if (!who) problems.push(`lives: ${life.who.trim()} is not in the story; use a name from the people or the Groups`);
    else if (who === pc) problems.push(`lives: ${pc} is the player's character, whose life is the player's; leave him out`);
    else if (group) problems.push(`lives: ${who} lives as one of ${group}; give the Group's Life instead`);
    else lives.push({ who, where: life.where.trim(), doing: life.doing.trim(), after: life.after.trim() });
  }

  // What happened: in the span, known to people in the story, and every Landmark in the span among it.
  const from = parseStoryTime(ask.from);
  const until = parseStoryTime(ask.until);
  const landmarkNames = new Map(state.landmarks.map(landmark => [landmark.name.toLocaleLowerCase(), landmark.name]));
  const ids = new Map<string, Happened>();
  const happened: Happened[] = raw.happened.map(item => {
    const at = parseStoryTime(item.at);
    if (!at) problems.push(`happened: ${item.id} is at "${item.at}", which is not a time like "Day 4 06:30"`);
    else if (from && until && (minutesOf(at) < minutesOf(from) || minutesOf(at) > minutesOf(until))) {
      problems.push(`happened: ${item.id} is at ${item.at.trim()}, outside the span (${ask.from} to ${ask.until})`);
    }
    const knownTo = item.known_to.flatMap(name => {
      const who = named(name);
      if (!who) return (problems.push(`happened: ${item.id}, known_to: ${name.trim()} is not in the story`), []);
      return [who];
    });
    const landmark = item.landmark === null ? null : landmarkNames.get(item.landmark.trim().toLocaleLowerCase()) ?? null;
    if (item.landmark !== null && !landmark) problems.push(`happened: ${item.id} names the Landmark "${item.landmark}", which is not one of the story's`);
    const checked = { id: `h-${randomUUID().slice(0, 8)}`, what: item.what.trim(), at: item.at.trim(), where: item.where.trim(), knownTo: [...new Set(knownTo)], landmark };
    ids.set(item.id.trim(), checked);
    return checked;
  });
  for (const landmark of landmarksIn(ask)) {
    if (!happened.some(item => item.landmark === landmark.name)) {
      problems.push(`happened: the Landmark ${landmark.name} falls in the span (${landmark.at}) and has not happened; write it, with landmark set to its name`);
    }
  }

  // Meanwhile: only what he knows, told by someone who knows it.
  if (raw.meanwhile.length > MAX_MEANWHILE) problems.push(`meanwhile: there are ${raw.meanwhile.length} items; give at most six, the ones that matter to him`);
  const meanwhile: MeanwhileItem[] = raw.meanwhile.flatMap((item, index) => {
    const at = `meanwhile: item ${index + 1}`;
    const about = ids.get(item.happened.trim());
    if (!about) return (problems.push(`${at} tells of ${item.happened}, which is not something that happened here`), []);
    if (!about.knownTo.includes(pc)) {
      problems.push(`${at} tells of ${item.happened.trim()}, which the player's character does not know: he did not see it and nobody told him; leave it out`);
      return [];
    }
    let toldBy: string | null = null;
    if (item.how === "told") {
      toldBy = item.told_by ? named(item.told_by) : null;
      if (!item.told_by) problems.push(`${at} is told, so say who told him in told_by`);
      else if (!toldBy) problems.push(`${at} is told by ${item.told_by.trim()}, who is not in the story`);
      else if (!about.knownTo.includes(toldBy)) problems.push(`${at} is told by ${toldBy}, who does not know ${item.happened.trim()}; only someone who knows it can tell him`);
    }
    return [{ text: item.text.trim(), how: item.how, happened: about.id, toldBy }];
  });

  if (problems.length) return { ok: false, problems };
  return { ok: true, value: { lives, threads: raw.threads.map(thread => ({ name: thread.name.trim(), now: thread.now.trim() })), happened, meanwhile } };
}

function section(tag: string, body: string): string | null {
  if (!body.trim()) return null;
  return `<${tag}>\n${body.trim()}\n</${tag.split(" ")[0]}>`;
}

function say(state: State, at: string): string {
  const time = parseStoryTime(at);
  return time ? `${at} (${sayStoryTime(time, state.dayOneWeekday)})` : at;
}

/** The Story the Weaver moves on: the same for every call, so its prompt cache hits (docs/adr/0005). */
function storyPrompt(state: State): string {
  const pc = state.playerCharacter;
  const people = Object.values(state.people).filter(person => person.name !== pc).map(person =>
    `- ${person.name}${person.aliases.length ? ` (also ${person.aliases.join(", ")})` : ""}: ${person.whoTheyAre}${person.group ? ` One of ${person.group}.` : ""}`);
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
    section(`player_character name="${pc}"`, state.people[pc]?.whoTheyAre ?? ""),
    section("people", people.join("\n")),
    section("groups", state.groups.map(group => `- ${group.name}: ${group.description}`).join("\n")),
    section("leads", state.leads.join(", "))
  ].filter(part => part !== null).join("\n\n");
}

/** The Scene that ended as the Weaver reads it: its last twelve exchanges. */
function sceneThatEnded(entries: Entry[], pc: string): string {
  const passages = entries.flatMap(entry => {
    const payload = entry.payload;
    if (payload.kind === "scene_opened" && payload.prose) return [`<reply>\n${payload.prose}\n</reply>`];
    if (payload.kind === "move") return [`<move by="${pc}">\n${payload.text}\n</move>`];
    if (payload.kind === "reply") return [`<reply>\n${payload.text}\n</reply>`];
    return [];
  });
  return passages.slice(-WEAVER_EXCHANGES * 2).join("\n\n");
}

/** What the Weaver is sent: the Story in its system prompt, the span and the World in its task. */
export function weaverPrompt(ask: WeaveAsk): { system: string; prompt: string; facts: Record<string, unknown> } {
  const { state, world } = ask;
  const pc = state.playerCharacter;
  const scene = state.scene;
  const from = parseStoryTime(ask.from);
  const lately = world.happened.filter(item => {
    const at = parseStoryTime(item.at);
    return at && from && minutesOf(from) - minutesOf(at) <= LATELY_MINUTES;
  });
  const life = (item: Life) => `- ${item.who}: ${item.where ?? "where not yet said"}; ${item.doing ?? "doing what they do"}; after: ${item.after || "nothing said"}`;
  const landmarks = landmarksIn(ask);
  const ended = scene?.endedAt ?? ask.from;
  const night = ended !== ask.until
    ? `After the Scene he went to bed. The night passes; he wakes and goes through his morning as he always does, breakfast included, until ${say(state, ask.until)}, when he is free to choose. What he would see or hear in that morning, where he would be, can reach him.`
    : "";
  const prompt = [
    section(`span from="${say(state, ask.from)}" until="${say(state, ask.until)}"`, [
      `The World last stood at ${say(state, ask.from)}. Move it on to ${say(state, ask.until)}, when ${pc} is next free to choose what to do.`,
      night
    ].filter(Boolean).join("\n")),
    section("lives", world.lives.map(life).join("\n")),
    section("threads", world.threads.map(thread => `- ${thread.name}: ${thread.now}`).join("\n")),
    section("lately", lately.map(item => `- ${item.what} (${say(state, item.at)}, ${item.where}; known to: ${item.knownTo.join(", ") || "nobody"})`).join("\n")),
    section(`scene_that_ended title="${scene?.title ?? ""}" place="${scene?.place ?? ""}" with="${ask.inScene.join(", ") || "nobody else"}"`, sceneThatEnded(ask.scene, pc)),
    section("landmarks_in_span", landmarks.map(landmark => `- ${landmark.name}, ${landmark.at}: ${landmark.what}`).join("\n")),
    section("task", [
      "Move the World on over the span: the Lives and Threads that moved, what happened and who knows it, and what the player's character learned.",
      landmarks.length ? "Every Landmark in the span happens." : "",
      "Return only the JSON object."
    ].filter(Boolean).join("\n"))
  ].filter(part => part !== null).join("\n\n");
  const facts = { from: ask.from, until: ask.until, landmarks: landmarks.map(landmark => ({ name: landmark.name, at: landmark.at })) };
  return { system: storyPrompt(state), prompt, facts };
}

/** Runs the Weaver once, checked and repaired once; throws WeaverFailed with the reasons. */
export function writeWeave(models: Models, model: ModelChoice, ask: WeaveAsk, storyId: string, traceId: string, signal: AbortSignal): Promise<{ value: WeaveRecord; callId: string }> {
  const { system, prompt, facts } = weaverPrompt(ask);
  return answerWithOneRepair(models,
    { agent: "weaver", model, system, prompt, schema: WEAVER_SCHEMA, facts, traceId, storyId },
    answer => checkWeave(ask, answer),
    reason => new WeaverFailed(`The World could not move on: ${reason}`),
    signal);
}
