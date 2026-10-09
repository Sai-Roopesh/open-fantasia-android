import type { StoryFile } from "../protocol/generated/story-file.js";
import type { Beat, Landmark, ModelChoice, Person, Place, SceneCall, State } from "./state.js";
import type { Weekday } from "../time.js";

/**
 * What can be written to a Story's tree (docs/adr/0003). Each kind is something that happened; the State on a
 * Path is what all of them add up to, worked out by the reducer.
 */
export type Payload = StorySetUp | SceneOpened | MoveWritten | Redo | BeatNote | ReplyWritten | SceneClosed | FocusSet | LingerSet | TasteSet | KnownSet | PersonSet | LeadSet | GroupSet | PortraitSet | StoryEdit | Chronicle | WorldMoved | DirectorPlan | RecordGap;

/** The kinds written beside play, hanging off the Path and never on it (docs/adr/0007). */
export const RECORD_KINDS = ["chronicle", "world_moved", "director_plan", "record_gap"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/**
 * The edits to the Story, by the player or Claude: they move the head without anyone playing it, so neither the
 * Previously card nor Home counts them as play.
 */
export const EDIT_KINDS: ReadonlySet<string> = new Set([
  "taste_set", "known_set", "person_set", "lead_set", "group_set", "portrait_set",
  "premise_set", "style_set", "reply_length_set", "arcs_set", "landmark_set", "landmark_dropped", "place_set", "world_set", "clock_set"
] satisfies Payload["kind"][]);

/** A payload as any version may have stored it. */
export type StoredPayload = Exclude<Payload, BeatNote | Chronicle | WorldMoved>
  | (Omit<BeatNote, "inPlay" | "goes"> & Partial<Pick<BeatNote, "inPlay" | "goes">>)
  | (Omit<Chronicle, "sceneEnded"> & Partial<Pick<Chronicle, "sceneEnded">>)
  | (Omit<WorldMoved, "happenings"> & Partial<Pick<WorldMoved, "happenings">>);

/**
 * An entry as it reads now, however long ago it was written. Entries never change (docs/adr/0003), so a field added
 * later is filled here, the one place entries are read, as it would have been: a Beat Note from before Moments were
 * put in play has none in play, and one from before people could go has nobody going; a Chronicle from before open
 * Scenes had summaries recorded an ended Scene exactly when it had one; a World moved before Happenings offers none.
 */
export function readPayload(stored: StoredPayload): Payload {
  if (stored.kind === "beat_note") return { ...stored, inPlay: stored.inPlay ?? [], goes: stored.goes ?? [] };
  if (stored.kind === "chronicle") return { ...stored, sceneEnded: stored.sceneEnded ?? stored.summary !== null };
  if (stored.kind === "world_moved") return { ...stored, happenings: stored.happenings ?? [] };
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
  /** What the player chose at the Day View, when the Move is a choice: the Writer opens the Scene on it. */
  choice?: Choice;
}

/** A choice at the Day View, resolved against what it offered (openspec day-view: The player chooses where to be). */
export interface Choice {
  kind: "go" | "follow" | "somewhere" | "skip" | "story";
  /** Where the next Scene opens, when the choice says. */
  place: string | null;
  /** When the next Scene opens, when the choice says. */
  at: string | null;
  /** Who will be in it: the Happening's people, or the person followed. */
  who: string[];
}

/**
 * The player asked for the latest Reply again, with a Direction for the Writer or none. It is written under the
 * Move that Reply answered, so the old Reply leaves the Path and the new one is written after this.
 */
export interface Redo {
  kind: "redo";
  direction: string | null;
  remember: boolean;
  /** The model for just this Reply, when the player chose one (openspec scenes: Redo on another model). */
  model?: ModelChoice;
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

/** The player deleted a lesson: Taste on this Path is these lines from here on (openspec long-run). */
export interface TasteSet {
  kind: "taste_set";
  lines: string[];
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
  /** What the Player Character now knows of the people this Scene changed it for; absent from Chronicles before it was asked. */
  known?: KnownLine[];
  /** For each person whose standing with the Player Character this Scene changed: the turn, and where it stands now. */
  bonds?: BondLine[];
  /** The parts of the Chronicler's answer left out, and why (lasting-records); empty when it was right in every part. */
  dropped?: string[];
  callId: string;
  model: ModelChoice;
}

/**
 * A Scene whose record could not be made (lasting-records design decision 4): how many tries, why the last failed,
 * how many Scenes had ended on the Path when it did, and whether it was given up. Written beside the Path after each
 * failed try; a Retry writes one with no tries, which makes the Scene due again.
 */
export interface RecordGap {
  kind: "record_gap";
  scene: string;
  attempts: number;
  reason: string;
  endedScenes: number;
  givenUp: boolean;
}

/** What the Player Character knows of someone, as the Chronicler wrote it after a Scene they were in. */
export interface KnownLine {
  who: string;
  now: string;
}

/** A turn in someone's Bond with the Player Character, and where things stand after it (docs/adr/0009). */
export interface BondLine {
  who: string;
  standing: string;
  turn: string;
}

/** Where a person or Group is, what they are doing and what they are after: none of it set until the Weaver moves them. */
export interface Life {
  who: string;
  where: string | null;
  doing: string | null;
  after: string;
}

/** A situation developing in the World on its own, and where it stands. */
export interface ThreadNow {
  name: string;
  now: string;
}

/** Something that happened off-screen, and who knows it (the Player Character, once he does). */
export interface Happened {
  id: string;
  what: string;
  at: string;
  where: string;
  knownTo: string[];
  /** The Landmark it is, when it is one. */
  landmark: string | null;
}

/** What the Player Character learned while elsewhere, and how: one line of the Day View's Meanwhile. */
export interface MeanwhileItem {
  text: string;
  how: "seen" | "told" | "rumour";
  /** The id of what happened that it tells of. */
  happened: string;
  /** Who told him, for what he was told. */
  toldBy: string | null;
  /** Who the line is about; absent from lines woven before it was asked, which are about whoever they name. */
  about?: string[];
}

/** Something going on that the Player Character could go to (openspec day-view: Up to four Happenings). */
export interface Happening {
  id: string;
  at: string;
  place: string;
  what: string;
  who: string[];
  /** He is expected there, and knows it. */
  expected: boolean;
  /** The Story's own pick. */
  pick: boolean;
  /** Nothing is at stake in it, as the Weaver judged; absent from Happenings woven before it was asked. */
  quiet?: boolean;
}

/**
 * The Weaver's record: the World moved on from [from] to [until] after a Scene ended. It hangs off the Scene's last
 * entry and never extends the Path (docs/adr/0007); the World is worked out beside the Path (story/world.ts).
 */
export interface WorldMoved {
  kind: "world_moved";
  /** The opening entry of the Scene whose end it moved the World on from. */
  scene: string;
  from: string;
  until: string;
  /** Only the Lives and Threads it moved; everything else stays where it was. */
  lives: Life[];
  threads: ThreadNow[];
  happened: Happened[];
  meanwhile: MeanwhileItem[];
  /** What is on from [until] on, the Story's pick first. */
  happenings: Happening[];
  /** The parts of the Weaver's answer left out, and why (lasting-records); empty when it was right in every part. */
  dropped?: string[];
  callId: string;
  model: ModelChoice;
}

/** One Arc as the Director plans it for a stretch: where it stands, the one step it may take, and what is too far. */
export interface ArcStep {
  arc: string;
  now: string;
  next: string;
  not_yet: string;
}

/**
 * The Director's plan for the next stretch of the Story (openspec long-run: The Director shapes the long run). It
 * hangs off the entry that closed the Scene it followed (docs/adr/0007); the newest one on a Path is its plan, and has
 * run its course once [scenes] Scenes have closed since.
 */
export interface DirectorPlan {
  kind: "director_plan";
  /** What the stretch builds toward, in the Story's words: "the flying test on Wednesday". */
  toward: string;
  /** The Landmark it builds toward, when it is one. */
  landmark: string | null;
  phase: "build" | "peak" | "rest";
  /** How many Scenes the stretch should take. */
  scenes: number;
  arcs: ArcStep[];
  /** How the Premise comes into the stretch: which kinds of Scene serve it, and which leave it alone. */
  premise: string;
  /** The parts of the Director's answer left out, and why (lasting-records); empty when it was right in every part. */
  dropped?: string[];
  callId: string;
  model: ModelChoice;
}

/**
 * What the Player Character knows of someone, set on a Story already being played (`fantasia known`; openspec
 * outside-the-scene: The World screen shows what the Player Character knows). On the Path, like any change the player
 * can make.
 */
export interface KnownSet {
  kind: "known_set";
  person: string;
  text: string;
}

/**
 * The player's, or Claude's, edits to the Story's people (openspec stories: Anything can be edited or created in the
 * app). On the Path, from that moment onward; nothing in the Story writes them, so Leads and Groups stay the player's.
 */
export interface PersonSet {
  kind: "person_set";
  /** The person whole, created or replaced; a Portrait already theirs is kept. */
  person: Omit<Person, "portrait">;
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
  /** The file in the Story's Portraits on the Mac. */
  file: string;
}

/**
 * The player's, or Claude's, edits to the rest of the Story (openspec stories: Anything can be edited or created in
 * the app; editing-the-story design decision 1). On the Path, from that moment onward, like the edits to its people.
 */
export type StoryEdit = PremiseSet | StyleSet | ReplyLengthSet | ArcsSet | LandmarkSet | LandmarkDropped | PlaceSet | WorldSet | ClockSet;

export interface PremiseSet {
  kind: "premise_set";
  premise: string;
}

export interface StyleSet {
  kind: "style_set";
  style: string;
}

export interface ReplyLengthSet {
  kind: "reply_length_set";
  length: State["replyLength"];
}

/** The Arcs whole: an Arc has no name of its own, so adding, rewording and dropping are each a new list. */
export interface ArcsSet {
  kind: "arcs_set";
  arcs: string[];
}

/** A Landmark created, moved or rewritten, by its name. */
export interface LandmarkSet {
  kind: "landmark_set";
  landmark: Landmark;
}

export interface LandmarkDropped {
  kind: "landmark_dropped";
  name: string;
}

/** A place or an institution created or rewritten, by its name. */
export interface PlaceSet {
  kind: "place_set";
  place: Place;
  institution: boolean;
}

/** What the World is, and its history. */
export interface WorldSet {
  kind: "world_set";
  summary: string;
  history: string;
}

/** The clock moved on, never back, and which weekday Day 1 was. */
export interface ClockSet {
  kind: "clock_set";
  clock: string;
  dayOneWeekday: Weekday | null;
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
