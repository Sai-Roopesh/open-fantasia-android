import type { Mac } from "../mac.js";
import { type Bond, bondsOn } from "../story/bonds.js";
import type { Chronicle, Entry, Quote } from "../story/entries.js";
import { momentsOn } from "../story/memory.js";
import { worldOn } from "../story/world.js";
import { minutesOf, parseStoryTime } from "../time.js";

/** At most this many Moments are recalled into a prompt (docs/adr/0006). */
export const RECALLED_MOMENTS = 5;
/** A Bond is recalled as where things stand and its latest turns, so a prompt stays the same size over years. */
export const RECALLED_TURNS = 3;
/** Each Scene further back counts for this much less when Moments are ranked. */
const RECENCY = 0.85;
const DAY = 24 * 60;

/** Words recalled as they were written, and whose they were when the player wrote them. */
export interface RecalledWords {
  /** The Player Character's name for words from his Move; null for a Reply's. */
  by: string | null;
  text: string;
}

export interface RecalledMoment {
  /** The Moment's id, which the Writer's Beat Note names when it puts the Moment in play. */
  id: string;
  /** "Scene 3 · The station". */
  scene: string;
  /** The Chronicler's line for it: for the Writer only, never the Actor, which reads the words themselves. */
  what: string;
  words: RecalledWords[];
  /** Who of the people present knows it. */
  knownTo: string[];
}

/**
 * What a prompt carries from before the current Scene (docs/adr/0006): the summaries of the last day's Scenes, the
 * end of the last Scene word for word, at most five Moments someone present was there for or was told of, and what
 * happened off-screen in the last day that someone present knows. The Moments and what happened are sorted by who
 * knows them, so the Actor reads only those; the Writer reads all of it (docs/adr/0004).
 */
export interface Recall {
  earlier: string[];
  lastSceneEnd: RecalledWords[];
  moments: RecalledMoment[];
  /** What happened off-screen in the last day that someone present knows, with who of them knows it. */
  lately: { what: string; at: string; knownTo: string[] }[];
  /** The Bond of each person present who has one (lasting-records design decision 6). */
  between: RecalledBond[];
  /** The Bond of every Lead, present or not, standing null for one with no history yet: for the Writer only. */
  leads: RecalledBond[];
}

/** A Bond as a prompt carries it: where things stand, and its latest turns as "Scene 3 · The station: …". */
export interface RecalledBond {
  who: string;
  standing: string | null;
  turns: string[];
}

export const NOTHING_RECALLED: Recall = { earlier: [], lastSceneEnd: [], moments: [], lately: [], between: [], leads: [] };

/** [who]'s Bond as a prompt carries it, with at most its latest three turns. */
export function recalledBond(who: string, bond: Bond | undefined): RecalledBond {
  return {
    who,
    standing: bond?.standing ?? null,
    turns: (bond?.turns ?? []).slice(-RECALLED_TURNS).map(turn => (turn.scene ? `Scene ${turn.scene.number} · ${turn.scene.title}: ${turn.text}` : turn.text))
  };
}

/** Bonds as a prompt shows them: one line of where things stand for each person, and their latest turns under it. */
export function sayBetween(bonds: RecalledBond[]): string {
  return bonds.map(bond => [`- ${bond.who}: ${bond.standing ?? "no history yet"}`, ...bond.turns.map(turn => `  - ${turn}`)].join("\n")).join("\n");
}

function words(entry: Entry | null, text: string, pc: string): RecalledWords {
  return { by: entry?.payload.kind === "move" ? pc : null, text };
}

/** What is recalled at [head] for [present], the people in the Scene besides the Player Character. */
export function recall(mac: Mac, head: string, present: string[]): Recall {
  const state = mac.states.at(head);
  // Where things stand between him and the people here, and every Lead (for the Writer): open Scene or not.
  const bonds = bondsOn(mac, head);
  const between = present.filter(name => bonds.has(name)).map(name => recalledBond(name, bonds.get(name)));
  const leads = state.leads.map(name => recalledBond(name, bonds.get(name)));
  const scene = state.scene;
  if (!scene) return { ...NOTHING_RECALLED, between, leads };
  const pc = state.playerCharacter;
  const path = mac.tree.pathTo(head);

  // The Moments: from Scenes before this one, known to someone here, ranked, at most five, oldest first.
  const ranked = momentsOn(mac, head)
    .map((remembered, order) => ({ remembered, order, knowers: remembered.knownTo.filter(name => present.includes(name)) }))
    .filter(({ remembered, knowers }) => remembered.scene.id !== scene.openedBy && knowers.length > 0)
    .map(item => ({ ...item, score: item.remembered.moment.weight * (1 + item.knowers.length) * RECENCY ** (scene.number - item.remembered.scene.number) }))
    .sort((left, right) => right.score - left.score || right.order - left.order)
    .slice(0, RECALLED_MOMENTS)
    .sort((left, right) => left.order - right.order);
  const moments = ranked.map(({ remembered, knowers }) => ({
    id: remembered.moment.id,
    scene: `Scene ${remembered.scene.number} · ${remembered.scene.title}`,
    what: remembered.moment.what,
    words: remembered.moment.quotes.map((quote: Quote) => words(mac.tree.entry(quote.entry), quote.text, pc)),
    knownTo: knowers
  }));

  // The summaries of the Scenes in the last day of Story time before this one.
  const now = parseStoryTime(scene.at);
  const summaries = new Map(mac.tree.recordsOn(head, "chronicle").flatMap(entry => {
    const chronicle = entry.payload as Chronicle;
    return chronicle.summary ? [[chronicle.scene, chronicle.summary] as const] : [];
  }));
  const earlier = path.flatMap(entry => {
    if (entry.payload.kind !== "scene_opened" || entry.id === scene.openedBy) return [];
    const at = parseStoryTime(entry.payload.at);
    const summary = summaries.get(entry.id);
    if (!summary || !at || !now || minutesOf(now) - minutesOf(at) > DAY) return [];
    return [`Scene ${entry.payload.number} · ${entry.payload.title}: ${summary}`];
  });

  // The end of the last Scene: its last Move and the Reply to it.
  const startsAt = path.findIndex(entry => entry.id === scene.startsAt);
  const before = path.slice(0, Math.max(0, startsAt));
  const lastReply = before.findLastIndex(entry => entry.payload.kind === "reply");
  const lastMove = before.slice(0, lastReply).findLastIndex(entry => entry.payload.kind === "move");
  const lastSceneEnd = [before[lastMove], before[lastReply]].flatMap(entry => {
    if (!entry) return [];
    const payload = entry.payload;
    return payload.kind === "move" || payload.kind === "reply" ? [words(entry, payload.text, pc)] : [];
  });

  // What the people here lived through or were told off-screen in the last day (openspec day-view: Missing something
  // has consequences): the Weaver's record, sorted by who knows it, as Moments are.
  const clock = parseStoryTime(state.clock);
  const lately = worldOn(mac, head).happened.flatMap(item => {
    const at = parseStoryTime(item.at);
    const knowers = item.knownTo.filter(name => present.includes(name));
    if (!at || !clock || minutesOf(clock) - minutesOf(at) > DAY || knowers.length === 0) return [];
    return [{ what: item.what, at: item.at, knownTo: knowers }];
  });

  return { earlier, lastSceneEnd, moments, lately, between, leads };
}

/** Recalled words as a prompt shows them: the player's in a Move tag, as the Scene shows his Moves. */
export function sayWords(recalled: RecalledWords[]): string {
  return recalled.map(item => (item.by ? `<move by="${item.by}">\n${item.text}\n</move>` : item.text)).join("\n");
}
