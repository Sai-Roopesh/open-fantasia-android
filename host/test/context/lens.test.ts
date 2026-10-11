import { describe, expect, it } from "vitest";
import { BUDGET, calendarPart, castPart, factsPart, momentsPart, recallFacts, section, steeringPart, storyPart, storySoFarPart } from "../../src/context/lens.js";
import type { Moment } from "../../src/story/entries.js";
import { ledger } from "../agents/ledger.js";

const moment = (what: string, weight: number, there: string[]): Moment => ({ what, quotes: [{ entry: "e", text: `"${what}," she says.` }], there, weight });

/** Three Scenes recorded, two with Hermione and one with Harry, and a fourth open with Hermione. */
function remembered() {
  const story = ledger();
  story.close();
  story.chronicle({ moments: [moment("one, weight 1", 1, ["Hermione Granger"]), moment("one, weight 2", 2, ["Hermione Granger"]), moment("one, weight 5", 5, ["Hermione Granger"])] });
  story.open("Breakfast", "The Great Hall", "Day 4 09:00", ["Hermione Granger"]);
  story.close();
  story.chronicle({ moments: [moment("two, weight 3", 3, ["Hermione Granger"]), moment("two, weight 4", 4, ["Hermione Granger"]), moment("two, weight 1", 1, ["Hermione Granger"])] });
  story.open("The pitch", "The Quidditch pitch", "Day 4 11:00", ["Harry Potter"]);
  story.close();
  story.chronicle({ moments: [moment("three, Harry's", 5, ["Harry Potter"])] });
  story.open("The library", "The library", "Day 4 15:00", ["Hermione Granger"]);
  return story;
}

