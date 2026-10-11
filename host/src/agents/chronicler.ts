import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Models } from "../models/model-call.js";
import type { Chronicle, Entry, Moment } from "../story/entries.js";
import type { Engagement, Fact, ModelChoice, Quote, State } from "../story/state.js";
import { minutesOf, parseStoryTime } from "../time.js";
import { engagementsAhead } from "../story/day.js";
import { join, recallFacts, say, section, storyPart, storySoFarPart } from "../context/lens.js";
import { claimsAboutPlayer, playerNames } from "./deciding.js";
import { matches, namer, nullable, oneOf, peopleEnum, storyTime, text, timeFormat, wordCount } from "./format.js";
import { runAgent, TIMEOUT_MS, type Checked } from "./step.js";

const PROMPT = readFileSync(new URL("./CHRONICLER.md", import.meta.url), "utf8");

/**
 * The Chronicler: records a closed Scene from its page, inventing nothing (docs/adr/0006): its Moments in their own
 * words, who was told what, what he now knows of people, the Bonds, his Engagements, a line for the Journal and a
 * paragraph for The Story So Far. Only what is not on the page is left out; nothing is sent back for its length.
 */
export interface ChronicleAsk {
  /** The State with the Scene closed. */
  state: State;
  /** The Scene's entries, opening to close. */
  scene: Entry[];
}

export type ChronicleRecord = Omit<Chronicle, "kind" | "scene" | "callId" | "model" | "dropped">;

interface Raw {
  summary: string;
  paragraph: string;
  moments: { what: string; quotes: { entry: string; text: string }[]; there: string[]; weight: number }[];
  told: { moment: string; to: string[] }[];
  known: { who: string; now: string }[];
  bonds: { who: string; standing: string; turn: string }[];
  engagements: { what: string; at: string; place: string; who: string[]; expected: boolean; every: "week" | null; quotes: { entry: string; text: string }[] }[];
  changed: { engagement: string; to: string; quotes: { entry: string; text: string }[] }[];
}

/**
 * The longest a line may run and still be kept: what is asked for, and half again, since no model counts words
 * exactly (docs/adr/0012). Past it the line is left out, and what the Story had before stays.
 */
const KEEP_WORDS = { known: 60, standing: 60, turn: 37 } as const;

/**
 * Finds [quote] in [source] as the same words, whatever the quote marks and spacing, and returns the source's own
 * words for it, or null: a Moment is kept in its original words (openspec living-world).
 */
function findWords(source: string, quote: string): string | null {
  const plain = (value: string) => {
    let out = "";
    const at: number[] = [];
    for (let index = 0; index < value.length; index++) {
      let char = value[index] ?? "";
      if (char === "‘" || char === "’") char = "'";
      if (char === "“" || char === "”") char = "\"";
      if (/\s/.test(char)) {
        if (out.endsWith(" ") || out.length === 0) continue;
        char = " ";
      }
      out += char;
      at.push(index);
    }
    return { out, at };
  };
  const from = plain(source);
  const wanted = plain(quote.trim()).out.trim();
  if (!wanted) return null;
  const start = from.out.indexOf(wanted);
  if (start < 0) return null;
  const first = from.at[start] ?? 0;
  const last = from.at[start + wanted.length - 1] ?? first;
  return source.slice(first, last + 1);
}

/** The Scene's Moves and Replies, labelled P1 … for quoting. */
export function passages(scene: Entry[]): { label: string; entry: Entry; text: string; move: boolean }[] {
  return scene.flatMap(entry => {
    const words = entry.payload.kind === "move" ? entry.payload.text : entry.payload.kind === "reply" ? entry.payload.text : entry.payload.kind === "scene_opened" ? entry.payload.prose ?? "" : "";
    return words ? [{ entry, text: words, move: entry.payload.kind === "move" }] : [];
  }).map((item, index) => ({ label: `P${index + 1}`, ...item }));
}

