import { describe, expect, it } from "vitest";
import { actorPrompt } from "../../src/agents/actor.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { Models } from "../../src/models/model-call.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { freshHome } from "../support/host.js";
import { writeStoryFile } from "../support/story-files.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";

// These call real models through the player's Claude subscription. They run only with `npm run test:real`, and
// only when a token is stored, because they spend quota and take minutes.
const token = readSecret(CLAUDE_TOKEN);
const RUNS = 3;

const commonRoom: StoryFile = {
  format: 1,
  title: "After curfew",
  premise: "A slow-burn romance at Hogwarts as a university.",
  style: "Close third person on the people around Roopesh, British English, 1991, quiet and specific.",
  reply_length: "medium",
  people: [
    { name: "Hermione Granger", who_they_are: "Muggle-born, Gryffindor, top of every class; sharp, honest, flustered when caught out.", voice: ["That's not a reason. That's a list of circumstances."],
      knows: [
        "In Charms on Thursday, Roopesh's inkwell filled itself back up after Neville knocked it over. Roopesh had no wand out. When she asked him about it after class he said, \"Maybe it likes me,\" and walked off.",
        "At the troll on Saturday night Roopesh pulled her out of the girls' bathroom before the club came down, faster than anyone should be able to move. He has not mentioned it since, and neither has she."
      ] },
    { name: "Roopesh Gantasala", who_they_are: "A Muggle-born from Bangalore who hides what he can do." }
  ],
  player_character: "Roopesh Gantasala",
  opening: {
    title: "After curfew",
    place: "The Gryffindor common room",
    at: "Day 2 23:35",
    who: ["Hermione Granger"],
    prose: "The fire has burned down to red. Hermione is on the sofa with her knees drawn up, a book open on them that she has not turned a page of in ten minutes."
  }
};

/**
 * What the Story has already shown of Roopesh before this Scene, which a Reply may draw on (openspec scenes: The Reply
 * never writes the Player Character, "in anything the Story has not shown"): Hermione's memories in the Story File.
 */
const SHOWN = (commonRoom.people.find(person => person.name === "Hermione Granger")?.knows ?? []).join(" ");
const shownToJudge = `What the story has already shown of Roopesh before this scene, which the passage may refer back to: ${SHOWN}`;

function setUp() {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(commonRoom), mac);
  if (!imported.ok) throw new Error("import failed");
  const runner = new ClaudeRunner(mac.home, () => token);
  const models = new Models(mac.db, { claude: runner });
  return { mac, runner, models, storyId: imported.storyId };
}

/** Writes one Reply to [move] in the common room, through the real Actor; [note] is the Writer's Beat Note for it, if any. */
async function replyTo(move: string, note?: string) {
  const { mac, runner, models, storyId } = setUp();
  let head = mac.tree.append(storyId, mac.tree.currentPath(storyId)!.headEntryId, { kind: "move", text: move });
  if (note) head = mac.tree.append(storyId, head.id, { kind: "beat_note", plan: null, here: ["Hermione Granger"], goes: [], beats: [], note, call: "continue",
    intensity: 2, arcMoved: true, clock: "Day 2 23:40", taste: null, inPlay: [], callId: "scripted", model: { provider: "claude", model: "scripted" } });
  const state = mac.states.at(head.id);
  const { system, prompt } = actorPrompt(state, mac.tree.pathTo(head.id).slice(1));
  const words: string[] = [];
  const answer = await models.call({ agent: "actor", model: { provider: "claude", model: "claude-opus-5-5" }, system, prompt, traceId: "real", storyId }, word => words.push(word));
  runner.close();
  return { answer, words, mac, system };
}

/** Asks a second model a yes-or-no question about a Reply; on YES it quotes the words that made it say so. */
async function judge(question: string, reply: string): Promise<{ yes: boolean; said: string }> {
  const { mac, runner, models } = setUp();
  const answer = await models.call({
    agent: "judge",
    model: { provider: "claude", model: "claude-sonnet-5-5" },
    system: "You judge a passage of fiction. Answer NO, or answer YES followed by the exact words from the passage that make it YES.",
    prompt: `<passage>\n${reply}\n</passage>\n\n${question}`,
    traceId: "judge",
    storyId: null
  });
  runner.close();
  void mac;
  // A judge may answer in markdown ("**YES.**"); its verdict is the first word, whatever surrounds it.
  return { yes: /^\W*YES\b/i.test(answer.text), said: answer.text };
}

