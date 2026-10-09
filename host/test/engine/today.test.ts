import { describe, expect, it } from "vitest";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

const quiet = { lives: [], threads: [], happened: [], meanwhile: [], happenings: [] };
const summons = { id: "P1", at: "Day 4 09:00", place: "McGonagall's office", what: "Your account of the troll. Hermione goes in first.", who: ["Minerva McGonagall", "Hermione Granger"], expected: true, pick: true };
const hospital = { id: "P2", at: "Day 4 11:00", place: "Outside the hospital wing", what: "Draconia, on a strapped ankle, is fighting Snape for her bed back.", who: ["Draconia Malfoy", "Severus Snape"], expected: false, pick: false };
const twins = { id: "P3", at: "Day 4 20:00", place: "The Three Broomsticks", what: "Fred and George are buying the first round.", who: ["Harry Potter"], expected: false, pick: false };

/** The night after curfew, woven with what is on on Saturday. */
async function saturday(happenings: object[]) {
  const played = playable(hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] }), { weaver: [{ answer: JSON.stringify({ ...quiet, happenings }) }], unplanned: true });
  await played.play("I say goodnight to Hermione and go up.");
  played.engine.endScene(played.storyId, played.head(), "trace-end");
  await played.engine.woven(played.storyId);
  return played;
}

describe("what is on today", () => {
  // GIVEN McGonagall has summoned the Player Character to her office at 9:00
  // THEN that Happening is marked "You're expected"
  it("day-view › Up to four Happenings › A summons is marked", async () => {
    const { view } = await saturday([summons, hospital, twins]);
    const happenings = view().day_view!.happenings;
    expect(happenings.map(({ id: _, ...item }) => item)).toEqual([
      { at: "Day 4 09:00", time: "9:00 am", days_away: 0, scene: null, place: "McGonagall's office", what: "Your account of the troll. Hermione goes in first.", who: ["Minerva McGonagall", "Hermione Granger"], expected: true, pick: true },
      { at: "Day 4 11:00", time: "11:00 am", days_away: 0, scene: null, place: "Outside the hospital wing", what: "Draconia, on a strapped ankle, is fighting Snape for her bed back.", who: ["Draconia Malfoy", "Severus Snape"], expected: false, pick: false },
      { at: "Day 4 20:00", time: "8:00 pm", days_away: 0, scene: null, place: "The Three Broomsticks", what: "Fred and George are buying the first round.", who: ["Harry Potter"], expected: false, pick: false }
    ]);
  });
});
