import type { StoryFile } from "../protocol/generated/story-file.js";
import type { Outline } from "./outline.js";
import type { TruthUpdate } from "./truth.js";
import type { ArcStep, Beat, Engagement, Landmark, LeadMove, ModelChoice, NewThing, Person, Place, PlannedScene, Quote, RoadmapPoint, SceneCall, State } from "./state.js";

/**
 * Everything written to a Story's tree, all of it on the Path (docs/adr/0015): play, the player's edits, and what the
 * agents recorded at a Scene's end. The State on a Path is what all of them add up to.
 */
export type Payload = StorySetUp | SceneOpened | MoveWritten | Redo | BeatNote | ReplyWritten | SceneClosed | FocusSet
  | LingerSet | KnownSet | PersonSet | LeadSet | GroupSet | PortraitSet | StoryEdit
  | SceneRecorded | Chronicle | WorldMoved | DirectorPlan | StoryFolded | OutlineSet;

/**
 * The edits to the Story, by the player or Claude: neither Home nor the Previously card counts them as play. What the
 * Story learns about the player (Taste, the brief, reactions, steering notes) is kept beside the Story, not on a Path
 * (docs/adr/0020).
 */
export const EDIT_KINDS: ReadonlySet<string> = new Set([
  "known_set", "person_set", "lead_set", "group_set", "portrait_set", "premise_set", "style_set",
  "reply_length_set", "arcs_set", "landmark_set", "landmark_dropped", "place_set", "world_set", "clock_set",
  "routine_set"
] satisfies Payload["kind"][]);

/** What a Scene's end writes, each by its step (docs/adr/0016). */
export const SCENE_END_KINDS: ReadonlySet<string> = new Set(["chronicle", "outline_set", "director_plan", "world_moved", "story_folded"] satisfies Payload["kind"][]);

export interface StorySetUp {
  kind: "story_set_up";
  storyFile: StoryFile;
  portraits: Record<string, string>;
}

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

export interface MoveWritten {
  kind: "move";
  text: string;
  choice?: Choice;
}

/** A choice at the Day View, resolved against what it offered. */
export interface Choice {
  kind: "go" | "follow" | "somewhere" | "skip" | "story";
  place: string | null;
  at: string | null;
  who: string[];
  /** The Scene that matters it opens, when it is one. */
  scene: string | null;
  /** The Engagement it keeps, when it is the next time of one. */
  engagement: string | null;
}

export interface Redo {
  kind: "redo";
  direction: string | null;
  remember: boolean;
  model?: ModelChoice;
}

/** The Writer's step for one Move: the Scene's beats, who is here, the note the Reply plays, the call and the clock. */
export interface BeatNote {
  kind: "beat_note";
  plan: { purpose: string; exit: string } | null;
  here: string[];
  goes: string[];
  beats: Beat[];
  note: string;
  call: SceneCall;
  intensity: number;
  arcMoved: boolean;
  clock: string;
  inPlay: string[];
  place?: string;
  /** What the Writer found in its lookups that the Reply needs, in the Story's own words (docs/adr/0018). */
  gathered?: Gathered[];
  callId: string;
  model: ModelChoice;
}

/** A passage the Writer gathered for the Actor: its words as the Story has them, and the Scene they are from. */
export interface Gathered {
  /** The Scene the words were played in; null for what happened off the page. */
  scene: number | null;
  words: string;
}

export interface SceneClosed {
  kind: "scene_closed";
  /** The Story closed it; the player ended it; or the player's Move left it for something else, straight into the next. */
  by: "story" | "player" | "move";
}

export interface FocusSet {
  kind: "focus_set";
  on: string | null;
}

export interface LingerSet {
  kind: "linger_set";
  on: boolean;
}

export interface KnownSet {
  kind: "known_set";
  person: string;
  text: string;
}

export interface PersonSet {
  kind: "person_set";
  person: Omit<Person, "portrait" | "broughtIn">;
}

export interface LeadSet {
  kind: "lead_set";
  person: string;
  lead: boolean;
}

export interface GroupSet {
  kind: "group_set";
  group: string;
  description: string;
}

export interface PortraitSet {
  kind: "portrait_set";
  person: string;
  file: string;
}

export type StoryEdit = PremiseSet | StyleSet | ReplyLengthSet | ArcsSet | LandmarkSet | LandmarkDropped | PlaceSet
  | WorldSet | ClockSet | RoutineSet;

export interface PremiseSet { kind: "premise_set"; premise: string }
export interface StyleSet { kind: "style_set"; style: string }
export interface ReplyLengthSet { kind: "reply_length_set"; length: State["replyLength"] }
export interface ArcsSet { kind: "arcs_set"; arcs: string[] }
export interface LandmarkSet { kind: "landmark_set"; landmark: Landmark }
export interface LandmarkDropped { kind: "landmark_dropped"; name: string }
export interface PlaceSet { kind: "place_set"; place: Place; institution: boolean }
export interface WorldSet { kind: "world_set"; summary: string; history: string }
export interface ClockSet { kind: "clock_set"; clock: string; /** Day 1's date, "YYYY-MM-DD", or null for no calendar. */ dayOne: string | null }
export interface RoutineSet { kind: "routine_set"; routine: string[] }

