import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Models } from "../models/model-call.js";
import type { Entry, Happened, Happening, Life, MeanwhileItem, ThreadNow } from "../story/entries.js";
import type { ModelChoice, State } from "../story/state.js";
import type { World } from "../story/world.js";
import { minutesOf, parseStoryTime, sayStoryTime, sayTime } from "../time.js";
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
const MAX_HAPPENINGS = 4;
/** How far back what happened is shown to the Weaver, so it can go on from it. */
const LATELY_MINUTES = 24 * 60;
const WEAVER_EXCHANGES = 12;

const text = { type: "string", minLength: 1 } as const;
const names = { type: "array", items: { type: "string" } } as const;

/** The Weaver's answer, as the provider is asked to give it. */
export const WEAVER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lives", "threads", "happened", "meanwhile", "happenings"],
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
        properties: {
          id: text, what: text, at: { ...text, description: "A story time in the span, \"Day N HH:MM\"." }, where: text, known_to: names, landmark: { type: ["string", "null"] },
          missed: { type: ["string", "null"], description: "In a Gap: the id (G1) of what was on that this is, going on without him." }
        }
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
    },
    happenings: {
      type: "array",
      description: "What is on from the end of the span on, at most four, the pick first.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "at", "place", "what", "who", "expected", "pick"],
        properties: {
          id: text, at: text, place: text, what: text, who: names, expected: { type: "boolean" }, pick: { type: "boolean" },
          quiet: { type: "boolean", description: "Nothing is at stake in it: an ordinary meal, a walk, study, a letter home." }
        }
      }
    }
  }
} as const;

interface RawWeave {
  lives: { who: string; where: string; doing: string; after: string }[];
  threads: { name: string; now: string }[];
  happened: { id: string; what: string; at: string; where: string; known_to: string[]; landmark: string | null; missed?: string | null }[];
  meanwhile: { text: string; how: "seen" | "told" | "rumour"; happened: string; told_by: string | null }[];
  happenings: { id: string; at: string; place: string; what: string; who: string[]; expected: boolean; pick: boolean; quiet?: boolean }[];
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
  /** The last two Scenes had no Lead in them, so the Story's pick has one (openspec day-view: Lead absence). */
  leadless?: boolean;
  /** The Scene that ended peaked, so the Story's pick is quiet (openspec long-run: Rest is deliberate). */
  afterPeak?: boolean;
  /** When the span is a Gap the player chose to skip: what was on in it, which goes on without him. */
  gap?: { missed: Happening[] };
  /** What was on already and is still ahead: the Day View keeps it, so it is not offered again. */
  stillOn?: Happening[];
}

/** What the Weaver wrote, checked, with every name as the Story keeps it and what happened given ids of its own. */
export interface WeaveRecord {
  lives: Life[];
  threads: ThreadNow[];
  happened: Happened[];
  meanwhile: MeanwhileItem[];
  happenings: Happening[];
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
  // In a Gap, what was on goes on without him; where he was expected, the people there notice (openspec day-view).
  for (const [index, missed] of (ask.gap?.missed ?? []).entries()) {
    const label = `G${index + 1}`;
    if (!missed.expected) continue;
    const answered = raw.happened.some(item => item.missed?.trim() === label && item.known_to.some(name => missed.who.includes(named(name) ?? "")));
    if (!answered) problems.push(`happened: ${missed.place} at ${sayTime(parseStoryTime(missed.at) ?? { day: 0, minuteOfDay: 0 })} went on without him, and he was expected; write it going on, with the people there noticing he did not come (missed: ${label})`);
  }
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

  // What is on: at most four, from the Day View on, the Story's names, one pick and it first.
  if (raw.happenings.length > MAX_HAPPENINGS) problems.push(`happenings: there are ${raw.happenings.length}; offer at most four, the ones that matter most`);
  const happenings: Happening[] = raw.happenings.map(item => {
    const at = parseStoryTime(item.at);
    if (!at) problems.push(`happenings: ${item.id} is at "${item.at}", which is not a time like "Day 4 09:00"`);
    else if (until && minutesOf(at) < minutesOf(until)) problems.push(`happenings: ${item.id} is at ${item.at.trim()}, before the Day View (${ask.until}); offer only what is still to come`);
    const who = item.who.flatMap(name => {
      const known = named(name);
      if (!known) return (problems.push(`happenings: ${item.id}, who: ${name.trim()} is not in the story`), []);
      if (known === pc) return (problems.push(`happenings: ${item.id}, who: ${pc} is the player's character; say who else will be there`), []);
      return [known];
    });
    return { id: `p-${randomUUID().slice(0, 8)}`, at: item.at.trim(), place: item.place.trim(), what: item.what.trim(), who: [...new Set(who)], expected: item.expected, pick: item.pick, quiet: item.quiet === true };
  });
  const picks = happenings.filter(item => item.pick).length;
  if (picks > 1) problems.push(`happenings: ${picks} are the pick; pick one, and put it first`);
  else if (picks === 1 && !happenings[0]?.pick) problems.push("happenings: your pick is not first; put it first");
  if (ask.leadless) {
    const pick = happenings.find(item => item.pick);
    const lead = (item: Happening | undefined) => item?.who.some(name => state.leads.includes(name)) ?? false;
    if (!lead(pick)) problems.push(`happenings: the last two Scenes had no Lead in them; make your pick something with a Lead in it (${state.leads.join(", ")})`);
  }

