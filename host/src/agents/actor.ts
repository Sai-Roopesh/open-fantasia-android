import type { Models } from "../models/model-call.js";
import type { Entry, Gathered } from "../story/entries.js";
import type { Fact, ModelChoice, State } from "../story/state.js";
import type { Beside } from "../story/beside.js";
import { asCall, layers, recallFacts, section } from "../context/lens.js";
import { AgentFailed, BUDGETS } from "./step.js";
import { inPlayFacts } from "./writer.js";

const LENGTH = {
  short: "Keep each Reply short: one or two brief paragraphs.",
  medium: "Keep each Reply to three or four paragraphs.",
  full: "Let each Reply run as long as the moment needs, up to about six hundred words."
} as const;

/**
 * The Actor plays everyone in a Scene and writes the Replies as a novelist (docs/adr/0017): it reads the four layers
 * through the actor lens, shown everything about the people here with what each knows and believes stated plainly, and
 * writes each of them from what they know. It looks nothing up: it writes from the Writer's plan and the passages the
 * Writer gathered, in layer 4 (the-storys-mind design decision 6).
 */
export interface ActorAsk {
  /** The State at the Writer's Beat Note: its Scene open, the clock at the Reply. */
  state: State;
  beside: Beside;
  /** The Scene's entries, from its opening to the Move the Reply answers. */
  scene: Entry[];
  /** What the Writer found in its lookups for this Reply, in the Story's own words. */
  gathered: Gathered[];
  /** When the Reply is written again: the Reply the Editor sent back, and what breaks it (docs/adr/0019). */
  again?: { draft: string; notes: string[] };
}

/** The Actor's own instructions, at the top of layer 1: the same for every Reply until the Story is edited. */
function instructions(state: State): string {
  const pc = state.playerCharacter;
  return [
    `You are writing a story together with a player. The player writes ${pc}; you write everyone and everything else, Reply by Reply, as a novelist does: you are shown everything about the people here, their history and what they hide, and you write each of them knowing only what they know.`,
    "",
    `Whatever ${pc}'s Move says has happened, even when it has someone else act, time pass or the place change. Carry on from its effect; do not retell it.`,
    `Never decide what ${pc} says, chooses, does on purpose, thinks or feels. The people here may see ${pc} and say how ${pc} looks to them. Stop where it is ${pc}'s turn.`,
    `The people here remember of ${pc} only what the scene so far, The Story So Far and what they remember show, and their own past: they never recall anything else he said, chose or did on purpose.`,
    `Tell nothing from inside ${pc}: what can be seen of him, never what he sees, notices or feels.`,
    `What ${pc} thinks without saying it stays inside ${pc}. The people here hear only what was said aloud and see only what was done where they could see it.`,
    "Each person knows their own past, what they have lived through in this story, and what they have been told or have seen; nothing else. What each person here knows and believes is said plainly under what_each_knows: play each of them from it. Someone who believes something wrong acts on the belief; nobody acts on what they do not know, however well you know it.",
    "Write each person as who they are now, under people_now, not as who they were when the story began. Where things stand between them, and what is true now, they lived too, and they act from it; what has ended is over for them.",
    "The people here want things and act on them without being asked. They are as kind or as cruel as they are; nobody softens to make things easier.",
    "The player's Taste is how they want the story written: keep to it.",
    "Write prose only, with no headings, notes or lists.",
    LENGTH[state.replyLength]
  ].join("\n");
}

const CALL = {
  continue: null,
  land: "Bring the Scene toward its turn."
} as const;

/** A Moment as the Actor is given it: what happened and who knows it, then its own words. */
const moment = (fact: Fact, scene: boolean) => `(${scene ? `Scene ${fact.scene}; ` : ""}known to ${fact.knownTo.join(", ")}) ${fact.what}\n${fact.quotes.map(quote => `  "${quote.text}"`).join("\n")}`;

/**
 * The Actor's prompt in four layers (the-storys-mind design decision 7): the Story with its instructions; where things
 * stand for the people here, their knowledge and beliefs spelled out; the Scene so far; and this moment: what the
 * people here remember, the Move, the Writer's plan for the Reply and what it gathered, and, when the Reply is written
 * again, what it was sent back for.
 */
export function actorPrompt(ask: ActorAsk): { system: string; prompt: string } {
  const { state } = ask;
  const scene = state.scene;
  if (!scene) throw new Error("The Actor writes inside a Scene, and none is open");
  const pc = state.playerCharacter;
  const at = ask.scene.findLastIndex(entry => entry.payload.kind === "move");
  const move = ask.scene[at];
  if (move?.payload.kind !== "move") throw new Error("The Actor answers a Move, and the Scene has none to answer");
  const call = scene.call ? CALL[scene.call] : null;
  const thisReply = [
    scene.note ? `What happens next: ${scene.note}` : "",
    call ?? "",
    scene.focus ? `Stay close beside ${scene.focus}: mostly their words, actions and thoughts. Nobody new comes in unless the Move brings them.` : "",
    scene.linger ? "Force nothing. Let the moment breathe, and answer only what the Move does." : ""
  ].filter(Boolean).join("\n");
  const again = ask.again;
  return asCall(layers(state, ask.beside, "actor", scene.here, ask.scene.slice(0, at), [
    section("remembered", recallFacts(state, scene.here).map(fact => moment(fact, true)).join("\n\n")),
    section(`move by="${pc}"`, move.payload.text),
    section("this_reply", thisReply),
    section("gathered", ask.gathered.map(item => `${item.scene ? `From Scene ${item.scene}` : "Off the page"}: “${item.words}”`).join("\n")),
    section("in_play", inPlayFacts(state).map(fact => moment(fact, false)).join("\n\n")),
    again ? section("sent_back", [
      "Your Reply was read before the player saw it, and sent back to be written again. What breaks it:",
      ...again.notes.map(note => `- ${note}`),
      "",
      "It read:",
      again.draft
    ].join("\n")) : null,
    `Write what happens next${again ? ", again: mend what it was sent back for, and keep what was right" : ""}. What ${pc} says, chooses, thinks and feels belongs to the player, now and in anything the story has not shown; what he did before is only what the story has shown, as it shows it. Leave the rest out.`
  ], instructions(state)));
}

/**
 * Writes the Reply whole (docs/adr/0019): the model may stream it, but no word reaches the player until the Editor has
 * read it, so the second model steps in whenever the first fails or runs out of time.
 */
export async function writeReply(models: Models, choices: ModelChoice[], ask: ActorAsk, storyId: string, traceId: string, signal: AbortSignal): Promise<{ text: string; callId: string; model: ModelChoice }> {
  const { system, prompt } = actorPrompt(ask);
  const reasons: string[] = [];
  const tried = new Set<string>();
  for (const model of choices) {
    const key = `${model.provider}/${model.model}`;
    if (tried.has(key)) continue;
    tried.add(key);
    try {
      const answer = await models.call({ agent: "actor", model, system, prompt, traceId, storyId }, () => {}, AbortSignal.any([signal, AbortSignal.timeout(BUDGETS.actor.ms)]));
      return { text: answer.text.trim(), callId: answer.callId, model };
    } catch (error) {
      if (signal.aborted) throw error;
      reasons.push(`${model.model}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new AgentFailed(reasons.join(" | ") || "no model could be reached");
}
