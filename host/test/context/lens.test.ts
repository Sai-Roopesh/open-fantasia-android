import { describe, expect, it } from "vitest";
import { BUDGET, layers, momentsPart, recallFacts, section, storySoFarPart, tokens } from "../../src/context/lens.js";
import { nothingBeside, type Beside } from "../../src/story/beside.js";
import type { Moment, OutlineSet } from "../../src/story/entries.js";
import { ledger, SONNET } from "../agents/ledger.js";

/** The Director's Outline in two years, at Act [current]. */
const outlineAt = (current: number): OutlineSet => ({
  kind: "outline_set", reason: "", planFollows: false, dropped: [], callId: "c", model: SONNET,
  outline: {
    current, ending: "", intentions: [], setups: [], promoted: [], revisedAfter: 0, deep: true, lookedUp: [],
    acts: ["Year One", "Year Two"].map((title, index) => ({ number: index + 1, title, question: "", buildsTo: "", detail: "sketched", turns: [], relationships: [], movers: [], handsOn: "" }))
  }
});

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

  it("gives the Story as it was set up in layer 1, the same on every call until the player edits it, so the cache hits", () => {
    const story = ledger();
    const storyOf = () => layers(story.state(), nothingBeside(), "director", [], [], []).story;
    const before = storyOf();
    expect(before).toContain("Title: After Curfew");
    expect(before).toContain("- Draconia comes round to Roopesh, slowly, against everything she was raised to be.");
    expect(before).toContain("- Roopesh Gantasala, the player's character, also Roo: A Muggle-born from Bangalore with powers he hides.");
    story.move("I sit down.");
    story.note({ intensity: 3 });
    story.reply("She looks up.");
    // Someone the Director brings in is in standing layer 2, not in cached layer 1.
    story.plan({ people: [{ name: "Aurelia Vance", aliases: [], whoTheyAre: "A stranger asking about the train.", known: null, appearance: "", after: "", knows: [], voice: [], group: null }] });
    expect(storyOf()).toBe(before);
    expect(layers(story.state(), nothingBeside(), "director", ["Aurelia Vance"], [], []).standing).toContain("Aurelia Vance (new to the Story: A stranger asking about the train)");
    story.add({ kind: "premise_set", premise: "A heist at Hogwarts." });
    expect(storyOf()).not.toBe(before);
  });

  it("tells The Story So Far in time order: each finished Act's account, then the current Act's weeks, then each of its Scenes", () => {
    const story = ledger();
    story.add(outlineAt(1));
    story.close();
    story.chronicle({ paragraph: "Hermione caught him out after curfew, and he lied about where he had been." });
    story.add(outlineAt(2));
    story.fold({ into: "act", count: 1, from: "Day 3 21:40", until: "Day 3 23:00", text: "Year One, told whole." });
    story.open("Breakfast", "The Great Hall", "Day 4 08:00", ["Hermione Granger"]);
    story.close();
    story.chronicle({ paragraph: "Breakfast went badly, and everyone saw." });
    story.fold({ into: "week", count: 0, from: "Day 4 06:00", until: "Day 4 07:00", text: "The first days of Year Two." });
    expect(storySoFarPart(story.state())).toBe([
      "<story_so_far>",
      "Acts:\nAct 1, Year One (Friday 6 September 1991, 9:40 pm to Friday 6 September 1991, 11:00 pm, Scenes 1 to 1): Year One, told whole.",
      "",
      "Weeks:\nSaturday 7 September 1991, 6:00 am to Saturday 7 September 1991, 7:00 am: The first days of Year Two.",
      "",
      "Scenes:\nScene 2, Breakfast (Saturday 7 September 1991, 8:00 am): Breakfast went badly, and everyone saw.",
      "</story_so_far>"
    ].join("\n"));
  });

  it("leaves the oldest of The Story So Far out past its limit, and says so", () => {
    const story = ledger();
    for (let number = 1; number <= 12; number++) {
      if (number > 1) story.open(`Scene ${number}`, "The library", `Day ${3 + number} 10:00`, ["Hermione Granger"]);
      story.close();
      story.chronicle({ paragraph: `Paragraph ${number}. ${"Then they talked. ".repeat(20)}` });
    }
    const part = storySoFarPart(story.state(), "", 600)!;
    expect(tokens(part)).toBeLessThanOrEqual(600);
    expect(part).toMatch(/\(The \d+ oldest parts are left out for length\.\)/);
    expect(part).toContain("Paragraph 12.");
    expect(part).not.toContain("Paragraph 1.");
  });

  it("gives what he arranged and the Landmarks next, soonest first, and the plan only to the readers that steer", () => {
    const story = ledger();
    story.add({ kind: "landmark_set", landmark: { name: "The Halloween feast", at: "Day 5 19:00", what: "The feast." } });
    story.close();
    story.chronicle({ engagements: [{ id: "g-1", what: "Revision with Hermione.", at: "Day 4 19:30", place: "The library's end table", who: ["Hermione Granger"], expected: true, every: "week", quotes: [] }] });
    story.plan({ scenes: [{ id: "s1.1", at: "Day 4 10:00", place: "The Great Hall", who: ["Draconia Malfoy"], for: "She claims him in front of Slytherin.", offer: "Draconia is at breakfast.", headline: "Breakfast: Draconia", lead: "Draconia Malfoy", engagement: null, quiet: false, serves: { turn: null, lives: [] } }] });
    const director = layers(story.state(), nothingBeside(), "director", [], [], []).standing;
    expect(director).toContain("- E1 Saturday 7 September 1991, 7:30 pm, every week, The library's end table: Revision with Hermione. With Hermione Granger. He is expected.");
    expect(director).toContain("Landmarks next:\n- The Halloween feast, Sunday 8 September 1991, 7:00 pm\n- Draconia's flying test, Wednesday 11 September 1991, 10:00 am");
    expect(director).toContain("- s1.1 Saturday 7 September 1991, 10:00 am, The Great Hall, with Draconia Malfoy: She claims him in front of Slytherin.");
    expect(layers(story.state(), nothingBeside(), "actor", [], [], []).standing).not.toContain("She claims him");
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
    const weaver = layers(story.state(), nothingBeside(), "weaver", [], [], []).standing;
    expect(weaver).toContain("What is on ahead:\n- Saturday 7 September 1991, 10:00 am, The library: Hermione at the end table. With Hermione Granger.\n- Saturday 7 September 1991, 8:00 pm, The Three Broomsticks: The twins buy a round for anyone who saw the troll. With Harry Potter.");
    expect(weaver).not.toContain("Breakfast, early.");
    expect(layers(story.state(), nothingBeside(), "actor", [], [], []).standing).not.toContain("What is on ahead");
  });

  it("gives the player's brief, reactions and Taste, kept beside the Story, to those who steer", () => {
    const story = ledger();
    const beside: Beside = { ...nothingBeside(), brief: { more: ["more danger"], less: ["the library"] }, reactions: [{ scene: 1, title: "After curfew", reaction: "less", note: "too slow" }] };
    const director = layers(story.state(), beside, "director", [], [], []).standing;
    expect(director).toContain("More of:\n- more danger");
    expect(director).toContain("Less of:\n- the library");
    expect(director).toContain("Reactions to recent Scenes:\n- Scene 1, After curfew: less like this (too slow)");
  });
});

