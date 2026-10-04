import type { StoryFile } from "../protocol/generated/story-file.js";
import type { Beat, ModelChoice, SceneCall } from "./state.js";

/**
 * What can be written to a Story's tree (docs/adr/0003). Each kind is something that happened; the State on a
 * Path is what all of them add up to, worked out by the reducer.
 */
export type Payload = StorySetUp | SceneOpened | MoveWritten | Redo | BeatNote | ReplyWritten | SceneClosed | FocusSet | LingerSet;

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
  here: string[];
  beats: Beat[];
  note: string;
  call: SceneCall;
  intensity: number;
  arcMoved: boolean;
  clock: string;
  taste: string | null;
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
