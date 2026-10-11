import type { StoryFile } from "../protocol/generated/story-file.js";
import type { ArcStep, Beat, Engagement, Landmark, LeadMove, ModelChoice, NewThing, Person, Place, PlannedScene, Quote, RoadmapPoint, SceneCall, State } from "./state.js";

/**
 * Everything written to a Story's tree, all of it on the Path (docs/adr/0015): play, the player's edits, and what the
 * agents recorded at a Scene's end. The State on a Path is what all of them add up to.
 */
export type Payload = StorySetUp | SceneOpened | MoveWritten | Redo | BeatNote | ReplyWritten | SceneClosed | FocusSet
  | LingerSet | TasteSet | KnownSet | PersonSet | LeadSet | GroupSet | PortraitSet | StoryEdit | ReactionSet
  | Chronicle | WorldMoved | DirectorPlan | StoryFolded;

/** The edits to the Story, by the player or Claude: neither Home nor the Previously card counts them as play. */
export const EDIT_KINDS: ReadonlySet<string> = new Set([
  "taste_set", "known_set", "person_set", "lead_set", "group_set", "portrait_set", "premise_set", "style_set",
  "reply_length_set", "arcs_set", "landmark_set", "landmark_dropped", "place_set", "world_set", "clock_set",
  "brief_set", "routine_set", "reaction_set"
] satisfies Payload["kind"][]);

/** What a Scene's end writes, each by its step (docs/adr/0016). */
export const SCENE_END_KINDS: ReadonlySet<string> = new Set(["chronicle", "director_plan", "world_moved", "story_folded"] satisfies Payload["kind"][]);

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
  taste: string | null;
  inPlay: string[];
  place?: string;
  callId: string;
  model: ModelChoice;
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

export interface TasteSet {
  kind: "taste_set";
  lines: string[];
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
  | WorldSet | ClockSet | BriefSet | RoutineSet;

export interface PremiseSet { kind: "premise_set"; premise: string }
export interface StyleSet { kind: "style_set"; style: string }
export interface ReplyLengthSet { kind: "reply_length_set"; length: State["replyLength"] }
export interface ArcsSet { kind: "arcs_set"; arcs: string[] }
export interface LandmarkSet { kind: "landmark_set"; landmark: Landmark }
export interface LandmarkDropped { kind: "landmark_dropped"; name: string }
export interface PlaceSet { kind: "place_set"; place: Place; institution: boolean }
export interface WorldSet { kind: "world_set"; summary: string; history: string }
export interface ClockSet { kind: "clock_set"; clock: string; /** Day 1's date, "YYYY-MM-DD", or null for no calendar. */ dayOne: string | null }
/** What the player wants more of and less of (openspec long-run: The player steers with a brief and reactions). */
export interface BriefSet { kind: "brief_set"; more: string[]; less: string[] }
export interface RoutineSet { kind: "routine_set"; routine: string[] }

/** The player's reaction to a played Scene, or its clearing (null). */
export interface ReactionSet {
  kind: "reaction_set";
  scene: number;
  reaction: "more" | "less" | null;
  note: string | null;
}

export interface ReplyWritten {
  kind: "reply";
  text: string;
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
  dropped: string[];
  callId: string | null;
  model: ModelChoice | null;
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

/** The Folder gathered the oldest Scenes into a week, or the oldest weeks into a chapter. */
export interface StoryFolded {
  kind: "story_folded";
  into: "week" | "chapter";
  /** How many of the oldest Scene paragraphs, or weeks, it replaces. */
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
