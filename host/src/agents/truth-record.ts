import { section } from "../context/lens.js";
import { livedAs, tiers, type Tiers } from "../story/relevance.js";
import type { Quote, State } from "../story/state.js";
import { emptyUpdate, open, type Keepsake, type PersonNow, type TruthKind, type TruthUpdate } from "../story/truth.js";
import { namer, nullable, oneOf, peopleEnum, storyTime, text, timeFormat } from "./format.js";

/**
 * The truth as the Chronicler records it from the page and the Weaver off it (openspec the-truth; the-storys-mind
 * design decision 1): the part of their answer that says what changed, and the check that turns the answer into the
 * record's TruthUpdate; what is already kept they read with its ids where things stand, in the four layers every
 * agent reads (the-storys-mind design decision 7). Items are opened, and closed by their ids; nothing is deleted. On
 * the page every item cites the passages it came from, and is left out when its words are not there; off the page the
 * span is its source.
 */

const KINDS: TruthKind[] = ["agreement", "promise", "debt", "threat", "secret", "status"];

export interface RawQuote {
  entry: string;
  text: string;
}

interface Closing {
  id: string;
  why: string;
  quotes?: RawQuote[];
}

/** The truth part of an answer, as the model writes it. */
export interface RawTruth {
  people: { who: string; now: string; feelings: { about: string; feels: string }[]; wants: string; hides: string; quotes?: RawQuote[] }[];
  beliefs: { open: { holder: string; what: string; true: boolean; quotes?: RawQuote[] }[]; close: Closing[] };
  between: { people: string[]; stands: string | null; turn: string | null; keepsakes?: { what: string; quotes: RawQuote[] }[]; quotes?: RawQuote[] }[];
  truths: { open: { kind: TruthKind; what: string; terms: string[]; who: string[]; known_to: string[]; due: string | null; replaces: string | null; quotes?: RawQuote[] }[]; close: Closing[] };
  rules: { open: { what: string; quotes?: RawQuote[] }[]; close: Closing[] };
  names: { name: string; kind: "person" | "place" | "thing"; what: string; quotes?: RawQuote[] }[];
}

/** An answer's truth that changes nothing: what the fake models answer, and the shape of an empty one. */
export function nothingTrue(): RawTruth {
  return { people: [], beliefs: { open: [], close: [] }, between: [], truths: { open: [], close: [] }, rules: { open: [], close: [] }, names: [] };
}

/** The ids of what is still open, of each kind, for an answer to close or change. */
function openIds(state: State) {
  return {
    beliefs: open(state.truth.beliefs).map(item => item.id),
    truths: open(state.truth.truths).map(item => item.id),
    rules: open(state.truth.rules).map(item => item.id)
  };
}

/**
 * The truth part of an answer's format. [quote] is the format of a quote from the page, for the Chronicler; without
 * one (the Weaver, off the page) nothing is quoted and nothing is a keepsake, since a keepsake is in its own words.
 */
export function truthFormat(state: State, quote: object | null) {
  const ids = openIds(state);
  const quoted = (properties: Record<string, unknown>, required: string[]) => ({
    type: "object", additionalProperties: false,
    required: quote ? [...required, "quotes"] : required,
    properties: quote ? { ...properties, quotes: { type: "array", items: quote } } : properties
  });
  const closing = (labels: string[]) => ({ type: "array", items: quoted({ id: oneOf(labels), why: text }, ["id", "why"]) });
  const anyone = peopleEnum(state, true);
  const others = peopleEnum(state);
  return {
    type: "object",
    additionalProperties: false,
    required: ["people", "beliefs", "between", "truths", "rules", "names"],
    properties: {
      people: { type: "array", items: quoted({ who: others, now: text, feelings: { type: "array", items: { type: "object", additionalProperties: false, required: ["about", "feels"], properties: { about: anyone, feels: text } } }, wants: { type: "string" }, hides: { type: "string" } }, ["who", "now", "feelings", "wants", "hides"]) },
      beliefs: { type: "object", additionalProperties: false, required: ["open", "close"], properties: {
        open: { type: "array", items: quoted({ holder: others, what: text, true: { type: "boolean" } }, ["holder", "what", "true"]) },
        close: closing(ids.beliefs)
      } },
      between: { type: "array", items: quoted({
        people: { type: "array", items: anyone }, stands: nullable(text), turn: nullable(text),
        ...(quote ? { keepsakes: { type: "array", items: { type: "object", additionalProperties: false, required: ["what", "quotes"], properties: { what: text, quotes: { type: "array", items: quote } } } } } : {})
      }, quote ? ["people", "stands", "turn", "keepsakes"] : ["people", "stands", "turn"]) },
      truths: { type: "object", additionalProperties: false, required: ["open", "close"], properties: {
        open: { type: "array", items: quoted({
          kind: { type: "string", enum: KINDS }, what: text, terms: { type: "array", items: text }, who: { type: "array", items: anyone }, known_to: { type: "array", items: anyone },
          due: nullable(timeFormat(state, ", the deadline")), replaces: nullable(oneOf(ids.truths))
        }, ["kind", "what", "terms", "who", "known_to", "due", "replaces"]) },
        close: closing(ids.truths)
      } },
      rules: { type: "object", additionalProperties: false, required: ["open", "close"], properties: {
        open: { type: "array", items: quoted({ what: text }, ["what"]) },
        close: closing(ids.rules)
      } },
      names: { type: "array", items: quoted({ name: text, kind: { type: "string", enum: ["person", "place", "thing"] }, what: text }, ["name", "kind", "what"]) }
    }
  } as const;
}

