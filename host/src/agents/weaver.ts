import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Models } from "../models/model-call.js";
import { nothingBeside, type Beside } from "../story/beside.js";
import type { Entry, WorldMoved } from "../story/entries.js";
import { tiers } from "../story/relevance.js";
import type { Engagement, LeadMove, ModelChoice, State } from "../story/state.js";
import { minutesOf, parseStoryTime } from "../time.js";
import { asCall, layers, say, section } from "../context/lens.js";
import { clampTime, matches, namer, nullable, oneOf, peopleEnum, storyTime, text, timeFormat } from "./format.js";
import { BUDGETS, runAgent, type Checked, type ToolKit } from "./step.js";
import { checkTruth, tiersPart, truthFormat, type RawTruth } from "./truth-record.js";

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
  /** What the Story has learned from the player, kept beside it (docs/adr/0020); nothing of it when not given. */
  beside?: Beside;
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
  /** Kept by a model that keeps to the format; a move without it changes nothing in the truth. */
  truth?: RawTruth;
}

/** The Leads' moves this Stretch still to make off-screen. */
export function movesDue(state: State): LeadMove[] {
  const plan = state.plan;
  if (!plan) return [];
  const made = new Set(state.facts.filter(fact => fact.move && fact.scene >= plan.afterScene).map(fact => fact.move));
  return plan.leads.filter(lead => lead.scene === null && !made.has(lead.who));
}

export function weaverFormat(state: State, ask: WeaveAsk) {
  const { close, movers, others } = tiers(state);
  const people = peopleEnum(state);
  return {
    type: "object",
    additionalProperties: false,
    required: ["lives", "threads", "happened", "meanwhile", "on", "truth"],
    properties: {
      // Everyone who has a Life, a Group as one: its members are lived as the Group (openspec living-world).
      lives: { type: "array", items: { type: "object", additionalProperties: false, required: ["who", "where", "doing", "after"], properties: { who: oneOf([...close, ...movers, ...others]), where: text, doing: text, after: text } } },
      threads: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "now"], properties: { name: text, now: text } } },
      happened: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "what", "at", "where", "known_to", "landmark", "move", "missed"], properties: {
        id: text, what: text, at: timeFormat(state, ", in the span"), where: text, known_to: { type: "array", items: peopleEnum(state, true) },
        landmark: { anyOf: [oneOf(state.landmarks.map(landmark => landmark.name)), { type: "null" }] }, move: { anyOf: [oneOf(state.leads), { type: "null" }] },
        missed: { anyOf: [oneOf(ask.missed.map((_, index) => `G${index + 1}`)), { type: "null" }] }
      } } },
      meanwhile: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "how", "happened", "told_by", "about", "engagement"], properties: {
        text, how: { type: "string", enum: ["seen", "told", "rumour"] }, happened: text, told_by: { anyOf: [people, { type: "null" }] }, about: { type: "array", items: people },
        engagement: nullable({ type: "object", additionalProperties: false, required: ["what", "at", "place", "who", "expected", "every"], properties: { what: text, at: timeFormat(state, ", after the span"), place: text, who: { type: "array", items: people }, expected: { type: "boolean" }, every: { type: ["string", "null"], enum: ["week", null] } } })
      } } },
      on: { type: "array", items: { type: "object", additionalProperties: false, required: ["at", "place", "what", "who"], properties: { at: timeFormat(state, ", after the span"), place: text, what: text, who: { type: "array", items: people } } } },
      truth: truthFormat(state, null)
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

/**
 * The Weaver's prompt in four layers (the-storys-mind design decision 7), as every agent reads the Story: its
 * instructions and the Story; where things stand as of the last Scene's end, with the Lives of everyone who matters in
 * full; the Scene that ended, word for word (in a Gap, the Move that chose it is this moment instead); then this
 * moment: whose Life is kept how, the span, what was on in it, the Landmarks it holds, the Leads' moves still to make
 * off-screen, and the task.
 */
