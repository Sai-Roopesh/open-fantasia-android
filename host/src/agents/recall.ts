import type { Mac } from "../mac.js";
import type { Chronicle, Entry, Quote } from "../story/entries.js";
import { momentsOn } from "../story/memory.js";
import { minutesOf, parseStoryTime } from "../time.js";

/** At most this many Moments are recalled into a prompt (docs/adr/0006). */
export const RECALLED_MOMENTS = 5;
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
 * end of the last Scene word for word, and at most five Moments someone present was there for or was told of. Only
 * the Moments are sorted by who knows them, so the Actor reads only those; the Writer reads all of it
 * (docs/adr/0004).
 */
export interface Recall {
  earlier: string[];
  lastSceneEnd: RecalledWords[];
  moments: RecalledMoment[];
}

export const NOTHING_RECALLED: Recall = { earlier: [], lastSceneEnd: [], moments: [] };

function words(entry: Entry | null, text: string, pc: string): RecalledWords {
  return { by: entry?.payload.kind === "move" ? pc : null, text };
}

/** What is recalled at [head] for [present], the people in the Scene besides the Player Character. */
export function recall(mac: Mac, head: string, present: string[]): Recall {
  const state = mac.states.at(head);
  const scene = state.scene;
  if (!scene) return NOTHING_RECALLED;
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

  return { earlier, lastSceneEnd, moments };
}

/** Recalled words as a prompt shows them: the player's in a Move tag, as the Scene shows his Moves. */
export function sayWords(recalled: RecalledWords[]): string {
  return recalled.map(item => (item.by ? `<move by="${item.by}">\n${item.text}\n</move>` : item.text)).join("\n");
}
