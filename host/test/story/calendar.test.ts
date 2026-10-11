import { describe, expect, it } from "vitest";
import { checkChronicle, passages } from "../../src/agents/chronicler.js";
import { checkPlan, directorPrompt, directorFormat } from "../../src/agents/director.js";
import { nowPart, say } from "../../src/context/lens.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { dayOfDate, formatDated, parseAnyTime, sayDate, weekdayOf } from "../../src/time.js";
import { checkStoryFile } from "../../src/storyfile/check.js";
import { dayView } from "../../src/views/scene.js";
import { ledger } from "../agents/ledger.js";
import { malfoyProblemStoryFile, writeStoryFile } from "../support/story-files.js";

/** The Malfoy Problem on its calendar: Day 1 is Sunday 1 September 1991, and it begins on Day 6, a Friday night. */
function onTheCalendar(): StoryFile {
  const file = malfoyProblemStoryFile();
  return { ...file, clock: { starts: "Day 6 21:40", day_one: "1991-09-01" }, opening: { ...file.opening, at: "Day 6 21:40" } };
}

const NO_DAY_NUMBER = /\bDay \d+\b/;

describe("the Story's calendar (openspec stories: Story time is told as dates)", () => {
  it("turns days into dates and back, weekdays following the date", () => {
    expect(weekdayOf(1, "1991-09-01")).toBe("sunday");
    expect(weekdayOf(61, "1991-09-01")).toBe("thursday");
    expect(sayDate({ day: 61, minuteOfDay: 0 }, "1991-09-01", true)).toBe("Thursday 31 October 1991");
    expect(dayOfDate("1991-10-31", "1991-09-01")).toBe(61);
    expect(dayOfDate("1991-08-31", "1991-09-01")).toBeNull();
    expect(formatDated({ day: 14, minuteOfDay: 20 * 60 }, "1991-09-01")).toBe("1991-09-14 20:00");
    expect(parseAnyTime("1991-09-14 20:00", "1991-09-01")).toEqual({ day: 14, minuteOfDay: 1200 });
    expect(parseAnyTime("1991-02-30 20:00", "1991-09-01")).toBeNull();
    // Without a calendar, days are said by number.
    expect(sayDate({ day: 3, minuteOfDay: 0 }, null)).toBe("Day 3");
  });

  it("refuses a first day that is not on the calendar", () => {
    const file = onTheCalendar();
    const checked = checkStoryFile(writeStoryFile({ ...file, clock: { ...file.clock, day_one: "1991-02-30" } }));
    expect(checked.ok ? [] : checked.problems).toEqual([{ where: "clock.day_one", message: "\"1991-02-30\" is not a date on the calendar" }]);
  });

  // GIVEN a Story File whose first day is Sunday 1 September 1991 and whose clock starts on Day 6 at 21:40
  // WHEN it is imported
  // THEN the Story begins on Friday 6 September 1991 at 9:40 pm
  it("story-file › A Story File sets up every part of a Story › A Story on a calendar", () => {
    const story = ledger(onTheCalendar());
    const state = story.state();
    expect(state.dayOne).toBe("1991-09-01");
    expect(say(state, state.clock)).toBe("Friday 6 September 1991, 9:40 pm");
    expect(nowPart(state)).toBe("<now>\nIt is Friday 6 September 1991, 9:40 pm (1991-09-06 21:40).\n</now>");
  });

  // GIVEN a Story whose first day is Sunday 1 September 1991, now Friday 6 September at 9:40 pm
  // WHEN the Director plans the next Stretch
  // THEN it is told today is Friday 6 September 1991, picks each Scene that matters from the Stretch's dates, and
  //   each lands on the date it picked
  it("stories › Story time is told as dates › The Director plans on dates", () => {
    const state = ledger(onTheCalendar()).state();
    const { system, prompt } = directorPrompt(state, "No plan yet.");
    expect(prompt).toContain("Today is Friday 6 September 1991.");
    expect(prompt).toContain("1991-09-07 (Saturday 7 September)");
    expect(prompt).not.toMatch(NO_DAY_NUMBER);
    expect(system).not.toMatch(/\bDay \d+ \d\d:\d\d\b/);
    const scenes = directorFormat(state).properties.scenes.items.properties;
    expect(scenes.date).toMatchObject({ enum: ["1991-09-06", "1991-09-07", "1991-09-08", "1991-09-09", "1991-09-10", "1991-09-11"] });

    const checked = checkPlan(state, {
      days: 5, toward: "Sunday's picnic", landmark: null, phase: "build",
      scenes: [{ id: "S1", date: "1991-09-08", time: "15:00", place: "The Three Broomsticks", who: ["Draconia Malfoy"], for: "She makes him pay for the round.", offer: "Draconia is holding court at the Three Broomsticks.", headline: "The Three Broomsticks: the round", lead: "Draconia Malfoy", engagement: null, quiet: false }],
      new: [{ kind: "mystery", what: "A note in his Charms book in a hand he does not know.", scene: null, person: null }],
      leads: [], arcs: [], roadmap: [], premise: "A debt between them."
    });
    if (!checked.ok) throw new Error(checked.problems.join("; "));
    expect(checked.value.scenes[0]!.at).toBe("Day 8 15:00");
    expect(say(state, checked.value.scenes[0]!.at)).toBe("Sunday 8 September 1991, 3:00 pm");
  });

  // GIVEN the same Story, and Draconia says on the page "Saturday the fourteenth, eight o'clock, the owlery"
  // WHEN the Chronicler records it as 1991-09-14 20:00
  // THEN the Engagement is on Saturday 14 September 1991 at 8:00 pm
  it("stories › Story time is told as dates › An arrangement made for a date", () => {
    const story = ledger(onTheCalendar());
    story.move("I ask when she wants the debt paid.");
    story.note();
    story.reply("\"Saturday the fourteenth, eight o'clock, the owlery,\" Draconia says. \"Don't be late.\"");
    story.close();
    const ask = { state: story.state(), scene: story.scene() };
    const reply = passages(ask.scene).findLast(item => !item.move)!;
    const checked = checkChronicle(ask, [], {
      summary: "She names a time.", paragraph: "Draconia named the owlery, Saturday at eight.", moments: [], told: [], known: [], bonds: [], changed: [],
      engagements: [{ what: "Paying Draconia's debt, at the owlery", at: "1991-09-14 20:00", place: "The owlery", who: ["Draconia Malfoy"], expected: true, every: null, quotes: [{ entry: reply.label, text: "Saturday the fourteenth, eight o'clock, the owlery" }] }]
    });
    if (!checked.ok) throw new Error(checked.problems.join("; "));
    expect(checked.dropped).toEqual([]);
    expect(checked.value.engagements[0]!.at).toBe("Day 14 20:00");
    expect(say(ask.state, checked.value.engagements[0]!.at)).toBe("Saturday 14 September 1991, 8:00 pm");
  });

  // GIVEN the same Story, now Saturday 7 September at 7:30 am
  // WHEN the player is at the Day View
  // THEN it says "Saturday 7 September"
  it("stories › Story time is told as dates › The Day View says the date", () => {
    const story = ledger(onTheCalendar());
    story.move("I say goodnight.");
    story.note({ clock: "Day 6 22:30" });
    story.reply("She does not say it back.");
    story.close();
    story.chronicle();
    story.world();
    const shown = dayView(story.state());
    expect(story.state().clock).toBe("Day 7 07:30");
    expect(shown).toMatchObject({ day: "Saturday 7 September", time: "7:30 am" });
  });
});
