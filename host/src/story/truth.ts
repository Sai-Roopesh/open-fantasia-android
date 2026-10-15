import type { Quote } from "./state.js";

/**
 * The truth (openspec the-truth): everything the Story keeps of what is true now and how it came to be, folded from
 * the Path like the rest of the State (docs/adr/0015). Every item points to the passages it was read from, and
 * nothing is deleted: what stops being true is closed, with the Scene that closed it.
 */

/** Something kept that holds from the Scene it opened in until a Scene closes it. Scene 0 is the Story File. */
export interface Held {
  id: string;
  opened: number;
  closed: number | null;
  /** Why it stopped being true, in a line. */
  closedBy: string | null;
  sources: Quote[];
}

/** Who a person is now, as of a Scene: read first by whatever writes them (openspec the-truth: Who each person is now). */
export interface PersonNow {
  who: string;
  /** Who they are now, in a few lines. */
  now: string;
  feelings: { about: string; feels: string }[];
  wants: string;
  hides: string;
  scene: number;
  sources: Quote[];
}

/** Something a person knows or believes; `true` false for a belief that is wrong. */
export interface Belief extends Held {
  holder: string;
  what: string;
  true: boolean;
}

export interface Turn {
  text: string;
  scene: number;
  sources: Quote[];
}

/** A moment two people would remember for life, kept in its own words; it never fades. */
export interface Keepsake {
  id: string;
  what: string;
  scene: number;
  words: Quote[];
}

/** Where things stand between two people, as the Story knows it: not only as the Player Character has seen it. */
export interface Between {
  people: [string, string];
  stands: string;
  turns: Turn[];
  keepsakes: Keepsake[];
}

export type TruthKind = "agreement" | "promise" | "debt" | "threat" | "secret" | "status";

/** Something true now: an agreement with its terms, a promise with its deadline, a secret with who knows it. */
export interface Truth extends Held {
  kind: TruthKind;
  what: string;
  terms: string[];
  who: string[];
  knownTo: string[];
  /** A deadline, as a Story time. */
  due: string | null;
  /** The item this one changed, for an agreement amended or a promise moved. */
  replaces: string | null;
}

/** How the World works, established in the Story File or in play. */
export interface Rule extends Held {
  what: string;
}

/** A person, place or thing named on the page, from its first mention. */
export interface Name {
  name: string;
  kind: "person" | "place" | "thing";
  what: string;
  first: number;
  sources: Quote[];
}

type Opening<T extends Held> = Omit<T, "opened" | "closed" | "closedBy">;

/** An item closed by a record: why, and, on the page, the words that ended it. */
export interface Closing {
  id: string;
  why: string;
  sources?: Quote[];
}

/** What one record changes in the truth: new items opened, kept ones changed or closed by id. */
export interface TruthUpdate {
  now: PersonNow[];
  beliefs: { open: Opening<Belief>[]; close: Closing[] };
  between: { people: [string, string]; stands: string | null; turn: Turn | null; keepsakes: Keepsake[] }[];
  truths: { open: Opening<Truth>[]; close: Closing[] };
  rules: { open: Opening<Rule>[]; close: Closing[] };
  names: Name[];
}

export interface TruthState {
  now: Record<string, PersonNow>;
  /** Who each person was before, oldest first: nothing is deleted. */
  past: PersonNow[];
  beliefs: Record<string, Belief>;
  /** By betweenKey. */
  between: Record<string, Between>;
  truths: Record<string, Truth>;
  rules: Record<string, Rule>;
  names: Record<string, Name>;
}

export function emptyTruth(): TruthState {
  return { now: {}, past: [], beliefs: {}, between: {}, truths: {}, rules: {}, names: {} };
}

export function emptyUpdate(): TruthUpdate {
  return { now: [], beliefs: { open: [], close: [] }, between: [], truths: { open: [], close: [] }, rules: { open: [], close: [] }, names: [] };
}

/** The key for two people, whichever order they are named in. */
export function betweenKey(a: string, b: string): string {
  return [a, b].sort((left, right) => left.localeCompare(right)).join("|");
}

function opened<T extends Held>(items: Record<string, T>, open: Opening<T>[], scene: number): Record<string, T> {
  const next = { ...items };
  for (const item of open) next[item.id] = { ...item, opened: scene, closed: null, closedBy: null } as T;
  return next;
}

function closed<T extends Held>(items: Record<string, T>, close: Closing[], scene: number): Record<string, T> {
  const next = { ...items };
  for (const { id, why, sources } of close) {
    const item = next[id];
    if (item && item.closed === null) next[id] = { ...item, closed: scene, closedBy: why, sources: [...item.sources, ...(sources ?? [])] };
  }
  return next;
}

/** The truth after a record from [scene]: closings first, then what opens, so an item can be replaced in one record. */
export function applyTruth(truth: TruthState, update: TruthUpdate, scene: number): TruthState {
  const now = { ...truth.now };
  const past = [...truth.past];
  for (const person of update.now) {
    const before = now[person.who];
    if (before) past.push(before);
    now[person.who] = person;
  }
  const between = { ...truth.between };
  for (const change of update.between) {
    const key = betweenKey(change.people[0], change.people[1]);
    const before = between[key] ?? { people: [...change.people].sort((a, b) => a.localeCompare(b)) as [string, string], stands: "", turns: [], keepsakes: [] };
    const known = new Set(before.keepsakes.map(keepsake => keepsake.id));
    between[key] = {
      ...before,
      stands: change.stands ?? before.stands,
      turns: change.turn ? [...before.turns, change.turn] : before.turns,
      keepsakes: [...before.keepsakes, ...change.keepsakes.filter(keepsake => !known.has(keepsake.id))]
    };
  }
  const names = { ...truth.names };
  for (const name of update.names) if (!names[name.name]) names[name.name] = name;
  return {
    now,
    past,
    beliefs: opened(closed(truth.beliefs, update.beliefs.close, scene), update.beliefs.open, scene),
    between,
    truths: opened(closed(truth.truths, update.truths.close, scene), update.truths.open, scene),
    rules: opened(closed(truth.rules, update.rules.close, scene), update.rules.open, scene),
    names
  };
}

/** The items still true. */
export function open<T extends Held>(items: Record<string, T>): T[] {
  return Object.values(items).filter(item => item.closed === null);
}
