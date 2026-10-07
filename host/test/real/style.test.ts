import { describe, expect, it } from "vitest";
import { actorPrompt } from "../../src/agents/actor.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { Models } from "../../src/models/model-call.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { freshHome } from "../support/host.js";
import { writeStoryFile } from "../support/story-files.js";

// Calls real models through the player's Claude subscription: only with `npm run test:real`, and only when a token
// is stored. The Story's Style is changed between Replies (editing-the-story task 1.3).
const token = readSecret(CLAUDE_TOKEN);
const RUNS = 3;
const ADDED = "Keep the humour dry and British.";

const commonRoom: StoryFile = {
  format: 1,
  title: "After curfew",
  premise: "A slow-burn romance at Hogwarts as a university.",
  style: "Close third person on the people around Roopesh, British English, 1991, quiet and specific.",
  reply_length: "medium",
  people: [
    { name: "Hermione Granger", who_they_are: "Muggle-born, Gryffindor, top of every class; sharp, honest, flustered when caught out.",
      knows: ["In Charms on Thursday, Roopesh's inkwell filled itself back up after Neville knocked it over. Roopesh had no wand out."] },
    { name: "Roopesh Gantasala", who_they_are: "A Muggle-born from Bangalore who hides what he can do." }
  ],
  player_character: "Roopesh Gantasala",
  opening: {
    title: "After curfew",
    place: "The Gryffindor common room",
    at: "Day 2 23:35",
    who: ["Hermione Granger"],
    prose: "The fire has burned down to red. Hermione is on the sofa with a book she has not turned a page of in ten minutes."
  }
};

function setUp() {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(commonRoom), mac);
  if (!imported.ok) throw new Error("import failed");
  const runner = new ClaudeRunner(mac.home, () => token);
  return { mac, runner, models: new Models(mac.db, { claude: runner }), storyId: imported.storyId };
}

/** One Reply to the same Move through the real Actor, with the Style as imported or after the player's change. */
async function replyTo(move: string, changed: boolean): Promise<string> {
  const { mac, runner, models, storyId } = setUp();
  let head = mac.tree.currentPath(storyId)!.headEntryId;
  if (changed) head = mac.tree.append(storyId, head, { kind: "style_set", style: `${commonRoom.style} ${ADDED}` }).id;
  const moved = mac.tree.append(storyId, head, { kind: "move", text: move });
  const { system, prompt } = actorPrompt(mac.states.at(moved.id), mac.tree.pathTo(moved.id).slice(1));
  expect(system.includes(ADDED)).toBe(changed);
  const answer = await models.call({ agent: "actor", model: { provider: "claude", model: "claude-opus-5-5" }, system, prompt, traceId: "real", storyId });
  runner.close();
  return answer.text;
}

/** Asks a second model which of two passages has the drier, more British humour; the order is shuffled each time. */
async function drier(changed: string, unchanged: string): Promise<{ changedWins: boolean; said: string }> {
  const { runner, models } = setUp();
  const changedFirst = Math.random() < 0.5;
  const [a, b] = changedFirst ? [changed, unchanged] : [unchanged, changed];
  const answer = await models.call({
    agent: "judge",
    model: { provider: "claude", model: "claude-sonnet-5-5" },
    system: "You compare two passages of fiction. Answer A or B, then one sentence quoting the words that decided it.",
    prompt: `<a>\n${a}\n</a>\n\n<b>\n${b}\n</b>\n\nWhich passage has the drier, more British humour: understatement, deadpan, irony?`,
    traceId: "judge",
    storyId: null
  });
  runner.close();
  const pick = /^\W*([AB])\b/i.exec(answer.text)?.[1]?.toUpperCase();
  return { changedWins: pick === (changedFirst ? "A" : "B"), said: answer.text };
}

describe.skipIf(!token)("the Style changed mid-Story, with the real Actor", () => {
  it("long-run › Style is the player's own words › Changing the Style mid-Story: the Replies after read as the new Style says", async () => {
    const move = "I tell her the inkwell probably just likes me.";
    const verdicts: { changedWins: boolean; said: string }[] = [];
    for (let run = 0; run < RUNS; run++) verdicts.push(await drier(await replyTo(move, true), await replyTo(move, false)));
    const wins = verdicts.filter(verdict => verdict.changedWins).length;
    expect(wins, verdicts.map(verdict => verdict.said).join("\n---\n")).toBeGreaterThanOrEqual(2);
  });
});
