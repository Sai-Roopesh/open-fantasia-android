import { describe, expect, it } from "vitest";
import { writeChronicle } from "../../src/agents/chronicler.js";
import { writeWeave, type WeaveRecord } from "../../src/agents/weaver.js";
import { endedScene, sceneEndWeave } from "../../src/engine/scene-end.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { DEFAULT_JOB_MODELS } from "../../src/models/jobs.js";
import { Models } from "../../src/models/model-call.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import type { Engagement } from "../../src/story/state.js";
import { samePlace } from "../../src/story/places.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { freshHome } from "../support/host.js";
import { hogwartsWorldStoryFile, writeStoryFile } from "../support/story-files.js";

// Engagements task 4.1: the first play's five arrangements, recorded by the real Chronicler from the page and the real
// Weaver from Meanwhile. They run only with `npm run test:real`.
const token = readSecret(CLAUDE_TOKEN);

/** A Scene played as written, ended, and what the real Chronicler and Weaver record of it. */
async function recorded(story: StoryFile, exchanges: [string, string][], weave = false): Promise<{ page: Engagement[]; meanwhile: Engagement[]; said: string }> {
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
  const closed = mac.tree.append(imported.storyId, at, { kind: "scene_closed", by: "player" });
  mac.tree.moveHead(path.id, at, closed.id);
  try {
    const ended = mac.states.at(closed.id);
    const chronicle = await writeChronicle(models, [DEFAULT_JOB_MODELS.chronicler], { state: ended, scene: endedScene(mac, closed.id, ended) }, imported.storyId, "real-chronicle", new AbortController().signal);
    let world: WeaveRecord | null = null;
    if (weave) {
      // The World moves on from the record, as a Scene's end does it: the Chronicler's entry first, then the Weaver.
      const recorded = mac.tree.append(imported.storyId, closed.id, { kind: "chronicle", scene: ended.scene!.number, ...chronicle.value, dropped: chronicle.dropped, callId: chronicle.callId, model: chronicle.model });
      mac.tree.moveHead(path.id, closed.id, recorded.id);
      const state = mac.states.at(recorded.id);
      world = (await writeWeave(models, [DEFAULT_JOB_MODELS.weaver], sceneEndWeave(mac, recorded.id, state), imported.storyId, "real-weave", new AbortController().signal)).value;
    }
    return {
      page: chronicle.value.engagements,
      meanwhile: world?.meanwhile.flatMap(line => (line.engagement ? [line.engagement] : [])) ?? [],
      said: JSON.stringify({ page: chronicle.value.engagements, dropped: chronicle.dropped, meanwhile: world?.meanwhile })
    };
  } finally {
    runner.close();
  }
}

const opening = (title: string, place: string, at: string, who: string[], prose: string) => hogwartsWorldStoryFile({ title, place, at, who, prose });
const day = (engagement: Engagement) => Number(/^Day (\d+)/.exec(engagement.at)?.[1] ?? 0);

describe.skipIf(!token)("Engagements recorded by the real agents", () => {
  it("records at least four of the first play's five arrangements, with the right day, place and expected, and invents none", async () => {
    const results: { name: string; ok: boolean; said: string }[] = [];

    // 1. Draconia's Wednesdays, set on a Sunday (Day 5; Day 1 was a Wednesday), and he agrees.
    const wednesdays = await recorded(opening("The price of a slap", "The Great Hall", "Day 5 07:30", ["Draconia Malfoy"], "Draconia sits down opposite him without asking."), [
      ["I ask Draconia what the slap is going to cost me.", "She does not look up from her toast. \"Wednesdays, in the library, half past seven. You'll be there before me.\""],
      ["I sigh and say, \"yeah alright i will be there\"", "\"I shan't accept yeah on Wednesday, so you might as well practise now.\""]
    ]);
    results.push({ name: "Wednesdays", said: wednesdays.said, ok: wednesdays.page.some(item => item.every === "week" && day(item) === 8 && item.at.endsWith("19:30") && samePlace(item.place, "the library") && item.expected) });

    // 2. Hermione's invitation, on a Saturday (Day 4), not taken up.
    const invitation = await recorded(opening("Saturday, in daylight", "The Great Hall", "Day 4 07:30", ["Hermione Granger"], "Hermione has three books open beside her porridge."), [
      ["I sit down and pull the toast towards me.", "\"If anyone wants to do the Charms essay properly instead of copying it on Sunday night, I'll be at the end table in the library from nine,\" Hermione says, to nobody in particular."],
      ["I say nothing and finish my porridge.", "She goes back to her book, but she turns the page too hard."]
    ]);
    results.push({ name: "Hermione", said: invitation.said, ok: invitation.page.some(item => day(item) === 4 && samePlace(item.place, "the library") && !item.expected && item.who.includes("Hermione Granger")) });

    // 3. Flitwick's practical, named on a Wednesday evening (Day 8) for Friday (Day 10).
    const practical = await recorded(opening("The working lamp", "The library", "Day 8 19:30", ["Draconia Malfoy"], "Draconia has the end table, and a second chair she has not offered."), [
      ["I sit in the second chair.", "\"A Malfoy doesn't carry debts about like loose change, so you are going to make Flitwick's practical on Friday at ten a credit to me.\""],
      ["I take out my wand.", "\"Not like that. The wrist goes down.\""]
    ]);
    results.push({ name: "Flitwick", said: practical.said, ok: practical.page.some(item => day(item) === 10 && /charms|flitwick/i.test(`${item.place} ${item.what}`)) });

    // 4. McGonagall's summons, sent overnight through Meanwhile.
    const summonsStory = opening("Saturday night", "The Gryffindor common room", "Day 4 22:30", ["Hermione Granger"], "The fire is low.");
    summonsStory.threads = [{ name: "The troll accounts", now: "McGonagall is taking each witness's account of the troll in her office; tonight she is writing a note summoning Roopesh to her office at nine tomorrow morning" }];
    const summons = await recorded(summonsStory, [["I say goodnight to Hermione and go up.", "\"Goodnight,\" she says, without looking up."]], true);
    results.push({ name: "McGonagall", said: summons.said, ok: summons.meanwhile.some(item => day(item) === 5 && /mcgonagall/i.test(`${item.place} ${item.who.join(" ")}`) && item.expected) });

    // 5. Draconia's note, under the door before breakfast.
    const noteStory = opening("Saturday night", "The Gryffindor common room", "Day 4 22:30", ["Hermione Granger"], "The fire is low.");
    noteStory.threads = [{ name: "The debt", now: "Draconia has written a note for Roopesh, to be pushed under his door before breakfast: \"Library. Ten o'clock.\"" }];
    const note = await recorded(noteStory, [["I say goodnight to Hermione and go up.", "\"Goodnight,\" she says, without looking up."]], true);
    results.push({ name: "note", said: note.said, ok: note.meanwhile.some(item => day(item) === 5 && item.at.endsWith("10:00") && samePlace(item.place, "the library")) });

    // A Scene with nothing arranged in it records none.
    const nothing = await recorded(opening("Supper", "The Great Hall", "Day 4 19:00", ["Ron Weasley"], "Ron is on his third helping."), [
      ["I ask Ron how he can eat that much.", "\"Practice,\" Ron says, and reaches for the potatoes."]
    ]);

    const report = results.map(result => `${result.ok ? "✓" : "✗"} ${result.name}: ${result.said}`).join("\n");
    console.log(report);
    expect(results.filter(result => result.ok).length, report).toBeGreaterThanOrEqual(4);
    expect(nothing.page, nothing.said).toEqual([]);
  }, 20 * 60 * 1000);
});
