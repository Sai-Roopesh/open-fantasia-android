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

/** The Scene being played: its title card and who is there besides the Player Character. */
export interface CurrentScene {
  number: number;
  title: string;
  place: string;
  at: string;
  who: string[];
  /** The entry that opened it; the Scene is every entry from here to the head. */
  openedBy: string;
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
}
