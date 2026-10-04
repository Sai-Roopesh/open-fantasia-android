import { describe, expect, it } from "vitest";
import { actorPrompt } from "../../src/agents/actor.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { freshHome } from "../support/host.js";
import type { State } from "../../src/story/state.js";
import { malfoyProblemStoryFile, writeStoryFile } from "../support/story-files.js";
import { nightTrain } from "../support/stories.js";

function sceneWithMoves(...moves: string[]) {
  const mac = freshHome();
  const result = importStoryFile(writeStoryFile(malfoyProblemStoryFile()), mac);
  if (!result.ok) throw new Error("import failed");
  let head = mac.tree.currentPath(result.storyId)!.headEntryId;
  const prompts = moves.map((text, index) => {
    head = mac.tree.append(result.storyId, head, { kind: "move", text }).id;
    const state = mac.states.at(head);
    const scene = mac.tree.pathTo(head).filter(entry => entry.seq >= mac.tree.entry(state.scene!.openedBy)!.seq);
    const prompt = actorPrompt(state, scene);
    head = mac.tree.append(result.storyId, head, { kind: "reply", text: `Reply ${index}`, callId: `c${index}`, model: state.actor }).id;
    return prompt;
  });
  return prompts;
}

describe("the Actor's prompt", () => {
  it("sends the same system prompt for every Reply in a Scene, so the prompt cache hits", () => {
    const [first, second] = sceneWithMoves("I raise my glass to her.", "I ask the barman for another.");
    expect(second!.system).toBe(first!.system);
    expect(second!.prompt).not.toBe(first!.prompt);
  });

  it("carries the Scene word for word and ends on the Move to answer", () => {
    const [, second] = sceneWithMoves("I raise my glass to her.", "I ask the barman for another.");
    expect(second!.prompt).toContain("don't they have mirrors at the mission?");
    expect(second!.prompt).toContain("I raise my glass to her.");
    expect(second!.prompt).toContain("Reply 0");
    expect(second!.prompt).toMatch(/<move by="Roopesh Gantasala">\nI ask the barman for another.\n<\/move>\n\n/);
    expect(second!.prompt).toMatch(/Write what happens next\. What Roopesh Gantasala says, chooses, thinks and feels belongs to the player[^\n]*$/);
  });

  it("describes the people in the Scene and the Player Character, and never the Premise or the Arcs", () => {
    const [first] = sceneWithMoves("I raise my glass to her.");
    expect(first!.system).toContain('<person name="Draconia Malfoy">');
    expect(first!.system).toContain('<player_character name="Roopesh Gantasala">');
    expect(first!.system).not.toContain("Student 12");
    expect(first!.system).not.toContain("enemies-to-lovers");
    expect(first!.system).not.toContain("comes round to Roopesh");
    expect(first!.system).toContain("The Three Broomsticks, Friday, 9:40 pm.");
  });
});

describe("the Actor's prompt for one Reply", () => {
  const planned = (changes: Partial<NonNullable<State["scene"]>> = {}, taste: string[] = []) => {
    const { state, mac, head, storyId } = nightTrain();
    const move = mac.tree.append(storyId, head(), { kind: "move", text: "I offer her the window seat." });
    const scene = mac.tree.pathTo(move.id).slice(1);
    const current: State = {
      ...state,
      clock: "Day 1 22:52",
      taste,
      scene: {
        ...state.scene!,
        purpose: "Meera decides whether this stranger is someone to talk to.",
        exit: "She climbs to the upper berth, or sits down opposite him.",
        beats: [{ text: "Uncle Bhalla takes a side, loudly.", status: "in_play" }, { text: "Meera asks about Shimla.", status: "pending" }, { text: "The lights go out.", status: "pending" }],
        note: "Bhalla rules for Meera. She sits anyway, opposite, and asks about Shimla.",
        call: "continue",
        ...changes
      }
    };
    return actorPrompt(current, [...scene, { ...move, seq: move.seq + 1, id: "note", payload: { kind: "beat_note", plan: null, here: [], beats: [], note: "", call: "continue", intensity: 2, arcMoved: true, clock: "Day 1 22:52", taste: null, callId: "c", model: state.actor } }]);
  };

  it("adds the time, the Beat Note, Focus, Linger and Taste after the Move, and never the beats, purpose or exit", () => {
    const { system, prompt } = planned({ focus: "Meera Kulkarni", linger: true }, ["Keep Uncle Bhalla to the edges."]);
    const afterMove = prompt.slice(prompt.indexOf("I offer her the window seat."));
    expect(afterMove).toContain("Thursday, 10:52 pm");
    expect(afterMove).toContain("Bhalla rules for Meera. She sits anyway, opposite, and asks about Shimla.");
    expect(afterMove).toMatch(/Stay close beside Meera Kulkarni/);
    expect(afterMove).toMatch(/nobody new comes in unless/i);
    expect(afterMove).toMatch(/Force nothing/);
    expect(afterMove).toContain("Keep Uncle Bhalla to the edges.");
    for (const secret of ["Meera decides whether this stranger", "climbs to the upper berth", "The lights go out", "Meera asks about Shimla."]) {
      expect(system + prompt).not.toContain(secret);
    }
  });

  it("says what the call means for this Reply", () => {
    expect(planned({ call: "land" }).prompt).toMatch(/toward its turn/);
    expect(planned({ call: "end" }).prompt).toMatch(/This Reply closes the Scene/);
    expect(planned({ call: "continue" }).prompt).not.toMatch(/closes the Scene|toward its turn/);
  });
});
