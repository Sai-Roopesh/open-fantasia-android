import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Models } from "../models/model-call.js";
import type { Entry, WorldMoved } from "../story/entries.js";
import type { Engagement, LeadMove, ModelChoice, State } from "../story/state.js";
import { minutesOf, parseStoryTime } from "../time.js";
import { calendarPart, castPart, factsPart, join, nowPart, salience, say, section, storyPart, storySoFarPart, threadsPart } from "../context/lens.js";
import { clampTime, matches, namer, nullable, oneOf, peopleEnum, storyTime, text } from "./format.js";
import { runAgent, TIMEOUT_MS, type Checked } from "./step.js";

const PROMPT = readFileSync(new URL("./WEAVER.md", import.meta.url), "utf8");

/** At most this many lines of Meanwhile, and things on. */
const MAX_MEANWHILE = 6;
const MAX_ON = 3;

/** Something on in the span that he was not at: it goes on without him (openspec day-view: Missing something). */
export interface Missed {
  at: string;
  place: string;
  what: string;
  who: string[];
  expected: boolean;
}

export interface WeaveAsk {
  state: State;
  from: string;
  until: string;
  gap: boolean;
  /** The Scene that ended, or the Gap's Move alone. */
  scene: Entry[];
  missed: Missed[];
}

export type WeaveRecord = Omit<WorldMoved, "kind" | "scene" | "gap" | "from" | "until" | "callId" | "model" | "dropped">;

interface Raw {
  lives: { who: string; where: string; doing: string; after: string }[];
  threads: { name: string; now: string }[];
  happened: { id: string; what: string; at: string; where: string; known_to: string[]; landmark: string | null; move: string | null; missed: string | null }[];
  meanwhile: { text: string; how: "seen" | "told" | "rumour"; happened: string; told_by: string | null; about: string[]; engagement: { what: string; at: string; place: string; who: string[]; expected: boolean; every: "week" | null } | null }[];
  on: { at: string; place: string; what: string; who: string[] }[];
}

/** The Leads' moves this Stretch still to make off-screen. */
export function movesDue(state: State): LeadMove[] {
  const plan = state.plan;
  if (!plan) return [];
  const made = new Set(state.facts.filter(fact => fact.move && fact.scene >= plan.afterScene).map(fact => fact.move));
  return plan.leads.filter(lead => lead.scene === null && !made.has(lead.who));
}

export function weaverFormat(state: State, ask: WeaveAsk) {
  const { full, nearby } = salience(state, state.scene?.met ?? []);
  const people = peopleEnum(state);
  return {
    type: "object",
    additionalProperties: false,
    required: ["lives", "threads", "happened", "meanwhile", "on"],
    properties: {
      lives: { type: "array", items: { type: "object", additionalProperties: false, required: ["who", "where", "doing", "after"], properties: { who: oneOf([...full, ...nearby, ...state.groups.map(group => group.name)]), where: text, doing: text, after: text } } },
      threads: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "now"], properties: { name: text, now: text } } },
      happened: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "what", "at", "where", "known_to", "landmark", "move", "missed"], properties: {
        id: text, what: text, at: { ...text, description: "Day N HH:MM, in the span" }, where: text, known_to: { type: "array", items: peopleEnum(state, true) },
        landmark: { anyOf: [oneOf(state.landmarks.map(landmark => landmark.name)), { type: "null" }] }, move: { anyOf: [oneOf(state.leads), { type: "null" }] },
        missed: { anyOf: [oneOf(ask.missed.map((_, index) => `G${index + 1}`)), { type: "null" }] }
      } } },
      meanwhile: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "how", "happened", "told_by", "about", "engagement"], properties: {
        text, how: { type: "string", enum: ["seen", "told", "rumour"] }, happened: text, told_by: { anyOf: [people, { type: "null" }] }, about: { type: "array", items: people },
        engagement: nullable({ type: "object", additionalProperties: false, required: ["what", "at", "place", "who", "expected", "every"], properties: { what: text, at: text, place: text, who: { type: "array", items: people }, expected: { type: "boolean" }, every: { type: ["string", "null"], enum: ["week", null] } } })
      } } },
      on: { type: "array", items: { type: "object", additionalProperties: false, required: ["at", "place", "what", "who"], properties: { at: text, place: text, what: text, who: { type: "array", items: people } } } }
    }
  } as const;
}

