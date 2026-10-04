import { describe, expect, it } from "vitest";
import { actorPrompt } from "../../src/agents/actor.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { freshHome } from "../support/host.js";
import { malfoyProblemStoryFile, writeStoryFile } from "../support/story-files.js";

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
    expect(second!.prompt).toMatch(/<move by="Roopesh Gantasala">\nI ask the barman for another.\n<\/move>\n\nWrite what happens next\. What Roopesh Gantasala says, chooses, thinks and feels belongs to the player/);
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
