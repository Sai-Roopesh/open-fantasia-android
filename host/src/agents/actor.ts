import type { Entry } from "../story/entries.js";
import type { ModelChoice, Person, State } from "../story/state.js";
import { parseStoryTime, sayDay, sayTime, type StoryTime, type Weekday } from "../time.js";
import type { ModelAnswer, Models } from "../models/model-call.js";
import { NOTHING_RECALLED, sayBetween, sayWords, type Recall } from "./recall.js";
import { lifeOf, NO_WORLD, type World } from "../story/world.js";
import type { Life } from "../story/entries.js";

/** What the Actor is sent for one Reply. */
export interface ActorPrompt {
  /** The same for every Reply in a Scene, so Claude's prompt cache hits (docs/adr/0005). */
  system: string;
  /** The Scene so far and the Move to answer. */
  prompt: string;
}

const LENGTH = {
  short: "Keep each Reply short: one or two brief paragraphs.",
  medium: "Keep each Reply to three or four paragraphs.",
  full: "Let each Reply run as long as the moment needs, up to about six hundred words."
} as const;

/**
 * The Actor plays everyone in a Scene and writes the Replies (CONTEXT.md). It reads only what the moment needs
 * and what the people in the Scene could know (openspec living-world: Characters know only what they could know).
 * It is never given the Premise or the Arcs: a Reply told what the player came for performs it at them, and
 * steering the Story belongs to the Writer and the Director.
 */
export function actorPrompt(state: State, scene: Entry[], recall: Recall = NOTHING_RECALLED, world: World = NO_WORLD): ActorPrompt {
  if (!state.scene) throw new Error("The Actor writes inside a Scene, and none is open");
  const pc = state.playerCharacter;
  const here = state.scene.here.map(name => state.people[name]).filter((person): person is Person => person !== undefined);
  const at = parseStoryTime(state.scene.at);

  const system = [
    `You are writing a story together with a player. The player writes ${pc}; you write everyone and everything else.`,
    "",
    `Whatever ${pc}'s Move says has happened, even when it has someone else act, time pass or the place change. Carry on from its effect; do not retell it.`,
    `Never decide what ${pc} says, chooses, does on purpose, thinks or feels. The people here may see ${pc} and say how ${pc} looks to them. Stop where it is ${pc}'s turn.`,
    `The people here remember of ${pc} only what the scene so far and remembered show, and their own past: they never recall anything else he said, chose or did on purpose.`,
    `Tell nothing from inside ${pc}: what can be seen of him, never what he sees, notices or feels.`,
    `What ${pc} thinks without saying it stays inside ${pc}. The people here hear only what was said aloud and see only what was done where they could see it.`,
    "Each person knows their own past, what they have lived through in this story, and what they have been told or have seen; nothing else.",
    `What the people here remember from before this scene is under remembered, in the words that were said and done; each moment says who of them knows it, and nobody else here does. What ${pc} said and did in it is only what his own moves say.`,
    `Where things stand between ${pc} and each person here is under between, with the latest turns: they lived it too, and act from where it stands.`,
    "The people here want things and act on them without being asked. They are as kind or as cruel as they are; nobody softens to make things easier.",
    "Write prose only, with no headings, notes or lists.",
    LENGTH[state.replyLength],
    "",
    section("style", state.style),
    section("world", [state.world.summary, state.world.history].filter(Boolean).join("\n\n")),
    section(`player_character name="${pc}"`, describe(state.people[pc], { withVoice: false })),
    section("people_here", here.map(person => section(`person name="${person.name}"`, describe(person, { withVoice: true, life: lifeOf(world, person) }))).join("\n\n") || "Nobody besides " + pc + "."),
    section("scene", `${state.scene.title}. ${state.scene.place}, ${at ? sayDayAndTime(at, state.dayOneWeekday) : state.scene.at}.`),
    // Where things stand between him and each person here: what passed in front of them both, so they lived it too.
    section("between", sayBetween(recall.between)),
    // Only the Moments someone here knows: the summaries and the end of the last Scene are not sorted by who knows them,
    // so they go to the Writer alone (docs/adr/0004: the Actor sees what the people in the Scene know).
    section("remembered", recall.moments.map(moment => section(`moment scene="${moment.scene}" known_to="${moment.knownTo.join(", ")}"`, sayWords(moment.words))).join("\n\n")),
    // What happened elsewhere lately that someone here lived through or was told; nobody else here knows it.
    section("lately", recall.lately.map(item => section(`happened known_to="${item.knownTo.join(", ")}"`, item.what)).join("\n\n"))
  ].filter(part => part !== null).join("\n");

  return { system, prompt: scenePrompt(state, scene, pc, recall) };
}

