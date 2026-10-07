import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Models } from "../models/model-call.js";
import type { Entry, KnownLine, Moment, Quote, Told } from "../story/entries.js";
import type { ModelChoice, State } from "../story/state.js";
import { parseStoryTime, sayStoryTime } from "../time.js";
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
/** What he knows of someone, asked for in three sentences. */
const MAX_KNOWN_WORDS = 80;

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
    }
  }
} as const;

interface RawChronicle {
  summary: string | null;
  moments: { what: string; quotes: { entry: string; text: string }[]; there: string[]; weight: number }[];
  told: { moment: string; to: string[]; entry: string }[];
  known?: { who: string; now: string }[];
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
  known: KnownMoment[];
  /** What the Player Character knew of each person in the Scene before it, or null for nothing yet. */
  knownBefore?: Record<string, string | null>;
}

/** What the Chronicler recorded, checked, with every quote as its entry has it and every name as the Story keeps it. */
export interface ChronicleRecord {
  summary: string | null;
  moments: Moment[];
  told: Told[];
  known: KnownLine[];
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

/** Checks the Chronicler's answer against the Scene it read; returns the record, or every problem a repair could fix. */
export function checkChronicle(ask: ChronicleAsk, raw: unknown): Checked<ChronicleRecord> {
  if (!matchesSchema(raw)) {
    return { ok: false, problems: (matchesSchema.errors ?? []).map(error => `${error.instancePath.replace(/^\//, "").replace(/\//g, ".") || "answer"}: ${error.message ?? "is not as the schema says"}`) };
  }
  const { state } = ask;
  const problems: string[] = [];
  const pc = state.playerCharacter;
  const pcNames = playerNames({ name: pc, aliases: state.people[pc]?.aliases ?? [] });
  const index = nameIndex(Object.values(state.people));
  const byLabel = new Map(labelled(ask.entries).map(item => [item.label, item]));

  const person = (where: string, name: string): string | null => {
    const known = storyName(index, name);
    if (!known) return (problems.push(`${where}: ${name.trim() || "a blank name"} is not in the story; use a name from the people`), null);
    if (known === pc) return (problems.push(`${where}: ${pc} is the player's character, who is always there; leave them out`), null);
    if (!ask.inScene.includes(known)) return (problems.push(`${where}: ${known} was not in this Scene`), null);
    return known;
  };
  const newEntry = (where: string, label: string): Labelled | null => {
    const item = byLabel.get(label.trim());
    if (!item) return (problems.push(`${where} names ${label}, which is not an entry here`), null);
    if (item.index < ask.recordFrom) return (problems.push(`${where} is from ${label}, which was recorded already; record Moments only from the entries after`), null);
    return item;
  };

  // The summary.
  const summary = raw.summary?.trim() || null;
  if (!summary) problems.push(ask.sceneEnded
    ? "summary: the Scene has ended; write one line of what happened in it"
    : "summary: the Scene goes on; write where it stands so far, in one or two lines");
  if (summary && wordCount(summary) > MAX_SUMMARY_WORDS) problems.push(`summary: it is ${wordCount(summary)} words; say it in thirty or fewer`);

  // The Moments.
  if (raw.moments.length > MAX_MOMENTS) problems.push(`moments: there are ${raw.moments.length}; record at most five, the ones that matter most`);
  const moments: Moment[] = raw.moments.map((moment, momentIndex) => {
    const where = `moments: moment ${momentIndex + 1}`;
    if (moment.quotes.length < 1 || moment.quotes.length > MAX_QUOTES) problems.push(`${where} has ${moment.quotes.length} quotes; give one to three`);
    let fromMove = false;
    const quotes: Quote[] = moment.quotes.flatMap((quote, quoteIndex) => {
      const quoteWhere = `${where}, quote ${quoteIndex + 1}`;
      const item = newEntry(quoteWhere, quote.entry);
      if (!item) return [];
      const words = findWords(item.text, quote.text);
      if (words === null) return (problems.push(`${quoteWhere} is not word for word in ${item.label}; copy the words exactly`), []);
      if (item.kind === "move") fromMove = true;
      else {
        const phrase = decidesForPlayer(words, pcNames) ?? claimsAboutPlayer(words, pcNames);
        if (phrase) return (problems.push(`${quoteWhere} is from a Reply and decides for the player's character ("${phrase}"); only his Moves say what he did, so quote his Move instead`), []);
      }
      return [{ entry: item.entry.id, text: words }];
    });
    const what = moment.what.trim();
    const phrase = decidesForPlayer(what, pcNames);
    if (phrase && !fromMove) problems.push(`${where}, what says what the player's character did ("${phrase}"), and no quote is from his Move`);
    const there = [...new Set(moment.there.flatMap(name => person(`${where}, there`, name) ?? []))];
    return { id: randomUUID(), what, quotes, there, weight: moment.weight };
  });

  // Telling.
  const told: Told[] = raw.told.flatMap(item => {
    const shown = /^M(\d+)$/.exec(item.moment.trim());
    const known = shown ? ask.known[Number(shown[1]) - 1] : undefined;
    if (!known) return (problems.push(`told: ${item.moment} is not a Moment you were shown`), []);
    const at = newEntry(`told: ${item.moment}`, item.entry);
    const to = [...new Set(item.to.flatMap(name => person(`told: ${item.moment}, to`, name) ?? []))];
    return at && to.length ? [{ moment: known.id, to, entry: at.entry.id }] : [];
  });

  // What he now knows of the people in the Scene: one line each, for those this Scene changed.
  const seen = new Set<string>();
  const known: KnownLine[] = (raw.known ?? []).flatMap(row => {
    const who = person("known", row.who);
    if (!who) return [];
    if (seen.has(who)) return (problems.push(`known: two lines for ${who}; write one`), []);
    seen.add(who);
    const now = row.now.trim();
    if (wordCount(now) > MAX_KNOWN_WORDS) problems.push(`known: the line for ${who} is ${wordCount(now)} words; say it in three sentences at most`);
    return [{ who, now }];
  });

  if (problems.length) return { ok: false, problems };
  return { ok: true, value: { summary, moments, told, known } };
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
  const task = [
    ask.sceneEnded ? "The Scene has ended: write its summary." : "The Scene goes on: write where it stands so far.",
    ask.inScene.length ? `For each person in the Scene whose line it changes, write in known what ${pc} now knows of them: the line above, with what this Scene showed him, in three sentences at most.` : "",
    ask.recordFrom > 0 ? "Entries marked recorded were recorded already: record Moments only from the entries after them." : "",
    "Return only the JSON object."
  ].filter(Boolean).join("\n");
  const prompt = [
    section(`scene title="${ask.scene.title}" place="${ask.scene.place}" when="${when}"`, entries.join("\n\n")),
    section("people_in_the_scene", ask.inScene.join(", ") || "Nobody besides " + pc),
    section("known_moments", known.join("\n\n")),
    section("what_he_knows", whatHeKnows.join("\n")),
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
export function writeChronicle(models: Models, model: ModelChoice, ask: ChronicleAsk, storyId: string, traceId: string, signal: AbortSignal): Promise<{ value: ChronicleRecord; callId: string }> {
  const { system, prompt, facts } = chroniclerPrompt(ask);
  return answerWithOneRepair(models,
    { agent: "chronicler", model, system, prompt, schema: CHRONICLER_SCHEMA, facts, traceId, storyId },
    answer => checkChronicle(ask, answer),
    reason => new ChroniclerFailed(`The Chronicler's record could not be used: ${reason}`),
    signal);
}
