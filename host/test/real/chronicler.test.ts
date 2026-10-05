import { describe, expect, it } from "vitest";
import { writeChronicle } from "../../src/agents/chronicler.js";
import { chronicleAsk, dueChronicle } from "../../src/engine/chronicling.js";
import { Engine } from "../../src/engine/engine.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { DEFAULT_JOB_MODELS } from "../../src/models/jobs.js";
import { Models } from "../../src/models/model-call.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { momentsOn } from "../../src/story/memory.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { sceneView } from "../../src/views/scene.js";
import { freshHome } from "../support/host.js";
import { hogwartsStoryFile, writeStoryFile } from "../support/story-files.js";

// These call real models through the player's Claude subscription: the Chronicler and the Writer on their default
// models, the Actor on the Story's, and a judge. They run only with `npm run test:real`.
const token = readSecret(CLAUDE_TOKEN);
const RUNS = 3;

function onClaude(storyFile: StoryFile) {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(storyFile), mac);
  if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported.problems)}`);
  const runner = new ClaudeRunner(mac.home, () => token);
  const models = new Models(mac.db, { claude: runner });
  const engine = new Engine(mac, models);
  const storyId = imported.storyId;
  const head = () => mac.tree.currentPath(storyId)!.headEntryId;
  /** Writes a Scene's exchanges as they were played, without models, so the test controls what happened. */
  const played = (exchanges: [string, string][]) => {
    const path = mac.tree.currentPath(storyId)!;
    let at = path.headEntryId;
    for (const [move, reply] of exchanges) {
      const moved = mac.tree.append(storyId, at, { kind: "move", text: move });
      const replied = mac.tree.append(storyId, moved.id, { kind: "reply", text: reply, callId: "written-by-the-test", model: { provider: "claude", model: "written-by-the-test" } });
      mac.tree.moveHead(path.id, at, replied.id);
      at = replied.id;
    }
  };
  /** Plays one Move through the real Writer and Actor, and returns the Reply. */
  const play = async (move: string) => {
    engine.move(storyId, move, head(), "real");
    await engine.settled(storyId);
    const view = sceneView(mac, engine, storyId, "real");
    const reply = view.exchanges.at(-1)?.reply?.text;
    if (!reply) throw new Error(`No Reply: ${view.turn.reason ?? "unknown"}`);
    return reply;
  };
  return { mac, runner, models, engine, storyId, head, played, play };
}

async function judge(question: string, passage: string): Promise<{ yes: boolean; said: string }> {
  const { runner, models } = onClaude(hogwartsStoryFile());
  const answer = await models.call({
    agent: "judge",
    model: { provider: "claude", model: "claude-sonnet-5-5" },
    system: "You judge a passage of fiction. Answer YES or NO first, then quote the exact words that decided it.",
    prompt: `<passage>\n${passage}\n</passage>\n\n${question}`,
    traceId: "judge",
    storyId: null
  });
  runner.close();
  // A judge may answer in markdown ("**YES.**"); its verdict is the first word, whatever surrounds it.
  return { yes: /^\W*YES\b/i.test(answer.text), said: answer.text };
}

/** The Charms room and the troll, as the player played them, with a line of Hermione's that invents his past. */
const sharedWithHermione: [string, string][] = [
  ["When Neville knocks my inkwell over in Charms, I look at it and it fills itself back up. I don't take my wand out.",
    "The ink climbs back into the bottle as if poured in reverse. Hermione stops writing. After class she catches your sleeve in the corridor. \"How did you do that? You didn't even have your wand out.\""],
  ["\"Maybe it likes me,\" I say, and walk off.",
    "\"That's not a reason,\" she calls after you. \"That's a list of circumstances.\""],
  ["At the troll, I pull Hermione out of the bathroom before the club comes down.",
    "The club splinters the sink where she was standing a second ago. She is on the floor of the corridor with your hand still around her wrist, staring at you. \"You told me at breakfast you hate flying,\" she says, stupidly, \"and now you're faster than a Seeker.\""]
];

describe.skipIf(!token)("the Chronicler on Claude", () => {
  it("records the inkwell and the troll as Moments shared with Hermione, word for word, and never her invented line as his", async () => {
    for (let run = 0; run < RUNS; run++) {
      const opening = hogwartsStoryFile({ title: "First week", place: "Hogwarts", at: "Day 2 09:00", who: ["Hermione Granger", "Neville Longbottom"], prose: "The first week is mostly stairs." });
      const { mac, runner, models, storyId, head, played } = onClaude(opening);
      played(sharedWithHermione);
      const engine = new Engine(mac, models);
      engine.endScene(storyId, head(), "real-end");
      const due = dueChronicle(mac, head())!;
      const record = await writeChronicle(models, DEFAULT_JOB_MODELS.chronicler, chronicleAsk(mac, due), storyId, "real-chronicle", new AbortController().signal);
      runner.close();
      const moments = record.value.moments;
      const words = (pattern: RegExp) => moments.some(moment => moment.there.includes("Hermione Granger") && moment.quotes.some(quote => pattern.test(quote.text)));
      expect(words(/inkwell|ink|bottle|wand/i), `run ${run + 1}: ${JSON.stringify(moments)}`).toBe(true);
      expect(words(/club|bathroom|troll|wrist|sink/i), `run ${run + 1}: ${JSON.stringify(moments)}`).toBe(true);
      expect(moments.some(moment => moment.quotes.some(quote => /hate flying/i.test(quote.text))), `run ${run + 1}`).toBe(false);
      expect(record.value.summary, `run ${run + 1}`).toBeTruthy();
    }
  });

  // GIVEN the Reply has Hermione ask the Player Character why he kissed her
  // THEN the Reply ends with her question unanswered, and decides nothing he says, chooses, does on purpose, thinks or feels
  it("scenes › The Reply never writes the Player Character › Hermione asks a question", async () => {
    for (let run = 0; run < RUNS; run++) {
      const opening = hogwartsStoryFile({ title: "First week", place: "Hogwarts", at: "Day 2 09:00", who: ["Hermione Granger", "Neville Longbottom"], prose: "The first week is mostly stairs." });
      const { runner, engine, storyId, head, played, play } = onClaude(opening);
      played(sharedWithHermione);
      engine.endScene(storyId, head(), "real-end");
      await engine.chronicled(storyId);
      await play("Late that night I find Hermione alone in the common room, and sit down at the other end of the sofa.");
      const reply = await play("I kiss her, quickly, and pull back before she can say anything.");
      runner.close();
      // The judge is told what the Story has shown, so it can tell an invented past from one the player wrote.
      const shown = [...sharedWithHermione.map(([move]) => move), "Late that night I find Hermione alone in the common room, and sit down at the other end of the sofa."];
      const wroteHim = await judge(`Before this passage, the story established only these things Roopesh said or did, in his own moves:\n${shown.map(move => `- ${move}`).join("\n")}\nHis last move was: he kissed her quickly and pulled back. Apart from referring back to those, does this passage decide anything new that Roopesh says, chooses, does on purpose, thinks or feels, including inventing things he said or did before this scene? Other people describing how he looks to them or guessing at his reasons, and plain physical continuity such as "both of them go still", do not count. Answer YES or NO.`, reply);
      expect(wroteHim.yes, `run ${run + 1}: ${wroteHim.said}\n---\n${reply}`).toBe(false);
    }
  });

  // GIVEN the Moment at the Hogsmeade station where the Player Character saved Draconia
  // WHEN a later Scene brings up the life debt with Draconia
  // THEN her Replies draw on what was actually said and done at the station
  it("living-world › Moments are remembered from one record › Draconia remembers the station", async () => {
    for (let run = 0; run < RUNS; run++) {
      const station = hogwartsStoryFile({ title: "The station", place: "Hogsmeade station", at: "Day 1 18:00", who: ["Draconia Malfoy"], prose: "The train is still hissing when the crowd surges toward the platform's edge." });
      const { mac, runner, engine, storyId, head, played, play } = onClaude(station);
      played([["Draconia is shoved toward the edge as the train pulls out. I grab her wrist and haul her back onto the platform.",
        "For a moment she is pressed against you, breathing hard, the train roaring past an arm's length away. Then she pulls her wrist free. \"I'd have managed,\" Draconia says, and doesn't look at you. \"Don't touch me again, Stray.\""]]);
      engine.endScene(storyId, head(), "real-end");
      await engine.chronicled(storyId);
      expect(momentsOn(mac, head()).some(item => item.knownTo.includes("Draconia Malfoy")), `run ${run + 1}: no Moment with Draconia`).toBe(true);
      const reply = await play("A week later I find Draconia alone in the library and tell her I don't want anything for the station. She owes me nothing.");
      runner.close();
      const remembers = await judge("Earlier, at the train station, Roopesh hauled Draconia back from the platform's edge by her wrist as the train pulled out; she told him she'd have managed and not to touch her again. Does this passage show Draconia drawing on that actual event (what was said or done at the station), even if she tells it her own way? Answer YES or NO.", reply);
      expect(remembers.yes, `run ${run + 1}: ${remembers.said}\n---\n${reply}`).toBe(true);
    }
  });

  // GIVEN only Hagrid, Ron and Harry know about the dragon egg
  // WHEN Hermione is alone with the Player Character
  // THEN nothing she says or does shows knowledge of the egg
  it("living-world › Characters know only what they could know › Hermione does not know about the egg", async () => {
    for (let run = 0; run < RUNS; run++) {
      const hut = hogwartsStoryFile({ title: "Hagrid's hut", place: "Hagrid's hut", at: "Day 4 15:00", who: ["Rubeus Hagrid", "Ron Weasley", "Harry Potter"], prose: "It is far too hot in Hagrid's hut, and something in the fire is ticking." });
      const { runner, engine, storyId, head, played, play } = onClaude(hut);
      played([["I lean closer to the fire to see what's ticking.",
        "Hagrid lifts a huge black egg out of the coals with his bare hands. \"Won it off a stranger in the Hog's Head,\" he says, delighted. \"Norwegian Ridgeback, I reckon. Not a word to anyone, mind.\" Ron swears softly. Harry looks at the window."]]);
      engine.endScene(storyId, head(), "real-end");
      await engine.chronicled(storyId);
      const reply = await play("That evening I sit down across from Hermione in the library. I don't say anything about Hagrid.");
      runner.close();
      const knows = await judge("In this story, Hermione has never been told about, and has not seen, a dragon egg at Hagrid's hut. Does anything in this passage show Hermione knowing about or hinting at a dragon egg, a dragon, or what Hagrid is hiding? Answer YES or NO.", reply);
      expect(knows.yes, `run ${run + 1}: ${knows.said}\n---\n${reply}`).toBe(false);
    }
  });
});
