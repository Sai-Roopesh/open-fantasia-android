import { describe, expect, it } from "vitest";
import { writeWeave, type WeaveRecord } from "../../src/agents/weaver.js";
import { Engine } from "../../src/engine/engine.js";
import { dueWeave, weaveAsk } from "../../src/engine/weaving.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { DEFAULT_JOB_MODELS } from "../../src/models/jobs.js";
import { Models } from "../../src/models/model-call.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { minutesOf, parseStoryTime } from "../../src/time.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { freshHome } from "../support/host.js";
import { hogwartsWorldStoryFile, nightTrainStoryFile, writeStoryFile } from "../support/story-files.js";

// These call the real Weaver on its default model, and a judge, through the player's Claude subscription. They run
// only with `npm run test:real`.
const token = readSecret(CLAUDE_TOKEN);
const RUNS = 3;

/** A Scene played as written (no models), ended by the player, and the Weaver's real answer for the span after it. */
async function woven(story: StoryFile, exchanges: [string, string][], span: { from?: string; until?: string } = {}): Promise<WeaveRecord> {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(story), mac);
  if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported.problems)}`);
  const runner = new ClaudeRunner(mac.home, () => token);
  const models = new Models(mac.db, { claude: runner });
  const path = mac.tree.currentPath(imported.storyId)!;
  let at = path.headEntryId;
  for (const [move, reply] of exchanges) {
    const moved = mac.tree.append(imported.storyId, at, { kind: "move", text: move });
    const replied = mac.tree.append(imported.storyId, moved.id, { kind: "reply", text: reply, callId: "written-by-the-test", model: { provider: "claude", model: "written-by-the-test" } });
    mac.tree.moveHead(path.id, at, replied.id);
    at = replied.id;
  }
  new Engine(mac, models).endScene(imported.storyId, at, "real-end");
  const due = dueWeave(mac, mac.tree.currentPath(imported.storyId)!.headEntryId)!;
  const ask = weaveAsk(mac, due);
  try {
    const { value } = await writeWeave(models, DEFAULT_JOB_MODELS.weaver, { ...ask, ...span }, imported.storyId, "real-weave", new AbortController().signal);
    return value;
  } finally {
    runner.close();
  }
}

async function judge(question: string, passage: string): Promise<{ yes: boolean; said: string }> {
  const mac = freshHome();
  const runner = new ClaudeRunner(mac.home, () => token);
  const answer = await new Models(mac.db, { claude: runner }).call({
    agent: "judge",
    model: { provider: "claude", model: "claude-sonnet-5-5" },
    system: "You judge a passage. Answer YES or NO first, then quote the exact words that decided it.",
    prompt: `<passage>\n${passage}\n</passage>\n\n${question}`,
    traceId: "judge",
    storyId: null
  });
  runner.close();
  return { yes: /^\W*YES\b/i.test(answer.text), said: answer.text };
}

const commonRoom: [string, string][] = [
  ["I sit at the other end of the sofa and ask Hermione what she's reading.", "\"Hogwarts: A History,\" she says, without looking up. \"Again.\" The fire pops. She turns a page she has not read."],
  ["I say goodnight and go up to bed.", "\"Goodnight, Roopesh,\" she says, and does not look up until you are on the stairs."]
];

const show = (record: WeaveRecord) => JSON.stringify(record, null, 2);

describe.skipIf(!token)("the Weaver on Claude", () => {
  // GIVEN the Thread "the dragon egg in Hagrid's hut" and a week of Story time in which the Player Character never goes near Hagrid
  // THEN Backstage shows the Thread further along at the end of the week
  it("living-world › Threads develop off-screen › The dragon egg moves without the player", async () => {
    for (let run = 0; run < RUNS; run++) {
      const record = await woven(hogwartsWorldStoryFile({ at: "Day 3 22:40" }), commonRoom, { until: "Day 10 07:00" });
      const egg = record.threads.find(thread => /egg/i.test(thread.name));
      expect(egg, `run ${run + 1}: ${show(record)}`).toBeDefined();
      const verdict = await judge("A week ago this situation stood like this: \"Hagrid is keeping it warm in the fire\". The passage says where it stands a week later. Is it further along than it was, in any way? Answer YES or NO.", egg!.now);
      expect(verdict.yes, `run ${run + 1}: ${verdict.said}\n${egg!.now}`).toBe(true);
    }
  });

  // GIVEN the Hufflepuff Quidditch Group's Life touches nothing the Player Character will meet this week
  // WHEN the week passes off-screen
  // THEN their Life is unchanged
  it("living-world › Off-screen time is resolved only as far as it reaches the player › Nothing written that no one will meet", async () => {
    for (let run = 0; run < RUNS; run++) {
      const record = await woven(hogwartsWorldStoryFile({ at: "Day 3 22:40" }), commonRoom, { until: "Day 10 07:00" });
      expect(record.lives.map(life => life.who), `run ${run + 1}: ${show(record)}`).not.toContain("The Hufflepuff Quidditch team");
    }
  });

  // GIVEN Lavender has been telling people Selwyn's bones broke one after another
  // AND the Player Character could have heard it at breakfast
  // THEN Meanwhile shows it marked as rumour
  it("day-view › Meanwhile shows only what the Player Character knows › A rumour is marked as one", async () => {
    const story = hogwartsWorldStoryFile({ at: "Day 3 22:40" });
    story.people.push({ name: "Selwyn", who_they_are: "A Slytherin fifth-year who fell from his broom." });
    story.threads = [...(story.threads ?? []), { name: "Selwyn's fall", now: "Selwyn fell from his broom at practice; Lavender is telling everyone in Gryffindor Tower his bones broke one after another, \"like someone snapping kindling\", and it will be all anyone talks about at breakfast" }];
    for (let run = 0; run < RUNS; run++) {
      const record = await woven(story, commonRoom);
      const selwyn = record.meanwhile.filter(item => /selwyn/i.test(item.text));
      expect(selwyn.length, `run ${run + 1}: ${show(record)}`).toBeGreaterThan(0);
      expect(selwyn.every(item => item.how === "rumour"), `run ${run + 1}: ${show(record)}`).toBe(true);
    }
  });

  // GIVEN Quirrell tested the third-floor door overnight and nobody saw him
  // THEN Meanwhile says nothing about it
  // AND Backstage shows it
  it("day-view › Meanwhile shows only what the Player Character knows › Quirrell's night stays hidden", async () => {
    for (let run = 0; run < RUNS; run++) {
      const record = await woven(hogwartsWorldStoryFile({ at: "Day 3 22:40" }), commonRoom);
      expect(record.meanwhile.some(item => /quirrell|third.floor|ward/i.test(item.text)), `run ${run + 1}: ${show(record)}`).toBe(false);
      const night = record.happened.filter(item => /quirrell|third.floor|ward/i.test(item.what));
      expect(night.length, `run ${run + 1}: ${show(record)}`).toBeGreaterThan(0);
      expect(night.every(item => !item.knownTo.includes("Roopesh Gantasala")), `run ${run + 1}: ${show(record)}`).toBe(true);
    }
  });

  // GIVEN Crabbe and Goyle are a Group
  // WHEN a day passes off-screen
  // THEN Backstage shows one Life for them together, such as running Draconia's errands
  it("living-world › Everyone has a Life › A Group lives as one", async () => {
    const story = hogwartsWorldStoryFile({ title: "The corridor", place: "The dungeon corridor", at: "Day 3 17:00", who: ["Draconia Malfoy", "Vincent Crabbe", "Gregory Goyle"], prose: "Draconia is waiting by the Potions door with Crabbe and Goyle behind her like two wardrobes." });
    const corridor: [string, string][] = [
      ["I nod to Draconia on my way past.", "\"Gantasala.\" She does not nod back. Behind her, Crabbe cracks his knuckles. \"Go and find out where Potter goes after dinner,\" she tells them, without looking round, and they lumber off."]
    ];
    for (let run = 0; run < RUNS; run++) {
      const record = await woven(story, corridor, { until: "Day 4 17:00" });
      const who = record.lives.map(life => life.who);
      expect(who, `run ${run + 1}: ${show(record)}`).toContain("Crabbe and Goyle");
      expect(who.filter(name => name === "Vincent Crabbe" || name === "Gregory Goyle"), `run ${run + 1}`).toEqual([]);
    }
  });
  // GIVEN the World last stood at 7:40 am at Kalka, and a Scene at Barog opens at 9:05 am and ends with Ishaan still on the platform, listening for a bird with Meera
  // WHEN the World moves on
  // THEN what happened at Barog happened at 9:05 am, as the Scene says
  // AND nothing that happened before 9:05 am is known to Ishaan, and nothing has him back on the train
  it("living-world › Only the player makes facts about the Player Character › The World moves on around him", async () => {
    const story = nightTrainStoryFile();
    const barog: [string, string][] = [
      ["I get down after her to stretch my legs while the engine takes water.", "The mist has come up out of the valley and swallowed everything past the railings. Somewhere behind her the engine hisses and a man in a khaki cap swings the water spout over.\n\nThen, under it, a call. Three notes, rising, a pause, then a rattle. Meera goes still, walks to the platform's edge, and lifts the binoculars at the mist.\n\nShe knows he is there before she looks. \"Shh,\" she says, though he hasn't said anything, and then, more quietly, \"Listen.\" The bird does not oblige. \"It's here,\" she says. \"It's right here. I just can't see it.\""]
    ];
    for (let run = 0; run < RUNS; run++) {
      const record = await woven(story, barog, { from: "Day 2 07:40" });
      const earlier = record.happened.filter(item => item.knownTo.includes("Ishaan Mehra") && minutesOf(parseStoryTime(item.at)!) < minutesOf(parseStoryTime("Day 2 09:05")!));
      expect(earlier, `run ${run + 1}: ${show(record)}`).toEqual([]);
      const verdict = await judge("Does anything here put the train's stop at Barog, or anything on the platform there, before 9:05 am (Day 2 09:05), or have Ishaan get back on the train or the train leave Barog with him?", show(record));
      expect(verdict.yes, `run ${run + 1}: ${verdict.said}\n${show(record)}`).toBe(false);
    }
  });
});

