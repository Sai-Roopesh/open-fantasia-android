import type { StoryFile } from "../protocol/generated/story-file.js";
import type { Weekday } from "../time.js";
import type { BeatNote, Entry, SceneOpened, StorySetUp } from "./entries.js";
import type { Beat, CurrentScene, ModelChoice, Person, State } from "./state.js";

/** How many lines of Taste a Story keeps (openspec long-run: Taste is short, readable and the player's). */
export const TASTE_LINES = 10;
/** How many earlier Directions the Writer is shown, to tell when one recurs. */
const DIRECTIONS_KEPT = 10;

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
    case "beat_note":
      return { ...state, clock: payload.clock, scene: followScene(inScene(state), payload), taste: payload.taste ? [...state.taste, payload.taste].slice(-TASTE_LINES) : state.taste, pendingDirection: null };
    case "redo":
      return { ...state, pendingDirection: { text: payload.direction, remember: payload.remember }, directions: payload.direction ? [...state.directions, payload.direction].slice(-DIRECTIONS_KEPT) : state.directions };
    case "scene_closed":
      return { ...state, scene: { ...inScene(state), closed: payload.by, focus: null, linger: false } };
    case "focus_set":
      return { ...state, scene: { ...inScene(state), focus: payload.on } };
    case "linger_set":
      return { ...state, scene: { ...inScene(state), linger: payload.on } };
    case "chronicle":
      // A Chronicle hangs off the Path and is never walked (docs/adr/0007); recall reads it beside the Path.
      return state;
    case "move":
    case "reply":
      // A Move and a Reply change the Story through what they say; the agents that record it (the Chronicler, the
      // Weaver) arrive in later changes. For now they only lengthen the Scene, which is read from the Path.
      return state;
  }
}

function inScene(state: State): CurrentScene {
  if (!state.scene) throw new Error("No Scene has opened in this Story");
  return state.scene;
}

const inPlayIndex = (beats: Beat[]) => beats.findIndex(beat => beat.status === "in_play");

/**
 * The Scene after the Writer's step. The two counts are worked out here, from the Beat Notes on the Path, so a Redo
 * or a Rewind counts right with nothing kept anywhere else.
 */
function followScene(scene: CurrentScene, note: BeatNote): CurrentScene {
  const inPlay = inPlayIndex(note.beats);
  const sameBeat = inPlay >= 0 && scene.beats.length > 0 && inPlay === inPlayIndex(scene.beats);
  return {
    ...scene,
    purpose: note.plan?.purpose ?? scene.purpose,
    exit: note.plan?.exit ?? scene.exit,
    here: note.here,
    beats: note.beats,
    note: note.note,
    inPlay: note.inPlay,
    call: note.call,
    intensity: note.intensity,
    beatInPlayFor: inPlay < 0 ? 0 : sameBeat ? scene.beatInPlayFor + 1 : 1,
    withoutArc: note.arcMoved ? 0 : scene.withoutArc + 1
  };
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
    scenesPlayed: 0,
    taste: [],
    directions: [],
    pendingDirection: null
  };
}

/** A Scene that opens with exactly one other person starts focused on them (openspec scenes: Focus). */
function openScene(state: State, scene: SceneOpened, entryId: string): State {
  return {
    ...state,
    clock: scene.at,
    scene: {
      number: scene.number,
      title: scene.title,
      place: scene.place,
      at: scene.at,
      here: scene.who,
      openedBy: entryId,
      startsAt: scene.startsAt ?? entryId,
      purpose: scene.purpose,
      exit: scene.exit,
      beats: [],
      note: null,
      inPlay: [],
      call: null,
      intensity: null,
      beatInPlayFor: 0,
      withoutArc: 0,
      focus: scene.who.length === 1 ? scene.who[0] ?? null : null,
      linger: false,
      closed: null
    },
    scenesPlayed: state.scenesPlayed + (state.scene ? 1 : 0)
  };
}

function withoutUndefined(choice: { provider: ModelChoice["provider"]; model: string; effort?: string | undefined }): ModelChoice {
  return choice.effort === undefined ? { provider: choice.provider, model: choice.model } : { provider: choice.provider, model: choice.model, effort: choice.effort };
}
