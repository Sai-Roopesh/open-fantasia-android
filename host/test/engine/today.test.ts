import { describe, expect, it } from "vitest";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

/** The Director's plan: Saturday's Scene that matters is the hospital wing at 11:00, about Draconia. */
const plan = {
  days: 4, toward: "Draconia's flying test", landmark: null, phase: "build",
  scenes: [{ id: "S1", date: "1991-09-07", time: "11:00", place: "Outside the hospital wing", who: ["Draconia Malfoy", "Severus Snape"], for: "Draconia needs a witness.", offer: "Draconia, on a strapped ankle, is fighting Snape for her bed back.", headline: "The hospital wing: Draconia wants out", lead: "Draconia Malfoy", engagement: null, quiet: false }],
  new: [{ kind: "mystery", what: "Who hexed Draconia's broom.", scene: "S1", person: null }],
  leads: [{ who: "Draconia Malfoy", move: "She makes him her witness.", scene: "S1" }, { who: "Hermione Granger", move: "She asks where he was.", scene: "S1" }],
  arcs: [], roadmap: [], premise: "The romance turns on a debt."
};

/** The World overnight: McGonagall's note summons him at 9:00, and the twins are buying the first round at 8:00 pm. */
const overnight = {
  lives: [], threads: [],
  happened: [{ id: "H1", what: "McGonagall left a note for Roopesh: his account of the troll, in her office, at nine.", at: "Day 4 07:00", where: "The Gryffindor common room", known_to: ["Minerva McGonagall", "Roopesh Gantasala"], landmark: null, move: null, missed: null }],
  meanwhile: [{ text: "McGonagall's note: your account of the troll, my office, nine o'clock.", how: "told", happened: "H1", told_by: "Minerva McGonagall", about: ["Minerva McGonagall"],
    engagement: { what: "Your account of the troll. Hermione goes in first.", at: "Day 4 09:00", place: "McGonagall's office", who: ["Minerva McGonagall", "Hermione Granger"], expected: true, every: null } }],
  on: [{ at: "Day 4 20:00", place: "The Three Broomsticks", what: "Fred and George are buying the first round.", who: ["Harry Potter"] }]
};

/** The night after curfew, ended, with Saturday planned and the World moved on to Saturday morning. */
async function saturday() {
  const played = playable(hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] }),
    { director: [{ answer: JSON.stringify(plan) }], weaver: [{ answer: JSON.stringify(overnight) }] });
  await played.play("I say goodnight to Hermione and go up.");
  played.engine.endScene(played.storyId, played.head(), "trace-end");
  await played.engine.ended(played.storyId);
  return played;
}

describe("what is on today", () => {
  // GIVEN McGonagall has summoned the Player Character to her office at 9:00
  // THEN that Happening is marked "You're expected"
  it("day-view › Up to four Happenings › A summons is marked", async () => {
    const { view } = await saturday();
    const happenings = view().day_view!.happenings;
    // The Story's pick first, then the rest in time order; only the summons is one he is expected at.
    expect(happenings.map(({ id: _, ...item }) => item)).toEqual([
      { at: "Day 4 11:00", time: "11:00 am", days_away: 0, every: null, scene: "s1.1", place: "Outside the hospital wing", what: "Draconia, on a strapped ankle, is fighting Snape for her bed back.", who: ["Draconia Malfoy", "Severus Snape"], expected: false, pick: true },
      { at: "Day 4 09:00", time: "9:00 am", days_away: 0, every: null, scene: null, place: "McGonagall's office", what: "Your account of the troll. Hermione goes in first.", who: ["Minerva McGonagall", "Hermione Granger"], expected: true, pick: false },
      { at: "Day 4 20:00", time: "8:00 pm", days_away: 0, every: null, scene: null, place: "The Three Broomsticks", what: "Fred and George are buying the first round.", who: ["Harry Potter"], expected: false, pick: false }
    ]);
  });
});
