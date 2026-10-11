import type { ModelAnswer, Models } from "../models/model-call.js";
import type { Entry } from "../story/entries.js";
import type { Fact, ModelChoice, Person, State } from "../story/state.js";
import { parseStoryTime, sayDay, sayTime, type StoryTime, type Weekday } from "../time.js";
import { BUDGET, join, recallFacts, say, section } from "../context/lens.js";
import { inPlayFacts } from "./writer.js";

const LENGTH = {
  short: "Keep each Reply short: one or two brief paragraphs.",
  medium: "Keep each Reply to three or four paragraphs.",
  full: "Let each Reply run as long as the moment needs, up to about six hundred words."
} as const;

/**
 * The Actor plays everyone in a Scene and writes the Replies, through the character lens (one-truth design decision
 * 3): each person present is given only what they know, and the Story So Far only as far as they lived it. It is
 * never given the Premise or the Arcs: steering the Story is the Writer's and the Director's.
 */
export function actorPrompt(state: State, scene: Entry[]): { system: string; prompt: string } {
  if (!state.scene) throw new Error("The Actor writes inside a Scene, and none is open");
  const pc = state.playerCharacter;
  const herePeople = state.scene.here.map(name => state.people[name]).filter((person): person is Person => person !== undefined);
  const here = herePeople.map(person => person.name);
  const at = parseStoryTime(state.scene.at);
  const knowing = (fact: Fact) => fact.knownTo.some(name => here.includes(name));
  const lived = state.storySoFar.scenes.filter(part => part.who.some(name => here.includes(name)));

  const system = [
    `You are writing a story together with a player. The player writes ${pc}; you write everyone and everything else.`,
    "",
    `Whatever ${pc}'s Move says has happened, even when it has someone else act, time pass or the place change. Carry on from its effect; do not retell it.`,
    `Never decide what ${pc} says, chooses, does on purpose, thinks or feels. The people here may see ${pc} and say how ${pc} looks to them. Stop where it is ${pc}'s turn.`,
    `The people here remember of ${pc} only what the scene so far, lived and remembered show, and their own past: they never recall anything else he said, chose or did on purpose.`,
    `Tell nothing from inside ${pc}: what can be seen of him, never what he sees, notices or feels.`,
    `What ${pc} thinks without saying it stays inside ${pc}. The people here hear only what was said aloud and see only what was done where they could see it.`,
    "Each person knows their own past, what they have lived through in this story, and what they have been told or have seen; nothing else. What each of them knows is under their own name; nobody knows what is only under someone else's.",
    `Where things stand between ${pc} and each person here is under between: they lived it too, and act from where it stands.`,
    "The people here want things and act on them without being asked. They are as kind or as cruel as they are; nobody softens to make things easier.",
    "Write prose only, with no headings, notes or lists.",
    LENGTH[state.replyLength],
    "",
    section("style", state.style),
    section("world", [state.world.summary, state.world.history].filter(Boolean).join("\n\n")),
    section(`player_character name="${pc}"`, describe(state, state.people[pc], false)),
    section("people_here", herePeople.map(person => `<person name="${person.name}">\n${describe(state, person, true)}\n</person>`).join("\n\n") || `Nobody besides ${pc}.`),
    section("scene", `${state.scene.title}. ${state.scene.place}, ${at ? sayDayAndTime(at, state.dayOneWeekday) : state.scene.at}.`)
  ].filter(part => part !== null).join("\n");

  const recalled = recallFacts(state, here);
  const prompt = join([
    // The Scenes the people here lived with him, as the Story So Far tells them.
    section("lived", lived.slice(-BUDGET.recentScenes).map(part => `Scene ${part.scene?.number}, ${part.scene?.title} (with ${part.who.filter(name => here.includes(name)).join(", ")}): ${part.text}`).join("\n")),
    section("between", herePeople.flatMap(person => {
      const bond = state.bonds[person.name];
      return bond ? [`${person.name}: ${bond.standing}${bond.turns.length ? `\n  Latest: ${bond.turns.slice(-3).map(turn => turn.text).join(" / ")}` : ""}`] : [];
    }).join("\n")),
    section("remembered", recalled.map(fact => `(Scene ${fact.scene}; known to ${fact.knownTo.join(", ")}) ${fact.what}\n${fact.quotes.map(quote => `  "${quote.text}"`).join("\n")}`).join("\n\n")),
    section("lately", state.facts.filter(fact => fact.source === "world" && knowing(fact)).slice(-BUDGET.perPerson).map(fact => `(${say(state, fact.at)}; known to ${fact.knownTo.filter(name => name !== pc).join(", ")}) ${fact.what}`).join("\n")),
    scenePrompt(state, scene)
  ]);
  return { system, prompt };
}

