/* Generated from protocol/schemas by protocol/generate.mjs. Do not edit; change the schema and regenerate. */

/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ErrorCode".
 */
export type ErrorCode =
  "unpaired" | "version_mismatch" | "busy" | "stale_head" | "not_found" | "invalid" | "model_failed" | "internal";
/**
 * A step of a Scene's end, in order (docs/adr/0016).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SceneEndStep".
 */
export type SceneEndStep = "chronicler" | "director" | "weaver" | "folder";
/**
 * Go on, or bring the Scene to its turn; only the player, or a Move that leaves it, closes a Scene.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SceneCall".
 */
export type SceneCall = "continue" | "land";
/**
 * Where a beat stands: to come, under way, done, or passed over.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "BeatStatus".
 */
export type BeatStatus = "pending" | "in_play" | "done" | "skipped";
/**
 * Where a stretch of the Story is: building, at its peak, or resting after one.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "DirectorPhase".
 */
export type DirectorPhase = "build" | "peak" | "rest";
/**
 * played: the player chose it; passed: its time went by without it; ahead: still to come.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StretchSceneState".
 */
export type StretchSceneState = "played" | "passed" | "ahead";
/**
 * A job a model does (CONTEXT.md: Who writes the Story).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ModelJob".
 */
export type ModelJob = "actor" | "writer" | "editor" | "chronicler" | "weaver" | "director" | "folder";
/**
 * Who offers a model: each is reached through the player's own subscription (docs/adr/0005).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ModelProvider".
 */
export type ModelProvider = "claude" | "codex" | "antigravity" | "opencode";
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "CalendarKind".
 */
export type CalendarKind = "landmark" | "happening";

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
  /**
   * On a Reply only: the Editor's note when the Reply still breaks what is established after it was written again (docs/adr/0019); null otherwise.
   */
  note?: string | null;
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
 * Whether a Reply is under way (looking back, being written, being checked), has failed, or nothing is under way (openspec presence: A Reply arrives checked and whole).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "TurnState".
 */
export interface TurnState {
  kind: "idle" | "looking_back" | "writing" | "checking" | "failed";
  /**
   * When failed: why, in words the player can read.
   */
  reason?: string;
  /**
   * When writing or failed: the turn's trace id.
   */
  trace_id?: string;
  /**
   * When failed: the job that failed.
   */
  job?: "actor" | "writer" | "editor" | "chronicler" | "weaver" | "director" | "folder";
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
  brief: Brief;
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
  countdowns: Countdown[];
  /**
   * When the Scene that ended ran, as people say it: "Friday 9:40 pm – 11:05 pm".
   */
  scene_span: string;
  /**
   * What the Player Character learned while elsewhere, once the World has moved on; empty before.
   */
  meanwhile: MeanwhileItem[];
  /**
   * What is on today that the Player Character could go to: at most four, the Story's pick first, once the World has moved on; empty before.
   */
  happenings: Happening[];
  choices: DayChoices;
  scene_end: SceneEnd;
  /**
   * The player's reaction to the Scene that ended, or null.
   */
  reaction: "more" | "less" | null;
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
  /**
   * How many days off it is: 0 today, 1 tomorrow; the Day View says "in 5 days" beyond that.
   */
  days_away: number;
  /**
   * The Stretch's Scene that matters it is, when it is one; null otherwise.
   */
  scene: string | null;
  /**
   * For a weekly Engagement, the day it repeats ("Wednesday"), and time is then the hour alone: shown "Every Wednesday · 7:30 pm". Null otherwise.
   */
  every: string | null;
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
  /**
   * How many days off it is: 0 today, 1 tomorrow; the skip says "in 48 days" a week or more away.
   */
  days_away: number;
}
/**
 * How the Scene's end stands: the step under way, or the one it stopped at; both null when it is done.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SceneEnd".
 */
export interface SceneEnd {
  step: SceneEndStep | null;
  failed: SceneEndFailure | null;
  /**
   * While the Director re-plans an Act deeply: its title, such as "Year One"; null otherwise.
   */
  rethinking: string | null;
}
/**
 * Why a Scene's end stopped, and at which step.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SceneEndFailure".
 */
