import type { Countdown, DayView, Exchange, PastScene, Previously, SceneCard, SceneView, StoryEvent } from "../protocol/generated/link.js";
import { dayChoicesOf, todayOn } from "../story/day.js";
import type { Engine } from "../engine/engine.js";
import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import type { Chronicle, Entry, WorldMoved } from "../story/entries.js";
import { sceneSpans } from "../story/spans.js";
import type { State } from "../story/state.js";
import { minutesOf, parseStoryTime, sayDay, sayStoryTime, sayTime, type StoryTime } from "../time.js";

/** How many Landmarks ahead the Day View counts down to. */
const COUNTDOWNS = 3;

/** Where a Portrait is served, relative to the Mac's address. */
export function portraitUrl(storyId: string, file: string): string {
  return `/stories/${encodeURIComponent(storyId)}/portraits/${encodeURIComponent(file)}`;
}

function say(state: State, at: string): string {
  const time = parseStoryTime(at);
  return time ? sayStoryTime(time, state.dayOneWeekday) : at;
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
function countdown(now: StoryTime, at: StoryTime, name: string): Countdown {
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
export function dayView(mac: Mac, state: State, head: string, failure: { reason: string; traceId: string } | null = null): DayView {
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
  return {
    at: state.clock,
    at_label: say(state, state.clock),
    day: now ? sayDay(now, state.dayOneWeekday) : state.clock,
    time: now ? sayTime(now) : "",
    place: state.scene.place,
    closed_by: state.scene.closed,
    countdowns,
    scene_span: sceneSpan(state, state.scene.at, state.scene.endedAt ?? state.clock),
    ...worldOfDay(mac, head, state.scene.openedBy, failure),
    happenings: todayOn(mac, head, state),
    choices: dayChoicesOf(state)
  };
}


function worldOfDay(mac: Mac, head: string, scene: string, failure: { reason: string; traceId: string } | null): Pick<DayView, "world" | "meanwhile" | "failure"> {
  const record = mac.tree.recordsOn(head, "world_moved").map(entry => entry.payload as WorldMoved).find(moved => moved.scene === scene);
  if (record) return { world: "ready", meanwhile: record.meanwhile.map(item => ({ text: item.text, how: item.how })), failure: null };
  if (failure) return { world: "failed", meanwhile: [], failure: { reason: failure.reason, trace_id: failure.traceId } };
  return { world: "moving_on", meanwhile: [], failure: null };
}

/** When a Scene ran, as people say it: "Friday 9:40 pm – 11:05 pm", naming the day again if it ended on another. */
function sceneSpan(state: State, began: string, ended: string): string {
  const start = parseStoryTime(began);
  const end = parseStoryTime(ended);
  if (!start || !end) return `${began} – ${ended}`;
  const close = start.day === end.day ? sayTime(end) : sayStoryTime(end, state.dayOneWeekday);
  return `${sayStoryTime(start, state.dayOneWeekday)} – ${close}`;
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
    day_view: scene.closed ? dayView(mac, state, path.headEntryId, engine.worldFailure(storyId, scene.openedBy)) : null,
    earlier_scenes: all.flatMap(entry => entry.payload.kind === "scene_opened" && entry.id !== scene.openedBy
      ? [{ number: entry.payload.number, title: entry.payload.title, summary: summaries.get(entry.id) ?? "" }]
      : []),
    exchanges: exchanges(entries),
    turn: engine.turnState(storyId),
    previously: previously(mac, path.headEntryId, scene.openedBy, summaries, now),
    trace_id: traceId
  };
}

/** How long the player has been away before the Previously card shows (openspec stories: Back after a night away). */
const AWAY_MS = 24 * 60 * 60 * 1000;

/**
 * The Previously card, when the player last played more than a day before [now]: the latest summary of the Scene they
 * are in, or of the Scene that closed when they are at the Day View. A Scene with no summary yet has no card, rather
 * than an earlier Scene's words passed off as its own; the Mac writes one an hour after the player steps away.
 */
function previously(mac: Mac, head: string, scene: string, summaries: Map<string, string>, now: Date): Previously | null {
  const since = mac.tree.entry(head)?.createdAt;
  if (!since || now.getTime() - Date.parse(since) <= AWAY_MS) return null;
  const summary = summaries.get(scene);
  return summary ? { summary, since } : null;
}

/** The Chronicler's summary of each Scene on the Path at [head] that has one, by the Scene's opening entry. */
function summariesOn(mac: Mac, head: string): Map<string, string> {
  // Chronicles come oldest first, so each Scene keeps its latest: what happened in it once it has ended.
  return new Map(mac.tree.recordsOn(head, "chronicle").flatMap(entry => {
    const chronicle = entry.payload as Chronicle;
    return chronicle.summary ? [[chronicle.scene, chronicle.summary] as const] : [];
  }));
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
    case "move":
      return { kind: "move", seq: entry.seq, passage: { entry_id: entry.id, text: payload.text } };
    case "reply":
      return { kind: "reply", seq: entry.seq, passage: { entry_id: entry.id, text: payload.text }, scene: sceneCard(storyId, mac.states.at(entry.id)) };
    case "scene_closed":
      return { kind: "scene_closed", seq: entry.seq, day_view: dayView(mac, mac.states.at(entry.id), entry.id) };
    case "focus_set":
      return { kind: "focus_set", seq: entry.seq, focus: payload.on };
    case "linger_set":
      return { kind: "linger_set", seq: entry.seq, linger: payload.on };
    case "redo":
      return { kind: "redo", seq: entry.seq };
    case "beat_note":
    case "chronicle":
    case "world_moved":
    case "story_set_up":
      return null;
  }
}
