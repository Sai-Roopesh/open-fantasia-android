import type { StoryFile } from "../protocol/generated/story-file.js";
import type { Weekday } from "../time.js";
import type { Entry, SceneOpened, StorySetUp } from "./entries.js";
import type { ModelChoice, Person, State } from "./state.js";

/** The Actor a Story uses when its Story File names none: the model that wrote the first Story best. */
export const DEFAULT_ACTOR: ModelChoice = { provider: "claude", model: "claude-opus-5-5" };

/**
 * What one entry does to the State. Pure: the same State and entry always give the same result, which is what
 * lets the store cache States and throw them away (docs/adr/0003). A Story's first entry is always its setup.
 */
export function apply(state: State | null, entry: Entry): State {
  const payload = entry.payload;
  if (state === null) {
    if (payload.kind !== "story_set_up") throw new Error(`A Story begins with its setup, not with a ${payload.kind}`);
    return setUp(payload);
  }
  switch (payload.kind) {
    case "story_set_up":
      throw new Error("A Story is set up once, by its first entry");
    case "scene_opened":
      return openScene(state, payload, entry.id);
    case "move":
    case "reply":
      // A Move and a Reply change the Story through what they say; the agents that record it (the Chronicler, the
      // Weaver) arrive in later changes. For now they only lengthen the Scene, which is read from the Path.
      return state;
  }
}

function setUp({ storyFile, portraits }: StorySetUp): State {
  const file: StoryFile = storyFile;
  const people: Record<string, Person> = {};
  for (const person of file.people) {
    people[person.name] = {
      name: person.name,
      aliases: person.aliases ?? [],
      whoTheyAre: person.who_they_are,
      appearance: person.appearance ?? "",
      after: person.after ?? "",
      knows: person.knows ?? [],
      voice: person.voice ?? [],
      portrait: portraits[person.name] ?? null,
      group: person.group ?? null
    };
  }
  return {
    title: file.title,
    premise: file.premise,
    style: file.style,
    replyLength: file.reply_length ?? "full",
    actor: file.actor ? withoutUndefined(file.actor) : DEFAULT_ACTOR,
    dayOneWeekday: (file.clock?.day_one_weekday ?? null) as Weekday | null,
    clock: file.clock?.starts ?? file.opening.at,
    world: {
      summary: file.world?.summary ?? "",
      history: file.world?.history ?? "",
      places: (file.world?.places ?? []).map(place => ({ name: place.name, description: place.description ?? "" })),
      institutions: (file.world?.institutions ?? []).map(place => ({ name: place.name, description: place.description ?? "" }))
    },
    people,
    groups: (file.groups ?? []).map(group => ({ name: group.name, description: group.description ?? "" })),
    leads: file.leads ?? [],
    playerCharacter: file.player_character,
    arcs: file.arcs ?? [],
    landmarks: (file.landmarks ?? []).map(landmark => ({ name: landmark.name, at: landmark.at, what: landmark.what })),
    scene: null,
    scenesPlayed: 0
  };
}

function openScene(state: State, scene: SceneOpened, entryId: string): State {
  return {
    ...state,
    clock: scene.at,
    scene: { number: scene.number, title: scene.title, place: scene.place, at: scene.at, who: scene.who, openedBy: entryId },
    scenesPlayed: state.scenesPlayed + (state.scene ? 1 : 0)
  };
}

function withoutUndefined(choice: { provider: ModelChoice["provider"]; model: string; effort?: string | undefined }): ModelChoice {
  return choice.effort === undefined ? { provider: choice.provider, model: choice.model } : { provider: choice.provider, model: choice.model, effort: choice.effort };
}
