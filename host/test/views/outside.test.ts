import { describe, expect, it } from "vitest";
import { fakeChronicleAnswer, fakeWriterAnswer } from "../../src/models/fake.js";
import type { Script } from "../../src/models/scripted.js";
import { backstageView } from "../../src/views/backstage.js";
import { journalView } from "../../src/views/journal.js";
import { pastScene } from "../../src/views/scene.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

/** The Weaver's answer, in its format, with nothing moved but what [answer] says. */
const weave = (answer: Record<string, unknown>): Script => ({ answer: JSON.stringify({ lives: [], threads: [], happened: [], meanwhile: [], on: [], ...answer }) });
/** Something that happened, in the Weaver's format. */
const happened = (item: { id: string; what: string; at: string; where: string; known_to: string[] }) => ({ landmark: null, move: null, missed: null, ...item });
/** The Writer's ordinary answer, with its Reply beginning [minutes] after now: the code makes the clock from it. */
const writerIn = (minutes: number): Script => ({ from: request => ({ answer: JSON.stringify({ ...JSON.parse((fakeWriterAnswer(request) as { answer: string }).answer) as object, minutes }) }) });

describe("Outside the Scene", () => {
  // WHEN the player opens the Journal and taps Scene 3
  // THEN Scene 3 is shown in full
  it("outside-the-scene › The Journal reads the Story back › Reading back", async () => {
    // The first Scene runs an hour and more, past bedtime, so the World moves on over the night after it.
    const played = playable(hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 21:40", who: ["Hermione Granger"] }), {
      writer: [writerIn(70)],
      weaver: [weave({
        happened: [
          happened({ id: "H1", what: "Ron heard a troll got into the dungeons.", at: "Day 3 23:30", where: "the common room", known_to: ["Ron Weasley"] }),
          happened({ id: "H2", what: "Quirrell tried the wards on the third-floor door.", at: "Day 4 01:00", where: "the third-floor corridor", known_to: ["Quirinus Quirrell"] })
        ],
        meanwhile: [{ text: "Ron says a troll got into the dungeons.", how: "told", happened: "H1", told_by: "Ron Weasley", about: ["Ron Weasley"], engagement: null }]
      })]
    });
    const { engine, storyId, head, mac } = played;
    const end = async (move: string) => {
      engine.endScene(storyId, head(), "trace-end");
      await engine.ended(storyId);
      await played.play(move);
    };
    await played.play("I say goodnight to Hermione.");
    await end("I go down to the kitchens.");
    await end("I climb to the owlery.");
    await end("I go back to the common room.");

    const journal = journalView(mac, storyId, "trace-journal");
    const rows = journal.days.flatMap(day => day.rows);
    expect(rows.map(row => row.kind === "scene" ? `Scene ${row.scene!.number}${row.scene!.now ? " now" : ""}` : `${row.meanwhile!.how}: ${row.meanwhile!.text}`)).toEqual([
      "Scene 1", "told: Ron says a troll got into the dungeons.", "Scene 2", "Scene 3", "Scene 4 now"
    ]);
    expect(journal.days.map(day => day.day)).toEqual(["Friday", "Saturday"]);
    expect(rows[0]!.scene).toMatchObject({ title: "After curfew", label: "Scene 1 · 9:40 pm · The Gryffindor common room", summary: "The Scene was played to its end." });
    expect(rows.at(-1)!.scene!.label).toMatch(/^Scene 4 · \d+:\d\d [ap]m · .* · now$/);
    expect(JSON.stringify(journal)).not.toMatch(/Quirrell|wards/);

    const third = pastScene(mac, storyId, 3, "trace-past");
    expect(third.exchanges.map(exchange => exchange.move?.text).filter(Boolean)).toEqual(["I climb to the owlery."]);
    expect(third.exchanges.some(exchange => exchange.reply)).toBe(true);
  });

  // WHEN the player opens Backstage for Saturday night
  // THEN it shows what Quirrell did that night
  it("outside-the-scene › Backstage shows everything else, only when visited › Quirrell's nights, Backstage", async () => {
    const played = playable(hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 23:00", who: ["Hermione Granger"] }), {
      weaver: [weave({
        lives: [{ who: "Hermione Granger", where: "the girls' dormitory", doing: "Reading under the covers.", after: "Top marks." }],
        threads: [{ name: "Quirrell and the third-floor door", now: "Quirrell has tried the wards twice and scorched the door" }],
        happened: [happened({ id: "H1", what: "Quirrell tested the wards on the third-floor door. Nobody saw him.", at: "Day 4 00:40", where: "the third-floor corridor", known_to: ["Quirinus Quirrell"] })]
      })]
    });
    const { engine, storyId, head, mac } = played;
    await played.play("I say goodnight and go up.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    await played.play("I go down to breakfast.");
    engine.redo(storyId, head(), "Keep Ron in the background.", true, "trace-redo");
    await engine.settled(storyId);

    const backstage = backstageView(mac, storyId, "trace-backstage");
    expect(backstage.offscreen[0]).toEqual({ day: "Saturday", items: [{ time: "12:40 am", what: "Quirrell tested the wards on the third-floor door. Nobody saw him.", known_to: ["Quirinus Quirrell"] }] });
    expect(backstage.threads).toContainEqual({ name: "Quirrell and the third-floor door", now: "Quirrell has tried the wards twice and scorched the door" });
    expect(backstage.lives).toContainEqual({ who: "Hermione Granger", where: "the girls' dormitory", doing: "Reading under the covers." });
    expect(backstage.writer).toMatchObject({ call: expect.any(String), beats: expect.arrayContaining([expect.objectContaining({ status: expect.stringMatching(/done|in_play|pending|skipped/) })]) });
    expect(backstage.taste).toEqual(["Remember: Keep Ron in the background."]);
  });

  // GIVEN a Scene's record was kept with a Moment left out, because its words were not on the page
  // WHEN the player opens Backstage
  // THEN The record lists that Scene, the Moment left out, and why
  it("outside-the-scene › Backstage shows everything else, only when visited › A gap in the record", async () => {
    const move = "I ask Hermione about the essay.";
    // P1 is the opening prose, P2 the Move, P3 the Reply: Hermione's words are nowhere on the page.
    const record: Script = { from: request => ({ answer: JSON.stringify({
      ...JSON.parse((fakeChronicleAnswer(request) as { answer: string }).answer) as object,
      moments: [
        { what: "He asks about the essay.", quotes: [{ entry: "P2", text: move }], there: ["Hermione Granger"], weight: 2 },
        { what: "Hermione says the essay is already finished.", quotes: [{ entry: "P3", text: "It's finished, obviously." }], there: ["Hermione Granger"], weight: 3 }
      ]
    }) }) };
    const library = hogwartsWorldStoryFile({ title: "The library", place: "The library", at: "Day 3 15:00", who: ["Hermione Granger"], prose: "Hermione is at the end table." });
    const { play, engine, storyId, head, mac, state } = playable(library, { chronicler: [record] });
    await play(move);
    engine.endScene(storyId, head(), "t-end");
    await engine.ended(storyId);
    expect(backstageView(mac, storyId, "t").record).toEqual([{ scene_number: 1, scene_title: "The library", dropped: [
      "moments[1]: \"It's finished, obviously.\" is not in P3",
      "moments[1]: none of its words are on the page"
    ] }]);
    // The rest of the record is kept.
    expect(state().facts.filter(fact => fact.source === "page").map(fact => fact.what)).toEqual(["He asks about the essay."]);
    expect(state().recorded.map(row => row.summary)).toEqual(["The Scene was played to its end."]);
  });

  it("lists no Scene whose record was kept whole", async () => {
    const { play, engine, storyId, head, mac } = playable(hogwartsWorldStoryFile());
    await play("I ask Hermione about the essay.");
    engine.endScene(storyId, head(), "t-end");
    await engine.ended(storyId);
    expect(backstageView(mac, storyId, "t").record).toEqual([]);
  });
});