export interface SceneEndFailure {
  step: SceneEndStep;
  reason: string;
  trace_id: string;
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
 * What the player wants more of and less of (openspec long-run: The player steers with a brief and reactions).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "Brief".
 */
export interface Brief {
  more: string[];
  less: string[];
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
 * One event on a Story's live stream. Entry events (scene_opened, move, reply, scene_closed, focus_set, linger_set, redo, world_moved) are replayed after a reconnect; reply_started, turn_step and reply_failed describe the turn under way; a Reply's words arrive whole, in its reply event; scene_end_step says which step of a Scene's end is under way, null when it is done, and scene_end_failed where it stopped and why (docs/adr/0016). path_changed says the Story is now on another Path, or its Path was moved back, or a Move or Reply on it was edited. After scene_opened, scene_closed, redo, world_moved, scene_end_step, scene_end_failed and path_changed, and after a move that opens the next Scene, the phone reads the Scene again, because they change more than one part of it.
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
    | "turn_step"
    | "reply_failed"
    | "world_moved"
    | "path_changed"
    | "scene_end_step"
    | "scene_end_failed";
  /**
   * The newest entry this event follows.
   */
  seq: number;
  scene?: SceneCard1;
  passage?: Passage;
  /**
   * reply_delta: live streamed prose chunk while the Reply is being written.
   */
  delta?: string;
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
  /**
   * For scene_end_step and scene_end_failed: the step; null when the Scene's end is done.
   */
  step?: SceneEndStep | null;
  /**
   * turn_step: what the Reply under way is doing.
   */
  turn_step?: "looking_back" | "writing" | "checking";
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
  countdowns: Countdown[];
  /**
   * When the Scene that ended ran, as people say it: "Friday 9:40 pm – 11:05 pm".
   */
  scene_span: string;
  /**
   * What the Player Character learned while elsewhere, once the World has moved on; empty before.
   */
  meanwhile: MeanwhileItem[];
  /**
   * What is on today that the Player Character could go to: at most four, the Story's pick first, once the World has moved on; empty before.
   */
  happenings: Happening[];
  choices: DayChoices;
  scene_end: SceneEnd;
  /**
   * The player's reaction to the Scene that ended, or null.
   */
  reaction: "more" | "less" | null;
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
 * The Journal (openspec outside-the-scene: The Journal reads the Story back): the Scenes on the current Path by day, and what the Player Character heard Meanwhile between them, in order.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "JournalView".
 */
export interface JournalView {
  story_id: string;
  days: JournalDay[];
  trace_id: string;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "JournalDay".
 */
export interface JournalDay {
  /**
   * "Friday".
   */
  day: string;
  rows: JournalRow[];
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "JournalRow".
 */
export interface JournalRow {
  kind: "scene" | "meanwhile";
  scene: JournalScene | null;
  meanwhile: MeanwhileItem | null;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "JournalScene".
 */
export interface JournalScene {
  number: number;
  /**
   * "Scene 12 · 6:10 pm · The Three Broomsticks", or with "now" for the Scene the player is in.
   */
  label: string;
  title: string;
  /**
   * The Chronicler's line, or empty until it has written one.
   */
  summary: string;
  /**
   * Whether it is the Scene the player is in.
   */
  now: boolean;
}
/**
 * Backstage (openspec outside-the-scene: Backstage shows everything else, only when visited): what the Player Character does not know.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "BackstageView".
 */
export interface BackstageView {
  story_id: string;
  /**
   * What happened off-screen, by day, newest first, the last seven days.
   */
  offscreen: BackstageDay[];
  threads: BackstageThread[];
  lives: BackstageLife[];
  /**
   * The Writer's plan for the Scene the player is in; null between Scenes.
   */
  writer: WriterPlan | null;
  taste: string[];
  trace_id: string;
  /**
   * What the Director is building toward; null until the Director has planned on this Path.
   */
  director: DirectorLine | null;
  /**
   * The record: each Scene not yet recorded, and each recorded with parts left out, newest first; empty when nothing is missing.
   */
  record: RecordRow[];
  how_its_going: HowItsGoing;
  new_things: NewThingRow[];
  outline: OutlineView | null;
  lives_by_tier: LivesByTier;
  notes: SteeringNote[];
  truth: TruthView;
  /**
   * The player's own Taste, which every Story starts with (openspec long-run: Taste is short, readable and the player's).
   */
  player_taste: string[];
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "BackstageDay".
 */
export interface BackstageDay {
  /**
   * "Saturday".
   */
  day: string;
  items: BackstageItem[];
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "BackstageItem".
 */
export interface BackstageItem {
  /**
   * "11:50 pm".
   */
  time: string;
  what: string;
  known_to: string[];
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "BackstageThread".
 */
export interface BackstageThread {
  name: string;
  /**
   * Where it stands.
   */
  now: string;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "BackstageLife".
 */
export interface BackstageLife {
  who: string;
  where: string | null;
  doing: string | null;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "WriterPlan".
 */
export interface WriterPlan {
  /**
   * What the Writer says the next Reply does with the Scene, or null before its first plan.
   */
  call: SceneCall | null;
  purpose: string | null;
  beats: WriterBeat[];
  exit: string | null;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "WriterBeat".
 */
export interface WriterBeat {
  text: string;
  status: BeatStatus;
}
/**
 * The Director's plan as Backstage shows it (Backstage.dc.html: THE DIRECTOR).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "DirectorLine".
 */
export interface DirectorLine {
  /**
   * What the stretch builds toward: "the flying test on Wednesday".
   */
  toward: string;
  phase: DirectorPhase;
  /**
   * Said for Backstage: "Building toward the flying test on Wednesday. This stretch builds; rest comes after it."
   */
  line: string;
  /**
   * The Stretch the Director planned (Backstage.dc.html: THE DIRECTOR); null for a plan from before Stretches.
   */
  stretch: StretchView | null;
}
/**
 * A Stretch as Backstage shows it: its days, its Scenes that matter, and each Lead's move.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StretchView".
 */
export interface StretchView {
  /**
   * Its first day, "Saturday".
   */
  from_label: string;
  /**
   * Its last day, "Friday".
   */
  until_label: string;
  scenes: StretchScene[];
  leads: StretchLead[];
}
/**
 * A Scene that matters in the Stretch.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StretchScene".
 */
export interface StretchScene {
  place: string;
  who: string[];
  state: StretchSceneState;
  /**
   * When, as Backstage says it: "Mon 2:00 pm".
   */
  time: string;
  /**
   * What it is for, as the plan says it.
   */
  purpose: string;
}
/**
 * What a Lead does about the Player Character this Stretch.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StretchLead".
 */
export interface StretchLead {
  who: string;
  move: string;
  on_screen: boolean;
  /**
   * Where and when: "On screen · Charms, Monday", "Off-screen, Sunday · he heard it from Neville Longbottom", "Off-screen · still to come".
   */
  label: string;
}
/**
 * A Scene in The record that was kept with parts left out.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "RecordRow".
 */
export interface RecordRow {
  scene_number: number;
  scene_title: string;
  /**
   * The parts of its record that were left out, and why.
   */
  dropped: string[];
}
/**
 * How the Story's machinery is doing (openspec outside-the-scene: Backstage).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "HowItsGoing".
 */
export interface HowItsGoing {
  /**
   * How long the last Scene ends took, newest last.
   */
  scene_end_seconds: number[];
  jobs: JobHealth[];
  pace: PaceRow[];
  picks_offered: number;
  picks_taken: number;
  more: number;
  less: number;
  /**
   * How long the last Replies took, newest last.
   */
  reply_seconds: number[];
  /**
   * How many Replies the Editor set right in place.
   */
  editor_fixed: number;
  /**
   * How many Replies the Editor sent back to be written again.
   */
  editor_rewrote: number;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "JobHealth".
 */
export interface JobHealth {
  job: ModelJob;
  calls: number;
  /**
   * How often its second model had to step in.
   */
  second_model: number;
  /**
   * How often it failed on both.
   */
  failed: number;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PaceRow".
 */
export interface PaceRow {
  scene_number: number;
  title: string;
  intensity: number;
}
/**
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "NewThingRow".
 */
export interface NewThingRow {
  kind: string;
  what: string;
  /**
   * Which Stretch brought it: "This Stretch", or "Stretch 3".
   */
  stretch: string;
}
/**
 * The Outline (openspec the-outline: The player sees and steers the Outline).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "OutlineView".
 */
export interface OutlineView {
  current: ActView | null;
  later: ActSketch[];
  ending: string;
  setups: SetupRow[];
  looked_up: string[];
  /**
   * When it was last revised and how: "after Scene 19, deeply".
   */
  revised: string;
}
/**
 * The current Act in detail.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ActView".
 */
export interface ActView {
  number: number;
  title: string;
  question: string;
  builds_to: string;
  turns: TurnRow[];
  /**
   * Items: Where a relationship should stand by the Act's end.
   */
  relationships: {
    people: string[];
    by_end: string;
  }[];
  /**
   * Items: What someone who drives the World is doing this Act.
   */
  movers: {
    who: string;
    doing: string;
  }[];
  /**
   * Items: A person's own direction this Act.
   */
  intentions: {
    who: string;
    pursues: string;
    heading: string;
  }[];
}
/**
 * One turn of an Act.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "TurnRow".
 */
export interface TurnRow {
  when: string;
  what: string;
  done: boolean;
}
/**
 * An Act after the current one, outlined or sketched.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ActSketch".
 */
export interface ActSketch {
  number: number;
  title: string;
  question: string;
  builds_to: string;
  detail: "outlined" | "sketched";
}
/**
 * Something planted that the Outline means to pay off.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SetupRow".
 */
export interface SetupRow {
  what: string;
  payoff: string;
  state: "waiting" | "paid" | "dropped";
  planted: string | null;
}
/**
 * Lives by how much each person matters (openspec living-world: Everyone has a Life).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "LivesByTier".
 */
export interface LivesByTier {
  close: LifeRow[];
  movers: LifeRow[];
  others: string[];
}
/**
 * A person's Life as Backstage shows it.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "LifeRow".
 */
export interface LifeRow {
  who: string;
  now: string;
  wants: string;
  heading: string;
}
/**
 * A note the player wrote to steer the Outline.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SteeringNote".
 */
export interface SteeringNote {
  id: string;
  text: string;
  written_at: string;
  answered: boolean;
  /**
   * Whether this Direction guides subsequent Replies. Missing means active.
   */
  active?: boolean;
}
/**
 * What the Story keeps (openspec the-truth), each item with where it came from.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "TruthView".
 */
export interface TruthView {
  /**
   * Items: Who someone is now.
   */
  people: {
    who: string;
    now: string;
    sources: SourceRow[];
  }[];
  /**
   * Items: Where things stand between two people.
   */
  between: {
    people: string[];
    stands: string;
    keepsakes: string[];
    sources: SourceRow[];
  }[];
  /**
   * Items: Something true, or true until a Scene ended it.
   */
  truths: {
    kind: "agreement" | "promise" | "debt" | "threat" | "secret" | "status";
    what: string;
    terms: string[];
    due_label: string | null;
    known_to: string[];
    ended: string | null;
    sources: SourceRow[];
  }[];
  /**
   * Items: How the World works.
   */
  rules: {
    what: string;
    sources: SourceRow[];
  }[];
  /**
   * Items: A name made on the page.
   */
  names: {
    name: string;
    kind: "person" | "place" | "thing";
    what: string;
    first_scene: number;
  }[];
}
/**
 * Where something kept came from: the Scene and the words (openspec the-truth: Nothing is deleted).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SourceRow".
 */
export interface SourceRow {
  scene_number: number | null;
  text: string;
}
/**
 * Delete a lesson from a Taste (openspec long-run: Taste is short, readable and the player's).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "RemoveTasteRequest".
 */
export interface RemoveTasteRequest {
  /**
   * The lesson to delete, as Taste reads it.
   */
  line: string;
  /**
   * Whose Taste: the Story's own, or the player's own across every Story.
   */
  scope: "story" | "player";
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
  /**
   * The model for just this Reply; null or absent for the Story's Actor.
   */
  model?: ModelChoice | null;
}
/**
 * Which model does a job: the provider, the id it lists the model under, and the effort when the model has one.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ModelChoice".
 */
export interface ModelChoice {
  provider: ModelProvider;
  model: string;
  effort?: string | null;
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
/**
 * A model as the Models screen shows it: the choice, and its name with the effort ("GPT 6.1 Sol · high").
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ChosenModel".
 */
export interface ChosenModel {
  choice: ModelChoice;
  label: string;
}
/**
 * One Story's Actor on the Models screen.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StoryActor".
 */
export interface StoryActor {
  story_id: string;
  title: string;
  actor: ChosenModel;
  /**
   * Set by the player for this Story; otherwise the one its Story File names.
   */
  own: boolean;
}
/**
 * One job on the Models screen, for every Story.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "JobModel".
 */
export interface JobModel {
  job: ModelJob;
  title: string;
  /**
   * What the job does, in one line: "Plans each Reply before it starts".
   */
  does: string;
  model: ChosenModel;
  backup: ChosenModel1;
}
/**
 * A model as the Models screen shows it: the choice, and its name with the effort ("GPT 6.1 Sol · high").
 */
export interface ChosenModel1 {
  choice: ModelChoice;
  label: string;
}
/**
 * A model a provider offers.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ModelOption".
 */
export interface ModelOption {
  id: string;
  /**
   * As the phone shows it: "GPT 6.1 Sol".
   */
  name: string;
  /**
   * The efforts it supports, lowest first; empty when it has none.
   */
  efforts: string[];
  default_effort: string | null;
}
/**
 * What one provider offers, as last asked.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ProviderModels".
 */
export interface ProviderModels {
  provider: ModelProvider;
  /**
   * "CLAUDE", "CODEX", "ANTIGRAVITY".
   */
  label: string;
  /**
   * Whether the provider answered the last time it was asked.
   */
  reachable: boolean;
  /**
   * When not reachable: why, in words the player can read.
   */
  reason: string | null;
  /**
   * What it offers; when not reachable, what it last offered.
   */
  models: ModelOption[];
}
/**
 * The Models screen (openspec outside-the-scene: One Models screen).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ModelsView".
 */
export interface ModelsView {
  stories: StoryActor[];
  actor_backup: ChosenModel2;
  jobs: JobModel[];
  providers: ProviderModels[];
  /**
   * Whether the Editor checks every Reply before showing it (off by default for live streaming and lower token cost).
   */
  edit_every_reply?: boolean;
  trace_id: string;
}
/**
 * Turns the Editor on or off for every Story.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SetEditorEnabledRequest".
 */
export interface SetEditorEnabledRequest {
  enabled: boolean;
}
/**
 * A model as the Models screen shows it: the choice, and its name with the effort ("GPT 6.1 Sol · high").
 */
export interface ChosenModel2 {
  choice: ModelChoice;
  label: string;
}
/**
 * Sets the model for a job, from its next work.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SetJobModelRequest".
 */
export interface SetJobModelRequest {
  model: ModelChoice;
  /**
   * Sets the job's second model instead of its own.
   */
  backup?: boolean | null;
}
/**
 * Sets a Story's own Actor; null goes back to the one its Story File names.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SetActorRequest".
 */
export interface SetActorRequest {
  model: ModelChoice | null;
}
/**
 * Writes the failed Reply again; with a model, the job that failed runs on it for this one try.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "RetryRequest".
 */
export interface RetryRequest {
  model?: ModelChoice | null;
}
/**
 * A Scene by its number and title.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SceneRef".
 */
export interface SceneRef {
  number: number;
  title: string;
}
/**
 * Someone on the World screen, as the Player Character knows them (openspec outside-the-scene: The World screen shows what the Player Character knows).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "WorldPerson".
 */
export interface WorldPerson {
  name: string;
  aliases: string[];
  portrait_url: string | null;
  lead: boolean;
  /**
   * The Group they are in, if any.
   */
  group: string | null;
  /**
   * This entry is a Group, standing for members not known on their own.
   */
  is_group: boolean;
  /**
   * What the Player Character knows of them; null when it is only what he has heard.
   */
  known: string | null;
  /**
   * The Scene that last added to what he knows; null for what he knew from the start, or was set on the Mac.
   */
  known_from: SceneRef | null;
  /**
   * What he has heard of them, newest first.
   */
  heard: MeanwhileItem[];
  /**
   * Between you: their Bond; null when he has no history with them.
   */
  between: Between | null;
}
/**
 * Where things stand between the Player Character and someone, and the turns that brought it there, newest first (lasting-records: their Bond).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "Between".
 */
export interface Between {
  standing: string;
  turns: BetweenTurn[];
}
/**
 * One turn in a Bond, with the Scene it came in; the Scene is null for a turn from before the Story.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "BetweenTurn".
 */
export interface BetweenTurn {
  text: string;
  scene_number: number | null;
  scene_title: string | null;
}
/**
 * A place in the Story, as anyone there would know it.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "WorldPlace".
 */
export interface WorldPlace {
  name: string;
  description: string;
  /**
   * A Scene on this Path was there.
   */
  been: boolean;
}
/**
 * A Landmark, or a Happening he knows of, still ahead.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "CalendarItem".
 */
export interface CalendarItem {
  kind: CalendarKind;
  name: string;
  what: string;
  /**
   * When, as people say it: "Wednesday 9:00 am".
   */
  at_label: string;
  /**
   * How long to go: "3 days", "Tomorrow", "Today at 8:30 pm".
   */
  when: string;
}
/**
 * The World screen: People, Places and the Calendar, only as the Player Character knows them.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "WorldView".
 */
export interface WorldView {
  story_id: string;
  /**
   * The Leads first, in the Story's order, then everyone else he knows of, by name.
   */
  people: WorldPerson[];
  places: WorldPlace[];
  /**
   * Ordered by time.
   */
  calendar: CalendarItem[];
  trace_id: string;
}
/**
 * A Group and what it is, as anyone would know it.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "GroupInfo".
 */
export interface GroupInfo {
  name: string;
  description: string;
}
/**
 * Someone in Everyone in the Story: no one's description, only who they are to the Story.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PersonSummary".
 */
export interface PersonSummary {
  name: string;
  lead: boolean;
  group: string | null;
  portrait_url: string | null;
  player_character: boolean;
}
/**
 * Everyone in the Story, for editing (editing-people design decision 5): the Leads first, then by name.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PeopleView".
 */
export interface PeopleView {
  story_id: string;
  people: PersonSummary[];
  groups: GroupInfo[];
  trace_id: string;
}
/**
 * A person as the Story keeps them, for the person editor: shown only on Edit.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PersonDetail".
 */
export interface PersonDetail {
  story_id: string;
  name: string;
  /**
   * Other names they answer to.
   */
  aliases: string[];
  /**
   * Who they are and the backstory they come with, what nobody knows included.
   */
  who_they_are: string;
  /**
   * What the Player Character knows of them.
   */
  known: string | null;
  appearance: string;
  /**
   * What they are after.
   */
  wants: string;
  /**
   * Lines they have said, in their own words.
   */
  voice: string[];
  /**
   * What they know, beyond their own backstory.
   */
  knows: string[];
  group: string | null;
  lead: boolean;
  portrait_url: string | null;
  player_character: boolean;
  /**
   * Every Group, for the picker.
   */
  groups: GroupInfo[];
  trace_id: string;
  /**
   * Between you: their Bond; null when he has no history with them.
   */
  between: Between | null;
}
/**
 * A person created or changed whole, from that moment onward on the current Path.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PersonEdit".
 */
export interface PersonEdit {
  /**
   * The head the phone saw.
   */
  after: string;
  /**
   * A new person; false changes someone already in the Story.
   */
  create: boolean;
  /**
   * Other names they answer to.
   */
  aliases: string[];
  /**
   * Who they are and the backstory they come with, what nobody knows included.
   */
  who_they_are: string;
  /**
   * What the Player Character knows of them.
   */
  known: string | null;
  appearance: string;
  /**
   * What they are after.
   */
  wants: string;
  /**
   * Lines they have said, in their own words.
   */
  voice: string[];
  /**
   * What they know, beyond their own backstory.
   */
  knows: string[];
  group: string | null;
}
/**
 * Makes someone a Lead, or stops them being one.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "LeadRequest".
 */
export interface LeadRequest {
  /**
   * The head the phone saw.
   */
  after: string;
  lead: boolean;
}
/**
 * Creates a Group, or changes its description.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "GroupRequest".
 */
export interface GroupRequest {
  /**
   * The head the phone saw.
   */
  after: string;
  description: string;
}
/**
 * A place or an institution: its name and what it is.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StoryPlace".
 */
export interface StoryPlace {
  name: string;
  description: string;
}
/**
 * A Landmark as The Story screen shows it.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StoryLandmark".
 */
export interface StoryLandmark {
  name: string;
  /**
   * Its time on the Story Clock, "Day N HH:MM".
   */
  at: string;
  /**
   * Its time as the player reads it: "Wednesday 10:00 am · Day 66".
   */
  at_label: string;
  /**
   * How far off it is, as the Day View's countdowns say it; null once it has passed.
   */
  when?: string | null;
  what: string;
  /**
   * True when the World has reached its time on this Path: it has happened, and stays as it was.
   */
  passed: boolean;
}
/**
 * The time on the current Path.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StoryClock".
 */
export interface StoryClock {
  /**
   * "Day N HH:MM".
   */
  at: string;
  /**
   * "Saturday 7 September, 9:40 pm".
   */
  at_label: string;
  /**
   * The date of Day 1, YYYY-MM-DD, or null when the Story has no calendar.
   */
  day_one: string | null;
}
/**
 * Everything The Story screen shows, as it stands on the current Path (editing-the-story design decision 4).
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StoryView".
 */
export interface StoryView {
  story_id: string;
  title: string;
  premise: string;
  style: string;
  reply_length: "short" | "medium" | "full";
  arcs: string[];
  /**
   * In the order of their times.
   */
  landmarks: StoryLandmark[];
  world_summary: string;
  world_history: string;
  places: StoryPlace[];
  institutions: StoryPlace[];
  clock: StoryClock;
  /**
   * Where the World stands, "Day N HH:MM": a Landmark may only be set after it, and the clock only moved past the clock.
   */
  world_stands: string;
  head_entry_id: string;
  trace_id: string;
}
/**
 * Sets the Premise.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PremiseRequest".
 */
export interface PremiseRequest {
  /**
   * The head the phone saw.
   */
  after: string;
  premise: string;
}
/**
 * Sets the Style.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "StyleRequest".
 */
export interface StyleRequest {
  /**
   * The head the phone saw.
   */
  after: string;
  style: string;
}
/**
 * Sets the reply length.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ReplyLengthRequest".
 */
export interface ReplyLengthRequest {
  /**
   * The head the phone saw.
   */
  after: string;
  length: "short" | "medium" | "full";
}
/**
 * Sets the Arcs whole: adding, rewording and dropping are each a new list.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ArcsRequest".
 */
export interface ArcsRequest {
  /**
   * The head the phone saw.
   */
  after: string;
  arcs: string[];
}
/**
 * Creates, moves or rewrites a Landmark, named in the path.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "LandmarkRequest".
 */
export interface LandmarkRequest {
  /**
   * The head the phone saw.
   */
  after: string;
  /**
   * "Day N HH:MM".
   */
  at: string;
  what: string;
  /**
   * True for a new Landmark; refused if one has the name.
   */
  create: boolean;
}
/**
 * Drops a Landmark, named in the path.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "DropLandmarkRequest".
 */
export interface DropLandmarkRequest {
  /**
   * The head the phone saw.
   */
  after: string;
}
/**
 * Creates or rewrites a place or an institution, named in the path.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "PlaceRequest".
 */
export interface PlaceRequest {
  /**
   * The head the phone saw.
   */
  after: string;
  description: string;
  institution: boolean;
  create: boolean;
}
/**
 * Sets what the World is, and its history.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "WorldRequest".
 */
export interface WorldRequest {
  /**
   * The head the phone saw.
   */
  after: string;
  summary: string;
  history: string;
}
/**
 * Moves the clock on, and says the date of Day 1.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ClockRequest".
 */
export interface ClockRequest {
  /**
   * The head the phone saw.
   */
  after: string;
  /**
   * "Day N HH:MM", later than the clock.
   */
  at: string;
  /**
   * The date of Day 1, YYYY-MM-DD, or null for no calendar.
   */
  day_one: string | null;
}
/**
 * Rewords a lesson in Taste, in its place.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "RewordTasteRequest".
 */
export interface RewordTasteRequest {
  /**
   * The lesson as Taste reads it now.
   */
  line: string;
  text: string;
  /**
   * Whose Taste: the Story's own, or the player's own across every Story.
   */
  scope: "story" | "player";
}
/**
 * Sets the brief, kept beside the Story.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "BriefRequest".
 */
export interface BriefRequest {
  more: string[];
  less: string[];
}
/**
 * Reacts to a played Scene, or clears the reaction with null.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "ReactionRequest".
 */
export interface ReactionRequest {
  scene_number: number;
  reaction: "more" | "less" | null;
  note?: string | null;
}
/**
 * Adds a standing Direction used by subsequent Replies and planning.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SteeringNoteRequest".
 */
export interface SteeringNoteRequest {
  text: string;
}
/**
 * Edits a standing Direction or changes whether it is active, preserving its history.
 *
 * This interface was referenced by `Link`'s JSON-Schema
 * via the `definition` "SteeringNoteEditRequest".
 */
export interface SteeringNoteEditRequest {
  text: string;
  active: boolean;
}
