import { describe, expect, it } from "vitest";
import { storyTools } from "../../src/store/story-tools.js";
import { emptyUpdate, type TruthUpdate } from "../../src/story/truth.js";
import { ledger, SONNET, type Ledger } from "./ledger.js";

/** The truth a record changes, with only the parts a test names. */
const truth = (changes: Partial<TruthUpdate>): TruthUpdate => ({ ...emptyUpdate(), ...changes });

/**
 * A Story two Scenes in, recorded as the Scene's end records it: Hermione learns his secret and promises to keep the
 * egg to herself; Ron believes something wrong; a Rule holds and then ends; an Auror is named; and the World moves
 * on off the page between the Scenes.
 */
function twoScenes() {
  const story = ledger();
  const move = story.move("I ask Hermione what Hagrid is hiding.");
  const reply = story.reply("Hermione lowers her voice. \"Hagrid has a dragon egg in his hut. An Auror called Kingsley Shacklebolt came asking about it.\" The air smells of ozone where your hand rests on the table.");
  story.close();
  story.chronicle({
    paragraph: "Hermione told Roopesh about Hagrid's dragon egg, and noticed the smell of ozone his magic leaves.",
    moments: [{ what: "Hermione told him about the dragon egg.", quotes: [{ entry: reply.id, text: "Hagrid has a dragon egg in his hut." }], there: ["Hermione Granger"], weight: 3 }],
    bonds: [{ who: "Hermione Granger", standing: "She trusts him with a secret.", turn: "She told him about the egg." }],
    truth: truth({
      now: [{ who: "Hermione Granger", now: "Wary of him, and curious despite herself.", feelings: [{ about: "Roopesh Gantasala", feels: "suspicious and drawn" }], wants: "To know what he is.", hides: "That she has noticed the ozone.", scene: 1, sources: [] }],
      beliefs: {
        open: [
          { id: "b1", holder: "Hermione Granger", what: "Roopesh does wandless magic.", true: true, sources: [{ entry: reply.id, text: "The air smells of ozone" }] },
          { id: "b2", holder: "Ron Weasley", what: "Roopesh is a Squib.", true: false, sources: [] }
        ],
        close: []
      },
      between: [{
        people: ["Roopesh Gantasala", "Hermione Granger"], stands: "Wary allies.", turn: { text: "She told him about the egg.", scene: 1, sources: [] },
        keepsakes: [{ id: "k1", what: "She trusted him with Hagrid's secret.", scene: 1, words: [{ entry: reply.id, text: "Hagrid has a dragon egg in his hut." }] }]
      }],
      truths: { open: [{ id: "t1", kind: "promise", what: "Hermione keeps the egg to herself.", terms: ["Not even Harry"], who: ["Hermione Granger"], knownTo: ["Hermione Granger", "Roopesh Gantasala"], due: "Day 10 12:00", replaces: null, sources: [] }], close: [] },
      rules: { open: [
        { id: "r1", what: "Wandless magic leaves a smell of ozone.", sources: [{ entry: reply.id, text: "The air smells of ozone" }] },
        { id: "r2", what: "The Room of Requirement opens only to those in need.", sources: [] }
      ], close: [] },
      names: [{ name: "Kingsley Shacklebolt", kind: "person", what: "An Auror who came asking about the egg.", first: 1, sources: [{ entry: reply.id, text: "An Auror called Kingsley Shacklebolt" }] }]
    })
  });
  story.world({ happened: [{ id: "H1", what: "Ron told Lavender, over breakfast, that Roopesh is a Squib.", at: "Day 4 07:30", where: "the Great Hall", knownTo: ["Ron Weasley", "Lavender Brown"], landmark: null, move: null }] });
  story.open("The Owlery", "The Owlery at dawn", "Day 4 08:00", ["Hermione Granger"], "Owls shift on their perches. Hermione is already there, a letter in her hand.");
  story.move("I tell her the ozone is mine.");
  const second = story.reply("Hermione kisses you, quickly, as if to stop herself saying anything.");
  story.close();
  story.chronicle({
    paragraph: "In the Owlery he told Hermione the truth, and she kissed him.",
    truth: truth({
      now: [{ who: "Hermione Granger", now: "Keeping his secret, and no longer only his ally.", feelings: [{ about: "Roopesh Gantasala", feels: "fond" }], wants: "Him to trust her.", hides: "", scene: 2, sources: [] }],
      between: [{ people: ["Hermione Granger", "Roopesh Gantasala"], stands: "Something more than allies.", turn: { text: "She kissed him in the Owlery.", scene: 2, sources: [] }, keepsakes: [{ id: "k2", what: "The first kiss.", scene: 2, words: [{ entry: second.id, text: "Hermione kisses you, quickly" }] }] }],
      rules: { open: [], close: [{ id: "r1", why: "He learned to mask it." }] }
    })
  });
  return { story, move };
}