/** Every Landmark whose time falls in the span: it happens, wherever he is. */
function landmarksIn(ask: WeaveAsk) {
  const from = parseStoryTime(ask.from);
  const until = parseStoryTime(ask.until);
  return ask.state.landmarks.filter(landmark => {
    const at = parseStoryTime(landmark.at);
    return at && from && until && minutesOf(at) >= minutesOf(from) && minutesOf(at) < minutesOf(until);
  });
}

export function weaverPrompt(ask: WeaveAsk): { system: string; prompt: string } {
  const { state } = ask;
  const pc = state.playerCharacter;
  const scene = ask.scene.flatMap(entry => (entry.payload.kind === "move" ? [`<move by="${pc}">\n${entry.payload.text}\n</move>`] : entry.payload.kind === "reply" ? [entry.payload.text] : []));
  const moves = movesDue(state);
  return {
    system: join([PROMPT, storyPart(state)]),
    prompt: join([
      nowPart(state),
      section(`span from="${say(state, ask.from)}" until="${say(state, ask.until)}"`, ask.gap ? "A Gap: he chose to be somewhere later." : "The World moves on from the Scene that ended to when he is next free."),
      storySoFarPart(state),
      castPart(state, state.scene?.met ?? [], "omniscient"),
      calendarPart(state, "omniscient"),
      threadsPart(state),
      factsPart(state, "omniscient", []),
      section(ask.gap ? "the_gap" : `scene_that_ended title="${state.scene?.title ?? ""}" place="${state.scene?.place ?? ""}" from="${state.scene ? say(state, state.scene.at) : ""}" until="${say(state, ask.from)}"`, scene.slice(-24).join("\n\n")),
      section("missed", ask.missed.map((item, index) => `- G${index + 1} ${say(state, item.at)}, ${item.place}: ${item.what}${item.who.length ? ` With ${item.who.join(", ")}.` : ""}${item.expected ? " He was expected." : ""}`).join("\n")),
      section("landmarks_in_span", landmarksIn(ask).map(landmark => `- ${landmark.name}, ${say(state, landmark.at)}: ${landmark.what}`).join("\n")),
      section("lead_moves_offscreen", moves.map(move => `- ${move.who}: ${move.move}`).join("\n")),
      section("task", "Move the World on over the span: the Lives and Threads that moved, what happened and who knows it, what reached him, and what is on.")
    ])
  };
}

/** A Group lives as one (openspec living-world: A Group lives as one): a member's Life is the Group's, kept once. */
function livesOf(state: State, lives: { who: string; where: string; doing: string; after: string }[]) {
  const groups = new Set(state.groups.map(group => group.name));
  const kept = new Map<string, { who: string; where: string; doing: string; after: string }>();
  for (const life of lives) {
    const group = state.people[life.who]?.group;
    const who = group && groups.has(group) ? group : life.who;
    if (!kept.has(who)) kept.set(who, { ...life, who });
  }
  return [...kept.values()];
}

