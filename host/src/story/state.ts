
/** Which model does a job: the provider and the id it lists the model under. */
export interface ModelChoice {
  provider: "claude" | "codex" | "antigravity";
  model: string;
  effort?: string;
}

export interface Person {
  name: string;
  aliases: string[];
  whoTheyAre: string;
  /** What the Player Character knows of them as the Story File set it; the Chronicler's line, once there is one, is in `known`. */
  known: string | null;
  appearance: string;
  after: string;
  /** What they knew when the Story began, beyond their own backstory. */
  knows: string[];
  /** Lines they have said, in their own words. */
  voice: string[];
  /** The stored Portrait's file name, or null. */
  portrait: string | null;
  group: string | null;
  /** The Stretch that brought them in, for someone the Director brought into the Story; null for the Story File's. */
  broughtIn: number | null;
}

export interface Place {
  name: string;
  description: string;
}

export interface Landmark {
  name: string;
  at: string;
  what: string;
}

export type BeatStatus = "done" | "in_play" | "pending" | "skipped";

export interface Beat {
  text: string;
  status: BeatStatus;
}

/** What the Writer says the next Reply does with the Scene: go on, bring it to its turn, or close it. */
export type SceneCall = "continue" | "land" | "end";

/** The steps of a Scene's end, in order (docs/adr/0016). */
export const SCENE_END_STEPS = ["chronicler", "director", "weaver", "folder"] as const;
export type SceneEndStep = (typeof SCENE_END_STEPS)[number];

/** The Scene being played, or the last one played when it has closed. */
export interface CurrentScene {
  number: number;
  title: string;
  place: string;
  at: string;
  here: string[];
  /** Everyone who was in it at any point. */
  met: string[];
  openedBy: string;
  startsAt: string;
  purpose: string | null;
  exit: string | null;
  beats: Beat[];
  note: string | null;
  call: SceneCall | null;
  intensity: number | null;
  /** The highest intensity any Reply in it was given: the Scene's own, for the pacing curve. */
  peak: number;
  inPlay: string[];
  goes: string[];
  beatInPlayFor: number;
  withoutArc: number;
  focus: string | null;
  linger: boolean;
  closed: "story" | "player" | "move" | null;
  endedAt: string | null;
  /** The steps of its end already done, once it has closed. */
  ended: SceneEndStep[];
}

export interface PendingDirection {
  text: string | null;
  remember: boolean;
}

/** Words taken exactly from one entry. */
export interface Quote {
  entry: string;
  text: string;
}

/**
 * Something that happened, and who knows it (docs/adr/0015): on the page, recorded by the Chronicler with its words,
 * or off it, by the Weaver. The Player Character knows it when his name is among `knownTo`.
 */
export interface Fact {
  id: string;
  what: string;
  at: string;
  where: string | null;
  knownTo: string[];
  source: "page" | "world";
  /** The Scene it happened in, or the Scene whose end the World moved on from. */
  scene: number;
  quotes: Quote[];
  /** How much it matters, 1 to 5. */
  weight: number;
  landmark: string | null;
  /** The Lead whose off-screen move it is. */
  move: string | null;
}

/** What reached the Player Character while he was elsewhere: one line of Meanwhile. */
export interface Meanwhile {
  text: string;
  how: "seen" | "told" | "rumour";
  fact: string;
  toldBy: string | null;
  about: string[];
  /** The Scene whose end, or whose Gap, it came in. */
  scene: number;
  gap: boolean;
}

export interface Life {
  where: string | null;
  doing: string | null;
  after: string;
}

export interface Thread {
  name: string;
  now: string;
}

export interface BondTurn {
  text: string;
  scene: { number: number; title: string } | null;
}

export interface Bond {
  standing: string;
  turns: BondTurn[];
}

/** What the Player Character knows of someone, and the Scene that last told him. */
export interface Known {
  text: string;
  from: { number: number; title: string } | null;
}

/** Something the Player Character knows is on at a time and place (docs/adr/0011). */
export interface Engagement {
  id: string;
  what: string;
  at: string;
  place: string;
  who: string[];
  expected: boolean;
  every: "week" | null;
  quotes: Quote[];
}

