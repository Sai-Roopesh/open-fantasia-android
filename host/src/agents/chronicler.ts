import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Models } from "../models/model-call.js";
import { MAX_STANDING_WORDS, MAX_TURN_WORDS } from "../story/bonds.js";
import type { BondLine, Engagement, EngagementChange, Entry, KnownLine, Moment, Quote, Told } from "../story/entries.js";
import { samePlace } from "../story/places.js";
import type { ModelChoice, State } from "../story/state.js";
import { minutesOf, parseStoryTime, sayStoryTime } from "../time.js";
import { claimsAboutPlayer, decidesForPlayer, playerNames } from "./deciding.js";
import { nameIndex, storyName } from "./names.js";
import { answerWithOneRepair, type Checked } from "./repair.js";

/**
 * The Chronicler: records what happened in a Scene, inventing nothing (docs/adr/0004, 0006). It marks the Moments that
 * matter as quotes taken word for word from the Moves and Replies, says who was there and how much each mattered,
 * notes who was told an earlier Moment, and writes the Scene's summary: what happened in it, or where it stands so
 * far. Code checks every quote against the entry it names, and refuses a Reply's line that decides for the Player
 * Character: only the player's Moves make facts about him (openspec living-world).
 */

const PROMPT = readFileSync(new URL("./CHRONICLER.md", import.meta.url), "utf8");

const MAX_MOMENTS = 5;
const MAX_QUOTES = 3;
/** Asked for in thirty words; refused only when far past it, since no model counts words exactly. */
const MAX_SUMMARY_WORDS = 45;
/** What he knows of someone: who they are to him and what he has seen, whole, in sixty words or fewer (lasting-records). */
const MAX_KNOWN_WORDS = 60;
/** A Bond's lines are asked for in forty and twenty-five words; refused only when far past it (docs/adr/0012). */
const REFUSED_STANDING_WORDS = Math.floor(MAX_STANDING_WORDS * 1.5);
const REFUSED_TURN_WORDS = Math.floor(MAX_TURN_WORDS * 1.5);

const text = { type: "string", minLength: 1 } as const;

export const CHRONICLER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "moments", "told"],
  properties: {
    summary: { type: ["string", "null"], description: "When the Scene has ended, one line of what happened in it; when it goes on, one or two lines of where it stands so far." },
    moments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["what", "quotes", "there", "weight"],
        properties: {
          what: text,
          quotes: {
            type: "array",
            items: { type: "object", additionalProperties: false, required: ["entry", "text"], properties: { entry: text, text } }
          },
          there: { type: "array", items: { type: "string" } },
          weight: { type: "integer", minimum: 1, maximum: 5 }
        }
      }
    },
    told: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["moment", "to", "entry"],
        properties: { moment: text, to: { type: "array", items: { type: "string" } }, entry: text }
      }
    },
    known: {
      type: "array",
      description: "For each person in the Scene whose line it changes: what the player's character now knows of them.",
      items: { type: "object", additionalProperties: false, required: ["who", "now"], properties: { who: text, now: text } }
    },
    engagements: {
      type: "array",
      description: "Each arrangement made in this Scene that the player's character knows is on at a time and place, with the words it was made in.",
      items: {
        type: "object", additionalProperties: false, required: ["what", "at", "place", "who", "expected", "every", "quotes"],
        properties: {
          what: text, at: text, place: text, who: { type: "array", items: { type: "string" } }, expected: { type: "boolean" },
          every: { type: ["string", "null"], enum: ["week", null] },
          quotes: { type: "array", items: { type: "object", additionalProperties: false, required: ["entry", "text"], properties: { entry: text, text } } }
        }
      }
    },
    changed: {
      type: "array",
      description: "Each Engagement you were shown (E1 …) that this Scene moved to another time, or called off, with the words.",
      items: {
        type: "object", additionalProperties: false, required: ["engagement", "to", "quotes"],
        properties: { engagement: text, to: text, quotes: { type: "array", items: { type: "object", additionalProperties: false, required: ["entry", "text"], properties: { entry: text, text } } } }
      }
    },
    bonds: {
      type: "array",
      description: "For each person in the Scene whose standing with the player's character this Scene changed: where it stands now, and the turn.",
      items: { type: "object", additionalProperties: false, required: ["who", "standing", "turn"], properties: { who: text, standing: text, turn: text } }
    }
  }
} as const;

