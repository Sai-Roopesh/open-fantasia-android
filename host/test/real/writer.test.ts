import { describe, expect, it } from "vitest";
import { writeBeat, type WriterAsk } from "../../src/agents/writer.js";
import { Engine } from "../../src/engine/engine.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { DEFAULT_JOB_MODELS } from "../../src/models/jobs.js";
import { Models } from "../../src/models/model-call.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { minutesOf, parseStoryTime } from "../../src/time.js";
import { sceneEntries, sceneView } from "../../src/views/scene.js";
import { freshHome } from "../support/host.js";
import { hogwartsStoryFile, writeStoryFile } from "../support/story-files.js";

// These call real models through the player's Claude subscription: the Writer on its default model, the Actor on
// the Story's, and a judge. They run only with `npm run test:real`, because they spend quota and take minutes.
const token = readSecret(CLAUDE_TOKEN);
const RUNS = 3;

function onClaude(storyFile: StoryFile) {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(storyFile), mac);
  if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported.problems)}`);
  const runner = new ClaudeRunner(mac.home, () => token);
  const models = new Models(mac.db, { claude: runner });
  const storyId = imported.storyId;
  const head = () => mac.tree.currentPath(storyId)!.headEntryId;
  return { mac, runner, models, storyId, head };
}

/** One Writer call for [move] at the Story's opening, as the engine would make it. */
async function writerAnswers(storyFile: StoryFile, move: string) {
  const { mac, runner, models, head } = onClaude(storyFile);
  const state = mac.states.at(head());
  const ask: WriterAsk = { state, scene: sceneEntries(mac, head()).entries, move, direction: null };
  try {
    return await writeBeat(models, DEFAULT_JOB_MODELS.writer, ask, "real", "real-writer", new AbortController().signal);
  } finally {
    runner.close();
  }
}

/** Asks a second model a yes-or-no question about a passage; it quotes the words that decided it. */
async function judge(question: string, passage: string): Promise<{ yes: boolean; said: string }> {
  const { runner, models } = onClaude(hogwartsStoryFile());
  const answer = await models.call({
    agent: "judge",
    model: { provider: "claude", model: "claude-sonnet-5-5" },
    system: "You judge a passage of fiction, or an author's note about one. Answer YES or NO first, then quote the exact words that decided it.",
    prompt: `<passage>\n${passage}\n</passage>\n\n${question}`,
    traceId: "judge",
    storyId: null
  });
  runner.close();
  return { yes: /^\s*YES/i.test(answer.text), said: answer.text };
}

const hospitalWing = (): StoryFile => {
  const story = hogwartsStoryFile({
    title: "Visiting hours",
    place: "The hospital wing",
    at: "Day 6 17:30",
    who: ["Draconia Malfoy", "Severus Snape"],
    prose: "The hospital wing smells of camphor. At the far end, Draconia Malfoy is sitting up in the bed by the window, and Professor Snape is standing over it with his arms folded."
  });
  story.people = story.people.map(person => person.name === "Draconia Malfoy"
    ? { ...person, after: "To be moved out of the bed by the window, which she says is draughty, and to be left alone by everyone, most of all Roopesh." }
    : person.name === "Severus Snape" ? { ...person, after: "Draconia in the bed Madam Pomfrey put her in, and no fuss from a Malfoy." } : person) as StoryFile["people"];
  return story;
};

describe.skipIf(!token)("the Writer on Claude", () => {
  // GIVEN Draconia's argument with Snape about her bed touches no Arc
  // WHEN the Player Character finds them in the hospital wing
  // THEN the Reply gives the argument a line and stays with what is moving between her and the Player Character
  it("scenes › Only what matters earns time › Procedure does not take over", async () => {
    for (let run = 0; run < RUNS; run++) {
      const { mac, runner, models, storyId, head } = onClaude(hospitalWing());
      const engine = new Engine(mac, models);
      engine.move(storyId, "I walk down the ward to her bed, holding the book she left in the library.", head(), `real-procedure-${run}`);
      await engine.settled(storyId);
      runner.close();
      const reply = sceneView(mac, engine, storyId, "real").exchanges.at(-1)?.reply?.text ?? "";
      expect(reply, sceneView(mac, engine, storyId, "real").turn.reason ?? "").not.toBe("");
      const verdict = await judge(
        "Draconia and Professor Snape were arguing about which bed she should be in when Roopesh arrived. Does this passage spend more than two sentences on that argument about the bed, rather than staying with what passes between Draconia and Roopesh? Answer YES or NO.",
        reply
      );
      expect(verdict.yes, `run ${run + 1}: ${verdict.said}\n\n${reply}`).toBe(false);
    }
  });

  it("leaves the Scene when a Move goes somewhere else", async () => {
    for (let run = 0; run < RUNS; run++) {
      const { plan } = await writerAnswers(hogwartsStoryFile(), "I go to my room; Harry, Ron and Neville are playing a board game");
      expect(plan.opens, `run ${run + 1}`).not.toBeNull();
      expect(plan.opens!.place, `run ${run + 1}`).toMatch(/dorm|room/i);
      expect(plan.here, `run ${run + 1}`).toEqual(expect.arrayContaining(["Harry Potter", "Ron Weasley", "Neville Longbottom"]));
    }
  });

  it("moves the clock by the time a Move passes", async () => {
    const broom = hogwartsStoryFile({ title: "Flying lesson", place: "The Quidditch pitch", at: "Day 2 16:00", who: ["Draconia Malfoy"], prose: "Draconia lets you climb on behind her, says nothing, and kicks off." });
    for (let run = 0; run < RUNS; run++) {
      const { plan } = await writerAnswers(broom, "after an hour, I'm still sitting on her broom, holding on");
      const at = parseStoryTime(plan.clock)!;
      expect(minutesOf(at), `run ${run + 1}: ${plan.clock}`).toBeGreaterThanOrEqual(minutesOf(parseStoryTime("Day 2 17:00")!));
    }
  });

  it("never softens anyone in its notes", async () => {
    const pitch = hogwartsStoryFile({ title: "The broom shed", place: "The broom shed by the pitch", at: "Day 2 15:40", who: ["Draconia Malfoy"], prose: "Draconia is wrestling with a school broom whose bristles have come loose. She has not noticed you yet." });
    for (let run = 0; run < RUNS; run++) {
      const { plan } = await writerAnswers(pitch, "I tell her I can fix that, if she wants, and hold out my hand for the broom.");
      const verdict = await judge(
        "Draconia Malfoy is a proud pure-blood who despises the Muggle-born Roopesh. This is an author's note on what she does next, after he kindly offers to fix her broom. Does the note have her accept his help gracefully, warm to him, or become agreeable, rather than refusing, deflecting, or making him pay for it? Answer YES or NO.",
        plan.note
      );
      expect(verdict.yes, `run ${run + 1}: ${verdict.said}\n\n${plan.note}`).toBe(false);
    }
  });
});