describe.skipIf(!token)("the Actor on Claude", () => {
  it("streams its words, keeps the call, and sends exactly the system prompt it was given", async () => {
    const { answer, words, mac, system } = await replyTo("I sit down at the other end of the sofa.");
    expect(words.length).toBeGreaterThan(5);
    expect(words.join("")).toBe(answer.text);
    const row = mac.db.prepare("SELECT request, answer FROM calls WHERE id = ?").get(answer.callId) as { request: string; answer: string };
    expect(JSON.parse(row.request).system).toBe(system);
    expect(row.answer).toBe(answer.text);
  });

  // The Line the player chose on 4 October 2026: agency only (openspec change first-playable-scene, scenes delta).
  // GIVEN the Reply has Hermione ask the Player Character why he kissed her
  // THEN the Reply ends with her question unanswered, and contains no words, thoughts or actions of his
  it("scenes › The Reply never writes the Player Character › Hermione asks a question", async () => {
    for (let run = 0; run < RUNS; run++) {
      const { answer } = await replyTo("I kiss her, quickly, and pull back before she can say anything.");
      const wroteHim = await judge(`Roopesh's own last move was: he kissed her quickly and pulled back. Apart from referring back to that, does this passage decide anything new that Roopesh says, chooses, does on purpose, thinks or feels, including inventing things he said or did before this scene? ${shownToJudge} Other people describing how he looks to them, and plain physical continuity such as \"both of them go still\", do not count. Answer YES or NO.`, answer.text);
      expect(wroteHim.yes, `${wroteHim.said}\n---\n${answer.text}`).toBe(false);
    }
  });

  // GIVEN the Player Character has not slept
  // WHEN Hermione says "you look like you haven't slept"
  // THEN that is allowed: it is how he looks to her, not a decision for him
  it("scenes › The Reply never writes the Player Character › Others may describe him", async () => {
    const passages: string[] = [];
    let remarked = 0;
    for (let run = 0; run < RUNS; run++) {
      const { answer } = await replyTo("I sit down across from her. I haven't slept properly in three days.",
        "Hermione tells him he looks like he hasn't slept.");
      passages.push(answer.text);
      const seen = await judge("Does someone in this passage say, aloud, how Roopesh looks to them: tired, worn out, or as if he has not slept? Answer YES or NO.", answer.text);
      if (seen.yes) remarked++;
      const wroteHim = await judge(`Roopesh's own last move was: he sat down across from her, and he has not slept properly in three days. Apart from referring back to that, does this passage decide anything new that Roopesh says, chooses, does on purpose, thinks or feels, including inventing things he said or did before this scene? ${shownToJudge} Other people describing how he looks to them, and plain physical continuity such as \"both of them go still\", do not count. Answer YES or NO.`, answer.text);
      expect(wroteHim.yes, `${wroteHim.said}\n---\n${answer.text}`).toBe(false);
    }
    // The remark is allowed, and the Actor makes it when the Writer plans it.
    expect(remarked, passages.join("\n---\n")).toBeGreaterThanOrEqual(2);
  });

  // WHEN the Move is "I smile at her. (I can't believe she bought that.)"
  // THEN in the Reply she reacts to the smile, and nobody shows any sign of having heard the thought
  it("scenes › Thoughts stay private › An unspoken thought", async () => {
    for (let run = 0; run < RUNS; run++) {
      const { answer } = await replyTo("I smile at her. (I can't believe she bought that.)");
      const heard = await judge("Roopesh smiled at her and privately thought \"I can't believe she bought that\" without saying it aloud. Does anyone in this passage react to, repeat or answer that unspoken thought, as if they had heard it? Reacting to his smile does not count. Answer YES or NO.", answer.text);
      expect(heard.yes, `${heard.said}\n---\n${answer.text}`).toBe(false);
    }
  });
});
