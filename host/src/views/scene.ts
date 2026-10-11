import type { Countdown, DayView, Exchange, NextScene, PastScene, Previously, SceneCard, SceneView, StoryEvent } from "../protocol/generated/link.js";
import { dayChoicesOf, todayOn } from "../story/day.js";
import type { SceneEnd } from "../protocol/generated/link.js";
import type { Engine } from "../engine/engine.js";
import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import { lastPlayed } from "../story/played.js";
import type { Entry } from "../story/entries.js";
import { sceneSpans } from "../story/spans.js";
import type { State } from "../story/state.js";
import { minutesOf, parseStoryTime, sayDate, sayStoryTime, sayTime, type StoryTime } from "../time.js";

/** How many Landmarks ahead the Day View counts down to. */
const COUNTDOWNS = 3;

/** Where a Portrait is served, relative to the Mac's address. */
export function portraitUrl(storyId: string, file: string): string {
  return `/stories/${encodeURIComponent(storyId)}/portraits/${encodeURIComponent(file)}`;
}

export function say(state: State, at: string): string {
  const time = parseStoryTime(at);
  return time ? sayStoryTime(time, state.dayOne) : at;
}

/** A Story time with its date, as the phone says it where the day matters: "Saturday 7 September, 9:40 pm". */
export function sayClock(state: State, at: string): string {
  const time = parseStoryTime(at);
  return time ? `${sayDate(time, state.dayOne)}, ${sayTime(time)}` : at;
}

/**
 * The Move at the Day View that is opening the next Scene, while the Scene has not opened yet: the entries on [path]
 * from the first Move after the closed Scene's `scene_closed` and its end's entries (openspec presence: Between Scenes
 * is quiet). Null when the Scene at [state] is open, or closed with nothing after it but the Day View.
 */
export function openingEntries(state: State, path: Entry[]): Entry[] | null {
  if (!state.scene?.closed) return null;
  const closedAt = path.findLastIndex(entry => entry.payload.kind === "scene_closed");
  // A Move that left the Scene goes straight into the next: no Day View, only that Move while the Scene ends.
  if (state.scene.closed === "move" && path[closedAt - 1]?.payload.kind === "move") return path.slice(closedAt - 1);
  const move = path.findIndex((entry, index) => index > closedAt && entry.payload.kind === "move");
  return closedAt >= 0 && move >= 0 ? path.slice(move) : null;
}

/** The card for the next Scene while it is being written: when it is, when the Move's choice set a time. */
export function nextScene(state: State, move: Entry): NextScene {
  const at = move.payload.kind === "move" ? move.payload.choice?.at ?? null : null;
  return { at, at_label: at ? say(state, at) : null };
}

/** A Scene's title card: title, place, when it began as people say it, and who is there now with their Portraits. */
export function sceneCard(storyId: string, state: State): SceneCard {
  if (!state.scene) throw new Error("No Scene has opened");
  return {
    number: state.scene.number,
    title: state.scene.title,
    place: state.scene.place,
    at: state.scene.at,
    at_label: say(state, state.scene.at),
    people: state.scene.here.map(name => {
      const portrait = state.people[name]?.portrait ?? null;
      return { name, portrait_url: portrait ? portraitUrl(storyId, portrait) : null };
    })
  };
}

/** How long to go, and the whole line: "3 days" ("3 days to …"), "Tomorrow" ("Tomorrow: …"), "Today at 6:00 pm". */
export function countdown(now: StoryTime, at: StoryTime, name: string): Countdown {
  const days = at.day - now.day;
  if (days >= 2) return { landmark: name, when: `${days} days`, label: `${days} days to ${name}` };
  if (days === 1) return { landmark: name, when: "Tomorrow", label: `Tomorrow: ${name}` };
  return { landmark: name, when: `Today at ${sayTime(at)}`, label: `Today at ${sayTime(at)}: ${name}` };
}

/**
 * The Day View, once the Scene has closed: the day and time, where the Player Character is, and countdowns to the
 * next Landmarks (openspec day-view: The Day View says where and when the player is).
 */
/**
 * The Day View once a Scene has closed: where and when, the countdowns, and the World: moving on until the Weaver's
 * record for this Scene's end exists, then ready with what the Player Character learned meanwhile, or failed with why
 * (openspec presence: Between Scenes is quiet, and shows progress).
 */
