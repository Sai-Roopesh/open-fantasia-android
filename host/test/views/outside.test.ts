import { describe, expect, it } from "vitest";
import { backstageView } from "../../src/views/backstage.js";
import { journalView } from "../../src/views/journal.js";
import { pastScene } from "../../src/views/scene.js";
import { LinkError } from "../../src/link/errors.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

const weave = (answer: Record<string, unknown>) => ({ answer: JSON.stringify({ lives: [], threads: [], happened: [], meanwhile: [], happenings: [], ...answer }) });

describe("Outside the Scene", () => {
  // WHEN the player opens the Journal and taps Scene 3
  // THEN Scene 3 is shown in full
  it("outside-the-scene › The Journal reads the Story back › Reading back", async () => {
    const played = playable(hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 21:40", who: ["Hermione Granger"] }), {
      weaver: [weave({
        happened: [
          { id: "H1", what: "Ron heard a troll got into the dungeons.", at: "Day 3 21:40", where: "the common room", known_to: ["Ron Weasley", "Roopesh Gantasala"], landmark: null },
          { id: "H2", what: "Quirrell tried the wards on the third-floor door.", at: "Day 3 21:40", where: "the third-floor corridor", known_to: ["Quirinus Quirrell"], landmark: null }
        ],
        meanwhile: [{ text: "Ron says a troll got into the dungeons.", how: "told", happened: "H1", told_by: "Ron Weasley" }]
      })]
    });
    const { engine, storyId, head, mac } = played;
    const end = async (move: string) => {
      engine.endScene(storyId, head(), "trace-end");
      await engine.woven(storyId);
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
    expect(journal.days.map(day => day.day)).toEqual(["Friday"]);
    expect(rows[0]!.scene).toMatchObject({ title: "After curfew", label: "Scene 1 · 9:40 pm · The Gryffindor common room" });
    expect(rows.at(-1)!.scene!.label).toMatch(/^Scene 4 · 9:40 pm · .* · now$/);
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
        lives: [{ who: "Quirinus Quirrell", where: "the third-floor corridor", doing: "Testing the wards again, at night.", after: "The Stone." }],
        threads: [{ name: "Quirrell and the third-floor door", now: "Quirrell has tried the wards twice and scorched the door" }],
        happened: [{ id: "H1", what: "Quirrell tested the wards on the third-floor door. Nobody saw him.", at: "Day 4 00:40", where: "the third-floor corridor", known_to: ["Quirinus Quirrell"], landmark: null }]
      })]
    });
    const { engine, storyId, head, mac } = played;
    await played.play("I say goodnight and go up.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.woven(storyId);
    await played.play("I go down to breakfast.");
    engine.redo(storyId, head(), "Keep Ron in the background.", true, "trace-redo");
    await engine.settled(storyId);

    const backstage = backstageView(mac, storyId, "trace-backstage");
    expect(backstage.offscreen[0]).toEqual({ day: "Saturday", items: [{ time: "12:40 am", what: "Quirrell tested the wards on the third-floor door. Nobody saw him.", known_to: ["Quirinus Quirrell"] }] });
    expect(backstage.threads).toContainEqual({ name: "Quirrell and the third-floor door", now: "Quirrell has tried the wards twice and scorched the door" });
    expect(backstage.lives).toContainEqual({ who: "Quirinus Quirrell", where: "the third-floor corridor", doing: "Testing the wards again, at night." });
    expect(backstage.writer).toMatchObject({ call: expect.any(String), beats: expect.arrayContaining([expect.objectContaining({ status: expect.stringMatching(/done|in_play|pending|skipped/) })]) });
    expect(backstage.taste).toEqual(["Remember: Keep Ron in the background."]);
  });
});

describe("The record (lasting-records design decision 4)", () => {
  const library = () => hogwartsWorldStoryFile({ title: "The library", place: "The library", at: "Day 3 15:00", who: ["Hermione Granger"], prose: "Hermione is at the end table." });

  // GIVEN the record of the library Scene was given up after three tries
  // WHEN the player opens Backstage
  // THEN The record lists the library Scene with why it failed, and Retry records it again
  it("outside-the-scene › Backstage shows everything else, only when visited › A gap in the record", async () => {
    const { play, engine, storyId, head, mac } = playable(library(), { chronicler: Array.from({ length: 6 }, () => ({ fail: "Sonnet is overloaded" })) });
    await play("I ask Hermione about the essay.");
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    expect(backstageView(mac, storyId, "t").record).toEqual([{ scene_number: 1, scene_title: "The library", state: "waiting", reason: expect.stringContaining("Sonnet is overloaded"), dropped: [] }]);
    for (let start = 0; start < 2; start++) { engine.chronicleAll(); await engine.chronicled(storyId); }
    expect(backstageView(mac, storyId, "t").record).toEqual([{ scene_number: 1, scene_title: "The library", state: "given_up", reason: expect.stringContaining("Sonnet is overloaded"), dropped: [] }]);

    engine.retryRecord(storyId, head(), 1, "t-retry");
    await engine.chronicled(storyId);
    expect(mac.tree.recordsOn(head(), "chronicle")).toHaveLength(1);
    expect(backstageView(mac, storyId, "t").record).toEqual([]);
  });

  it("lists a Scene recorded with parts left out, and why", async () => {
    const move = "I ask Hermione about the essay.";
    const { play, engine, storyId, head, mac } = playable(library(), { chronicler: Array.from({ length: 2 }, () => ({ answer: JSON.stringify({
      summary: "Hermione told him about the essay.",
      moments: [{ what: "He asks about the essay.", quotes: [{ entry: "E2", text: move }], there: ["Hermione Granger"], weight: 2 }],
      told: [],
      known: [{ who: "Hermione Granger", now: "word ".repeat(70).trim() }]
    }) })) });
    await play(move);
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    expect(backstageView(mac, storyId, "t").record).toEqual([{ scene_number: 1, scene_title: "The library", state: "recorded", reason: null, dropped: ["known: the line for Hermione Granger is 70 words; say it in sixty or fewer"] }]);
  });

  it("refuses Retry for a Scene with nothing missing, or when the phone has not seen the latest", async () => {
    const { play, engine, storyId, head } = playable(library());
    await play("I ask Hermione about the essay.");
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    expect(() => engine.retryRecord(storyId, head(), 1, "t")).toThrow(new LinkError("invalid", "Scene 1 is recorded; there is nothing to try again."));
    expect(() => engine.retryRecord(storyId, head(), 7, "t")).toThrow(new LinkError("not_found", "There is no Scene 7 on this Path."));
    expect(() => engine.retryRecord(storyId, "an-old-head", 1, "t")).toThrow(/moved on since you last looked/);
  });
});
