import type { Countdown, DayView, NextScene, Passage, SceneCard, SceneEnd, StoryEvent } from "../protocol/generated/link.js";
import { dayChoicesOf, todayOn } from "../story/day.js";
import type { Mac } from "../mac.js";
import type { Entry, ReplyWritten } from "../story/entries.js";
import { besideOf } from "../store/beside.js";
import type { Reaction, State } from "../story/state.js";
import { stripSceneState } from "../context/lens.js";
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
 * from the first Move after the closed Scene's `scene_closed` and its end's entries.
 */
export function openingEntries(state: State, path: Entry[]): Entry[] | null {
  if (!state.scene?.closed) return null;
  const closedAt = path.findLastIndex(entry => entry.payload.kind === "scene_closed");
  if (state.scene.closed === "move") {
    let left = closedAt - 1;
    while (left > 0 && ["redo", "focus_set", "linger_set"].includes(path[left]?.payload.kind ?? "")) left--;
    if (path[left]?.payload.kind === "move") return path.slice(left);
  }
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

/** The Day View once a Scene has closed: where and when, countdowns, meanwhile, happenings, and choices. */
export function dayView(state: State, sceneEnd: SceneEnd = { step: null, failed: null, rethinking: null }, reactions: Reaction[] = []): DayView {
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
    countdowns,
    scene_span: sceneSpan(state, state.scene.at, state.scene.endedAt ?? state.clock),
    scene_end: sceneEnd,
    reaction: reactions.find(item => item.scene === number)?.reaction ?? null,
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

/** A Reply as the phone shows it: its words (with any `<scene_state>` tag stripped), and the Editor's note when present. */
export function replyPassage(entryId: string, reply: ReplyWritten): Passage {
  const text = stripSceneState(reply.text);
  return reply.note ? { entry_id: entryId, text, note: reply.note } : { entry_id: entryId, text };
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
      const state = mac.states.at(entry.id);
      const passage = { entry_id: entry.id, text: payload.text };
      return state.scene?.closed ? { kind: "move", seq: entry.seq, passage, opening: nextScene(state, entry) } : { kind: "move", seq: entry.seq, passage };
    }
    case "reply":
      return { kind: "reply", seq: entry.seq, passage: replyPassage(entry.id, payload), scene: sceneCard(storyId, mac.states.at(entry.id)) };
    case "scene_closed":
      return { kind: "scene_closed", seq: entry.seq, day_view: dayView(mac.states.at(entry.id), { step: "chronicler", failed: null, rethinking: null }, besideOf(mac, storyId, entry.id).reactions) };
    case "focus_set":
      return { kind: "focus_set", seq: entry.seq, focus: payload.on };
    case "linger_set":
      return { kind: "linger_set", seq: entry.seq, linger: payload.on };
    case "redo":
      return { kind: "redo", seq: entry.seq };
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
    case "routine_set":
      return { kind: "path_changed", seq: entry.seq };
    case "world_moved":
      return payload.gap ? null : { kind: "world_moved", seq: entry.seq };
    case "beat_note":
    case "scene_recorded":
    case "chronicle":
    case "outline_set":
    case "director_plan":
    case "story_folded":
    case "story_set_up":
      return null;
  }
}