/** The first id for [prefix] not yet used among [taken], and the next after it, and on. */
function ids(prefix: string, taken: Iterable<string>): () => string {
  const used = new Set(taken);
  let next = used.size + 1;
  return () => {
    while (used.has(`${prefix}${next}`)) next++;
    const id = `${prefix}${next}`;
    used.add(id);
    return id;
  };
}

export interface TruthCheck {
  /** The Scene the record belongs to: the one that ended, or the one whose end the World moved on from. */
  scene: number;
  /** Quotes as the page has them, or none of them when the passage is not there; null off the page. */
  quotes: ((where: string, quotes: RawQuote[]) => Quote[]) | null;
  dropped: string[];
}

/**
 * The TruthUpdate an answer's truth makes (docs/adr/0012): names as the Story keeps them, ids the code's, and items
 * whose words are not on the page left out, with why. A truth that changes another closes it; feelings a person's new
 * "now" does not mention are carried from who they were, so nothing about them is forgotten. A record without its
 * truth part changes nothing in the truth.
 */
export function checkTruth(state: State, raw: RawTruth | undefined, how: TruthCheck): TruthUpdate {
  const update = emptyUpdate();
  if (!raw) return update;
  const { dropped } = how;
  const pc = state.playerCharacter;
  const named = namer(state, dropped, "people");
  const sourced = (where: string, quotes: RawQuote[] | undefined): Quote[] | null => {
    if (!how.quotes) return [];
    const kept = how.quotes(where, quotes ?? []);
    if (!kept.length) return (dropped.push(`${where}: none of its words are on the page`), null);
    return kept;
  };
  const closings = (kind: "beliefs" | "truths" | "rules", list: Closing[]) => list.flatMap((item, index) => {
    const held = state.truth[kind][item.id.trim()];
    if (!held || held.closed !== null) return (dropped.push(`truth.${kind}.close[${index}]: ${item.id} is not one still open`), []);
    return sourced(`truth.${kind}.close[${index}]`, item.quotes) ? [{ id: held.id, why: item.why.trim() }] : [];
  });

  const people = new Set<string>();
  for (const [index, line] of raw.people.entries()) {
    const who = named([line.who]).map(name => livedAs(state, name))[0];
    if (!who || people.has(who)) continue;
    const sources = sourced(`truth.people[${index}]`, line.quotes);
    if (!sources) continue;
    people.add(who);
    const feelings = line.feelings.flatMap(feeling => named([feeling.about], true).map(about => ({ about, feels: feeling.feels.trim() })));
    const said = new Set(feelings.map(feeling => feeling.about));
    const before = state.truth.now[who]?.feelings.filter(feeling => !said.has(feeling.about)) ?? [];
    const now: PersonNow = { who, now: line.now.trim(), feelings: [...feelings, ...before], wants: line.wants.trim(), hides: line.hides.trim(), scene: how.scene, sources };
    update.now.push(now);
  }

  const belief = ids("B", Object.keys(state.truth.beliefs));
  update.beliefs.close = closings("beliefs", raw.beliefs.close);
  update.beliefs.open = raw.beliefs.open.flatMap((item, index) => {
    const holder = named([item.holder])[0];
    const sources = holder ? sourced(`truth.beliefs.open[${index}]`, item.quotes) : null;
    return holder && sources ? [{ id: belief(), holder, what: item.what.trim(), true: item.true, sources }] : [];
  });

  const keepsake = ids("K", Object.values(state.truth.between).flatMap(between => between.keepsakes.map(item => item.id)));
  update.between = raw.between.flatMap((item, index) => {
    const pair = named(item.people, true);
    if (pair.length !== 2) return (dropped.push(`truth.between[${index}]: it is not between two people of the Story`), []);
    const sources = sourced(`truth.between[${index}]`, item.quotes);
    if (!sources) return [];
    const keepsakes: Keepsake[] = (item.keepsakes ?? []).flatMap((kept, at) => {
      const words = sourced(`truth.between[${index}].keepsakes[${at}]`, kept.quotes);
      return words ? [{ id: keepsake(), what: kept.what.trim(), scene: how.scene, words }] : [];
    });
    if (!item.stands && !item.turn && !keepsakes.length) return [];
    return [{ people: [pair[0], pair[1]] as [string, string], stands: item.stands?.trim() || null, turn: item.turn ? { text: item.turn.trim(), scene: how.scene, sources } : null, keepsakes }];
  });

  const truth = ids("T", Object.keys(state.truth.truths));
  const closed = closings("truths", raw.truths.close);
  update.truths.open = raw.truths.open.flatMap((item, index) => {
    const sources = sourced(`truth.truths.open[${index}]`, item.quotes);
    if (!sources) return [];
    const due = item.due ? storyTime(item.due, state.dayOne) : null;
    if (item.due && !due) dropped.push(`truth.truths.open[${index}]: its deadline "${item.due}" is not a date`);
    const replaced = item.replaces ? state.truth.truths[item.replaces.trim()] : undefined;
    if (item.replaces && (!replaced || replaced.closed !== null)) dropped.push(`truth.truths.open[${index}]: it replaces ${item.replaces}, which is not one still open`);
    const replaces = replaced && replaced.closed === null ? replaced.id : null;
    const id = truth();
    // A change is the old closed and the new opened: one it replaces is closed with it, whether or not it was said.
    if (replaces && !closed.some(close => close.id === replaces)) closed.push({ id: replaces, why: `Changed: ${item.what.trim()}` });
    return [{ id, kind: item.kind, what: item.what.trim(), terms: item.terms.map(term => term.trim()), who: named(item.who, true), knownTo: named(item.known_to, true), due, replaces, sources }];
  });
  update.truths.close = closed;

  const rule = ids("R", Object.keys(state.truth.rules));
  update.rules.close = closings("rules", raw.rules.close);
  update.rules.open = raw.rules.open.flatMap((item, index) => {
    const sources = sourced(`truth.rules.open[${index}]`, item.quotes);
    return sources ? [{ id: rule(), what: item.what.trim(), sources }] : [];
  });

  // A name already in the Story is not new: only a first mention is kept, as it was said.
  const known = new Set([
    ...Object.values(state.people).flatMap(person => [person.name, ...person.aliases]), ...state.groups.map(group => group.name),
    ...state.world.places.map(place => place.name), ...state.world.institutions.map(place => place.name), ...Object.keys(state.truth.names)
  ].map(name => name.toLocaleLowerCase()));
  update.names = raw.names.flatMap((item, index) => {
    const name = item.name.trim();
    if (known.has(name.toLocaleLowerCase()) || name === pc) return [];
    known.add(name.toLocaleLowerCase());
    const sources = sourced(`truth.names[${index}]`, item.quotes);
    if (!sources) return [];
    if (how.quotes && !sources.some(quote => saysName(quote.text, name))) return (dropped.push(`truth.names[${index}]: ${name} is not in its words`), []);
    return [{ name, kind: item.kind, what: item.what.trim(), first: how.scene, sources }];
  });
  return update;
}

