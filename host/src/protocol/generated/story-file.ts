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
  opening: OpeningSetup;
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
  day_one_weekday?: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
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
