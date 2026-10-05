import type { StoryFile } from "../protocol/generated/story-file.js";
import type { Beat, ModelChoice, SceneCall } from "./state.js";

/**
 * What can be written to a Story's tree (docs/adr/0003). Each kind is something that happened; the State on a
 * Path is what all of them add up to, worked out by the reducer.
 */
export type Payload = StorySetUp | SceneOpened | MoveWritten | Redo | BeatNote | ReplyWritten | SceneClosed | FocusSet | LingerSet | Chronicle;

/** A payload as any version may have stored it. */
export type StoredPayload = Exclude<Payload, BeatNote | Chronicle>
  | (Omit<BeatNote, "inPlay" | "goes"> & Partial<Pick<BeatNote, "inPlay" | "goes">>)
  | (Omit<Chronicle, "sceneEnded"> & Partial<Pick<Chronicle, "sceneEnded">>);

/**
 * An entry as it reads now, however long ago it was written. Entries never change (docs/adr/0003), so a field added
 * later is filled here, the one place entries are read, as it would have been: a Beat Note from before Moments were
 * put in play has none in play, and one from before people could go has nobody going; a Chronicle from before open
 * Scenes had summaries recorded an ended Scene exactly when it had one.
 */
export function readPayload(stored: StoredPayload): Payload {
  if (stored.kind === "beat_note") return { ...stored, inPlay: stored.inPlay ?? [], goes: stored.goes ?? [] };
  if (stored.kind === "chronicle") return { ...stored, sceneEnded: stored.sceneEnded ?? stored.summary !== null };
  return stored;
}

/** The Story as its Story File set it up. Portraits map each person's name to the stored image's file name. */
export interface StorySetUp {
  kind: "story_set_up";
  storyFile: StoryFile;
  portraits: Record<string, string>;
}

/**
 * A Scene began: its title card, who is there, and the Writer's frame when the Writer opened it. A Scene a Move
 * opened (from the Day View, or by leaving the last one) starts at that Move, which belongs to it; a Story File's
 * opening has prose of its own and no plan until the Writer makes one.
 */
export interface SceneOpened {
  kind: "scene_opened";
  number: number;
  title: string;
  place: string;
  at: string;
  who: string[];
  prose: string | null;
  startsAt: string | null;
  purpose: string | null;
  exit: string | null;
}

/** The player's Move, word for word. */
export interface MoveWritten {
  kind: "move";
  text: string;
}

/**
 * The player asked for the latest Reply again, with a Direction for the Writer or none. It is written under the
 * Move that Reply answered, so the old Reply leaves the Path and the new one is written after this.
 */
export interface Redo {
  kind: "redo";
  direction: string | null;
  remember: boolean;
}

/**
 * The Writer's step for one Move (docs/adr/0004): the Scene's beats as it judged them, who is here, the Beat Note
 * the Reply plays, the call, and the time the Reply begins. [plan] is the purpose and exit of a Scene that opened
 * without one; [taste] is a lasting lesson to keep.
 */
export interface BeatNote {
  kind: "beat_note";
  plan: { purpose: string; exit: string } | null;
  /** Who is in the Scene for the Reply besides the Player Character, worked out from who came in and who goes. */
  here: string[];
  /** Who leaves in the Reply: written leaving, and out of the Scene once it is written. */
  goes: string[];
  beats: Beat[];
  note: string;
  call: SceneCall;
  intensity: number;
  arcMoved: boolean;
  clock: string;
  taste: string | null;
  /** The remembered Moments the Reply draws on, by id. */
  inPlay: string[];
  callId: string;
  model: ModelChoice;
}

/** A Scene closed: the Story closed it with a Reply, or the player ended it. */
export interface SceneClosed {
  kind: "scene_closed";
  by: "story" | "player";
}

/** The player set Focus on someone in the Scene, or cleared it. */
export interface FocusSet {
  kind: "focus_set";
  on: string | null;
}

/** The player turned Linger on or off. */
export interface LingerSet {
  kind: "linger_set";
  on: boolean;
}

/** Words taken exactly from one entry, the way a Moment keeps what was said and done. */
export interface Quote {
  entry: string;
  text: string;
}

/**
 * A part of the Story that matters, recorded once in its original words, with who was there besides the Player
 * Character and how much it mattered (docs/adr/0006).
 */
export interface Moment {
  id: string;
  what: string;
  quotes: Quote[];
  there: string[];
  weight: number;
}

/** Someone told someone else about a Moment, in this entry. */
export interface Told {
  moment: string;
  to: string[];
  entry: string;
}

/**
 * What the Chronicler recorded about a Scene, up to the entry this hangs off (docs/adr/0007): never on a Path, seen by
 * every Path its parent is on. [summary] is there once the Scene has ended.
 */
export interface Chronicle {
  kind: "chronicle";
  scene: string;
  /** What happened in the Scene, when it had ended; where it stood so far, when it had not. */
  summary: string | null;
  /** Whether the Scene had ended: a Scene is summarised by the Chronicle that records its end. */
  sceneEnded: boolean;
  moments: Moment[];
  told: Told[];
  callId: string;
  model: ModelChoice;
}

/** A Reply, word for word, and the model call that wrote it. */
export interface ReplyWritten {
  kind: "reply";
  text: string;
  callId: string;
  model: ModelChoice;
}

export type EntryKind = Payload["kind"];

export interface Entry<P extends Payload = Payload> {
  seq: number;
  id: string;
  storyId: string;
  parentId: string | null;
  payload: P;
  createdAt: string;
}

export function isKind<K extends EntryKind>(entry: Entry, kind: K): entry is Entry<Extract<Payload, { kind: K }>> {
  return entry.payload.kind === kind;
}
