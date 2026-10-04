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
   * The newest entry this view reflects; the live stream resumes after it.
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
 * One event on a Story's live stream. Entry events (scene_opened, move, reply) are replayed after a reconnect; reply_started, reply_delta and reply_failed describe the turn under way.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StoryEvent".
 */
export interface StoryEvent {
  kind: "scene_opened" | "move" | "reply" | "reply_started" | "reply_delta" | "reply_failed";
  /**
   * The newest entry this event follows.
   */
  seq: number;
  scene?: SceneCard;
  passage?: Passage;
  /**
   * reply_delta: the words that just arrived.
   */
  text?: string;
  reason?: string;
  trace_id?: string;
}
