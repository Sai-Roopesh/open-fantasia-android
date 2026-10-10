import { bondsOn } from "../story/bonds.js";
import { engagementsOn } from "../story/engagements.js";
import { knownOn } from "../story/known.js";
import type { ChronicleAsk } from "../agents/chronicler.js";
import { nameIndex, namedIn } from "../agents/names.js";
import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import type { Chronicle, Entry, RecordGap, SceneOpened } from "../story/entries.js";
import type { State } from "../story/state.js";
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

/** A Scene whose record failed is given up after this many tries (lasting-records design decision 4). */
export const RECORD_TRIES = 3;

/** The newest gap for each Scene on the Path to [head]: a Retry's gap, with no tries, replaces the ones before it. */
export function gapsOn(mac: Mac, head: string): Map<string, RecordGap> {
  const gaps = new Map<string, RecordGap>();
  for (const entry of mac.tree.recordsOn(head, "record_gap")) gaps.set((entry.payload as RecordGap).scene, entry.payload as RecordGap);
  return gaps;
}

/** A Scene in the record that is missing, or kept with parts left out. */
export interface RecordState {
  scene: SceneOpened & { id: string };
  state: "waiting" | "given_up" | "recorded";
  reason: string | null;
  dropped: string[];
}

/**
 * Each Scene on the Path at [head] whose last try to record it failed, waiting or given up, and each recorded with
 * parts left out, with why, in Path order (lasting-records design decision 4). A gap stands until a record is written
 * after it.
 */
export function recordOn(mac: Mac, head: string): RecordState[] {
  const gaps = mac.tree.recordsOn(head, "record_gap") as Entry<RecordGap>[];
  const chronicles = mac.tree.recordsOn(head, "chronicle") as Entry<Chronicle>[];
  return mac.tree.pathTo(head).flatMap((entry): RecordState[] => {
    if (entry.payload.kind !== "scene_opened") return [];
    const scene = { ...entry.payload, id: entry.id };
    const mine = chronicles.filter(record => record.payload.scene === entry.id);
    const dropped = mine.flatMap(record => record.payload.dropped ?? []);
    const gap = gaps.filter(record => record.payload.scene === entry.id).at(-1);
    if (gap && Math.max(-1, ...mine.map(record => record.seq)) < gap.seq) {
      return [{ scene, state: gap.payload.givenUp ? "given_up" : "waiting", reason: gap.payload.reason, dropped }];
    }
    return dropped.length ? [{ scene, state: "recorded", reason: null, dropped }] : [];
  });
}

/**
 * Marks Scene [sceneNumber] on the Path at [head] to be recorded again (openspec outside-the-scene: A gap in the record):
 * a fresh gap with no tries makes it due at the next chance, with three more tries. Only a Scene whose record is
 * missing can be.
 */
export function markForRetry(mac: Mac, storyId: string, head: string, sceneNumber: number): void {
  const scene = mac.tree.pathTo(head).find(entry => entry.payload.kind === "scene_opened" && entry.payload.number === sceneNumber);
  if (!scene) throw new LinkError("not_found", `There is no Scene ${sceneNumber} on this Path.`);
  const missing = recordOn(mac, head).some(row => row.scene.id === scene.id && row.state !== "recorded");
  const gap = (mac.tree.recordsOn(head, "record_gap") as Entry<RecordGap>[]).filter(entry => entry.payload.scene === scene.id).at(-1);
  if (!missing || !gap) throw new LinkError("invalid", `Scene ${sceneNumber} is recorded; there is nothing to try again.`);
  mac.tree.append(storyId, gap.parentId ?? head, { kind: "record_gap", scene: scene.id, attempts: 0, reason: "Tried again by the player.", endedScenes: endedScenesOn(mac, head), givenUp: false });
}