export function weaverPrompt(ask: WeaveAsk): { system: string; prompt: string } {
  const { state } = ask;
  const pc = state.playerCharacter;
  const moves = movesDue(state);
  const tiered = tiers(state);
  const gap = ask.scene.flatMap(entry => (entry.payload.kind === "move" ? [`<move by="${pc}">\n${entry.payload.text}\n</move>`] : []));
  const span = ask.gap
    ? "A Gap: he chose to be somewhere later, and spent the time until then as his Move says. Live the span as it says, with him there where it puts him; everything it does not touch goes on around him."
    : "The World moves on from the Scene that ended to when he is next free.";
  return asCall(layers(state, ask.beside ?? nothingBeside(), "weaver", [...tiered.close, ...tiered.movers], ask.gap ? [] : ask.scene, [
    tiersPart(state, tiered),
    ask.gap ? section("the_gap", gap.join("\n\n")) : null,
    section(`span from="${say(state, ask.from)}" until="${say(state, ask.until)}"`, span),
    section(ask.gap ? "on_in_the_span" : "missed", ask.missed.map((item, index) => `- G${index + 1} ${say(state, item.at)}, ${item.place}: ${item.what}${item.who.length ? ` With ${item.who.join(", ")}.` : ""}${item.expected ? " He was expected." : ""}`).join("\n")),
    section("landmarks_in_span", landmarksIn(ask).map(landmark => `- ${landmark.name}, ${say(state, landmark.at)}: ${landmark.what}`).join("\n")),
    section("lead_moves_offscreen", moves.map(move => `- ${move.who}: ${move.move}`).join("\n")),
    section("task", ask.gap
      ? "Live the span out as his Move says: the Lives of the people who matter and how their feelings moved, what is true now, what happened and who knows it, and what reached him."
      : "Move the World on over the span: the Lives of the people who matter, lived for their own sake, and the Outline; the Threads that moved; what happened and who knows it; what is true now; what reached him, and what is on.")
  ], PROMPT));
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
  const asked = weaverFormat(state, ask);
  // A move that says nothing of the truth is still a move: it changes nothing in the truth (docs/adr/0012).
  const format = matches<Raw>({ ...asked, required: asked.required.filter(key => key !== "truth") }, answer);
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
    const at = missed?.at ?? clampTime(item.at, ask.from, ask.until, state.dayOne);
    if (!at) return (dropped.push(`happened[${index}]: "${item.at}" is not a story time`), []);
    const id = `h${randomUUID().slice(0, 8)}`;
    ids.set(item.id.trim(), id);
    return [{ id, what: item.what.trim(), at, where: missed?.place ?? item.where.trim(), knownTo: named(item.known_to, true), landmark: landmarkOf(item.landmark), move: moveOf(item.move) }];
  });
  for (const landmark of landmarksIn(ask)) {
    if (!happened.some(item => item.landmark === landmark.name)) problems.push(`happened: ${landmark.name} falls in the span (${say(state, landmark.at)}) and has not happened; write it, with landmark set to its name`);
  }
  ask.missed.forEach((missed, index) => {
    if (missed.expected && !raw.happened.some(item => item.missed === `G${index + 1}`)) {
      problems.push(ask.gap
        ? `happened: G${index + 1}, ${missed.place}, was on in the span and he was expected; write it as his Move has it: with him there, or going on without him and the people there noticing (missed: "G${index + 1}")`
        : `happened: G${index + 1}, ${missed.place}, went on without him and he was expected; write it, with the people there noticing he did not come (missed: "G${index + 1}")`);
    }
  });
  if (problems.length) return { ok: false, problems };

  const meanwhile = raw.meanwhile.slice(0, MAX_MEANWHILE).flatMap((line, index) => {
    const fact = ids.get(line.happened.trim());
    if (!fact) return (dropped.push(`meanwhile[${index}]: ${line.happened} is not one of the happenings`), []);
    let engagement: Engagement | null = null;
    if (line.engagement) {
      const at = storyTime(line.engagement.at, state.dayOne);
      const until = parseStoryTime(ask.until);
      const time = at ? parseStoryTime(at) : null;
      if (at && time && until && minutesOf(time) >= minutesOf(until)) engagement = { id: `g-${randomUUID().slice(0, 8)}`, what: line.engagement.what.trim(), at, place: line.engagement.place.trim(), who: named(line.engagement.who), expected: line.engagement.expected, every: line.engagement.every, quotes: [] };
      else dropped.push(`meanwhile[${index}]: the engagement at "${line.engagement.at}" is not after the span`);
    }
    return [{ text: line.text.trim(), how: line.how, fact, toldBy: line.told_by ? named([line.told_by])[0] ?? null : null, about: named(line.about).filter(name => name !== pc), engagement }];
  });
  const until = parseStoryTime(ask.until);
  const on = ask.gap ? [] : raw.on.slice(0, MAX_ON).flatMap((item, index) => {
    const at = storyTime(item.at, state.dayOne);
    const time = at ? parseStoryTime(at) : null;
    if (!at || !time || !until || minutesOf(time) < minutesOf(until)) return (dropped.push(`on[${index}]: "${item.at}" is not after the span`), []);
    return [{ id: `o${randomUUID().slice(0, 8)}`, at, place: item.place.trim(), what: item.what.trim(), who: named(item.who) }];
  });
  return {
    ok: true, dropped,
    value: {
      lives: livesOf(state, raw.lives.flatMap(life => named([life.who]).map(who => ({ who, where: life.where.trim(), doing: life.doing.trim(), after: life.after.trim() })))),
      threads: raw.threads.map(thread => ({ name: thread.name.trim(), now: thread.now.trim() })),
      happened, meanwhile, on,
      truth: checkTruth(state, raw.truth, { scene: state.scene?.number ?? 0, quotes: null, dropped })
    }
  };
}

/** What the Weaver may look up: the Story as it stood when the span began. */
function toolsFor(ask: WeaveAsk, storyId: string): ToolKit {
  const head = ask.scene.at(-1)?.id;
  return { story: head ? { storyId, head } : null, web: false };
}

export async function writeWeave(models: Models, choices: ModelChoice[], ask: WeaveAsk, storyId: string, traceId: string, signal: AbortSignal): Promise<{ value: WeaveRecord; callId: string; model: ModelChoice; dropped: string[]; lookups: string[] }> {
  const { system, prompt } = weaverPrompt(ask);
  return runAgent(models, choices, { agent: "weaver", system, prompt, schema: weaverFormat(ask.state, ask), tools: toolsFor(ask, storyId), facts: { from: ask.from, until: ask.until, gap: ask.gap, missed: ask.missed.map((item, index) => ({ label: `G${index + 1}`, at: item.at, place: item.place, who: item.who, expected: item.expected })), moves: movesDue(ask.state).map(move => ({ who: move.who, move: move.move })), landmarks: landmarksIn(ask).map(landmark => ({ name: landmark.name, at: landmark.at })) }, traceId, storyId }, answer => checkWeave(ask, answer), BUDGETS.weaver, signal);
}