describe("what each reader knows (openspec living-world: Characters know only what they could know)", () => {
  it("marks every happening with who knows it for the writer, and gives the actor only what someone present knows", () => {
    const story = ledger();
    story.world({ happened: [
      { id: "h-seat", what: "Draconia had his name taken off the Charms seating plan.", at: "Day 4 06:00", where: "Flitwick's office", knownTo: ["Draconia Malfoy", "Neville Longbottom"], landmark: null, move: "Draconia Malfoy" },
      { id: "h-note", what: "McGonagall left a note under his door.", at: "Day 4 06:30", where: "the dormitory", knownTo: ["Minerva McGonagall", "Roopesh Gantasala"], landmark: null, move: null }
    ] });
    const state = story.state();
    expect(layers(state, nothingBeside(), "writer", ["Hermione Granger"], [], []).standing).toContain("Draconia had his name taken off the Charms seating plan. Known to Draconia Malfoy and Neville Longbottom.");
    expect(layers(state, nothingBeside(), "actor", ["Hermione Granger"], [], []).standing).not.toContain("seating plan");
    expect(layers(state, nothingBeside(), "actor", ["Neville Longbottom"], [], []).standing).toContain("seating plan");
    expect(layers(state, nothingBeside(), "actor", ["Neville Longbottom"], [], []).standing).not.toContain("a note under his door");
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