/**
 * What on the Path to [head] the Chronicler owes at [now] (lasting-records design decision 4): a Scene that has ended
 * (closed, or left by the Move that opened the next) and is not yet summarised, or an open Scene with twelve exchanges
 * since its last Chronicle, or with any once the player has stepped away from it. A Scene's entries run from where it
 * starts (the Move that opened it, or its opening) to the entry before the next Scene starts.
 *
 * Scenes never tried come first, in Path order. A Scene whose record failed is tried again only once another Scene has
 * ended since, or when the Mac starts again ([retryNow]), and never after it has been given up, so one Scene that cannot
 * be recorded holds up no other.
 */
export function dueChronicle(mac: Mac, head: string, now: Date = new Date(), retryNow = false): DueChronicle | null {
  const path = mac.tree.pathTo(head);
  const steppedAway = now.getTime() - Date.parse(path.at(-1)?.createdAt ?? "") >= STEPPED_AWAY_MS;
  const position = new Map(path.map((entry, index) => [entry.id, index]));
  const chronicles = mac.tree.recordsOn(head, "chronicle");
  const gaps = gapsOn(mac, head);
  const spans = sceneSpans(path);
  const endedScenes = countEnded(path);
  let retry: DueChronicle | null = null;

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
    const gap = gaps.get(opened.id);
    const due = (sceneEnded: boolean): DueChronicle => ({ scene: opened, entries, recordFrom, through, sceneEnded });

    const exchangesSince = entries.slice(recordFrom).filter(entry => entry.payload.kind === "reply").length;
    const owed = ended ? !summarised : exchangesSince >= CHRONICLE_EVERY || (steppedAway && exchangesSince > 0);
    if (!owed) continue;
    if (!gap || gap.attempts === 0) return due(ended);
    if (!gap.givenUp && (retryNow || endedScenes > gap.endedScenes)) retry ??= due(ended);
  }
  return retry;
}

/** How many Scenes on the Path to [head] have ended, for a gap to say when it failed. */
export function endedScenesOn(mac: Mac, head: string): number {
  return countEnded(mac.tree.pathTo(head));
}

function countEnded(path: Entry[]): number {
  const spans = sceneSpans(path);
  return spans.filter((span, scene) => scene < spans.length - 1 || path.slice(span.start, span.end).some(entry => entry.payload.kind === "scene_closed")).length;
}

/** Everyone of the Story the Scene's own entries name, besides the Player Character: who the page may show there. */
function namedOnPage(state: State, entries: Entry[]): string[] {
  const index = nameIndex(Object.values(state.people));
  const page = entries.flatMap(entry => {
    const payload = entry.payload;
    return payload.kind === "reply" || payload.kind === "move" ? [payload.text] : payload.kind === "scene_opened" && payload.prose ? [payload.prose] : [];
  });
  return [...new Set(page.flatMap(text => namedIn(text, index)))].filter(name => name !== state.playerCharacter);
}

/** What the Chronicler reads for a due Chronicle: the Scene, who was in it, and the Moments someone there knows. */
export function chronicleAsk(mac: Mac, due: DueChronicle): ChronicleAsk {
  const state = mac.states.at(due.through.id);
  const inScene = [...new Set([
    ...due.scene.payload.who,
    ...due.entries.flatMap(entry => (entry.payload.kind === "beat_note" ? entry.payload.here : []))
  ])];
  const knownNow = knownOn(mac, due.through.id);
  const bondsNow = bondsOn(mac, due.through.id);
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
    knownBefore: Object.fromEntries(inScene.map(name => [name, knownNow.get(name)?.text ?? null])),
    bondsBefore: Object.fromEntries(inScene.map(name => [name, bondsNow.get(name)?.standing ?? null])),
    namedOnPage: namedOnPage(state, due.entries).filter(name => !inScene.includes(name)),
    // What is on from the Scene's start, as it stood before this record (docs/adr/0011).
    engagementsOn: engagementsOn(mac, due.through.id, due.scene.payload.at).map(on => on.engagement)
  };
}
