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
   * Where the Story stands on its current Path, as one line: "Scene 14 · After curfew" mid-Scene, "Sunday 7:40 am · choosing where to go" at the Day View.
   */
  standing: string;
  updated_at: string;
  /**
   * The line under the standing: "Friday 9:52 pm · with Hermione" mid-Scene, "3 Scenes played" at the Day View.
   */
  detail: string;
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
   * Story time as people say it: "Friday 9:40 pm".
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
  /**
   * Present when the player last played this Story more than a day ago and the Scene they are in, or the Scene that closed at the Day View, has a summary: the Previously card.
   */
  previously: Previously | null;
  /**
   * Present while a Move at the Day View is opening the next Scene and the Scene has not opened yet (openspec presence: Between Scenes is quiet, and shows progress). Then there is no Day View, the exchanges are that Move's, the Scene that closed is among the earlier Scenes, and the phone shows this card in place of the Scene's.
   */
  opening: NextScene | null;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SceneSummaryLine".
 */
export interface SceneSummaryLine {
  number: number;
  title: string;
  /**
   * The Chronicler's one line for the Scene, or empty until it has written one.
   */
  summary: string;
}
/**
 * Where and when the Player Character is between Scenes, and what he learned meanwhile (openspec day-view).
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
   * Story time as people say it: "Sunday 7:40 am".
   */
  at_label: string;
  /**
   * The day as people say it: "Sunday", or "Day 3" when the Story has no weekdays.
   */
  day: string;
  /**
   * The time as people say it: "7:40 am".
   */
  time: string;
  /**
   * Where the Player Character is.
   */
  place: string;
  /**
   * Who closed the last Scene: the Story, whose closing Reply can be redone, or the player, with End scene.
   */
  closed_by: "story" | "player";
  countdowns: Countdown[];
  /**
   * Whether the World has moved on to the Day View's time: moving_on while the Weaver works (the phone says so in one line and takes no Move), ready, or failed (with failure).
   */
  world: "moving_on" | "ready" | "failed";
  /**
   * When the Scene that ended ran, as people say it: "Friday 9:40 pm – 11:05 pm".
   */
  scene_span: string;
  /**
   * What the Player Character learned while elsewhere, once the World has moved on; empty before.
   */
  meanwhile: MeanwhileItem[];
  /**
   * Why the World could not move on, when world is failed; Retry is POST /stories/{id}/world/retry.
   */
  failure: WorldFailure | null;
  /**
   * What is on today that the Player Character could go to: at most four, the Story's pick first, once the World has moved on; empty before.
   */
  happenings: Happening[];
  choices: DayChoices;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "Countdown".
 */
export interface Countdown {
  landmark: string;
  /**
   * How long to go: "3 days", "Tomorrow", "Today at 8:30 pm".
   */
  when: string;
  /**
   * "3 days to Draconia's flying test", "Tomorrow: the first match", "Today at 6:00 pm: the feast".
   */
  label: string;
}
/**
 * One line of Meanwhile, marked by how the Player Character learned it.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "MeanwhileItem".
 */
export interface MeanwhileItem {
  text: string;
  how: "seen" | "told" | "rumour";
}
/**
 * The Weaver could not move the World on.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "WorldFailure".
 */
export interface WorldFailure {
  reason: string;
  trace_id: string;
}
/**
 * Something going on in the World at a time and place the Player Character could be at (openspec day-view: Up to four Happenings).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "Happening".
 */
export interface Happening {
  id: string;
  /**
   * Story time, "Day N HH:MM".
   */
  at: string;
  /**
   * When, as people say it: "9:00 am", or "Tomorrow 9:00 am".
   */
  time: string;
  place: string;
  /**
   * What is going on, and why it matters now.
   */
  what: string;
  /**
   * Who will be there, by name.
   */
  who: string[];
  /**
   * The Player Character is expected there: shown "You're expected".
   */
  expected: boolean;
  /**
   * The Story's own pick, which Let the Story choose goes to.
   */
  pick: boolean;
}
/**
 * What the Day View's other choices offer: people to follow, places to go, and times to skip to.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "DayChoices".
 */