/** What the Writer's call means for the Reply the Actor is writing. */
const CALL = {
  continue: null,
  land: "Bring the Scene toward its turn.",
  end: "This Reply closes the Scene on this moment. End on someone else's closing moment, never one of "
} as const;

/**
 * The Scene so far, the Move to answer, and what changes Reply by Reply: the time, the Beat Note, what the call
 * means, Focus, Linger and Taste. They come after the Move so the system prompt stays the same through a Scene. The
 * Writer's beats, purpose and exit never reach the Actor: a Reply told where the Scene is going performs it.
 */
function scenePrompt(state: State, scene: Entry[], pc: string, recall: Recall): string {
  const moveAt = scene.findLastIndex(entry => entry.payload.kind === "move");
  const latest = scene[moveAt];
  if (latest?.payload.kind !== "move") throw new Error("The Actor answers a Move, and the Scene has none to answer");
  const before = scene.slice(0, moveAt).flatMap(entry => {
    switch (entry.payload.kind) {
      case "scene_opened": return entry.payload.prose ? [entry.payload.prose] : [];
      case "move": return [section(`move by="${pc}"`, entry.payload.text)];
      case "reply": return [entry.payload.text];
      default: return [];
    }
  });
  const current = state.scene;
  const now = parseStoryTime(state.clock);
  const call = current?.call ? CALL[current.call] : null;
  const thisReply = [
    `It is ${now ? sayDayAndTime(now, state.dayOneWeekday) : state.clock}.`,
    current?.note ? `What happens next: ${current.note}` : "",
    call ? (current?.call === "end" ? `${call}${pc}'s.` : call) : "",
    current?.focus ? `Stay close beside ${current.focus}: mostly their words, actions and thoughts. Nobody new comes in unless the Move brings them.` : "",
    current?.linger ? "Force nothing. Let the moment breathe, and answer only what the Move does." : ""
  ].filter(Boolean).join("\n");
  // The last thing read weighs most, so the line the Actor most often crosses is said again here, at the end:
  // left to itself it decides for the Player Character, or gives them a past the player never wrote.
  return [
    section("scene_so_far", before.join("\n\n")),
    section(`move by="${pc}"`, latest.payload.text),
    section("this_reply", thisReply),
    section("taste", state.taste.map(line => `- ${line}`).join("\n")),
    // The memories the Writer put in play, again in their own words and last, where they weigh most: a Reply drawing on
    // the past keeps to what happened instead of filling the gaps itself.
    section("in_play", recall.moments.filter(moment => current?.inPlay.includes(moment.id))
      .map(moment => section(`moment scene="${moment.scene}" known_to="${moment.knownTo.join(", ")}"`, sayWords(moment.words))).join("\n\n")),
    `Write what happens next. What ${pc} says, chooses, thinks and feels belongs to the player, now and in anything the story has not shown; what he did before is only what the scene and remembered show, as they show it. Leave the rest out: nobody here remembers anything else of him, and nothing is told from inside him.`
  ].filter(part => part !== null).join("\n\n");
}

function describe(person: Person | undefined, { withVoice, life = null }: { withVoice: boolean; life?: Life | null }): string {
  if (!person) return "";
  // Their own Life is theirs to know: where they have been and what they are after now (openspec living-world).
  const after = life?.after || person.after;
  return [
    person.aliases.length ? `Also called ${person.aliases.join(", ")}.` : "",
    person.whoTheyAre,
    person.appearance,
    life?.where || life?.doing ? `Lately: ${[life.where, life.doing].filter(Boolean).join("; ")}.` : "",
    after ? `After: ${after}` : "",
    person.knows.length ? `Knows: ${person.knows.join(" ")}` : "",
    withVoice && person.voice.length ? `Has said: ${person.voice.map(line => `"${line}"`).join(" ")}` : ""
  ].filter(Boolean).join("\n");
}

/** A Story time in the Actor's words: "Friday, 9:40 pm". */
function sayDayAndTime(time: StoryTime, dayOneWeekday: Weekday | null): string {
  return `${sayDay(time, dayOneWeekday)}, ${sayTime(time)}`;
}

function section(tag: string, body: string): string | null {
  if (!body.trim()) return null;
  const name = tag.split(" ")[0];
  return `<${tag}>\n${body.trim()}\n</${name}>`;
}

/** Writes the Reply to the Scene's latest Move, streaming its words through [onText]. */
export function writeReply(models: Models, state: State, scene: Entry[], recall: Recall, world: World, storyId: string, traceId: string, onText: (delta: string) => void, signal: AbortSignal, model: ModelChoice = state.actor): Promise<ModelAnswer> {
  const { system, prompt } = actorPrompt(state, scene, recall, world);
  return models.call({ agent: "actor", model, system, prompt, traceId, storyId }, onText, signal);
}