describe("the parts of every prompt (one-truth design decision 3)", () => {
  it("closes a part by its tag's name alone, and leaves an empty part out", () => {
    expect(section('move by="Roopesh Gantasala"', " I sit down. ")).toBe('<move by="Roopesh Gantasala">\nI sit down.\n</move>');
    expect(section("lately", "  ")).toBeNull();
  });

  it("gives the Story as it was set up in one part, the same on every call until the player edits it, so the cache hits", () => {
    const story = ledger();
    const before = storyPart(story.state());
    expect(before).toContain("Title: After Curfew");
    expect(before).toContain("- Draconia comes round to Roopesh, slowly, against everything she was raised to be.");
    expect(before).toContain("- Draconia's flying test, Wednesday 11 September 1991, 10:00 am: Madam Hooch tests the first-years on brooms.");
    expect(before).toContain('<player_character name="Roopesh Gantasala">\nA Muggle-born from Bangalore with powers he hides.\n</player_character>');
    expect(before).toContain("<leads>\nDraconia Malfoy, Hermione Granger\n</leads>");
    expect(before).not.toMatch(/<people>[^]*- Roopesh Gantasala/);
    story.move("I sit down.");
    story.note({ intensity: 3 });
    story.reply("She looks up.");
    // Someone the Director brings in is in the cast, not in the cached part.
    story.plan({ people: [{ name: "Aurelia Vance", aliases: [], whoTheyAre: "A stranger asking about the train.", known: null, appearance: "", after: "", knows: [], voice: [], group: null }] });
    expect(storyPart(story.state())).toBe(before);
    expect(castPart(story.state(), [], "omniscient")).toContain("- Aurelia Vance (new to the Story: A stranger asking about the train.)");
    story.add({ kind: "premise_set", premise: "A heist at Hogwarts." });
    expect(storyPart(story.state())).not.toBe(before);
  });

  it("tells The Story So Far in time order: chapters, then weeks, then each Scene", () => {
    const story = ledger();
    story.close();
    story.chronicle({ paragraph: "Hermione caught him out after curfew, and he lied about where he had been." });
    story.fold({ into: "week", count: 0, from: "Day 1 08:00", until: "Day 2 22:00", text: "The first days." });
    story.fold({ into: "chapter", count: 0, from: "Day 1 08:00", until: "Day 2 22:00", text: "The first chapter." });
    expect(storySoFarPart(story.state())).toBe([
      "<story_so_far>",
      "Chapters:\nWednesday 4 September 1991, 8:00 am to Thursday 5 September 1991, 10:00 pm: The first chapter.",
      "",
      "Weeks:\nWednesday 4 September 1991, 8:00 am to Thursday 5 September 1991, 10:00 pm: The first days.",
      "",
      "Scenes:\nScene 1, After curfew (Friday 6 September 1991, 9:40 pm): Hermione caught him out after curfew, and he lied about where he had been.",
      "</story_so_far>"
    ].join("\n"));
  });

  it("gives the cast by salience: who is here and the Leads in full, others near the Story in a line, the rest as a count", () => {
    const story = ledger();
    story.world({ lives: [{ who: "Hermione Granger", where: "the library", doing: "revising", after: "Top marks" }, { who: "Lavender Brown", where: "the common room", doing: "talking", after: "News" }], happened: [{ id: "h1", what: "Lavender heard it first.", at: "Day 3 22:00", where: "the common room", knownTo: ["Lavender Brown"], landmark: null, move: null }] });
    const omniscient = castPart(story.state(), ["Harry Potter"], "omniscient")!;
    expect(omniscient).toContain("Harry Potter");
    expect(omniscient).toContain("Hermione Granger\n  Now: at the library, revising; after Top marks");
    expect(omniscient).toContain("Nearby:\n- Lavender Brown: at the common room, talking");
    expect(omniscient).toMatch(/\d+ others are about their own lives\./);
    // The character lens is not given where anyone is, nor who is about the Story elsewhere.
    const character = castPart(story.state(), ["Harry Potter"], "character")!;
    expect(character).not.toContain("Now:");
    expect(character).not.toContain("Nearby:");
  });

  it("gives what he arranged and the Landmarks next, soonest first, and the plan only to the lenses that may see it", () => {
    const story = ledger();
    story.add({ kind: "landmark_set", landmark: { name: "The Halloween feast", at: "Day 5 19:00", what: "The feast." } });
    story.close();
    story.chronicle({ engagements: [{ id: "g-1", what: "Revision with Hermione.", at: "Day 4 19:30", place: "The library's end table", who: ["Hermione Granger"], expected: true, every: "week", quotes: [] }] });
    story.plan({ scenes: [{ id: "s1.1", at: "Day 4 10:00", place: "The Great Hall", who: ["Draconia Malfoy"], for: "She claims him in front of Slytherin.", offer: "Draconia is at breakfast.", headline: "Breakfast: Draconia", lead: "Draconia Malfoy", engagement: null, quiet: false }] });
    const author = calendarPart(story.state(), "author")!;
    expect(author).toContain("- E1 Saturday 7 September 1991, 7:30 pm, every week, The library's end table: Revision with Hermione. With Hermione Granger. He is expected.");
    expect(author).toContain("Landmarks next:\n- The Halloween feast, Sunday 8 September 1991, 7:00 pm\n- Draconia's flying test, Wednesday 11 September 1991, 10:00 am");
    expect(author).toContain("- s1.1 Saturday 7 September 1991, 10:00 am, The Great Hall, with Draconia Malfoy: She claims him in front of Slytherin.");
    expect(calendarPart(story.state(), "character")).not.toContain("She claims him");
  });

  it("gives what the World has on ahead, so the Weaver can keep it, and not what is past", () => {
    const story = ledger();
    story.close();
    expect(story.state().clock).toBe("Day 3 21:40");
    story.world({ on: [
      { id: "o-1", at: "Day 3 21:00", place: "The Great Hall", what: "Breakfast, early.", who: [] },
      { id: "o-2", at: "Day 4 20:00", place: "The Three Broomsticks", what: "The twins buy a round for anyone who saw the troll.", who: ["Harry Potter"] },
      { id: "o-3", at: "Day 4 10:00", place: "The library", what: "Hermione at the end table.", who: ["Hermione Granger"] }
    ] });
    const omniscient = calendarPart(story.state(), "omniscient")!;
    expect(omniscient).toContain("What is on ahead:\n- Saturday 7 September 1991, 10:00 am, The library: Hermione at the end table. (with Hermione Granger)\n- Saturday 7 September 1991, 8:00 pm, The Three Broomsticks: The twins buy a round for anyone who saw the troll. (with Harry Potter)");
    expect(omniscient).not.toContain("Breakfast, early.");
    expect(calendarPart(story.state(), "character") ?? "").not.toContain("What is on ahead");
  });

  it("gives the player's brief, reactions and Taste to those who steer", () => {
    const story = ledger();
    story.close();
    story.add({ kind: "brief_set", more: ["more danger"], less: ["the library"] });
    story.add({ kind: "reaction_set", scene: 1, reaction: "less", note: "too slow" });
    expect(steeringPart(story.state())).toBe("<the_players_wishes>\nMore of:\n- more danger\n\nLess of:\n- the library\n\nReactions to recent Scenes:\n- Scene 1, After curfew: less like this (too slow)\n</the_players_wishes>");
  });
});

