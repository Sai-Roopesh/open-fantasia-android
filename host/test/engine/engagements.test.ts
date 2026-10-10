import { describe, expect, it } from "vitest";
import type { Script } from "../../src/models/scripted.js";
import type { Chronicle, Entry } from "../../src/story/entries.js";
import { engagementsOn } from "../../src/story/engagements.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

const ORDER = "\"Wednesdays, in the library, half past seven. You'll be there before me.\"";
const AGREED = "yeah alright i will be there";

/** Sunday morning, Day 5 (Day 1 was a Wednesday): Draconia sets the price of the slap. */
function sundayMorning(chronicler: Script[]) {
  const story = hogwartsStoryFile({ title: "The price of a slap", place: "The Great Hall", at: "Day 5 07:30", who: ["Draconia Malfoy"], prose: "Draconia sits down opposite him without asking." });
  return playable(story, { actor: [{ answer: `She does not look up from her toast. ${ORDER}` }], chronicler });
}

const record = (engagements: unknown[], changed: unknown[] = []): Script => ({ answer: JSON.stringify({
  summary: "Draconia set Wednesdays in the library as the price of the slap, and he agreed.",
  moments: [{ what: "She sets the price of the slap.", quotes: [{ entry: "E3", text: ORDER }], there: ["Draconia Malfoy"], weight: 3 }],
  told: [], engagements, changed
}) });

const wednesdays = (quotes: unknown[]) => ({ what: "Draconia's hour on the Charms practical, in the library.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week", quotes });

describe("an Engagement is recorded where it is made (openspec living-world)", () => {
  // WHEN a Scene ends in which Draconia says "Wednesdays, in the library, half past seven. You'll be there before me."
  //   and the player's Move answers "yeah alright i will be there"
  // THEN a weekly Engagement is recorded for Wednesdays at 7:30 pm in the library, with Draconia, he is expected, and
  //   it quotes her words and his
  it("living-world › An Engagement is recorded where it is made › Made in a Reply", async () => {
    const { play, engine, storyId, head, mac } = sundayMorning([record([wednesdays([{ entry: "E3", text: ORDER }, { entry: "E4", text: AGREED }])])]);
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.chronicled(storyId);
    const [chronicle] = mac.tree.recordsOn(head(), "chronicle") as Entry<Chronicle>[];
    const reply = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "reply")!;
    const move = mac.tree.pathTo(head()).filter(entry => entry.payload.kind === "move")[1]!;
    expect(chronicle!.payload.engagements).toEqual([{ id: expect.stringMatching(/^g-/), what: "Draconia's hour on the Charms practical, in the library.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week",
      quotes: [{ entry: reply.id, text: ORDER }, { entry: move.id, text: AGREED }] }]);
  });

  // WHEN the record of a Scene gives an Engagement whose quote is not in any Move or Reply of that Scene
  // THEN that Engagement is left out and noted, and the rest of the record is kept
  it("living-world › An Engagement is recorded where it is made › Words that are not on the page", async () => {
    const invented = record([wednesdays([{ entry: "E3", text: "Thursdays at the Owlery, at six." }])]);
    const { play, engine, storyId, head, mac } = sundayMorning([invented, invented]);
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.chronicled(storyId);
    const [chronicle] = mac.tree.recordsOn(head(), "chronicle") as Entry<Chronicle>[];
    expect(chronicle!.payload.engagements).toEqual([]);
    expect(chronicle!.payload.moments).toHaveLength(1);
    expect(chronicle!.payload.dropped).toEqual([
      "engagements: engagement 1, quote 1 is not word for word in E3; copy the words exactly",
      "engagements: engagement 1 has no quote that could be kept, so it is left out"
    ]);
  });

  // WHEN Pansy and Draconia agree, in the Slytherin common room, to meet at the Owlery at six
  // THEN no Engagement of his is recorded
  it("living-world › An Engagement is recorded where it is made › Arranged behind his back", async () => {
    const owlery = { answer: JSON.stringify({ lives: [], threads: [], meanwhile: [], happenings: [],
      happened: [{ id: "H1", what: "Pansy and Draconia agreed to meet at the Owlery at six.", at: "Day 5 08:30", where: "The Slytherin common room", known_to: ["Draconia Malfoy"], landmark: null }] }) };
    const story = hogwartsStoryFile({ title: "The price of a slap", place: "The Great Hall", at: "Day 5 07:30", who: ["Draconia Malfoy"], prose: "Draconia sits down opposite him without asking." });
    const { play, engine, storyId, head, mac } = playable(story, { weaver: [owlery], unplanned: true });
    await play("I finish my toast and leave.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    await engine.chronicled(storyId);
    expect(engagementsOn(mac, head(), "Day 5 09:00")).toEqual([]);
  });

  it("shows the Chronicler what is on, so a Scene can move or call one off", async () => {
    const { play, engine, storyId, head, models } = sundayMorning([record([wednesdays([{ entry: "E3", text: ORDER }, { entry: "E4", text: AGREED }])])]);
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.chronicled(storyId);
    await play("Later, I find her in the corridor.");
    engine.endScene(storyId, head(), "end-2");
    await engine.chronicled(storyId);
    expect(models.chronicler.requests.at(-1)!.prompt).toContain("<engagements_on>\n- E1: Draconia's hour on the Charms practical, in the library. Every Wednesday at 7:30 pm from Day 8 19:30, The library, with Draconia Malfoy, he is expected");
  });
});