export interface DayChoices {
  /**
   * People the Player Character could follow: the Leads and whoever was in the Scene that ended.
   */
  follow: string[];
  /**
   * The Story's places to go to.
   */
  places: string[];
  skips: Skip[];
}
/**
 * A later time to skip to: this evening, tomorrow, the weekend, the next Landmark.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "Skip".
 */
export interface Skip {
  /**
   * "This evening", "Tomorrow", "The weekend", or the Landmark's name.
   */
  label: string;
  /**
   * The label as it reads inside a sentence: "this evening", "tomorrow", "the weekend", or the Landmark's name as named.
   */
  in_sentence: string;
  at: string;
  /**
   * As people say it: "6:00 pm" on the Day View's own day, "Saturday 7:30 am" on another.
   */
  time: string;
}
/**
 * The Previously card: where the Story stands, from the Chronicler's records, and when the player last played.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "Previously".
 */
export interface Previously {
  /**
   * The latest summary of the Scene the player is in (so far), or of the Scene that closed.
   */
  summary: string;
  /**
   * When the player last played: the time the Path's head entry was written, ISO 8601.
   */
  since: string;
}
/**
 * The next Scene, being written: when it is, when the choice set a time.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "NextScene".
 */
export interface NextScene {
  /**
   * Story time, "Day N HH:MM", or null when the choice set none.
   */
  at: string | null;
  /**
   * As people say it: "Friday 6:00 pm", or null.
   */
  at_label: string | null;
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
 * One event on a Story's live stream. Entry events (scene_opened, move, reply, scene_closed, focus_set, linger_set, redo) are replayed after a reconnect; reply_started, reply_delta and reply_failed describe the turn under way; world_moved and world_failed say the World has moved on, or could not, after a Scene ended. path_changed says the Story is now on another Path, or its Path was moved back, or a Move or Reply on it was edited. After scene_opened, scene_closed, redo, world_moved, world_failed and path_changed, and after a move that opens the next Scene, the phone reads the Scene again, because they change more than one part of it.
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
    | "reply_failed"
    | "world_moved"
    | "world_failed"
    | "path_changed";
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
  opening?: NextScene1;
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
   * Story time as people say it: "Friday 9:40 pm".
   */
  at_label: string;
  /**
   * Who is in the Scene now besides the Player Character, with their Portraits; someone a Move or the Story brings in is added.
   */
  people: PersonCard[];
}
/**
 * Where and when the Player Character is between Scenes, and what he learned meanwhile (openspec day-view).
 */
export interface DayView1 {
  /**
   * Story time, "Day N HH:MM".
   */
  at: string;
  /**
   * Story time as people say it: "Sunday 7:40 am".
   */
  at_label: string;
  /**
   * The day as people say it: "Sunday", or "Day 3" when the Story has no weekdays.
   */
  day: string;
  /**
   * The time as people say it: "7:40 am".
   */
  time: string;
  /**
   * Where the Player Character is.
   */
  place: string;
  /**
   * Who closed the last Scene: the Story, whose closing Reply can be redone, or the player, with End scene.
   */
  closed_by: "story" | "player";
  countdowns: Countdown[];
  /**
   * Whether the World has moved on to the Day View's time: moving_on while the Weaver works (the phone says so in one line and takes no Move), ready, or failed (with failure).
   */
  world: "moving_on" | "ready" | "failed";
  /**
   * When the Scene that ended ran, as people say it: "Friday 9:40 pm – 11:05 pm".
   */
  scene_span: string;
  /**
   * What the Player Character learned while elsewhere, once the World has moved on; empty before.
   */
  meanwhile: MeanwhileItem[];
  /**
   * Why the World could not move on, when world is failed; Retry is POST /stories/{id}/world/retry.
   */
  failure: WorldFailure | null;
  /**
   * What is on today that the Player Character could go to: at most four, the Story's pick first, once the World has moved on; empty before.
   */
  happenings: Happening[];
  choices: DayChoices;
}
/**
 * The next Scene, being written: when it is, when the choice set a time.
 */
export interface NextScene1 {
  /**
   * Story time, "Day N HH:MM", or null when the choice set none.
   */
  at: string | null;
  /**
   * As people say it: "Friday 6:00 pm", or null.
   */
  at_label: string | null;
}
/**
 * A choice at the Day View (openspec day-view: The player chooses where to be). The Mac writes it as the player's Move, the Gap first.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ChooseRequest".
 */