/** Whether [text] says [name], or any word of it: "Penhallow" for Silas Penhallow. */
function saysName(text: string, name: string): boolean {
  return name.split(/\s+/).filter(word => word.length >= 3).some(word => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

/** How many people in a line are told, most relevant first. */
const IN_A_LINE = 14;

/**
 * Whose Life is kept how (openspec living-world: Everyone has a Life), for the jobs that keep or plan Lives: the
 * Close and the Movers by name, their Lives being under where things stand; everyone else a line each, as far as the
 * Story keeps one, and how many rest.
 */
export function tiersPart(state: State, tiered: Tiers = tiers(state)): string | null {
  const named = (name: string) => (state.leads.includes(name) ? `${name} (a Lead)` : name);
  const lines = tiered.others.flatMap(name => {
    const life = state.lives[name];
    const now = state.truth.now[name];
    if (!life && !now) return [];
    return [`- ${name}: ${[life ? [life.where ? `at ${life.where}` : "", life.doing ?? ""].filter(Boolean).join(", ") : "", now?.now ?? ""].filter(Boolean).join("; ")}`];
  }).slice(0, IN_A_LINE);
  const resting = tiered.others.length - lines.length;
  return section("lives_by_tier", [
    tiered.close.length ? `Close, each with a full Life: ${tiered.close.map(named).join(", ")}.` : "",
    tiered.movers.length ? `Movers, who drive the World this Act, each with a full Life: ${tiered.movers.map(named).join(", ")}.` : "",
    lines.length ? `In a line, each until something touches them:\n${lines.join("\n")}` : "",
    resting > 0 ? `${resting} others are about their own lives.` : ""
  ].filter(Boolean).join("\n"));
}