interface RawChronicle {
  summary: string | null;
  moments: { what: string; quotes: { entry: string; text: string }[]; there: string[]; weight: number }[];
  told: { moment: string; to: string[]; entry: string }[];
  known?: { who: string; now: string }[];
  bonds?: { who: string; standing: string; turn: string }[];
  engagements?: { what: string; at: string; place: string; who: string[]; expected: boolean; every: "week" | null; quotes: { entry: string; text: string }[] }[];
  changed?: { engagement: string; to: string; quotes: { entry: string; text: string }[] }[];
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
const matchesSchema = ajv.compile<RawChronicle>(CHRONICLER_SCHEMA);

/** A Moment someone in the Scene already knows, as the Chronicler is shown it so it can see it being told. */
export interface KnownMoment {
  id: string;
  what: string;
  quotes: Quote[];
}

/** What the Chronicler is asked to record. */
export interface ChronicleAsk {
  /** The State at the last entry recorded. */
  state: State;
  scene: { title: string; place: string; at: string };
  /** The Scene's entries, in order; those before [recordFrom] were recorded already and are there to read. */
  entries: Entry[];
  recordFrom: number;
  sceneEnded: boolean;
  /** Everyone who was in the Scene at some point, besides the Player Character. */
  inScene: string[];
  /** Anyone else of the Story the Scene's own entries name: the page may show them there (lasting-records decision 5). */
  namedOnPage?: string[];
  known: KnownMoment[];
  /** What the Player Character knew of each person in the Scene before it, or null for nothing yet. */
  knownBefore?: Record<string, string | null>;
  /** Where things stood between him and each person in the Scene before it, or null for no history yet. */
  bondsBefore?: Record<string, string | null>;
  /** The Engagements on, as the Chronicler is shown them (E1 …), so a Scene can move or call one off (docs/adr/0011). */
  engagementsOn?: Engagement[];
}

/** What the Chronicler recorded, checked, with every quote as its entry has it and every name as the Story keeps it. */
export interface ChronicleRecord {
  summary: string | null;
  moments: Moment[];
  told: Told[];
  known: KnownLine[];
  bonds: BondLine[];
  engagements: Engagement[];
  changed: EngagementChange[];
}

/** The Chronicler could not give a record the Story can use. */
export class ChroniclerFailed extends Error {}

/** One entry as the Chronicler reads it: its label, and whether the player wrote it. */
interface Labelled {
  label: string;
  entry: Entry;
  index: number;
  kind: "opening" | "move" | "reply";
  text: string;
}

function labelled(entries: Entry[]): Labelled[] {
  const result: Labelled[] = [];
  entries.forEach((entry, index) => {
    const payload = entry.payload;
    const add = (kind: Labelled["kind"], body: string) => result.push({ label: `E${result.length + 1}`, entry, index, kind, text: body });
    if (payload.kind === "scene_opened" && payload.prose) add("opening", payload.prose);
    if (payload.kind === "move") add("move", payload.text);
    if (payload.kind === "reply") add("reply", payload.text);
  });
  return result;
}

/**
 * Finds [quote] in [source] as the same words, whatever the quote marks and spacing, and returns the source's own
 * words for it, or null.
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

const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

/**
 * Checks the Chronicler's answer against the Scene it read, part by part (lasting-records design decision 3): only an
 * answer that does not match the schema is unusable. Anything else that is wrong leaves out only its own part (a
 * quote, a Moment, a name, a line), says why in `dropped`, and keeps the rest.
 */
export function checkChronicle(ask: ChronicleAsk, raw: unknown): Checked<ChronicleRecord> {
  if (!matchesSchema(raw)) {
    return { ok: false, problems: (matchesSchema.errors ?? []).map(error => `${error.instancePath.replace(/^\//, "").replace(/\//g, ".") || "answer"}: ${error.message ?? "is not as the schema says"}`) };
  }
  const { state } = ask;
  const dropped: string[] = [];
  const drop = (why: string) => { dropped.push(why); return null; };
  const pc = state.playerCharacter;
  const pcNames = playerNames({ name: pc, aliases: state.people[pc]?.aliases ?? [] });
  const index = nameIndex(Object.values(state.people));
  const byLabel = new Map(labelled(ask.entries).map(item => [item.label, item]));

  const person = (where: string, name: string): string | null => {
    const known = storyName(index, name);
    if (!known) return drop(`${where}: ${name.trim() || "a blank name"} is not in the story; use a name from the people`);
    if (known === pc) return drop(`${where}: ${pc} is the player's character, who is always there; leave them out`);
    if (!ask.inScene.includes(known) && !(ask.namedOnPage ?? []).includes(known)) return drop(`${where}: ${known} was not in this Scene`);
    return known;
  };
  const newEntry = (where: string, label: string): Labelled | null => {
    const item = byLabel.get(label.trim());
    if (!item) return drop(`${where} names ${label}, which is not an entry here`);
    if (item.index < ask.recordFrom) return drop(`${where} is from ${label}, which was recorded already; record Moments only from the entries after`);
    return item;
  };

  // The summary.
  let summary = raw.summary?.trim() || null;
  if (!summary) drop(ask.sceneEnded
    ? "summary: the Scene has ended; write one line of what happened in it"
    : "summary: the Scene goes on; write where it stands so far, in one or two lines");
  if (summary && wordCount(summary) > MAX_SUMMARY_WORDS) summary = drop(`summary: it is ${wordCount(summary)} words; say it in thirty or fewer`);

  // The Moments: a bad quote is left out, and a Moment with no quote left, or that decides for him, is left out.
  if (raw.moments.length > MAX_MOMENTS) drop(`moments: there are ${raw.moments.length}; record at most five, the ones that matter most`);
  const moments: Moment[] = raw.moments.slice(0, MAX_MOMENTS).flatMap((moment, momentIndex) => {
    const where = `moments: moment ${momentIndex + 1}`;
    let fromMove = false;
    const quotes: Quote[] = moment.quotes.slice(0, MAX_QUOTES).flatMap((quote, quoteIndex) => {
      const quoteWhere = `${where}, quote ${quoteIndex + 1}`;
      const item = newEntry(quoteWhere, quote.entry);
      if (!item) return [];
      const words = findWords(item.text, quote.text);
      if (words === null) return (drop(`${quoteWhere} is not word for word in ${item.label}; copy the words exactly`), []);
      if (item.kind === "move") fromMove = true;
      else {
        const phrase = decidesForPlayer(words, pcNames) ?? claimsAboutPlayer(words, pcNames);
        if (phrase) return (drop(`${quoteWhere} is from a Reply and decides for the player's character ("${phrase}"); only his Moves say what he did, so quote his Move instead`), []);
      }
      return [{ entry: item.entry.id, text: words }];
    });
    if (moment.quotes.length > MAX_QUOTES) drop(`${where} has ${moment.quotes.length} quotes; give one to three`);
    if (!quotes.length) return (drop(`${where} has no quote that could be kept, so it is left out`), []);
    const what = moment.what.trim();
    const phrase = decidesForPlayer(what, pcNames);
    if (phrase && !fromMove) return (drop(`${where}, what says what the player's character did ("${phrase}"), and no quote is from his Move`), []);
    const there = [...new Set(moment.there.flatMap(name => person(`${where}, there`, name) ?? []))];
    return [{ id: randomUUID(), what, quotes, there, weight: moment.weight }];
  });

  // Telling.
  const told: Told[] = raw.told.flatMap(item => {
    const shown = /^M(\d+)$/.exec(item.moment.trim());
    const known = shown ? ask.known[Number(shown[1]) - 1] : undefined;
    if (!known) return (drop(`told: ${item.moment} is not a Moment you were shown`), []);
    const at = newEntry(`told: ${item.moment}`, item.entry);
    const to = [...new Set(item.to.flatMap(name => person(`told: ${item.moment}, to`, name) ?? []))];
    return at && to.length ? [{ moment: known.id, to, entry: at.entry.id }] : [];
  });

  // What he now knows of the people in the Scene: one line each, whole, for those this Scene changed.
  const seen = new Set<string>();
  const known: KnownLine[] = (raw.known ?? []).flatMap(row => {
    const who = person("known", row.who);
    if (!who) return [];
    if (seen.has(who)) return (drop(`known: two lines for ${who}; write one`), []);
    seen.add(who);
    const now = row.now.trim();
    if (wordCount(now) > MAX_KNOWN_WORDS) return (drop(`known: the line for ${who} is ${wordCount(now)} words; say it in sixty or fewer`), []);
    return [{ who, now }];
  });

  // Bonds: for those whose standing with him this Scene changed, the turn and where it stands now; one row each.
  const bonded = new Set<string>();
  const bonds: BondLine[] = (raw.bonds ?? []).flatMap(row => {
    const who = person("bonds", row.who);
    if (!who) return [];
    if (bonded.has(who)) return (drop(`bonds: two rows for ${who}; write one`), []);
    const standing = row.standing.trim();
    const turn = row.turn.trim();
    if (wordCount(standing) > REFUSED_STANDING_WORDS) return (drop(`bonds: where things stand with ${who} is ${wordCount(standing)} words; say it in forty or fewer`), []);
    if (wordCount(turn) > REFUSED_TURN_WORDS) return (drop(`bonds: the turn with ${who} is ${wordCount(turn)} words; say it in twenty-five or fewer`), []);
    bonded.add(who);
    return [{ who, standing, turn }];
  });

  // Engagements: what he knows is on, in the words it was made in; never before the Scene, never twice.
  const pageQuotes = (where: string, quotes: { entry: string; text: string }[]): Quote[] => quotes.slice(0, MAX_QUOTES).flatMap((quote, quoteIndex) => {
    const quoteWhere = `${where}, quote ${quoteIndex + 1}`;
    const item = newEntry(quoteWhere, quote.entry);
    if (!item) return [];
    const words = findWords(item.text, quote.text);
    if (words === null) return (drop(`${quoteWhere} is not word for word in ${item.label}; copy the words exactly`), []);
    return [{ entry: item.entry.id, text: words }];
  });
  const sceneStart = parseStoryTime(ask.scene.at);
  const on = ask.engagementsOn ?? [];
  const near = (left: string, right: string) => {
    const a = parseStoryTime(left);
    const b = parseStoryTime(right);
    return a !== null && b !== null && Math.abs(minutesOf(a) - minutesOf(b)) <= 60;
  };
  const engagements: Engagement[] = (raw.engagements ?? []).flatMap((made, madeIndex) => {
    const where = `engagements: engagement ${madeIndex + 1}`;
    const quotes = pageQuotes(where, made.quotes);
    if (!quotes.length) return (drop(`${where} has no quote that could be kept, so it is left out`), []);
    const at = parseStoryTime(made.at);
    if (!at) return (drop(`${where} is at "${made.at.trim()}", which is not a time like "Day 4 19:30"`), []);
    if (sceneStart && minutesOf(at) < minutesOf(sceneStart)) return (drop(`${where} is at ${made.at.trim()}, before the Scene began (${ask.scene.at})`), []);
    const already = on.findIndex(item => samePlace(item.place, made.place) && near(item.at, made.at));
    if (already >= 0) return (drop(`${where} is E${already + 1}, already on (${on[already]?.what}); give it in changed if this Scene moved or called it off`), []);
    const who = [...new Set(made.who.flatMap(name => {
      const known = storyName(index, name);
      if (!known) return (drop(`${where}, who: ${name.trim()} is not in the story`), []);
      return known === pc ? [] : [known];
    }))];
    return [{ id: `g-${randomUUID().slice(0, 8)}`, what: made.what.trim(), at: made.at.trim(), place: made.place.trim(), who, expected: made.expected, every: made.every, quotes }];
  });
  const changed: EngagementChange[] = (raw.changed ?? []).flatMap(change => {
    const label = change.engagement.trim();
    const shown = /^E(\d+)$/.exec(label);
    const engagement = shown ? on[Number(shown[1]) - 1] : undefined;
    if (!engagement) return (drop(`changed: ${label} is not an Engagement you were shown`), []);
    const to = change.to.trim().toLocaleLowerCase() === "off" ? "off" : change.to.trim();
    if (to !== "off" && !parseStoryTime(to)) return (drop(`changed: ${label} moves to "${change.to.trim()}", which is not a time like "Day 4 19:30" or "off"`), []);
    const quotes = pageQuotes(`changed: ${label}`, change.quotes);
    if (!quotes.length) return (drop(`changed: ${label} has no quote that could be kept, so it is left out`), []);
    return [{ engagement: engagement.id, to, quotes }];
  });

  return { ok: true, value: { summary, moments, told, known, bonds, engagements, changed }, dropped };
}

/** An Engagement as the Chronicler is shown it: what, when (or every week from when), where, with whom, and expected. */
function sayEngagement(item: Engagement, state: State): string {
  const at = parseStoryTime(item.at);
  const said = at ? sayStoryTime(at, state.dayOneWeekday) : item.at;
  const when = item.every === "week" && at ? `Every ${said.split(" ")[0]} at ${said.split(" ").slice(1).join(" ")} from ${item.at}` : `${item.at} (${said})`;
  return `${item.what} ${when}, ${item.place}${item.who.length ? `, with ${item.who.join(", ")}` : ""}${item.expected ? ", he is expected" : ""}`;
}

function section(tag: string, body: string): string | null {
  if (!body.trim()) return null;
  return `<${tag}>\n${body.trim()}\n</${tag.split(" ")[0]}>`;
}

/** What the Chronicler is sent: the Story's people in its system prompt, the Scene and what is known in its task. */
export function chroniclerPrompt(ask: ChronicleAsk): { system: string; prompt: string; facts: Record<string, unknown> } {
  const { state } = ask;
  const pc = state.playerCharacter;
  const people = Object.values(state.people).filter(person => person.name !== pc)
    .map(person => `- ${person.name}${person.aliases.length ? ` (also ${person.aliases.join(", ")})` : ""}`);
  const system = [
    PROMPT,
    section("story", `Title: ${state.title}`),
    section(`player_character name="${pc}"`, state.people[pc]?.whoTheyAre ?? pc),
    section("people", people.join("\n"))
  ].filter(part => part !== null).join("\n\n");

  const at = parseStoryTime(ask.scene.at);
  const when = at ? sayStoryTime(at, state.dayOneWeekday) : ask.scene.at;
  const entries = labelled(ask.entries).map(item => {
    const recorded = item.index < ask.recordFrom ? " recorded=\"yes\"" : "";
    const by = item.kind === "move" ? ` by="${pc}"` : "";
    return `<entry label="${item.label}" kind="${item.kind}"${by}${recorded}>\n${item.text}\n</entry>`;
  });
  const known = ask.known.map((moment, position) =>
    `<moment id="M${position + 1}">\n${moment.what}\n${moment.quotes.map(quote => `"${quote.text}"`).join("\n")}\n</moment>`);
  const knownBefore = ask.knownBefore ?? {};
  const whatHeKnows = ask.inScene.map(name => `- ${name}: ${knownBefore[name] ?? "nothing yet"}`);
  const engagementsShown = (ask.engagementsOn ?? []).map((item, position) => `- E${position + 1}: ${sayEngagement(item, state)}`);
  const bondsBefore = ask.bondsBefore ?? {};
  const betweenYou = ask.inScene.map(name => `- ${name}: ${bondsBefore[name] ?? "no history yet"}`);
  const task = [
    ask.sceneEnded ? "The Scene has ended: write its summary." : "The Scene goes on: write where it stands so far.",
    ask.inScene.length ? `For each person in the Scene whose line it changes, write in known what ${pc} now knows of them, as the line should read now, whole, in sixty words or fewer: who they are to him and what he has seen of them. Rewrite it; never add to the end.` : "",
    ask.inScene.length ? `For each person in the Scene whose standing with ${pc} this Scene changed, write in bonds the turn, in twenty-five words or fewer, and where things stand now, whole, in forty words or fewer.` : "",
    `When this Scene arranged something ${pc} knows is on at a time and place, or moved or called off one under engagements_on, write it in engagements or changed, with the words it was made in. The Scene is on Day ${at?.day ?? "?"}: give times as "Day N HH:MM".`,
    ask.recordFrom > 0 ? "Entries marked recorded were recorded already: record Moments only from the entries after them." : "",
    "Return only the JSON object."
  ].filter(Boolean).join("\n");
  const prompt = [
    section(`scene title="${ask.scene.title}" place="${ask.scene.place}" when="${when}"`, entries.join("\n\n")),
    section("people_in_the_scene", ask.inScene.join(", ") || "Nobody besides " + pc),
    section("also_named", (ask.namedOnPage ?? []).filter(name => !ask.inScene.includes(name)).join(", ")),
    section("known_moments", known.join("\n\n")),
    section("what_he_knows", whatHeKnows.join("\n")),
    section("between_you", betweenYou.join("\n")),
    section("engagements_on", engagementsShown.join("\n")),
    section("task", task)
  ].filter(part => part !== null).join("\n\n");

  const facts = {
    sceneEnded: ask.sceneEnded,
    labels: labelled(ask.entries).filter(item => item.index >= ask.recordFrom).map(item => ({ label: item.label, kind: item.kind, text: item.text })),
    inScene: ask.inScene
  };
  return { system, prompt, facts };
}

/** Runs the Chronicler once, checked and repaired once; throws ChroniclerFailed with the reasons. */
export function writeChronicle(models: Models, model: ModelChoice, ask: ChronicleAsk, storyId: string, traceId: string, signal: AbortSignal): Promise<{ value: ChronicleRecord; callId: string; dropped: string[] }> {
  const { system, prompt, facts } = chroniclerPrompt(ask);
  return answerWithOneRepair(models,
    { agent: "chronicler", model, system, prompt, schema: CHRONICLER_SCHEMA, facts, traceId, storyId },
    answer => checkChronicle(ask, answer),
    reason => new ChroniclerFailed(`The Chronicler's record could not be used: ${reason}`),
    signal);
}
