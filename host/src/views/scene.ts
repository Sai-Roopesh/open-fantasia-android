import type { Exchange, SceneCard, SceneView, StoryEvent } from "../protocol/generated/link.js";
import type { Engine } from "../engine/engine.js";
import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import type { Entry } from "../story/entries.js";
import type { State } from "../story/state.js";
import { parseStoryTime, sayStoryTime } from "../time.js";

/** Where a Portrait is served, relative to the Mac's address. */
export function portraitUrl(storyId: string, file: string): string {
  return `/stories/${encodeURIComponent(storyId)}/portraits/${encodeURIComponent(file)}`;
}

/** A Scene's title card: title, place, the day and time as people say it, and who is there with their Portraits. */
export function sceneCard(storyId: string, state: State): SceneCard {
  if (!state.scene) throw new Error("No Scene is open");
  const at = parseStoryTime(state.scene.at);
  return {
    number: state.scene.number,
    title: state.scene.title,
    place: state.scene.place,
    at: state.scene.at,
    at_label: at ? sayStoryTime(at, state.dayOneWeekday) : state.scene.at,
    people: state.scene.who.map(name => {
      const portrait = state.people[name]?.portrait ?? null;
      return { name, portrait_url: portrait ? portraitUrl(storyId, portrait) : null };
    })
  };
}

/** The entries of the Scene open at [head]: from the entry that opened it to the head. */
export function sceneEntries(mac: Mac, head: string): { state: State; entries: Entry[] } {
  const state = mac.states.at(head);
  if (!state.scene) throw new Error("No Scene is open");
  const openedBy = state.scene.openedBy;
  const path = mac.tree.pathTo(head);
  return { state, entries: path.slice(path.findIndex(entry => entry.id === openedBy)) };
}

/**
 * The Scene screen as the Mac sees it on the Story's current Path. The phone shows this and applies the live
 * events after its seq; it never works the State out itself (docs/adr/0001).
 */
export function sceneView(mac: Mac, engine: Engine, storyId: string, traceId: string): SceneView {
  const path = mac.tree.currentPath(storyId);
  if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
  const { state, entries } = sceneEntries(mac, path.headEntryId);
  const all = mac.tree.pathTo(path.headEntryId);
  return {
    story_id: storyId,
    path_id: path.id,
    seq: Math.max(...all.map(entry => entry.seq)),
    head_entry_id: path.headEntryId,
    scene: sceneCard(storyId, state),
    player_character: state.playerCharacter,
    earlier_scenes: all
      .filter(entry => entry.payload.kind === "scene_opened" && entry.id !== state.scene?.openedBy)
      .map(entry => entry.payload.kind === "scene_opened" ? { number: entry.payload.number, title: entry.payload.title, summary: "" } : { number: 0, title: "", summary: "" }),
    exchanges: exchanges(entries),
    turn: engine.turnState(storyId),
    trace_id: traceId
  };
}

/** The Scene as Moves and the Replies that answered them; the opening prose is a Reply with no Move. */
function exchanges(entries: Entry[]): Exchange[] {
  const result: Exchange[] = [];
  for (const entry of entries) {
    const payload = entry.payload;
    if (payload.kind === "scene_opened") result.push({ move: null, reply: { entry_id: entry.id, text: payload.prose } });
    if (payload.kind === "move") result.push({ move: { entry_id: entry.id, text: payload.text }, reply: null });
    if (payload.kind === "reply") {
      const last = result.at(-1);
      if (last && last.move && !last.reply) last.reply = { entry_id: entry.id, text: payload.text };
      else result.push({ move: null, reply: { entry_id: entry.id, text: payload.text } });
    }
  }
  return result;
}

/** The live event an entry becomes once it is written. */
export function entryEvent(mac: Mac, storyId: string, entry: Entry): StoryEvent | null {
  switch (entry.payload.kind) {
    case "scene_opened":
      return { kind: "scene_opened", seq: entry.seq, scene: sceneCard(storyId, mac.states.at(entry.id)), passage: { entry_id: entry.id, text: entry.payload.prose } };
    case "move":
      return { kind: "move", seq: entry.seq, passage: { entry_id: entry.id, text: entry.payload.text } };
    case "reply":
      return { kind: "reply", seq: entry.seq, passage: { entry_id: entry.id, text: entry.payload.text } };
    case "story_set_up":
      return null;
  }
}