export interface ChooseRequest {
  /**
   * The entry the choice follows: the Day View's head.
   */
  after: string;
  kind: "go" | "follow" | "somewhere" | "skip" | "story";
  /**
   * go: the Happening's id; left out or null for the other kinds.
   */
  happening?: string | null;
  /**
   * follow: who; left out or null for the other kinds.
   */
  who?: string | null;
  /**
   * somewhere: the place; left out or null for the other kinds.
   */
  place?: string | null;
  /**
   * skip: the time skipped to; left out or null for the other kinds.
   */
  at?: string | null;
  /**
   * What the Player Character did in the Gap, in the player's words, or null: left blank, he spent it quietly where he was.
   */
  gap: string | null;
}
/**
 * The Paths screen (openspec paths: The Paths screen): the Story as a tree, laid out by the Mac in reading order.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PathsView".
 */
export interface PathsView {
  story_id: string;
  rows: PathRow[];
  /**
   * How many Paths Clear would remove: those Rewind set aside and the player never opened.
   */
  clearable: number;
  trace_id: string;
}
/**
 * One row of the tree: a run of Scenes the Paths below share, folded; the Scene where they part; or a Path's card. Depth says how far in it is drawn.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PathRow".
 */
export interface PathRow {
  kind: "scenes" | "fork" | "path";
  depth: number;
  /**
   * scenes: "Scenes 1 – 12 · Friday 6:10 pm"; fork: "Scene 13 · Friday 8:05 pm"; path: its card's label.
   */
  label: string;
  /**
   * fork: the Scene's title, "The troll"; otherwise null.
   */
  title: string | null;
  /**
   * path: the card.
   */
  path: PathCard | null;
}
/**
 * A Path on the Paths screen.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PathCard".
 */
export interface PathCard {
  id: string;
  /**
   * "MAIN · YOU ARE HERE", "FROM SCENE 13 · TRIED ANOTHER WAY", "SET ASIDE AT SCENE 14", "FROM THE BEGINNING".
   */
  label: string;
  /**
   * The player's name for it, or its newest Scene: "Scene 14 · After curfew".
   */
  title: string;
  /**
   * "3 Scenes · Saturday 1:15 am".
   */
  detail: string;
  /**
   * Whether the player is on it.
   */
  current: boolean;
  /**
   * When it was last played, ISO 8601; the phone says how long ago.
   */
  played_at: string;
  /**
   * False for the Path the player is on.
   */
  can_delete: boolean;
}
/**
 * Try another way from a Reply, or, with from null, start again from the beginning (openspec paths).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "TryAnotherWayRequest".
 */
export interface TryAnotherWayRequest {
  /**
   * The Reply's entry, or null for the Story's opening.
   */
  from: string | null;
  /**
   * The head the phone saw; refused as stale if the Story has moved on.
   */
  after: string;
}
/**
 * Rewind the Path the player is on to a Reply; what came after is set aside as a Path of its own.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "RewindRequest".
 */
export interface RewindRequest {
  /**
   * The Reply's entry.
   */
  to: string;
  /**
   * The head the phone saw; refused as stale if the Story has moved on.
   */
  after: string;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "RenamePathRequest".
 */
export interface RenamePathRequest {
  /**
   * The Path's new name; empty to go back to its newest Scene.
   */
  name: string;
}
/**
 * Edit a Move or a Reply in the player's words (openspec scenes: Editing). The latest changes in place; anything earlier carries the Story on from the edit on a new Path.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "EditRequest".
 */
export interface EditRequest {
  /**
   * The Move's or the Reply's entry, or a Scene's opening prose.
   */
  entry: string;
  /**
   * The words it should read.
   */
  text: string;
  /**
   * The head the phone saw; refused as stale if the Story has moved on.
   */
  after: string;
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
/**
 * An earlier Scene on the current Path, in full, for reading back (openspec scenes: Scrolling back).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PastScene".
 */
export interface PastScene {
  number: number;
  title: string;
  place: string;
  /**
   * When the Scene began, as people say it.
   */
  at_label: string;
  /**
   * The Chronicler's one line, or empty until it has written one.
   */
  summary: string;
  exchanges: Exchange[];
  trace_id: string;
}
