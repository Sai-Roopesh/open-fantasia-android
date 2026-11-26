import { describe, expect, it } from "vitest";
import { fakeWriterAnswer } from "../../src/models/fake.js";
import type { Script } from "../../src/models/scripted.js";
import { hogwartsStoryFile } from "../support/story-files.js";
import { playable } from "../support/play.js";

/** The Writer's ordinary answer, with its Reply beginning [minutes] after now: the code makes the clock from it. */
const writerIn = (minutes: number): Script => ({ from: request => ({ answer: JSON.stringify({ ...JSON.parse((fakeWriterAnswer(request) as { answer: string }).answer) as object, minutes }) }) });

describe("the Day View", () => {
  // GIVEN it is Sunday and Draconia's flying test is a Landmark on Wednesday
  // THEN the Day View shows "3 days to Draconia's flying test"
  it("day-view › The Day View says where and when the player is › A countdown", async () => {
    const sunday = hogwartsStoryFile({ title: "Sunday evening", place: "The Gryffindor common room", at: "Day 5 19:00" });
    const { play, engine, storyId, head, view } = playable(sunday, { writer: [writerIn(0)] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    expect(view().day_view).toEqual({
      at: "Day 5 19:00",
      at_label: "Sunday 7:00 pm",
      day: "Sunday 8 September",
      time: "7:00 pm",
      place: "The Gryffindor common room",
      countdowns: [{ landmark: "Draconia's flying test", when: "3 days", label: "3 days to Draconia's flying test" }],
      scene_span: "Sunday 7:00 pm – 7:00 pm",
      // Every step of the Scene's end is done, so the Day View is ready (openspec presence: Between Scenes is quiet).
      scene_end: { step: null, failed: null, rethinking: null },
      reaction: null,
      // What he learned meanwhile, and what is on, are the Weaver's and the Director's (openspec presence, day-view).
      meanwhile: expect.any(Array),
      happenings: expect.any(Array),
      choices: expect.any(Object)
    });
  });

  it("says tomorrow and today, and leaves out Landmarks already past", async () => {
    const story = hogwartsStoryFile({ at: "Day 7 19:00" });
    story.landmarks = [
      { name: "the Sorting", at: "Day 1 18:00", what: "Long past." },
      { name: "the feast", at: "Day 7 20:30", what: "Tonight." },
      { name: "Draconia's flying test", at: "Day 8 10:00", what: "Tomorrow." }
    ];
    const { play, engine, storyId, head, view } = playable(story);
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    expect(view().day_view!.countdowns.map(countdown => countdown.label)).toEqual(["Today at 8:30 pm: the feast", "Tomorrow: Draconia's flying test"]);
    expect(view().day_view!.countdowns.map(countdown => countdown.when)).toEqual(["Today at 8:30 pm", "Tomorrow"]);
  });

  // GIVEN the Scene "Flying lesson" ends at 5:20 pm on Thursday
  // WHEN the Day View opens
  // THEN it is Thursday 5:20 pm
  it("day-view › The Day View opens when the Player Character is next free to choose › A Scene ends in the afternoon", async () => {
    const lesson = hogwartsStoryFile({ title: "Flying lesson", place: "The Quidditch pitch", at: "Day 2 17:00", who: ["Draconia Malfoy"] });
    const { play, engine, storyId, head, view } = playable(lesson, { writer: [writerIn(20)] });
    await play("I land and hand back the broom.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    expect(view().day_view).toMatchObject({ at: "Day 2 17:20", day: "Thursday 5 September", time: "5:20 pm" });
  });

  // GIVEN the Scene "After curfew" ends at 11:05 pm on Friday
  // WHEN the Day View opens
  // THEN it is Saturday morning
  // AND Meanwhile can say what the Player Character learned overnight and on waking, and nothing he could not know
  // (What Meanwhile holds is the Weaver's: day-view › Meanwhile shows only what the Player Character knows.)
  it("day-view › The Day View opens when the Player Character is next free to choose › A late Scene ends", async () => {
    const curfew = hogwartsStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 21:40", who: ["Hermione Granger"] });
    const { play, engine, storyId, head, view, state, models } = playable(curfew, { writer: [writerIn(85)] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    expect(view().day_view).toMatchObject({ at: "Day 4 07:30", day: "Saturday 7 September", time: "7:30 am" });
    expect(state().scene?.endedAt).toBe("Day 3 23:05");
    // The World moved on over the night, to Saturday morning.
    expect(models.weaver.requests.at(-1)!.facts).toMatchObject({ from: "Day 3 23:05", until: "Day 4 07:30", gap: false });
    // The night has passed: the next Move is planned from Saturday morning, and never before it.
    await play("I go down to breakfast.");
    expect(models.writer.requests.at(-1)!.prompt).toContain("It is Saturday 7 September 1991, 7:30 am (1991-09-07 07:30).");
  });

  it("has no Happenings until every step of the Scene's end is done, then the Story's pick first, in the Director's words", async () => {
    const sunday = hogwartsStoryFile({ title: "Sunday evening", place: "The Gryffindor common room", at: "Day 5 19:00" });
    const { play, engine, storyId, head, view } = playable(sunday, { writer: [writerIn(0)] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    expect(view().day_view).toMatchObject({ scene_end: { step: "chronicler", failed: null }, happenings: [] });
    await engine.ended(storyId);
    const ready = view().day_view!;
    expect(ready.scene_end).toEqual({ step: null, failed: null, rethinking: null });
    // The fake Director's first Scene that matters: tomorrow at ten, in the Great Hall, with the first Lead.
    expect(ready.happenings[0]).toMatchObject({ pick: true, at: "Day 6 10:00", time: "Tomorrow 10:00 am", place: "the Great Hall", what: "Something is going on there that matters to him.", who: ["Draconia Malfoy"], expected: false });
    expect(ready.happenings.filter(item => item.pick)).toHaveLength(1);
  });

  it("carries the player's reaction to the Scene that ended", async () => {
    const { play, engine, storyId, head, view } = playable(hogwartsStoryFile({ at: "Day 5 19:00" }));
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    engine.setReaction(storyId, 1, "more", "More of her temper.", "trace-reaction");
    expect(view().day_view!.reaction).toBe("more");
    engine.setReaction(storyId, 1, null, null, "trace-cleared");
    expect(view().day_view!.reaction).toBeNull();
  });

  it("offers the Leads and the Scene's people to follow, the Story's places, and later times to skip to", async () => {
    const sunday = hogwartsStoryFile({ title: "Sunday evening", place: "The Gryffindor common room", at: "Day 5 19:00", who: ["Hermione Granger"] });
    sunday.world = { places: [{ name: "The library" }, { name: "Hagrid's hut" }] };
    const { play, engine, storyId, head, view } = playable(sunday);
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    expect(view().day_view!.choices).toEqual({
      follow: ["Hermione Granger", "Draconia Malfoy"],
      places: ["The library", "Hagrid's hut"],
      skips: [
        { label: "Tomorrow", in_sentence: "tomorrow", at: "Day 6 07:30", time: "Monday 7:30 am", days_away: 1 },
        { label: "Next week", in_sentence: "next week", at: "Day 12 07:30", time: "Sunday 7:30 am", days_away: 7 },
        { label: "Draconia's flying test", in_sentence: "Draconia's flying test", at: "Day 8 10:00", time: "Wednesday 10:00 am", days_away: 3 }
      ]
    });
  });

  it("says a Skip on the Day View's own day without the day, and each Skip's label as it reads in a sentence", async () => {
    const friday = hogwartsStoryFile({ title: "Friday morning", place: "The Gryffindor common room", at: "Day 3 09:00", who: ["Hermione Granger"] });
    const { play, engine, storyId, head, view } = playable(friday);
    await play("I say goodbye.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    expect(view().day_view!.choices.skips.map(skip => [skip.label, skip.in_sentence, skip.time])).toEqual([
      ["This evening", "this evening", "6:00 pm"],
      ["Tomorrow", "tomorrow", "Saturday 7:30 am"],
      ["Next week", "next week", "Friday 7:30 am"],
      ["Draconia's flying test", "Draconia's flying test", "Wednesday 10:00 am"]
    ]);
  });

  // GIVEN it is Friday, and the next Landmark, the Halloween troll, is on a Thursday 48 days on
  // THEN Skip to later offers it as "Thursday 7:00 pm · in 48 days", and next week as "Friday 7:30 am · in 7 days"
  it("day-view › The player chooses where to be › A Landmark weeks away", async () => {
    const friday = hogwartsStoryFile({ title: "Friday morning", place: "The Gryffindor common room", at: "Day 3 09:00", who: ["Hermione Granger"] });
    friday.landmarks = [{ name: "The Halloween troll", at: "Day 51 19:00", what: "A troll in the dungeons." }];
    const { play, engine, storyId, head, view } = playable(friday);
    await play("I say goodbye.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    // The phone says "in N days" a week or more away, from days_away (DayView.dc.html).
    const skips = view().day_view!.choices.skips;
    expect(skips.find(skip => skip.label === "The Halloween troll")).toMatchObject({ time: "Thursday 7:00 pm", days_away: 48 });
    expect(skips.find(skip => skip.label === "Next week")).toMatchObject({ time: "Friday 7:30 am", days_away: 7 });
    expect(skips.find(skip => skip.label === "Tomorrow")).toMatchObject({ time: "Saturday 7:30 am", days_away: 1 });
  });
});
