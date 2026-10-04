import type { Weekday } from "../time.js";

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
  appearance: string;
  after: string;
  /** What they knew when the Story began, beyond their own backstory. */
  knows: string[];
  /** Lines they have said, in their own words. */
  voice: string[];
  /** The stored Portrait's file name, or null. */
  portrait: string | null;
  group: string | null;
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

/** One thing that happens on the way to a Scene's purpose, as the Writer last judged it. */
export interface Beat {
  text: string;
  status: BeatStatus;
}

/** What the Writer says the next Reply does with the Scene: go on, bring it to its turn, or close it. */
export type SceneCall = "continue" | "land" | "end";

/**
 * The Scene being played, or the last one played when it has closed: its title card, who is there besides the
 * Player Character, the Writer's plan for it, and the player's Focus and Linger.
 */
export interface CurrentScene {
  number: number;
  title: string;
  place: string;
  /** When the Scene began. */
  at: string;
  /** Who is in the Scene now besides the Player Character. */
  here: string[];
  /** The entry that opened it. */
  openedBy: string;
  /** Where the Scene's entries begin: the Move that opened it, or the opening itself. */
  startsAt: string;
  /** What should change by its end, and what ending looks like; null until the Writer plans it. */
  purpose: string | null;
  exit: string | null;
  beats: Beat[];
  /** The latest Beat Note and call, which the next Reply plays. */
  note: string | null;
  call: SceneCall | null;
  intensity: number | null;
  /** How many Beat Notes in a row have had the same beat in play. */
  beatInPlayFor: number;
  /** How many Beat Notes in a row have judged that no Arc moved. */
  withoutArc: number;
  focus: string | null;
  linger: boolean;
  /** Who closed the Scene, once it has closed. A Scene left by a Move is simply followed by the next. */
  closed: "story" | "player" | null;
}

/** A Redo waiting for its Reply: what the player asked of the Writer, if anything. */
export interface PendingDirection {
  text: string | null;
  remember: boolean;
}

/**
 * Everything true on a Path at one entry, as the reducer works it out. It is never stored as the truth, only
 * cached; the entries are the truth.
 */
export interface State {
  title: string;
  premise: string;
  style: string;
  replyLength: "short" | "medium" | "full";
  actor: ModelChoice;
  dayOneWeekday: Weekday | null;
  clock: string;
  world: { summary: string; history: string; places: Place[]; institutions: Place[] };
  people: Record<string, Person>;
  groups: Place[];
  leads: string[];
  playerCharacter: string;
  arcs: string[];
  landmarks: Landmark[];
  scene: CurrentScene | null;
  scenesPlayed: number;
  /** Lasting lessons from the player's Directions, oldest first, at most ten (openspec long-run: Taste). */
  taste: string[];
  /** The Directions given on this Path, oldest first, so the Writer can tell when one recurs. */
  directions: string[];
  /** The Direction of a Redo whose Reply is still to be written. */
  pendingDirection: PendingDirection | null;
}
