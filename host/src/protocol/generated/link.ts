/* Generated from protocol/schemas by protocol/generate.mjs. Do not edit; change the schema and regenerate. */

/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ErrorCode".
 */
export type ErrorCode =
  "unpaired" | "version_mismatch" | "busy" | "stale_head" | "not_found" | "invalid" | "model_failed" | "internal";

/**
 * Everything the phone and the Mac say to each other (openspec/specs/mac-link). Every request carries the Fantasia-Contract header with the contract version; every response carries a trace id. Unions are flat objects with a kind field, so the Kotlin side stays plain data classes.
 */
export interface Link {
  [k: string]: unknown | undefined;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ErrorBody".
 */
export interface ErrorBody {
  error: ErrorDetail;
}
export interface ErrorDetail {
  code: ErrorCode;
  /**
   * Why, in words the player can read.
   */
  message: string;
  trace_id: string;
}
/**
 * What the Mac's pairing QR code holds.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PairingInvite".
 */
export interface PairingInvite {
  host_id: string;
  host_name: string;
  addresses: string[];
  port: number;
  /**
   * One-time pairing code, valid for ten minutes.
   */
  code: string;
  /**
   * SHA-256 of the Mac's certificate, which the phone pins.
   */
  fingerprint: string;
  contract: number;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PairRequest".
 */
export interface PairRequest {
  code: string;
  device_name: string;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PairResponse".
 */
export interface PairResponse {
  device_token: string;
  host_id: string;
  host_name: string;
  trace_id: string;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StoryList".
 */
export interface StoryList {
  stories: StorySummary[];
  trace_id: string;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StorySummary".
 */
export interface StorySummary {
  id: string;
  title: string;
  /**
   * Where the Story stands on its current Path, as one line: "Scene 14 · After curfew".
   */
  standing: string;
  updated_at: string;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PersonCard".
 */
export interface PersonCard {
  name: string;
  portrait_url: string | null;
}
/**
 * A Scene's title card.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SceneCard".
 */
export interface SceneCard {
  number: number;
  title: string;
  place: string;
  /**
   * Story time, "Day N HH:MM".
   */
  at: string;
  /**
   * Story time as people say it: "Friday · 9:40 pm".
   */
  at_label: string;
  /**
   * Who is in the Scene now besides the Player Character, with their Portraits; someone a Move or the Story brings in is added.
   */
  people: PersonCard[];
}
/**
 * One Move or Reply, as it stands on the tree.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "Passage".
 */
export interface Passage {
  entry_id: string;
  text: string;
}
/**
 * A Move and the Reply that answered it. The opening Scene's first Reply has no Move.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "Exchange".
 */
export interface Exchange {
  move: Passage | null;
  reply: Passage | null;
}
/**
 * Whether a Reply is being written, has failed, or nothing is under way.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "TurnState".
 */
export interface TurnState {
  kind: "idle" | "writing" | "failed";
  /**
   * While writing: the Reply's words so far.
   */
  text_so_far?: string;
  /**
   * When failed: why, in words the player can read.
   */
  reason?: string;
  /**
   * When writing or failed: the turn's trace id.
   */
  trace_id?: string;
}
/**
 * The Scene screen as the Mac sees it on the Story's current Path.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SceneView".
 */
export interface SceneView {
  story_id: string;
  path_id: string;
  /**
   * The newest entry in the Story when this view was taken.
   */
  seq: number;
  /**
   * The entry a Move must follow.
   */
  head_entry_id: string;
  scene: SceneCard;
  /**
   * The name of the person the player plays, for labelling their Moves.
   */
  player_character: string;
  earlier_scenes: SceneSummaryLine[];
  exchanges: Exchange[];
  turn: TurnState;
  trace_id: string;
  /**
   * The id of the newest event this view reflects, including the words of a Reply under way; the live stream resumes after it.
   */
  last_event_id: string;
  /**
   * Who the Scene is focused on, or null.
   */
  focus: string | null;
  /**
   * Whether Linger is on.
   */
  linger: boolean;
  /**
   * Present once the Scene has closed, by the Story or by End scene: the Day View, whose composer takes the next Move.
   */
  day_view: DayView | null;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SceneSummaryLine".
 */
export interface SceneSummaryLine {
  number: number;
  title: string;
  summary: string;
}
/**
 * Where and when the Player Character is between Scenes (openspec day-view).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "DayView".
 */
export interface DayView {
  /**
   * Story time, "Day N HH:MM".
   */
  at: string;
  /**
   * Story time as people say it: "Sunday · 7:40 am".
   */
  at_label: string;
  /**
   * Where the Player Character is.
   */
  place: string;
  /**
   * Who closed the last Scene: the Story, whose closing Reply can be redone, or the player, with End scene.
   */
  closed_by: "story" | "player";
  countdowns: Countdown[];
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "Countdown".
 */
export interface Countdown {
  landmark: string;
  /**
   * "3 days to Draconia's flying test", "Tomorrow: the first match", "Today at 6:00 pm: the feast".
   */
  label: string;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "MoveRequest".
 */
export interface MoveRequest {
  text: string;
  /**
   * The entry the phone saw as the head; a Move after any other is refused as stale.
   */
  after: string;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "TurnAccepted".
 */
export interface TurnAccepted {
  move_entry_id: string;
  trace_id: string;
}
/**
 * One event on a Story's live stream. Entry events (scene_opened, move, reply, scene_closed, focus_set, linger_set, redo) are replayed after a reconnect; reply_started, reply_delta and reply_failed describe the turn under way. After scene_opened, scene_closed and redo the phone reads the Scene again, because they change more than one part of it.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StoryEvent".
 */
export interface StoryEvent {
  kind:
    | "scene_opened"
    | "move"
    | "reply"
    | "scene_closed"
    | "focus_set"
    | "linger_set"
    | "redo"
    | "reply_started"
    | "reply_delta"
    | "reply_failed";
  /**
   * The newest entry this event follows.
   */
  seq: number;
  scene?: SceneCard1;
  passage?: Passage;
  /**
   * reply_delta: the words that just arrived.
   */
  text?: string;
  reason?: string;
  trace_id?: string;
  day_view?: DayView1;
  /**
   * scene_opened and focus_set: who the Scene is focused on, or null.
   */
  focus?: string | null;
  /**
   * linger_set: whether Linger is on.
   */
  linger?: boolean;
}
/**
 * A Scene's title card.
 */
export interface SceneCard1 {
  number: number;
  title: string;
  place: string;
  /**
   * Story time, "Day N HH:MM".
   */
  at: string;
  /**
   * Story time as people say it: "Friday · 9:40 pm".
   */
  at_label: string;
  /**
   * Who is in the Scene now besides the Player Character, with their Portraits; someone a Move or the Story brings in is added.
   */
  people: PersonCard[];
}
/**
 * Where and when the Player Character is between Scenes (openspec day-view).
 */
export interface DayView1 {
  /**
   * Story time, "Day N HH:MM".
   */
  at: string;
  /**
   * Story time as people say it: "Sunday · 7:40 am".
   */
  at_label: string;
  /**
   * Where the Player Character is.
   */
  place: string;
  /**
   * Who closed the last Scene: the Story, whose closing Reply can be redone, or the player, with End scene.
   */
  closed_by: "story" | "player";
  countdowns: Countdown[];
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "EndSceneRequest".
 */
export interface EndSceneRequest {
  /**
   * The head the phone saw; refused as stale if the Story has moved on.
   */
  after: string;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "FocusRequest".
 */
export interface FocusRequest {
  after: string;
  /**
   * The person to focus on, by name, or null to clear Focus.
   */
  on: string | null;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "LingerRequest".
 */
export interface LingerRequest {
  after: string;
  on: boolean;
}
/**
 * Write the latest Reply again. The Direction reaches the Writer only, never the Story.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "RedoRequest".
 */
export interface RedoRequest {
  /**
   * The head the phone saw: the latest Reply, or the end of the Scene that Reply closed.
   */
  after: string;
  direction: string | null;
  /**
   * Keep the Direction as a line of Taste.
   */
  remember: boolean;
}
/**
 * A change to the Story that is done when it is answered.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "Accepted".
 */
export interface Accepted {
  head_entry_id: string;
  trace_id: string;
}