export interface ReplyWritten {
  kind: "reply";
  text: string;
  callId: string;
  model: ModelChoice;
  /** The Editor's note, when the Reply still breaks what is established after it was written again (docs/adr/0019). */
  note?: string;
}

/**
 * The Chronicler's record of a Scene still being played, once it has run past the length it can be carried word for
 * word (the-storys-mind design decision 8): recorded as a finished Scene is, once, before the Writer plans the next
 * Reply. Its truth and Moments join the State; the Scene's end records only what came after [through].
 */
export interface SceneRecorded {
  kind: "scene_recorded";
  scene: number;
  /** The last passage the record covers. */
  through: string;
  /** The Scene so far told in a paragraph. */
  paragraph: string;
  moments: Moment[];
  told: ToldOn[];
  known: { who: string; now: string }[];
  bonds: { who: string; standing: string; turn: string }[];
  engagements: Engagement[];
  changed: { engagement: string; to: string }[];
  truth: TruthUpdate;
  dropped: string[];
  callId: string;
  model: ModelChoice;
}

/** A Moment as the Chronicler recorded it: what happened, in its own words, and who was there. */
export interface Moment {
  what: string;
  quotes: Quote[];
  there: string[];
  weight: number;
}

/** Someone told someone else about something, in this Scene: a fact of an earlier Scene, by its id. */
export interface ToldOn {
  fact: string;
  to: string[];
}

/** The Chronicler's record of a closed Scene. */
export interface Chronicle {
  kind: "chronicle";
  scene: number;
  /** A line, for the Journal. */
  summary: string;
  /** The Scene told in a paragraph, for The Story So Far. */
  paragraph: string;
  moments: Moment[];
  told: ToldOn[];
  known: { who: string; now: string }[];
  bonds: { who: string; standing: string; turn: string }[];
  engagements: Engagement[];
  changed: { engagement: string; to: string }[];
  /** What the Scene changed in the truth (openspec the-truth). */
  truth: TruthUpdate;
  dropped: string[];
  callId: string;
  model: ModelChoice;
}

export interface Happened {
  id: string;
  what: string;
  at: string;
  where: string;
  knownTo: string[];
  landmark: string | null;
  move: string | null;
}

export interface MeanwhileLine {
  text: string;
  how: "seen" | "told" | "rumour";
  fact: string;
  toldBy: string | null;
  about: string[];
  engagement: Engagement | null;
}

/** The Weaver's record: the World moved on from [from] to [until], after a Scene's end or over a Gap. */
export interface WorldMoved {
  kind: "world_moved";
  scene: number;
  gap: boolean;
  from: string;
  until: string;
  lives: { who: string; where: string | null; doing: string | null; after: string }[];
  threads: { name: string; now: string }[];
  happened: Happened[];
  meanwhile: MeanwhileLine[];
  on: { id: string; at: string; place: string; what: string; who: string[] }[];
  /** What the span changed in the truth, off the page. */
  truth: TruthUpdate;
  dropped: string[];
  callId: string | null;
  model: ModelChoice | null;
}

/** The Director's Outline, written when a Story starts and reconsidered after each Scene (openspec the-outline). */
export interface OutlineSet {
  kind: "outline_set";
  outline: Omit<Outline, "version">;
  /** Why it was written: the Story starting, a focused revision, or a deep one and why. */
  reason: string;
  /** Whether a Stretch plan follows it in the same step of the Scene's end; when not, it ends the Director's step. */
  planFollows: boolean;
  dropped: string[];
  callId: string;
  model: ModelChoice;
}

/** The Director's plan for the next Stretch, and the people it brings into the Story. */
export interface DirectorPlan {
  kind: "director_plan";
  from: number;
  until: number;
  toward: string;
  landmark: string | null;
  phase: "build" | "peak" | "rest";
  scenes: PlannedScene[];
  leads: LeadMove[];
  arcs: ArcStep[];
  roadmap: RoadmapPoint[];
  premise: string;
  newThings: NewThing[];
  people: Omit<Person, "portrait" | "broughtIn">[];
  /** Why it was due. */
  reason: string;
  afterScene: number;
  dropped: string[];
  callId: string;
  model: ModelChoice;
}

/**
 * The Folder gathered the current Act's oldest Scenes into a week, or a finished Act's weeks and Scenes into one account
 * of it (the-storys-mind design decision 8).
 */
export interface StoryFolded {
  kind: "story_folded";
  into: "week" | "act";
  /** How many of the oldest parts it replaces: Scene paragraphs for a week; an Act's weeks, then its Scenes, for an Act. */
  count: number;
  from: string;
  until: string;
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
