import type { Exchange, PastScene, Previously, SceneEnd, SceneView, TurnState } from "../protocol/generated/link.js";
import { LinkError } from "../errors.js";
import type { Mac } from "../mac.js";
import { lastPlayed } from "../story/played.js";
import type { Entry } from "../story/entries.js";
import { sceneSpans } from "../story/spans.js";
import { besideOf } from "../store/beside.js";
import { sceneEntries } from "../store/scene-entries.js";
import type { State } from "../story/state.js";
import { countdown, dayView, entryEvent, nextScene, openingEntries, portraitUrl, replyPassage, say, sayClock, sceneCard } from "../engine/events.js";

export { countdown, dayView, entryEvent, nextScene, openingEntries, portraitUrl, say, sayClock, sceneCard, sceneEntries };

/** Live read-only engine surface needed to render the Scene screen (breaks Engine <-> view coupling). */
export interface SceneLive {
  newestSeq(storyId: string): number;
  position(storyId: string): string;
  sceneEndOf(storyId: string): SceneEnd;
  turnState(storyId: string): TurnState;
}

/**
 * The Scene screen as the Mac sees it on the Story's current Path. The phone shows this and applies the live
 * events after [last_event_id]; it never works the State out itself (docs/adr/0001).
 */
export function sceneView(mac: Mac, engine: SceneLive, storyId: string, traceId: string, now: Date = new Date()): SceneView {
  const path = mac.tree.currentPath(storyId);
  if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
  const { state, entries } = sceneEntries(mac, path.headEntryId);
  const scene = state.scene;
  if (!scene) throw new Error("No Scene has opened");
  const all = mac.tree.pathTo(path.headEntryId);
  // Each earlier Scene's summary is the Chronicler's, once it has written one (openspec scenes: Scrolling back).
  const summaries = summariesOn(mac, path.headEntryId);
  // A Move at the Day View opens the next Scene at once: its card, the Move, and the closed Scene among the earlier ones.
  const opening = openingEntries(state, all);
  // What the Story has learned from the player is kept beside it (docs/adr/0020).
  const beside = besideOf(mac, storyId, path.headEntryId);
  return {
    story_id: storyId,
    path_id: path.id,
    seq: engine.newestSeq(storyId),
    last_event_id: engine.position(storyId),
    head_entry_id: path.headEntryId,
    scene: sceneCard(storyId, state),
    player_character: state.playerCharacter,
    focus: scene.focus,
    linger: scene.linger,
    day_view: scene.closed && !opening ? dayView(state, engine.sceneEndOf(storyId), beside.reactions) : null,
    brief: beside.brief,
    earlier_scenes: all.flatMap(entry => entry.payload.kind === "scene_opened" && (opening || entry.id !== scene.openedBy)
      ? [{ number: entry.payload.number, title: entry.payload.title, summary: summaries.get(entry.id) ?? "" }]
      : []),
    exchanges: exchanges(opening ?? entries),
    turn: engine.turnState(storyId),
    previously: previously(mac, path.headEntryId, state, summaries, now),
    opening: opening?.[0] ? nextScene(state, opening[0]) : null,
    trace_id: traceId
  };
}

/** How long the player has been away before the Previously card shows (openspec stories: Back after a night away). */
const AWAY_MS = 24 * 60 * 60 * 1000;

/**
 * The Previously card, when the player last played more than a day before [now]: at the Day View, the Chronicler's
 * line for the Scene that closed; mid-Scene, the Story So Far's newest paragraph and where this Scene stands, all
 * from what the Story keeps, so opening never waits.
 */
function previously(mac: Mac, head: string, state: State, summaries: Map<string, string>, now: Date): Previously | null {
  const since = lastPlayed(mac, head);
  const scene = state.scene;
  if (!since || !scene || now.getTime() - Date.parse(since) <= AWAY_MS) return null;
  if (scene.closed) {
    const summary = summaries.get(scene.openedBy);
    return summary ? { summary, since } : null;
  }
  const before = state.storySoFar.scenes.at(-1)?.text;
  const with_ = scene.met.filter(name => name !== state.playerCharacter);
  const now_ = `Now: ${scene.title}, ${scene.place}${with_.length ? `, with ${with_.join(", ")}` : ""}.`;
  return { summary: before ? `${before}\n\n${now_}` : now_, since };
}

/** The Chronicler's line for each Scene on the Path at [head], by the Scene's opening entry. */
export function summariesOn(mac: Mac, head: string): Map<string, string> {
  const state = mac.states.at(head);
  const lines = new Map(state.recorded.map(row => [row.number, row.summary]));
  return new Map(mac.tree.pathTo(head).flatMap(entry => (entry.payload.kind === "scene_opened" && lines.has(entry.payload.number) ? [[entry.id, lines.get(entry.payload.number) ?? ""] as const] : [])));
}

/** An earlier Scene on the Story's current Path, in full, for reading back (openspec scenes: Scrolling back). */
export function pastScene(mac: Mac, storyId: string, number: number, traceId: string): PastScene {
  const path = mac.tree.currentPath(storyId);
  if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
  const entries = mac.tree.pathTo(path.headEntryId);
  const span = sceneSpans(entries).find(item => item.opened.payload.number === number);
  if (!span) throw new LinkError("not_found", `There is no Scene ${number} on this Path.`);
  const state = mac.states.at(span.opened.id);
  return {
    number,
    title: span.opened.payload.title,
    place: span.opened.payload.place,
    at_label: say(state, span.opened.payload.at),
    summary: summariesOn(mac, path.headEntryId).get(span.opened.id) ?? "",
    exchanges: exchanges(entries.slice(span.start, span.end)),
    trace_id: traceId
  };
}

/** The Scene as Moves and the Replies that answered them; a Story File's opening prose is a Reply with no Move. */
function exchanges(entries: Entry[]): Exchange[] {
  const result: Exchange[] = [];
  for (const entry of entries) {
    const payload = entry.payload;
    if (payload.kind === "scene_opened" && payload.prose) result.push({ move: null, reply: { entry_id: entry.id, text: payload.prose } });
    if (payload.kind === "move") result.push({ move: { entry_id: entry.id, text: payload.text }, reply: null });
    if (payload.kind === "reply") {
      const last = result.at(-1);
      if (last && last.move && !last.reply) last.reply = replyPassage(entry.id, payload);
      else result.push({ move: null, reply: replyPassage(entry.id, payload) });
    }
  }
  return result;
}