export function chronicleFormat(state: State, labels: string[], moments: Fact[], engagements: string[]) {
  const quote = { type: "object", additionalProperties: false, required: ["entry", "text"], properties: { entry: oneOf(labels), text } };
  const people = peopleEnum(state);
  return {
    type: "object",
    additionalProperties: false,
    required: ["summary", "paragraph", "moments", "told", "known", "bonds", "engagements", "changed"],
    properties: {
      summary: text,
      paragraph: text,
      moments: { type: "array", items: { type: "object", additionalProperties: false, required: ["what", "quotes", "there", "weight"], properties: { what: text, quotes: { type: "array", items: quote }, there: { type: "array", items: people }, weight: { type: "integer", minimum: 1, maximum: 5 } } } },
      told: { type: "array", items: { type: "object", additionalProperties: false, required: ["moment", "to"], properties: { moment: oneOf(moments.map((_, index) => `M${index + 1}`)), to: { type: "array", items: people } } } },
      known: { type: "array", items: { type: "object", additionalProperties: false, required: ["who", "now"], properties: { who: people, now: text } } },
      bonds: { type: "array", items: { type: "object", additionalProperties: false, required: ["who", "standing", "turn"], properties: { who: people, standing: text, turn: text } } },
      engagements: { type: "array", items: { type: "object", additionalProperties: false, required: ["what", "at", "place", "who", "expected", "every", "quotes"], properties: { what: text, at: timeFormat(state), place: text, who: { type: "array", items: people }, expected: { type: "boolean" }, every: { type: ["string", "null"], enum: ["week", null] }, quotes: { type: "array", items: quote } } } },
      changed: { type: "array", items: { type: "object", additionalProperties: false, required: ["engagement", "to", "quotes"], properties: { engagement: oneOf(engagements), to: timeFormat(state, ", or off"), quotes: { type: "array", items: quote } } } }
    }
  } as const;
}

export function chroniclerPrompt(ask: ChronicleAsk, moments: Fact[]): { system: string; prompt: string } {
  const { state } = ask;
  const scene = state.scene;
  const met = scene?.met ?? [];
  const pc = state.playerCharacter;
  return {
    system: join([PROMPT, storyPart(state)]),
    prompt: join([
      storySoFarPart(state),
      section("people_in_the_scene", met.map(name => `${name}\n  What ${pc} knows of them: ${state.known[name]?.text ?? "nothing yet"}\n  Where things stand: ${state.bonds[name]?.standing ?? "no history yet"}`).join("\n")),
      section("known_moments", moments.map((fact, index) => `M${index + 1} (Scene ${fact.scene}; known to ${fact.knownTo.join(", ")}): ${fact.what}`).join("\n")),
      section("engagements_on", engagementsAhead(state).map(({ engagement, next }, index) => `E${index + 1}: ${engagement.what} ${say(state, next)}${engagement.every ? ", every week" : ""}, ${engagement.place}`).join("\n")),
      section(`scene title="${scene?.title ?? ""}" place="${scene?.place ?? ""}" from="${scene ? say(state, scene.at) : ""}" until="${scene?.endedAt ? say(state, scene.endedAt) : ""}"`, passages(ask.scene).map(item => `[${item.label}${item.move ? ` move by ${pc}` : ""}]\n${item.text}`).join("\n\n")),
      section("task", "The Scene has ended. Record it.")
    ])
  };
}

