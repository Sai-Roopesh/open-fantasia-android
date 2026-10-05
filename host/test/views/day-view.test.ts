import { describe, expect, it } from "vitest";
import { hogwartsStoryFile } from "../support/story-files.js";
import { playable } from "../support/play.js";

describe("the Day View", () => {
  // GIVEN it is Sunday and Draconia's flying test is a Landmark on Wednesday
  // THEN the Day View shows "3 days to Draconia's flying test"
  it("day-view › The Day View says where and when the player is › A countdown", async () => {
    const sunday = hogwartsStoryFile({ title: "Sunday evening", place: "The Gryffindor common room", at: "Day 5 19:00" });
    const { play, engine, storyId, head, view } = playable(sunday);
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    expect(view().day_view).toEqual({
      at: "Day 5 19:00",
      at_label: "Sunday 7:00 pm",
      day: "Sunday",
      time: "7:00 pm",
      place: "The Gryffindor common room",
      closed_by: "player",
      countdowns: [{ landmark: "Draconia's flying test", when: "3 days", label: "3 days to Draconia's flying test" }]
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
    expect(view().day_view!.countdowns.map(countdown => countdown.label)).toEqual(["Today at 8:30 pm: the feast", "Tomorrow: Draconia's flying test"]);
    expect(view().day_view!.countdowns.map(countdown => countdown.when)).toEqual(["Today at 8:30 pm", "Tomorrow"]);
  });
});
