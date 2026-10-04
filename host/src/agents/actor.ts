import type { Entry } from "../story/entries.js";
import type { Person, State } from "../story/state.js";
import { parseStoryTime, sayStoryTime } from "../time.js";
import type { ModelAnswer, Models } from "../models/model-call.js";

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
export function actorPrompt(state: State, scene: Entry[]): ActorPrompt {
  if (!state.scene) throw new Error("The Actor writes inside a Scene, and none is open");
  const pc = state.playerCharacter;
  const here = state.scene.who.map(name => state.people[name]).filter((person): person is Person => person !== undefined);
  const at = parseStoryTime(state.scene.at);

  const system = [
    `You are writing a story together with a player. The player writes ${pc}; you write everyone and everything else.`,
    "",
    `Whatever ${pc}'s Move says has happened, even when it has someone else act, time pass or the place change. Carry on from its effect; do not retell it.`,
    `Never write what ${pc} says, does, decides, thinks or feels. Stop where it is ${pc}'s turn.`,
    `What ${pc} thinks without saying it stays inside ${pc}. The people here hear only what was said aloud and see only what was done where they could see it.`,
    "Each person knows their own past, what they have lived through in this story, and what they have been told or have seen; nothing else.",
    "The people here want things and act on them without being asked. They are as kind or as cruel as they are; nobody softens to make things easier.",
    "Write prose only, with no headings, notes or lists.",
    LENGTH[state.replyLength],
    "",
    section("style", state.style),
    section("world", [state.world.summary, state.world.history].filter(Boolean).join("\n\n")),
    section(`player_character name="${pc}"`, describe(state.people[pc], { withVoice: false })),
    section("people_here", here.map(person => section(`person name="${person.name}"`, describe(person, { withVoice: true }))).join("\n\n") || "Nobody besides " + pc + "."),
    section("scene", `${state.scene.title}. ${state.scene.place}, ${at ? sayStoryTime(at, state.dayOneWeekday).replace(" · ", ", ") : state.scene.at}.`)
  ].filter(part => part !== null).join("\n");

  return { system, prompt: scenePrompt(scene, pc) };
}

function scenePrompt(scene: Entry[], pc: string): string {
  const latest = scene.at(-1);
  if (latest?.payload.kind !== "move") throw new Error("The Actor answers a Move, and the Scene does not end on one");
  const before = scene.slice(0, -1).map(entry => {
    switch (entry.payload.kind) {
      case "scene_opened": return entry.payload.prose;
      case "move": return section(`move by="${pc}"`, entry.payload.text);
      case "reply": return entry.payload.text;
      default: return "";
    }
  });
  return [section("scene_so_far", before.join("\n\n")), section(`move by="${pc}"`, latest.payload.text), "Write what happens next."].join("\n\n");
}

function describe(person: Person | undefined, { withVoice }: { withVoice: boolean }): string {
  if (!person) return "";
  return [
    person.aliases.length ? `Also called ${person.aliases.join(", ")}.` : "",
    person.whoTheyAre,
    person.appearance,
    person.after ? `After: ${person.after}` : "",
    person.knows.length ? `Knows: ${person.knows.join(" ")}` : "",
    withVoice && person.voice.length ? `Has said: ${person.voice.map(line => `"${line}"`).join(" ")}` : ""
  ].filter(Boolean).join("\n");
}

function section(tag: string, body: string): string | null {
  if (!body.trim()) return null;
  const name = tag.split(" ")[0];
  return `<${tag}>\n${body.trim()}\n</${name}>`;
}

/** Writes the Reply to the Scene's latest Move, streaming its words through [onText]. */
export function writeReply(models: Models, state: State, scene: Entry[], storyId: string, traceId: string, onText: (delta: string) => void, signal: AbortSignal): Promise<ModelAnswer> {
  const { system, prompt } = actorPrompt(state, scene);
  return models.call({ agent: "actor", model: state.actor, system, prompt, traceId, storyId }, onText, signal);
}