function tool(story: Ledger, name: string) {
  const found = storyTools(story.mac.db, story.storyId, story.head()).find(item => item.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
}

describe("the Story's tools (docs/adr/0018; the-storys-mind design decision 4)", () => {
  it("searches the Story on this Path, with each passage's Scene, and keeps the index up to the head", () => {
    const { story, move } = twoScenes();
    // A Reply on another Path, branched from the first Move: not part of this Story's Path.
    story.mac.tree.append(story.storyId, move.id, { kind: "reply", text: "Hermione says the basilisk is in the pipes.", callId: "c", model: SONNET });

    const egg = tool(story, "search_story").run({ words: "dragon egg" });
    expect(egg.line).toBe("searched the Story for “dragon egg”: 4 passages");
    expect(egg.answer).toContain("Scene 1, “After curfew”, a Reply: Hermione lowers her voice. \"Hagrid has a dragon egg");
    expect(egg.answer).toContain("The record of Scene 1: Hermione told him about the dragon egg.");

    expect(tool(story, "search_story").run({ words: "Squib breakfast" }).answer).toContain("Off the page, after Scene 1: Ron told Lavender, over breakfast");
    expect(tool(story, "search_story").run({ words: "ozone mine" }).answer).toContain("Scene 2, “The Owlery”, Roopesh Gantasala's Move: I tell her the ozone is mine.");
    // No passage has every word: any of them, best first.
    expect(tool(story, "search_story").run({ words: "kisses owl" }).answer).toContain("Hermione kisses you");
    expect(tool(story, "search_story").run({ words: "basilisk" })).toEqual({ answer: "Nothing in this Story so far mentions “basilisk”.", line: "searched the Story for “basilisk”: nothing found" });

    // Played on, the next search finds what is new.
    story.open("The Library", "The library, the Restricted Section", "Day 4 21:00", ["Hermione Granger"]);
    story.move("I look for a book on basilisks.");
    expect(tool(story, "search_story").run({ words: "basilisk" }).answer).toContain("Scene 3, “The Library”, Roopesh Gantasala's Move: I look for a book on basilisks.");
  });

  it("reads a Scene in full, word for word, with its record, and a long one in parts", () => {
    const { story } = twoScenes();
    const first = tool(story, "read_scene").run({ number: 1 });
    expect(first.line).toBe("read Scene 1, “After curfew”");
    expect(first.answer).toBe([
      "Scene 1, “After curfew”: The Gryffindor common room, Friday 6 September 1991, 9:40 pm. With Hermione Granger.",
      "",
      "The fire has burned down to red. Hermione is on the sofa with a book she has not turned a page of in ten minutes.",
      "",
      "Roopesh Gantasala (the player's Move): I ask Hermione what Hagrid is hiding.",
      "",
      "Hermione lowers her voice. \"Hagrid has a dragon egg in his hut. An Auror called Kingsley Shacklebolt came asking about it.\" The air smells of ozone where your hand rests on the table.",
      "",
      "(The Scene ended.)",
      "",
      "The Scene's record: Hermione told Roopesh about Hagrid's dragon egg, and noticed the smell of ozone his magic leaves."
    ].join("\n"));
    expect(tool(story, "read_scene").run({ number: 9 })).toEqual({ answer: "There is no Scene 9 on this Path; Scenes 1 to 2 have been played.", line: "read Scene 9: there is none" });

    story.open("The Lake", "The Black Lake", "Day 5 16:00", ["Hermione Granger"]);
    for (let reply = 0; reply < 6; reply++) {
      story.move(`I keep talking, part ${reply + 1}.`);
      story.reply(`Reply ${reply + 1}. ${"She listens, and the lake listens with her. ".repeat(100)}`);
    }
    const opening = tool(story, "read_scene").run({ number: 3 });
    expect(opening.line).toBe("read Scene 3, “The Lake”, part 1 of 3");
    expect(opening.answer.length).toBeLessThan(13_000);
    expect(opening.answer).toContain("(Part 1 of 3. Read on with part 2.)");
    const last = tool(story, "read_scene").run({ number: 3, part: 3 });
    expect(last.answer.startsWith("Scene 3, “The Lake”: The Black Lake")).toBe(true);
    expect(last.answer).toContain("Reply 6.");
    expect(last.answer).toContain("(Part 3 of 3.)");
  });

  it("reads a person's history: now and before, what they know and believe, what they know happened, what is true, and others", () => {
    const { story } = twoScenes();
    const hermione = tool(story, "read_person").run({ name: "Hermione" });
    expect(hermione.line).toBe("read Hermione Granger's history");
    expect(hermione.answer).toContain("Hermione Granger: Muggle-born, Gryffindor, top of every class.");
    expect(hermione.answer).toContain("Who they are now, as of Scene 2: Keeping his secret, and no longer only his ally.");
    expect(hermione.answer).toContain("How they feel: about Roopesh Gantasala, fond.");
    expect(hermione.answer).toContain("Who they were before, oldest first:\n- As of Scene 1: Wary of him, and curious despite herself.");
    expect(hermione.answer).toContain("- Knows, since Scene 1: Roopesh does wandless magic. From: “The air smells of ozone”");
    expect(hermione.answer).toContain("What they know happened:\n- Scene 1: Hermione told him about the dragon egg.");
    expect(hermione.answer).toContain("- Promise, since Scene 1: Hermione keeps the egg to herself. Its terms: Not even Harry. Due Day 10 12:00.");
    expect(hermione.answer).toContain("- With Roopesh Gantasala: Something more than allies.");

    const ron = tool(story, "read_person").run({ name: "Ron Weasley" }).answer;
    expect(ron).toContain("- Believes, wrongly, since Scene 1: Roopesh is a Squib.");
    expect(ron).toContain("- Scene 1, off the page: Ron told Lavender, over breakfast, that Roopesh is a Squib.");

    const nobody = tool(story, "read_person").run({ name: "Albus" });
    expect(nobody.line).toBe("read Albus's history: nobody by that name");
    expect(nobody.answer).toMatch(/^Nobody called “Albus” is in this Story\. Its people: Roopesh Gantasala, Hermione Granger/);
  });

  it("reads between two people: where it stands, its turning points, its keepsakes in their own words, and the Bond as he saw it", () => {
    const { story } = twoScenes();
    const between = tool(story, "read_between").run({ first: "Roo", second: "Hermione Granger" });
    expect(between.line).toBe("read between Roopesh Gantasala and Hermione Granger");
    expect(between.answer).toBe([
      "Between Roopesh Gantasala and Hermione Granger.",
      "Where it stands: Something more than allies.",
      "",
      "The turning points, oldest first:",
      "- Scene 1: She told him about the egg.",
      "- Scene 2: She kissed him in the Owlery.",
      "",
      "Keepsakes, in their own words:",
      "- Scene 1: She trusted him with Hagrid's secret. “Hagrid has a dragon egg in his hut.”",
      "- Scene 2: The first kiss. “Hermione kisses you, quickly”",
      "",
      "As Roopesh Gantasala has seen it: She trusts him with a secret.",
      "- Scene 1: She told him about the egg."
    ].join("\n"));
    expect(tool(story, "read_between").run({ first: "Harry Potter", second: "Draconia Malfoy" }).answer).toBe("Between Harry Potter and Draconia Malfoy.\nNothing is kept between them yet.");
  });

  it("reads the Rules that hold and the ones that ended, all of them or about something", () => {
    const { story } = twoScenes();
    expect(tool(story, "read_rules").run({})).toEqual({
      answer: [
        "The Rules that hold:",
        "- Since Scene 1: The Room of Requirement opens only to those in need.",
        "",
        "Rules that no longer hold:",
        "- From Scene 1 to Scene 2 (ended: He learned to mask it): Wandless magic leaves a smell of ozone."
      ].join("\n"),
      line: "read the Rules"
    });
    expect(tool(story, "read_rules").run({ about: "ozone" })).toEqual({
      answer: "Rules that no longer hold:\n- From Scene 1 to Scene 2 (ended: He learned to mask it): Wandless magic leaves a smell of ozone.",
      line: "read the Rules about “ozone”"
    });
    const none = tool(story, "read_rules").run({ about: "Quidditch" });
    expect(none.line).toBe("read the Rules about “Quidditch”: none");
    expect(none.answer.startsWith("No Rule is about “Quidditch”.\n\nThe Rules that hold:")).toBe(true);
  });

  it("looks up a name: who or what it is, and where it was first named", () => {
    const { story } = twoScenes();
    expect(tool(story, "read_name").run({ name: "Shacklebolt" })).toEqual({
      answer: "- Kingsley Shacklebolt (a person), first named in Scene 1: An Auror who came asking about the egg. From: “An Auror called Kingsley Shacklebolt”",
      line: "looked up the name “Shacklebolt”"
    });
    expect(tool(story, "read_name").run({ name: "Hagrid" }).answer).toBe("- Rubeus Hagrid, a person in the Story: Keeper of Keys and Grounds, with a soft spot for dangerous creatures.");
    expect(tool(story, "read_name").run({ name: "Crabbe and Goyle" }).answer).toContain("- Crabbe and Goyle, a group: Draconia's errands, and whatever she wants hit.");
    expect(tool(story, "read_name").run({ name: "Fluffy" })).toEqual({ answer: "Nothing called “Fluffy” has been named in this Story.", line: "looked up the name “Fluffy”: not named" });
  });

  it("keeps every answer within its bound", () => {
    const story = ledger();
    for (let exchange = 0; exchange < 40; exchange++) {
      story.move(`I mention the egg again, time ${exchange + 1}.`);
      story.reply(`The egg, again. ${"Hermione sighs about the egg and the fire and Hagrid. ".repeat(40)}`);
    }
    story.close();
    story.chronicle({ moments: Array.from({ length: 30 }, (_, index) => ({ what: `Moment ${index + 1} about the egg.`, quotes: [], there: ["Hermione Granger"], weight: 2 })) });
    const search = tool(story, "search_story").run({ words: "egg" });
    expect(search.line).toBe("searched the Story for “egg”: 8 passages");
    expect(search.answer.length).toBeLessThanOrEqual(8_100);
    const person = tool(story, "read_person").run({ name: "Hermione Granger" }).answer;
    expect(person).toContain("- (18 earlier left out)\n- Scene 1: Moment 19 about the egg.");
    expect(person.length).toBeLessThanOrEqual(8_100);
  });
});