/** Checks the record: what is not on the page is left out; only an answer that is not a record at all is sent back. */
export function checkChronicle(ask: ChronicleAsk, moments: Fact[], answer: unknown): Checked<ChronicleRecord> {
  const { state } = ask;
  const items = passages(ask.scene);
  const shown = engagementsAhead(state);
  const format = matches<Raw>(chronicleFormat(state, items.map(item => item.label), moments, shown.map((_, index) => `E${index + 1}`)), answer);
  if (!format.ok) return format;
  const raw = format.value;
  const dropped: string[] = [];
  const pc = state.playerCharacter;
  const pcNames = playerNames({ name: pc, aliases: state.people[pc]?.aliases ?? [] });
  const quotesOf = (where: string, quotes: { entry: string; text: string }[]): Quote[] => quotes.flatMap(quote => {
    const item = items.find(passage => passage.label === quote.entry);
    const words = item ? findWords(item.text, quote.text) : null;
    if (!item || words === null) return (dropped.push(`${where}: "${quote.text.slice(0, 40)}" is not in ${quote.entry}`), []);
    return [{ entry: item.entry.id, text: words }];
  });
  const named = namer(state, dropped, "people");
  const sceneStart = parseStoryTime(state.scene?.at ?? state.clock);

  const recorded: Moment[] = raw.moments.slice(0, 5).flatMap((moment, index) => {
    const quotes = quotesOf(`moments[${index}]`, moment.quotes);
    if (!quotes.length) return (dropped.push(`moments[${index}]: none of its words are on the page`), []);
    const quotesMove = quotes.some(quote => items.find(item => item.entry.id === quote.entry)?.move);
    if (!quotesMove && claimsAboutPlayer(moment.what, pcNames)) return (dropped.push(`moments[${index}]: says what ${pc} did without quoting his Move`), []);
    // A Reply that says what he did or said, when no Move of his did, invents his past: it is not remembered.
    if (!quotesMove && quotes.some(quote => claimsAboutPlayer(quote.text, pcNames))) return (dropped.push(`moments[${index}]: its words claim what ${pc} did or said, and no Move of his says so`), []);
    return [{ what: moment.what.trim(), quotes, there: named(moment.there), weight: moment.weight }];
  });
  const told = raw.told.flatMap(item => {
    const fact = moments[Number(item.moment.slice(1)) - 1];
    return fact ? [{ fact: fact.id, to: named(item.to) }] : [];
  });
  const engagements: Engagement[] = raw.engagements.flatMap((item, index) => {
    const at = storyTime(item.at, state.dayOne);
    const time = at ? parseStoryTime(at) : null;
    if (!time || (sceneStart && minutesOf(time) < minutesOf(sceneStart))) return (dropped.push(`engagements[${index}]: "${item.at}" is not a time after the Scene began`), []);
    const quotes = quotesOf(`engagements[${index}]`, item.quotes);
    if (!quotes.length) return (dropped.push(`engagements[${index}]: it was not arranged on the page`), []);
    return [{ id: `g-${randomUUID().slice(0, 8)}`, what: item.what.trim(), at: at as string, place: item.place.trim(), who: named(item.who), expected: item.expected, every: item.every, quotes }];
  });
  const changed = raw.changed.flatMap(item => {
    const on = shown[Number(item.engagement.slice(1)) - 1];
    const to = item.to.trim().toLowerCase() === "off" ? "off" : storyTime(item.to, state.dayOne);
    if (!on || !to) return (dropped.push(`changed: ${item.engagement} to "${item.to}" is not a change of one shown`), []);
    return [{ engagement: on.engagement.id, to }];
  });
  const tooLong = (where: string, line: string, limit: number, asked: string) => {
    if (wordCount(line) <= limit) return false;
    dropped.push(`${where} is ${wordCount(line)} words; say it in ${asked} or fewer`);
    return true;
  };
  const known = raw.known.flatMap(line => named([line.who]).flatMap(who => (tooLong(`known: the line for ${who}`, line.now, KEEP_WORDS.known, "forty-five") ? [] : [{ who, now: line.now.trim() }])));
  const bonds = raw.bonds.flatMap(line => named([line.who]).flatMap(who => (
    tooLong(`bonds: where things stand with ${who}`, line.standing, KEEP_WORDS.standing, "forty") || tooLong(`bonds: the turn with ${who}`, line.turn, KEEP_WORDS.turn, "twenty-five")
      ? [] : [{ who, standing: line.standing.trim(), turn: line.turn.trim() }])));
  return { ok: true, dropped, value: { summary: raw.summary.trim(), paragraph: raw.paragraph.trim(), moments: recorded, told, known, bonds, engagements, changed } };
}

export async function writeChronicle(models: Models, choices: ModelChoice[], ask: ChronicleAsk, storyId: string, traceId: string, signal: AbortSignal): Promise<{ value: ChronicleRecord; callId: string; model: ModelChoice; dropped: string[] }> {
  const moments = recallFacts(ask.state, ask.state.scene?.met ?? []);
  const { system, prompt } = chroniclerPrompt(ask, moments);
  const items = passages(ask.scene).map(item => item.label);
  const shown = engagementsAhead(ask.state).map((_, index) => `E${index + 1}`);
  return runAgent(models, choices, { agent: "chronicler", system, prompt, schema: chronicleFormat(ask.state, items, moments, shown), facts: { passages: passages(ask.scene).map(item => ({ label: item.label, move: item.move, text: item.text })), scene: ask.state.scene?.number }, traceId, storyId }, answer => checkChronicle(ask, moments, answer), TIMEOUT_MS.record, signal);
}

void nullable;
