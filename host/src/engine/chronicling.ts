import { knownOn } from "../story/known.js";
import type { ChronicleAsk } from "../agents/chronicler.js";
import type { Mac } from "../mac.js";
import type { Entry, SceneOpened } from "../story/entries.js";
import { momentsOn } from "../story/memory.js";
import { sceneSpans } from "../story/spans.js";

/** An open Scene is chronicled once this many exchanges have passed since its last Chronicle (docs/adr/0004). */
export const CHRONICLE_EVERY = 12;
/**
 * An open Scene is chronicled once the player has stepped away from it this long, so the Previously card has where
 * it stands long before a day passes (openspec stories: Back after a night away); a short break costs nothing.
 */
export const STEPPED_AWAY_MS = 60 * 60 * 1000;
/** How many already-recorded Moments the Chronicler is shown, so it can see one being told. */
const KNOWN_SHOWN = 20;

/** What on a Path is due to be chronicled: a Scene, its entries, where recording starts, and where the record hangs. */
export interface DueChronicle {
  scene: Entry<SceneOpened>;
  entries: Entry[];
  recordFrom: number;
  through: Entry;
  sceneEnded: boolean;
}

/**
 * The earliest thing on the Path to [head] the Chronicler owes at [now]: a Scene that has ended (closed, or left by the
 * Move that opened the next) and is not yet summarised, or an open Scene with twelve exchanges since its last
 * Chronicle, or with any once the player has stepped away from it. A Scene's entries run from where it starts (the
 * Move that opened it, or its opening) to the entry before the next Scene starts.
 */
export function dueChronicle(mac: Mac, head: string, now: Date = new Date()): DueChronicle | null {
  const path = mac.tree.pathTo(head);
  const steppedAway = now.getTime() - Date.parse(path.at(-1)?.createdAt ?? "") >= STEPPED_AWAY_MS;
  const position = new Map(path.map((entry, index) => [entry.id, index]));
  const chronicles = mac.tree.recordsOn(head, "chronicle");
  const spans = sceneSpans(path);

  for (const [scene, { opened, start, end }] of spans.entries()) {
    let entries = path.slice(start, end);
    const ended = scene < spans.length - 1 || entries.some(entry => entry.payload.kind === "scene_closed");
    if (!ended) {
      // A turn may be under way: an open Scene is read only up to its latest Reply.
      const lastReply = entries.findLastIndex(entry => entry.payload.kind === "reply");
      entries = entries.slice(0, lastReply + 1);
    }
    if (entries.length === 0) continue;

    const mine = chronicles.filter(entry => entry.payload.kind === "chronicle" && entry.payload.scene === opened.id);
    const coveredUpTo = Math.max(-1, ...mine.map(entry => position.get(entry.parentId ?? "") ?? -1));
    const recordFrom = Math.max(0, coveredUpTo + 1 - start);
    const summarised = mine.some(entry => entry.payload.kind === "chronicle" && entry.payload.sceneEnded);
    const through = entries.at(-1) as Entry;

    if (ended && !summarised) return { scene: opened, entries, recordFrom, through, sceneEnded: true };
    const exchangesSince = entries.slice(recordFrom).filter(entry => entry.payload.kind === "reply").length;
    if (!ended && (exchangesSince >= CHRONICLE_EVERY || (steppedAway && exchangesSince > 0))) return { scene: opened, entries, recordFrom, through, sceneEnded: false };
  }
  return null;
}

/** What the Chronicler reads for a due Chronicle: the Scene, who was in it, and the Moments someone there knows. */
export function chronicleAsk(mac: Mac, due: DueChronicle): ChronicleAsk {
  const state = mac.states.at(due.through.id);
  const inScene = [...new Set([
    ...due.scene.payload.who,
    ...due.entries.flatMap(entry => (entry.payload.kind === "beat_note" ? entry.payload.here : []))
  ])];
  const knownNow = knownOn(mac, due.through.id);
  const known = momentsOn(mac, due.through.id)
    .filter(remembered => remembered.knownTo.some(name => inScene.includes(name)))
    .sort((left, right) => right.moment.weight - left.moment.weight || right.scene.number - left.scene.number)
    .slice(0, KNOWN_SHOWN)
    .map(remembered => ({ id: remembered.moment.id, what: remembered.moment.what, quotes: remembered.moment.quotes }));
  return {
    state,
    scene: { title: due.scene.payload.title, place: due.scene.payload.place, at: due.scene.payload.at },
    entries: due.entries,
    recordFrom: due.recordFrom,
    sceneEnded: due.sceneEnded,
    inScene,
    known,
    knownBefore: Object.fromEntries(inScene.map(name => [name, knownNow.get(name)?.text ?? null]))
  };
}
