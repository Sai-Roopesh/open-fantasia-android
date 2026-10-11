import { describe, expect, it } from "vitest";
import type { ModelRequest } from "../../src/models/model-call.js";
import { fakeChronicleAnswer } from "../../src/models/fake.js";
import { worldView } from "../../src/views/world.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

/** The Hogwarts Story, where Roopesh knows Hermione only as a Gryffindor first-year. */
function hogwarts() {
  const story = hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 21:40", who: ["Hermione Granger"] });
  story.people = story.people.map(person => person.name === "Hermione Granger" ? { ...person, known: "A Gryffindor first-year." } : person) as typeof story.people;
  return story;
}

describe("the World screen", () => {
  // GIVEN all Roopesh knows of Hermione is that she is a Gryffindor first-year
  // WHEN a Scene ends in which she noticed the inkwell and asked him for a reason
  // THEN her entry on the World screen says she noticed the inkwell, from that Scene
  it("outside-the-scene › The World screen shows what the Player Character knows › What he knows grows with a Scene", async () => {
    const inkwell = { from: (request: ModelRequest) => ({ answer: JSON.stringify({
      ...JSON.parse((fakeChronicleAnswer(request) as { answer: string }).answer) as object,
      known: [{ who: "Hermione Granger", now: "A Gryffindor first-year. She noticed the inkwell move on its own, and asked him for a reason." }]
    }) }) };
    const { mac, engine, storyId, head, play } = playable(hogwarts(), { chronicler: [inkwell] });
    const before = worldView(mac, storyId, "t").people.find(person => person.name === "Hermione Granger")!;
    expect(before).toMatchObject({ known: "A Gryffindor first-year.", known_from: null });
    await play("I tell her the inkwell moved because I wanted it to.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const after = worldView(mac, storyId, "t").people.find(person => person.name === "Hermione Granger")!;
    expect(after.known).toContain("noticed the inkwell");
    expect(after.known_from).toEqual({ number: 1, title: "After curfew" });
  });

  // GIVEN fifteen Scenes with Draconia, each of which showed him something new about her
  // THEN what he knows of her is still at most 60 words, and the detail is in Between you and the Journal
  it("outside-the-scene › The World screen shows what the Player Character knows › What he knows stays short after many Scenes", async () => {
    const words = (text: string | null) => (text ?? "").trim().split(/\s+/).length;
    // Each Scene's record rewrites the line and adds a turn. Every third line comes back far longer than asked, as a
    // model's might: it is left out of the record (one-truth living-world: Moments are remembered from one record),
    // so the line before it stands.
    let scene = 0;
    const record = { from: (request: ModelRequest) => {
      scene += 1;
      return { answer: JSON.stringify({
        ...JSON.parse((fakeChronicleAnswer(request) as { answer: string }).answer) as object,
        known: [{ who: "Draconia Malfoy", now: scene % 3 === 0 ? `A Malfoy. ${"Something new. ".repeat(40)}` : `A Malfoy, sharp and proud; the latest thing he saw of her was in Scene ${scene}.` }],
        bonds: [{ who: "Draconia Malfoy", standing: `Where things stand after Scene ${scene}.`, turn: `What changed in Scene ${scene}.` }]
      }) };
    } };
    const { mac, engine, storyId, head, play } = playable(hogwarts(), { chronicler: Array.from({ length: 15 }, () => record) });
    for (let n = 1; n <= 15; n++) {
      await play(`I find Draconia Malfoy again, the ${n}th time this term.`);
      engine.endScene(storyId, head(), `end-${n}`);
      await engine.ended(storyId);
    }
    const draconia = worldView(mac, storyId, "t").people.find(person => person.name === "Draconia Malfoy")!;
    expect(words(draconia.known)).toBeLessThanOrEqual(60);
    expect(draconia.known).toBe("A Malfoy, sharp and proud; the latest thing he saw of her was in Scene 14.");
    expect(draconia.between?.standing).toBe("Where things stand after Scene 15.");
    expect(draconia.between?.turns).toHaveLength(15);
    expect(draconia.between?.turns[0]).toMatchObject({ text: "What changed in Scene 15.", scene_number: 15 });
    expect(draconia.between?.turns.at(-1)).toMatchObject({ text: "What changed in Scene 1.", scene_number: 1 });
    // Someone he has no history with has no Between you.
    expect(worldView(mac, storyId, "t").people.find(person => person.name === "Hermione Granger")!.between).toBeNull();
  });

  // GIVEN Quirrell serves Voldemort, and the Player Character does not know it
  // THEN Quirrell's entry on the World screen says nothing of it
  it("outside-the-scene › The World screen shows what the Player Character knows › A secret stays out of the World screen", async () => {
    const { mac, engine, storyId, head, play } = playable(withQuirrellsSecret(), { chronicler: [quirrellSeen] });
    await play("I ask Professor Quirrell about the troll.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const screen = JSON.stringify(worldView(mac, storyId, "t"));
    expect(screen).toContain("Quirinus Quirrell");
    expect(screen).not.toMatch(/Voldemort|back of his head/);
  });
});

describe("story-file", () => {
  // GIVEN a Story File where Quirrell is a servant of Voldemort, and Roopesh knows him as the nervous Defence teacher
  // WHEN it is imported
  // THEN the Story keeps both, and the World screen shows only the nervous Defence teacher
  it("story-file › A Story File sets up every part of a Story › What he knows of someone, and what they really are", () => {
    const { mac, storyId, state } = playable(withQuirrellsSecret());
    expect(state().people["Quirinus Quirrell"]!.whoTheyAre).toContain("Voldemort");
    const quirrell = worldView(mac, storyId, "t").people.find(person => person.name === "Quirinus Quirrell")!;
    expect(quirrell.known).toBe("The nervous Defence teacher. He stammers, and smells of garlic.");
    expect(JSON.stringify(worldView(mac, storyId, "t"))).not.toContain("Voldemort");
  });
});

/** Hogwarts, where Quirrell serves Voldemort and Roopesh knows him only as the nervous Defence teacher. */
function withQuirrellsSecret() {
  const story = hogwartsWorldStoryFile({ title: "After the troll", place: "The Defence classroom", at: "Day 3 21:40", who: ["Quirinus Quirrell"] });
  story.people = story.people.map(person => person.name === "Quirinus Quirrell"
    ? { ...person, who_they_are: "Serves Voldemort, who lives on the back of his head under the turban.", known: "The nervous Defence teacher. He stammers, and smells of garlic." }
    : person) as typeof story.people;
  return story;
}

/** A Chronicler that saw Quirrell flinch at the question, and no more. */
const quirrellSeen = { from: (request: ModelRequest) => ({ answer: JSON.stringify({
  ...JSON.parse((fakeChronicleAnswer(request) as { answer: string }).answer) as object,
  known: [{ who: "Quirinus Quirrell", now: "The nervous Defence teacher. He stammered worse when asked about the troll." }]
}) }) };


describe("who and what the World screen lists", () => {
  /** Hogwarts, where Roopesh knows Draconia, Hermione and Crabbe; Goyle and Quirrell are strangers to him. */
  function story() {
    const file = hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 21:40", who: ["Hermione Granger"] });
    const knownAs: Record<string, string> = { "Hermione Granger": "A Gryffindor.", "Vincent Crabbe": "Draconia's bodyguard.", "Lavender Brown": "Hears everything first." };
    // Exactly these, whatever the test Story says he knows.
    file.people = file.people.map(({ known: _known, ...person }) => knownAs[person.name] ? { ...person, known: knownAs[person.name] } : person) as typeof file.people;
    file.leads = ["Draconia Malfoy", "Hermione Granger"];
    file.world = { summary: "Hogwarts.", places: [{ name: "The Gryffindor common room", description: "Red and gold, a fire that never goes out." }, { name: "The Owlery", description: "Cold, and full of owls." }] };
    file.landmarks = [{ name: "The flying test", at: "Day 5 09:00", what: "First-years fly for the first time." }, { name: "Halloween", at: "Day 1 18:00", what: "Long past." }];
    return file;
  }

  it("lists the Leads he knows of first, then everyone else by name, each Group as one, and nobody he knows nothing of", () => {
    const { mac, storyId } = playable(story());
    const people = worldView(mac, storyId, "t").people;
    expect(people.map(person => [person.name, person.lead, person.is_group])).toEqual([
      ["Hermione Granger", true, false],
      ["Crabbe and Goyle", false, true],
      ["Lavender Brown", false, false],
      ["The Hufflepuff Quidditch team", false, true],
      ["Vincent Crabbe", false, false]
    ]);
    // Draconia is a Lead he knows nothing of yet; Goyle and Quirrell are strangers.
    expect(people.find(person => person.name === "Crabbe and Goyle")).toMatchObject({ known: "Draconia's errands, and whatever she wants hit." });
    expect(people.find(person => person.name === "Vincent Crabbe")).toMatchObject({ group: "Crabbe and Goyle", known: "Draconia's bodyguard." });
  });

  it("marks the places a Scene has been, and lists what is ahead in order, with countdowns", () => {
    const { mac, storyId } = playable(story());
    const world = worldView(mac, storyId, "t");
    expect(world.places).toEqual([
      { name: "The Gryffindor common room", description: "Red and gold, a fire that never goes out.", been: true },
      { name: "The Owlery", description: "Cold, and full of owls.", been: false }
    ]);
    expect(world.calendar).toEqual([{ kind: "landmark", name: "The flying test", what: "First-years fly for the first time.", at_label: expect.stringContaining("9:00 am"), when: "2 days" }]);
  });
});