/** Something going on that he could go to, as the World has it: not the Story's pick, which is the plan's. */
export interface On {
  id: string;
  at: string;
  place: string;
  what: string;
  who: string[];
}

export interface PlannedScene {
  id: string;
  at: string;
  place: string;
  who: string[];
  /** What it is for, author to author: the Writer's, never shown. */
  for: string;
  /** What the player is offered, in the World's words, without the plan's: the Day View's line. */
  offer: string;
  /** The Scene in a line, for Backstage. */
  headline: string;
  lead: string | null;
  engagement: string | null;
  quiet: boolean;
}

export interface LeadMove {
  who: string;
  move: string;
  scene: string | null;
}

export interface ArcStep {
  arc: string;
  now: string;
  next: string;
  notYet: string;
}

export interface RoadmapPoint {
  arc: string;
  by: string;
  stands: string;
}

export interface NewThing {
  kind: "person" | "secret" | "threat" | "mystery" | "place";
  what: string;
  scene: string | null;
  person: string | null;
}

/** The Director's plan for a Stretch, numbered on the Path. */
export interface Plan {
  number: number;
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
  /** The Scene whose end it was planned after. */
  afterScene: number;
}

/** One part of The Story So Far: a Scene's paragraph, a week's recap or a chapter. */
export interface Told {
  from: string;
  until: string;
  text: string;
  /** The Scene's number and title, for a Scene's paragraph. */
  scene: { number: number; title: string } | null;
  /** Who was there besides him, for a Scene's paragraph: the Actor is given only what the people present lived. */
  who: string[];
}

export interface StorySoFar {
  chapters: Told[];
  weeks: Told[];
  scenes: Told[];
}

export interface Reaction {
  scene: number;
  title: string;
  reaction: "more" | "less";
  note: string | null;
}

/** A Scene the Chronicler recorded: its line for the Journal, and what was left out of its record. */
export interface Recorded {
  number: number;
  title: string;
  summary: string;
  dropped: string[];
}

/**
 * Everything true on a Path at one entry: the Story as set up and edited, and the World as play, the record and the
 * World's moves have left it (docs/adr/0015). Worked out from the entries alone, and cached; the entries are the truth.
 */
export interface State {
  title: string;
  premise: string;
  style: string;
  replyLength: "short" | "medium" | "full";
  actor: ModelChoice;
  /** The date of Day 1, "YYYY-MM-DD", when the Story has a calendar (openspec stories: Story time is told as dates). */
  dayOne: string | null;
  clock: string;
  /**
   * Where the World stands: the time it was last moved on to, or the Story's start before that. The clock moved on
   * by hand leaves it behind, and the World catches up from here when it next moves.
   */
  worldAt: string;
  world: { summary: string; history: string; places: Place[]; institutions: Place[] };
  routine: string[];
  brief: { more: string[]; less: string[] };
  people: Record<string, Person>;
  groups: Place[];
  leads: string[];
  playerCharacter: string;
  arcs: string[];
  landmarks: Landmark[];
  threads: Thread[];
  lives: Record<string, Life>;
  facts: Fact[];
  meanwhile: Meanwhile[];
  bonds: Record<string, Bond>;
  known: Record<string, Known>;
  calendar: Engagement[];
  /** What is on, as the World last moved on; past items are left out when read. */
  on: On[];
  plan: Plan | null;
  /** The Scenes that mattered in the plans before this one, newest last, at most three plans. */
  recentPlans: PlannedScene[][];
  storySoFar: StorySoFar;
  /** Each played Scene's own intensity, in order. */
  curve: { scene: number; title: string; peak: number }[];
  reactions: Reaction[];
  recorded: Recorded[];
  /** The Engagements kept, as "id@at", by a choice for them. */
  kept: string[];
  /** The plan's Scenes that matter the player chose, by id. */
  played: string[];
  /** Everything the Stretches brought that was new, oldest first. */
  introduced: { stretch: number; kind: string; what: string }[];
  scene: CurrentScene | null;
  scenesPlayed: number;
  taste: string[];
  directions: string[];
  pendingDirection: PendingDirection | null;
}
