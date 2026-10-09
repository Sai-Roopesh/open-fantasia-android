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
import { hogwartsStoryFile, hogwartsWorldStoryFile, writeStoryFile } from "../support/story-files.js";

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

  it("writes where an open Scene stands so far once the player steps away, inventing nothing", async () => {
    const shown = sharedWithHermione.map(([move, reply]) => `Roopesh's move: ${move}\nThe reply: ${reply}`).join("\n\n");
    for (let run = 0; run < RUNS; run++) {
      const opening = hogwartsStoryFile({ title: "First week", place: "Hogwarts", at: "Day 2 09:00", who: ["Hermione Granger", "Neville Longbottom"], prose: "The first week is mostly stairs." });
      const { mac, runner, models, storyId, head, played } = onClaude(opening);
      played(sharedWithHermione);
      // The player stepped away mid-Scene: two hours on, the open Scene is due.
      const due = dueChronicle(mac, head(), new Date(Date.now() + 2 * 3600_000))!;
      expect(due.sceneEnded).toBe(false);
      const record = await writeChronicle(models, DEFAULT_JOB_MODELS.chronicler, chronicleAsk(mac, due), storyId, "real-so-far", new AbortController().signal);
      runner.close();
      const summary = record.value.summary ?? "";
      expect(summary, `run ${run + 1}`).not.toBe("");
      const invents = await judge(`This Scene so far was played as follows:\n\n${shown}\n\nThe passage is a summary of the Scene so far, for a player coming back to it. Does it say anything the Scene did not show, or treat Hermione's claim that Roopesh hates flying as something true or something he said? Answer YES or NO.`, summary);
      expect(invents.yes, `run ${run + 1}: ${invents.said}\n---\n${summary}`).toBe(false);
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

  // Lasting-records task 2.4: after a Scene that changes where things stand with Draconia, the real Chronicler writes a
  // turn and a standing within their limits, and keeps what he knows of her within sixty words, saying no secret feeling.
  it("keeps Draconia's Bond and what he knows of her within their limits after the classroom", async () => {
    const floating: [string, string][] = [
      ["When her levitation charm goes wrong and everything in the room lifts, I catch her before she hits the ceiling.",
        "Draconia lands against your chest with the desks drifting around you both. For a long second she does not move. Then her chin comes up. \"Put me down, Stray. Now.\""],
      ["I put her down, carefully, and step back.",
        "She smooths her robes, gathers her notes from the air one by one, and leaves without a word of thanks. At the door she stops. \"Nobody hears of this.\""]
    ];
    const known = "Slytherin, and a Malfoy: sharp-tongued, proud, the best in their year at Charms and furious about anyone who comes close. She called him the word on the train and slapped him at the feast. She bills him for the slap, calls him Stray, and keeps her distance on her own terms.";
    const bond = "She called him the word on the train; he saved her twenty minutes later. She owes him, hates owing him, bills him for the slap, and calls him Stray.";
    for (let run = 0; run < RUNS; run++) {
      const classroom = hogwartsStoryFile({ title: "Twenty-nine minutes", place: "An empty classroom", at: "Day 9 16:00", who: ["Draconia Malfoy"], prose: "Draconia sets out her notes and does not look up when he comes in." });
      classroom.people = classroom.people.map(person => person.name === "Draconia Malfoy" ? { ...person, known, bond } : person) as StoryFile["people"];
      const { mac, runner, models, storyId, head, played } = onClaude(classroom);
      played(floating);
      new Engine(mac, models).endScene(storyId, head(), "real-end");
      const record = await writeChronicle(models, DEFAULT_JOB_MODELS.chronicler, chronicleAsk(mac, dueChronicle(mac, head())!), storyId, "real-bond", new AbortController().signal);
      runner.close();
      const said = `run ${run + 1}: ${JSON.stringify({ bonds: record.value.bonds, known: record.value.known, dropped: record.dropped })}`;
      const row = record.value.bonds.find(item => item.who === "Draconia Malfoy");
      expect(row, said).toBeDefined();
      const words = (text: string) => text.trim().split(/\s+/).length;
      expect(words(row!.standing), said).toBeLessThanOrEqual(40);
      expect(words(row!.turn), said).toBeLessThanOrEqual(25);
      for (const line of record.value.known) expect(words(line.now), said).toBeLessThanOrEqual(60);
      expect(record.dropped.filter(why => /^(bonds|known):/.test(why)), said).toEqual([]);
      const secret = await judge("The passage says where things stand between Roopesh and Draconia, as he has seen it. Does it state a feeling of hers as a fact (that she likes, loves, wants or is falling for him) rather than what she said or did? Answer YES or NO.", `${row!.standing}\n${row!.turn}`);
      expect(secret.yes, `${said}\n${secret.said}`).toBe(false);
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

  // GIVEN Quirrell serves Voldemort, and the Player Character does not know it
  // THEN Quirrell's entry on the World screen says nothing of it
  it("outside-the-scene › The World screen shows what the Player Character knows › A secret stays out of the World screen", async () => {
    for (let run = 0; run < RUNS; run++) {
      const story = hogwartsWorldStoryFile({ title: "After the troll", place: "The Defence classroom", at: "Day 3 16:40", who: ["Quirinus Quirrell"] });
      story.people = story.people.map(person => person.name === "Quirinus Quirrell"
        ? { ...person, who_they_are: "Serves Voldemort, who lives on the back of his head under the turban. Let the troll in himself.", known: "The nervous Defence teacher. He stammers, and smells of garlic." }
        : person) as typeof story.people;
      const { mac, runner, models, storyId, head, played } = onClaude(story);
      const scene: [string, string] = ["I stay behind after class and ask Professor Quirrell about the essay on hinkypunks.",
        "Quirrell jumps when you speak, and drops his chalk. \"Ah! H-hinkypunks. One l-leg, l-lanterns, lure travellers into b-bogs,\" he says. \"T-twelve inches, by F-Friday.\" He picks up the chalk, drops it again, and laughs a thin laugh. \"Off you g-go, now. Mind the st-stairs.\""];
      played([scene]);
      new Engine(mac, models).endScene(storyId, head(), "real-end");
      const due = dueChronicle(mac, mac.tree.currentPath(storyId)!.headEntryId)!;
      try {
        const { value } = await writeChronicle(models, DEFAULT_JOB_MODELS.chronicler, chronicleAsk(mac, due), storyId, "real-known", new AbortController().signal);
        const line = value.known.find(row => row.who === "Quirinus Quirrell")?.now ?? "The nervous Defence teacher. He stammers, and smells of garlic.";
        expect(line).not.toMatch(/Voldemort|turban|let the troll in/i);
        const secret = await judge("Does this say or hint that Quirrell serves Voldemort, or hides something under his turban? Answer YES or NO.", line);
        expect(secret.yes, `${secret.said}\n\n${line}`).toBe(false);
        const beyond = await judge(
          "The passage is what Roopesh knew of Quirrell before, a Scene he played, and what he knows of Quirrell after it. Does the last part claim anything about Quirrell that neither the earlier line nor the Scene shows? Answer YES or NO.",
          `Before: The nervous Defence teacher. He stammers, and smells of garlic.\n\nThe Scene:\nRoopesh: ${scene[0]}\n${scene[1]}\n\nAfter: ${line}`);
        expect(beyond.yes, `${beyond.said}\n\n${line}`).toBe(false);
      } finally {
        runner.close();
      }
    }
  });
});