  if (ask.afterPeak && !ask.gap) {
    const pick = happenings.find(item => item.pick);
    if (!pick) problems.push("happenings: the Scene that ended peaked; offer a quiet Happening as your pick, nothing at stake in it, with quiet true");
    else if (!pick.quiet) problems.push("happenings: the Scene that ended peaked; make your pick a quiet Happening, nothing at stake in it, and set its quiet true");
  }

  if (problems.length) return { ok: false, problems };
  // A Gap's span ends where the next Scene begins; what is on after it is for the Day View after that Scene.
  return { ok: true, value: { lives, threads: raw.threads.map(thread => ({ name: thread.name.trim(), now: thread.now.trim() })), happened, meanwhile, happenings: ask.gap ? [] : happenings } };
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
  const opened = scene?.at ?? ask.from;
  const sayAt = (at: string) => { const time = parseStoryTime(at); return time ? sayStoryTime(time, state.dayOneWeekday) : at; };
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
    ask.gap
      ? section("the_gap", [
        `${pc} chose to be elsewhere later, and spent the time until then as his Move says:`,
        sceneThatEnded(ask.scene, pc),
        ask.gap.missed.length ? `What was on in the Gap goes on without him:\n${ask.gap.missed.map((item, index) => `- G${index + 1} ${sayTime(parseStoryTime(item.at) ?? { day: 0, minuteOfDay: 0 })}, ${item.place}: ${item.what} With ${item.who.join(", ")}${item.expected ? "; he was expected" : ""}.`).join("\n")}` : ""
      ].filter(Boolean).join("\n\n"))
      : section(`scene_that_ended title="${scene?.title ?? ""}" place="${scene?.place ?? ""}" from="${say(state, opened)}" until="${say(state, ended)}" with="${ask.inScene.join(", ") || "nobody else"}"`, [
        `The Scene ran from ${sayAt(opened)} to ${sayAt(ended)}: what happened in it happened then. Before ${sayAt(opened)}, ${pc} was off-screen, and only the player says where he was and what he did: nothing you write has him anywhere, doing anything or knowing anything before then that the Scene does not say.`,
        sceneThatEnded(ask.scene, pc)
      ].join("\n\n")),
    section("still_on", (ask.stillOn ?? []).map(item => `- ${item.at}, ${item.place}: ${item.what}`).join("\n")),
    section("landmarks_in_span", landmarks.map(landmark => `- ${landmark.name}, ${landmark.at}: ${landmark.what}`).join("\n")),
    section("task", [
      "Move the World on over the span: the Lives and Threads that moved, what happened and who knows it, and what the player's character learned.",
      landmarks.length ? "Every Landmark in the span happens." : "",
      ask.gap ? "Leave happenings empty: the next Scene begins where the Gap ends." : `Then say what is on from ${say(state, ask.until)} on; what is still on stays, so do not offer it again.`,
      ask.leadless ? `The last two Scenes had no Lead in them (${state.leads.join(", ")}): your pick has one in it.` : "",
      ask.afterPeak && !ask.gap ? "The Scene that ended peaked. Your pick is a quiet Happening, nothing at stake in it, with quiet true: an ordinary part of the day, with no one wanting anything from him and nothing left hanging." : "",
      "Return only the JSON object."
    ].filter(Boolean).join("\n"))
  ].filter(part => part !== null).join("\n\n");
  const facts = { from: ask.from, until: ask.until, landmarks: landmarks.map(landmark => ({ name: landmark.name, at: landmark.at })), leadless: ask.leadless ?? false, afterPeak: (ask.afterPeak ?? false) && !ask.gap, leads: state.leads,
    missed: (ask.gap?.missed ?? []).map((item, index) => ({ label: `G${index + 1}`, at: item.at, place: item.place, who: item.who, expected: item.expected })) };
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