describe("what each lens knows (openspec living-world: Characters know only what they could know)", () => {
  it("marks every happening with who knows it for the author, and gives a character only what someone present knows", () => {
    const story = ledger();
    story.world({ happened: [
      { id: "h-seat", what: "Draconia had his name taken off the Charms seating plan.", at: "Day 4 06:00", where: "Flitwick's office", knownTo: ["Draconia Malfoy", "Neville Longbottom"], landmark: null, move: "Draconia Malfoy" },
      { id: "h-note", what: "McGonagall left a note under his door.", at: "Day 4 06:30", where: "the dormitory", knownTo: ["Minerva McGonagall", "Roopesh Gantasala"], landmark: null, move: null }
    ] });
    const state = story.state();
    expect(factsPart(state, "author", ["Hermione Granger"])).toContain("- h-seat Saturday 7 September 1991, 6:00 am, Flitwick's office: Draconia had his name taken off the Charms seating plan. Known to: Draconia Malfoy, Neville Longbottom.");
    expect(factsPart(state, "character", ["Hermione Granger"])).toBeNull();
    expect(factsPart(state, "character", ["Neville Longbottom"])).toContain("seating plan");
    expect(factsPart(state, "character", ["Neville Longbottom"])).not.toContain("a note under his door");
  });
});

describe("the Moments recalled (one-truth design decision 3; was agents/recall)", () => {
  it("brings at most five Moments someone present knows: by who knows them, then weight, then how recent", () => {
    const state = remembered().state();
    const recalled = recallFacts(state, ["Hermione Granger"]);
    expect(recalled).toHaveLength(BUDGET.moments);
    expect(recalled.map(fact => fact.what)).toEqual(["one, weight 5", "two, weight 4", "two, weight 3", "one, weight 2", "two, weight 1"]);
    expect(recalled[0]).toMatchObject({ knownTo: ["Roopesh Gantasala", "Hermione Granger"], scene: 1, source: "page" });
    // Harry's Moment is his: Hermione was not there and nobody told her.
    expect(recallFacts(state, ["Hermione Granger", "Harry Potter"]).map(fact => fact.what)).toContain("three, Harry's");
    expect(recallFacts(state, []).length).toBe(0);
  });

  it("labels them M1 …, each with who knows it and its own words", () => {
    const state = remembered().state();
    const part = momentsPart(state, recallFacts(state, ["Hermione Granger"]).slice(0, 1));
    expect(part).toBe("<remembered>\nM1 (Scene 1; known to Roopesh Gantasala, Hermione Granger): one, weight 5\n  \"\"one, weight 5,\" she says.\"\n</remembered>");
  });
});