/** Checks the World's move: times are kept in the span, names to the Story; only a missing Landmark or answer is sent back. */
export function checkWeave(ask: WeaveAsk, answer: unknown): Checked<WeaveRecord> {
  const { state } = ask;
  const format = matches<Raw>(weaverFormat(state, ask), answer);
  if (!format.ok) return format;
  const raw = format.value;
  const dropped: string[] = [];
  const problems: string[] = [];
  const named = namer(state, dropped, "people");
  const pc = state.playerCharacter;
  // A mark the record cannot carry is cleared, never sent back (openspec living-world: Set right, not asked again).
  const landmarkOf = (name: string | null) => (name ? state.landmarks.find(landmark => landmark.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())?.name ?? null : null);
  const due = new Set(movesDue(state).map(move => move.who));
  const moveOf = (name: string | null) => (name ? named([name]).find(who => due.has(who)) ?? null : null);
  const ids = new Map<string, string>();
  const happened = raw.happened.flatMap((item, index) => {
    const missed = item.missed ? ask.missed[Number(item.missed.slice(1)) - 1] : undefined;
    const at = missed?.at ?? clampTime(item.at, ask.from, ask.until);
    if (!at) return (dropped.push(`happened[${index}]: "${item.at}" is not a story time`), []);
    const id = `h${randomUUID().slice(0, 8)}`;
    ids.set(item.id.trim(), id);
    return [{ id, what: item.what.trim(), at, where: missed?.place ?? item.where.trim(), knownTo: named(item.known_to, true), landmark: landmarkOf(item.landmark), move: moveOf(item.move) }];
  });
  for (const landmark of landmarksIn(ask)) {
    if (!happened.some(item => item.landmark === landmark.name)) problems.push(`happened: ${landmark.name} falls in the span (${landmark.at}) and has not happened; write it, with landmark set to its name`);
  }
  ask.missed.forEach((missed, index) => {
    if (missed.expected && !raw.happened.some(item => item.missed === `G${index + 1}`)) problems.push(`happened: G${index + 1}, ${missed.place}, went on without him and he was expected; write it, with the people there noticing he did not come (missed: "G${index + 1}")`);
  });
  if (problems.length) return { ok: false, problems };

  const meanwhile = raw.meanwhile.slice(0, MAX_MEANWHILE).flatMap((line, index) => {
    const fact = ids.get(line.happened.trim());
    if (!fact) return (dropped.push(`meanwhile[${index}]: ${line.happened} is not one of the happenings`), []);
    let engagement: Engagement | null = null;
    if (line.engagement) {
      const at = storyTime(line.engagement.at);
      const until = parseStoryTime(ask.until);
      const time = at ? parseStoryTime(at) : null;
      if (at && time && until && minutesOf(time) >= minutesOf(until)) engagement = { id: `g-${randomUUID().slice(0, 8)}`, what: line.engagement.what.trim(), at, place: line.engagement.place.trim(), who: named(line.engagement.who), expected: line.engagement.expected, every: line.engagement.every, quotes: [] };
      else dropped.push(`meanwhile[${index}]: the engagement at "${line.engagement.at}" is not after the span`);
    }
    return [{ text: line.text.trim(), how: line.how, fact, toldBy: line.told_by ? named([line.told_by])[0] ?? null : null, about: named(line.about).filter(name => name !== pc), engagement }];
  });
  const until = parseStoryTime(ask.until);
  const on = ask.gap ? [] : raw.on.slice(0, MAX_ON).flatMap((item, index) => {
    const at = storyTime(item.at);
    const time = at ? parseStoryTime(at) : null;
    if (!at || !time || !until || minutesOf(time) < minutesOf(until)) return (dropped.push(`on[${index}]: "${item.at}" is not after the span`), []);
    return [{ id: `o${randomUUID().slice(0, 8)}`, at, place: item.place.trim(), what: item.what.trim(), who: named(item.who) }];
  });
  return {
    ok: true, dropped,
    value: {
      lives: livesOf(state, raw.lives.flatMap(life => named([life.who]).map(who => ({ who, where: life.where.trim(), doing: life.doing.trim(), after: life.after.trim() })))),
      threads: raw.threads.map(thread => ({ name: thread.name.trim(), now: thread.now.trim() })),
      happened, meanwhile, on
    }
  };
}

export async function writeWeave(models: Models, choices: ModelChoice[], ask: WeaveAsk, storyId: string, traceId: string, signal: AbortSignal): Promise<{ value: WeaveRecord; callId: string; model: ModelChoice; dropped: string[] }> {
  const { system, prompt } = weaverPrompt(ask);
  return runAgent(models, choices, { agent: "weaver", system, prompt, schema: weaverFormat(ask.state, ask), facts: { from: ask.from, until: ask.until, gap: ask.gap, missed: ask.missed.map((item, index) => ({ label: `G${index + 1}`, at: item.at, place: item.place, who: item.who, expected: item.expected })), moves: movesDue(ask.state).map(move => ({ who: move.who, move: move.move })), landmarks: landmarksIn(ask).map(landmark => ({ name: landmark.name, at: landmark.at })) }, traceId, storyId }, answer => checkWeave(ask, answer), TIMEOUT_MS.record, signal);
}
