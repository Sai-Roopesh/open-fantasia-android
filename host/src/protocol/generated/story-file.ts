/* Generated from protocol/schemas by protocol/generate.mjs. Do not edit; change the schema and regenerate. */

/**
 * A moment on the Story Clock, written "Day N HH:MM".
 *
 * This interface was referenced by `StoryFile`'s JSON-Schema
 * via the `definition` "StoryTime".
 */
export type StoryTime = string;

/**
 * The setup document of a Story File (openspec/specs/story-file): story.yaml in a folder beside the Portrait images it names. People are referred to by name everywhere.
 */
export interface StoryFile {
  /**
   * The Story File format version this document was written for.
   */
  format: number;
  title: string;
  /**
   * What the player came to experience, in a line or two.
   */
  premise: string;
  /**
   * How the Story is written, in the player's own words.
   */
  style: string;
  reply_length?: "short" | "medium" | "full";
  actor?: ModelChoice;
  clock?: ClockSetup;
  world?: WorldSetup;
  /**
   * How the World works from the start, a line each (openspec story-file: Rules to start from).
   */
  rules?: string[];
  /**
   * @minItems 1
   */
  people: [PersonSetup, ...PersonSetup[]];
  groups?: GroupSetup[];
  /**
   * Names of the Leads.
   */
  leads?: string[];
  /**
   * The name of the person the player plays.
   */
  player_character: string;
  arcs?: string[];
  landmarks?: LandmarkSetup[];
  /**
   * Situations developing in the World on their own, each with where it stands when the Story begins.
   */
  threads?: ThreadSetup[];
  opening: OpeningSetup;
  /**
   * The Story's daily routine, a line each: when lectures, meals and the like are, for the Director and the World to build on and break.
   */
  routine?: string[];
  /**
   * What the player wants more of and less of in the Story; the Director plans every Stretch from it.
   */
  brief?: {
    more?: string[];
    less?: string[];
  };
}
/**
 * This interface was referenced by `StoryFile`'s JSON-Schema
 * via the `definition` "ModelChoice".
 */
export interface ModelChoice {
  provider: "claude" | "codex" | "antigravity";
  /**
   * The id the provider lists the model under.
   */
  model: string;
  effort?: string;
}
/**
 * This interface was referenced by `StoryFile`'s JSON-Schema
 * via the `definition` "ClockSetup".
 */
export interface ClockSetup {
  starts: StoryTime;
  /**
   * The date of the Story's first day, Day 1, as YYYY-MM-DD: every day after it is a date, and its weekday follows.
   */
  day_one?: string;
}
/**
 * This interface was referenced by `StoryFile`'s JSON-Schema
 * via the `definition` "WorldSetup".
 */
export interface WorldSetup {
  /**
   * What the World is, in a paragraph.
   */
  summary?: string;
  history?: string;
  places?: PlaceSetup[];
  institutions?: InstitutionSetup[];
}
/**
 * This interface was referenced by `StoryFile`'s JSON-Schema
 * via the `definition` "PlaceSetup".
 */
export interface PlaceSetup {
  name: string;
  description?: string;
}
/**
 * This interface was referenced by `StoryFile`'s JSON-Schema
 * via the `definition` "InstitutionSetup".
 */
export interface InstitutionSetup {
  name: string;
  description?: string;
}
/**
 * This interface was referenced by `StoryFile`'s JSON-Schema
 * via the `definition` "PersonSetup".
 */
export interface PersonSetup {
  name: string;
  /**
   * Other names they answer to.
   */
  aliases?: string[];
  /**
   * Who they are and the backstory they come with.
   */
  who_they_are: string;
  /**
   * What the Player Character knows of them when the Story begins: what he, not the Story, would say of them. Who they are may hold what nobody knows; this never does.
   */
  known?: string;
  /**
   * Where things stand between them and the Player Character when the Story begins, when they already have history: as he has seen it, in forty words or fewer. Never for the Player Character himself.
   */
  bond?: string;
  appearance?: string;
  /**
   * What they are after.
   */
  after?: string;
  /**
   * What they know when the Story begins, beyond their own backstory.
   */
  knows?: string[];
  /**
   * Lines they have said, in their own words.
   */
  voice?: string[];
  /**
   * The Portrait image's path within the Story File's folder.
   */
  portrait?: string;
  /**
   * The name of the Group they are in, if any.
   */
  group?: string;
}
/**
 * This interface was referenced by `StoryFile`'s JSON-Schema
 * via the `definition` "GroupSetup".
 */
export interface GroupSetup {
  name: string;
  description?: string;
}
/**
 * This interface was referenced by `StoryFile`'s JSON-Schema
 * via the `definition` "LandmarkSetup".
 */
export interface LandmarkSetup {
  name: string;
  at: StoryTime;
  what: string;
}
/**
 * This interface was referenced by `StoryFile`'s JSON-Schema
 * via the `definition` "ThreadSetup".
 */
export interface ThreadSetup {
  name: string;
  /**
   * Where it stands.
   */
  now: string;
}
/**
 * This interface was referenced by `StoryFile`'s JSON-Schema
 * via the `definition` "OpeningSetup".
 */
export interface OpeningSetup {
  title: string;
  place: string;
  at: StoryTime;
  /**
   * The names of everyone there besides the Player Character.
   */
  who: string[];
  /**
   * How the Scene opens, ending where the Player Character would act.
   */
  prose: string;
}