export function dayView(state: State, sceneEnd: SceneEnd = { step: null, failed: null }): DayView {
  if (!state.scene?.closed) throw new Error("The Day View opens once a Scene has closed");
  const now = parseStoryTime(state.clock);
  const countdowns: Countdown[] = now === null ? [] : state.landmarks
    .flatMap(landmark => {
      const at = parseStoryTime(landmark.at);
      return at && minutesOf(at) >= minutesOf(now) ? [{ landmark, at }] : [];
    })
    .sort((left, right) => minutesOf(left.at) - minutesOf(right.at))
    .slice(0, COUNTDOWNS)
    .map(({ landmark, at }) => countdown(now, at, landmark.name));
  const number = state.scene.number;
  const ready = state.scene.ended.includes("weaver") && sceneEnd.step === null && sceneEnd.failed === null;
  return {
    at: state.clock,
    at_label: say(state, state.clock),
    day: now ? sayDate(now, state.dayOne) : state.clock,
    time: now ? sayTime(now) : "",
    place: state.scene.place,
    closed_by: state.scene.closed === "story" ? "story" : "player",
    countdowns,
    scene_span: sceneSpan(state, state.scene.at, state.scene.endedAt ?? state.clock),
    scene_end: sceneEnd,
    reaction: state.reactions.find(item => item.scene === number)?.reaction ?? null,
    meanwhile: state.meanwhile.filter(line => line.scene === number && !line.gap).map(line => ({ text: line.text, how: line.how })),
    happenings: ready ? todayOn(state) : [],
    choices: dayChoicesOf(state)
  };
}

/** When a Scene ran, as people say it: "Friday 9:40 pm – 11:05 pm", naming the day again if it ended on another. */
function sceneSpan(state: State, began: string, ended: string): string {
  const start = parseStoryTime(began);
  const end = parseStoryTime(ended);
  if (!start || !end) return `${began} – ${ended}`;
  const close = start.day === end.day ? sayTime(end) : sayStoryTime(end, state.dayOne);
  return `${sayStoryTime(start, state.dayOne)} – ${close}`;
}

/**
 * The entries of the Scene at [head]: from where it starts to the head. A Scene a Move opened starts at that Move;
 * a closed Scene is still the latest Scene until the next one opens.
 */
export function sceneEntries(mac: Mac, head: string): { state: State; entries: Entry[] } {
  const state = mac.states.at(head);
  if (!state.scene) throw new Error("No Scene has opened");
  const startsAt = state.scene.startsAt;
  const path = mac.tree.pathTo(head);
  return { state, entries: path.slice(path.findIndex(entry => entry.id === startsAt)) };
}

/**
 * The Scene screen as the Mac sees it on the Story's current Path. The phone shows this and applies the live
 * events after [last_event_id]; it never works the State out itself (docs/adr/0001).
 */
export function sceneView(mac: Mac, engine: Engine, storyId: string, traceId: string, now: Date = new Date()): SceneView {
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
    day_view: scene.closed && !opening ? dayView(state, engine.sceneEndOf(storyId)) : null,
    brief: state.brief,
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
      if (last && last.move && !last.reply) last.reply = { entry_id: entry.id, text: payload.text };
      else result.push({ move: null, reply: { entry_id: entry.id, text: payload.text } });
    }
  }
  return result;
}

/** The live event an entry becomes once it is written; the Writer's Beat Notes belong to Backstage and send none. */
export function entryEvent(mac: Mac, storyId: string, entry: Entry): StoryEvent | null {
  const payload = entry.payload;
  switch (payload.kind) {
    case "scene_opened": {
      const state = mac.states.at(entry.id);
      return { kind: "scene_opened", seq: entry.seq, scene: sceneCard(storyId, state), focus: state.scene?.focus ?? null, ...(payload.prose ? { passage: { entry_id: entry.id, text: payload.prose } } : {}) };
    }
    case "move": {
      // Written at the Day View, the Move opens the next Scene at once, under its card.
      const state = mac.states.at(entry.id);
      const passage = { entry_id: entry.id, text: payload.text };
      return state.scene?.closed ? { kind: "move", seq: entry.seq, passage, opening: nextScene(state, entry) } : { kind: "move", seq: entry.seq, passage };
    }
    case "reply":
      return { kind: "reply", seq: entry.seq, passage: { entry_id: entry.id, text: payload.text }, scene: sceneCard(storyId, mac.states.at(entry.id)) };
    case "scene_closed":
      return { kind: "scene_closed", seq: entry.seq, day_view: dayView(mac.states.at(entry.id), { step: "chronicler", failed: null }) };
    case "focus_set":
      return { kind: "focus_set", seq: entry.seq, focus: payload.on };
    case "linger_set":
      return { kind: "linger_set", seq: entry.seq, linger: payload.on };
    case "redo":
      return { kind: "redo", seq: entry.seq };
    // A lesson deleted from Taste changes the Scene's head and nothing a phone shows: it reads the Scene again.
    case "taste_set":
    case "known_set":
    case "person_set":
    case "lead_set":
    case "group_set":
    case "portrait_set":
    case "premise_set":
    case "style_set":
    case "reply_length_set":
    case "arcs_set":
    case "landmark_set":
    case "landmark_dropped":
    case "place_set":
    case "world_set":
    case "clock_set":
    case "brief_set":
    case "routine_set":
    case "reaction_set":
      return { kind: "path_changed", seq: entry.seq };
    case "world_moved":
      return payload.gap ? null : { kind: "world_moved", seq: entry.seq };
    case "beat_note":
    case "chronicle":
    case "director_plan":
    case "story_folded":
    case "story_set_up":
      return null;
  }
}