const CALL = {
  continue: null,
  land: "Bring the Scene toward its turn.",
  end: "This Reply closes the Scene on this moment. End on someone else's closing moment, never one of "
} as const;

function scenePrompt(state: State, scene: Entry[]): string {
  const pc = state.playerCharacter;
  const moveAt = scene.findLastIndex(entry => entry.payload.kind === "move");
  const latest = scene[moveAt];
  if (latest?.payload.kind !== "move") throw new Error("The Actor answers a Move, and the Scene has none to answer");
  const before = scene.slice(0, moveAt).flatMap(entry => {
    switch (entry.payload.kind) {
      case "scene_opened": return entry.payload.prose ? [entry.payload.prose] : [];
      case "move": return [`<move by="${pc}">\n${entry.payload.text}\n</move>`];
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
  return join([
    section("scene_so_far", before.join("\n\n")),
    section(`move by="${pc}"`, latest.payload.text),
    section("this_reply", thisReply),
    section("taste", state.taste.map(line => `- ${line}`).join("\n")),
    section("in_play", inPlayFacts(state).map(fact => `(known to ${fact.knownTo.join(", ")}) ${fact.what}\n${fact.quotes.map(quote => `  "${quote.text}"`).join("\n")}`).join("\n\n")),
    `Write what happens next. What ${pc} says, chooses, thinks and feels belongs to the player, now and in anything the story has not shown; what he did before is only what the scene, lived and remembered show, as they show it. Leave the rest out.`
  ]);
}

function describe(state: State, person: Person | undefined, withVoice: boolean): string {
  if (!person) return "";
  const life = state.lives[person.name];
  const knows = state.facts.filter(fact => fact.knownTo.includes(person.name)).slice(-BUDGET.perPerson);
  return [
    person.aliases.length ? `Also called ${person.aliases.join(", ")}.` : "",
    person.whoTheyAre,
    person.appearance,
    life?.where || life?.doing ? `Lately: ${[life.where, life.doing].filter(Boolean).join("; ")}.` : "",
    life?.after || person.after ? `After: ${life?.after || person.after}` : "",
    person.knows.length ? `Knows: ${person.knows.join(" ")}` : "",
    withVoice && knows.length ? `Knows of late: ${knows.map(fact => fact.what).join(" ")}` : "",
    withVoice && person.voice.length ? `Has said: ${person.voice.map(line => `"${line}"`).join(" ")}` : ""
  ].filter(Boolean).join("\n");
}

function sayDayAndTime(time: StoryTime, dayOneWeekday: Weekday | null): string {
  return `${sayDay(time, dayOneWeekday)}, ${sayTime(time)}`;
}

/** Writes the Reply to the Scene's latest Move, streaming its words through [onText]. */
export function writeReply(models: Models, model: ModelChoice, state: State, scene: Entry[], storyId: string, traceId: string, onText: (delta: string) => void, signal: AbortSignal): Promise<ModelAnswer> {
  const { system, prompt } = actorPrompt(state, scene);
  return models.call({ agent: "actor", model, system, prompt, traceId, storyId }, onText, signal);
}
