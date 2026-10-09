import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importStoryFile } from "../../src/storyfile/import.js";
import { bondsOn } from "../../src/story/bonds.js";
import { worldOn } from "../../src/story/world.js";
import { listStories } from "../../src/views/stories.js";
import { freshHome } from "../support/host.js";
import { malfoyProblemStoryFile, minimalStoryFile, writeStoryFile } from "../support/story-files.js";

function storyCount(db: ReturnType<typeof freshHome>["db"]): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM stories").get() as { n: number }).n;
}

describe("story-file", () => {
  // GIVEN a folder holding the setup document and 46 Portrait images it names
  // WHEN it is imported
  // THEN each person's Portrait is the image the document names for them
  it("story-file › A Story File is one folder › A folder with its Portraits", () => {
    const mac = freshHome();
    const story = malfoyProblemStoryFile();
    story.people = story.people.map(person => ({ ...person, portrait: `portraits/${person.name.replace(/\W+/g, "-")}.png` })) as typeof story.people;
    const result = importStoryFile(writeStoryFile(story), mac);
    if (!result.ok) throw new Error(result.problems.map(problem => problem.message).join("; "));
    const state = mac.states.at(mac.tree.currentPath(result.storyId)!.headEntryId);
    expect(Object.keys(state.people)).toHaveLength(46);
    for (const person of Object.values(state.people)) {
      expect(person.portrait).not.toBeNull();
      expect(existsSync(join(mac.home, "portraits", result.storyId, person.portrait!))).toBe(true);
    }
  });

  // WHEN a Story File declares a format version the app does not understand
  // THEN the import is refused, naming the version found and the versions understood
  it("story-file › A Story File is one folder › An unknown version", () => {
    const mac = freshHome();
    const result = importStoryFile(writeStoryFile({ ...minimalStoryFile(), format: 2 }), mac);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]!.message).toMatch(/format 2/);
    expect(result.problems[0]!.message).toMatch(/understands format 1/);
    expect(storyCount(mac.db)).toBe(0);
  });

  // GIVEN a Story File with only a title, two people, the Player Character, a Premise, a Style and an opening Scene
  // WHEN it is imported
  // THEN the Story is created with no Groups, Arcs or Landmarks, and plays its opening Scene
  it("story-file › A Story File sets up every part of a Story › A small Story File", () => {
    const mac = freshHome();
    const result = importStoryFile(writeStoryFile(minimalStoryFile()), mac);
    if (!result.ok) throw new Error(result.problems.map(problem => problem.message).join("; "));
    const state = mac.states.at(mac.tree.currentPath(result.storyId)!.headEntryId);
    expect(state.groups).toEqual([]);
    expect(state.arcs).toEqual([]);
    expect(state.landmarks).toEqual([]);
    expect(state.scene).toMatchObject({ number: 1, title: "The night train", place: "A sleeper compartment", at: "Day 1 23:10", here: ["Mira"] });
  });

  // GIVEN a Story File with the Thread "the dragon egg in Hagrid's hut", where it stands "Hagrid is keeping it warm in the fire"
  // WHEN it is imported
  // THEN the Story's World has that Thread, standing where the Story File put it
  it("story-file › A Story File sets up every part of a Story › A Story File with a Thread", () => {
    const mac = freshHome();
    const story = { ...minimalStoryFile(), threads: [{ name: "the dragon egg in Hagrid's hut", now: "Hagrid is keeping it warm in the fire" }] };
    const result = importStoryFile(writeStoryFile(story), mac);
    if (!result.ok) throw new Error(result.problems.map(problem => problem.message).join("; "));
    const world = worldOn(mac, mac.tree.currentPath(result.storyId)!.headEntryId);
    expect(world.threads).toEqual([{ name: "the dragon egg in Hagrid's hut", now: "Hagrid is keeping it warm in the fire" }]);
  });

  // What the Player Character knows of someone is kept apart from who they really are (openspec story-file); the World
  // screen's half of this scenario is proved with the World screen.
  it("keeps who someone is and what the Player Character knows of them apart", () => {
    const mac = freshHome();
    const story = minimalStoryFile();
    story.people = story.people.map((person, index) => index === 1
      ? { ...person, who_they_are: "Serves Voldemort, who lives on the back of his head.", known: "The nervous Defence teacher, who stammers and smells of garlic." }
      : person) as typeof story.people;
    const result = importStoryFile(writeStoryFile(story), mac);
    if (!result.ok) throw new Error(result.problems.map(problem => problem.message).join("; "));
    const person = mac.states.at(mac.tree.currentPath(result.storyId)!.headEntryId).people[story.people[1]!.name]!;
    expect(person.whoTheyAre).toBe("Serves Voldemort, who lives on the back of his head.");
    expect(person.known).toBe("The nervous Defence teacher, who stammers and smells of garlic.");
    // Someone the Story File says nothing of is known for nothing yet.
    expect(mac.states.at(mac.tree.currentPath(result.storyId)!.headEntryId).people[story.people[0]!.name]!.known).toBeNull();
  });

  // GIVEN a Story File where Draconia's Bond says she called him the word on the train, he saved her twenty minutes later,
  //   and she owes him and calls him Stray
  // WHEN it is imported and her page is opened
  // THEN Between you shows that standing before any Scene is played
  // (The page's half is proved with the person view; here, the Bond the page reads.)
  it("story-file › A Story File sets up every part of a Story › A Bond to start from", () => {
    const mac = freshHome();
    const story = malfoyProblemStoryFile();
    const standing = "She called him the word on the train; twenty minutes later he saved her. She owes him, hates owing him, and calls him Stray.";
    story.people = story.people.map(person => person.name === "Draconia Malfoy" ? { ...person, bond: standing } : person) as typeof story.people;
    const result = importStoryFile(writeStoryFile(story), mac);
    if (!result.ok) throw new Error(result.problems.map(problem => problem.message).join("; "));
    const bonds = bondsOn(mac, mac.tree.currentPath(result.storyId)!.headEntryId);
    expect(bonds.get("Draconia Malfoy")).toEqual({ standing, turns: [] });
    // Someone the Story File gives no Bond has none yet.
    expect(bonds.has("Hermione Granger")).toBe(false);
  });

  // A Bond is where things stand between him and someone else, in forty words or fewer (lasting-records design decision 1).
  it("refuses a Bond for the Player Character himself, or one over forty words", () => {
    const mac = freshHome();
    const story = malfoyProblemStoryFile();
    const pc = story.people.findIndex(person => person.name === story.player_character);
    const draconia = story.people.findIndex(person => person.name === "Draconia Malfoy");
    story.people = story.people.map((person, index) => index === pc ? { ...person, bond: "He is himself." }
      : index === draconia ? { ...person, bond: Array.from({ length: 41 }, () => "word").join(" ") } : person) as typeof story.people;
    const result = importStoryFile(writeStoryFile(story), mac);
    expect(result.ok ? [] : result.problems).toHaveLength(2);
    expect(result.ok ? [] : result.problems).toEqual(expect.arrayContaining([
      { where: `people[${pc}].bond`, message: `${story.player_character} is the Player Character; a Bond is between him and someone else` },
      { where: `people[${draconia}].bond`, message: "Draconia Malfoy's Bond is 41 words; say where things stand in forty or fewer" }
    ]));
  });

  // WHEN a Story File has two people named "Weasley"
  // THEN the import is refused, naming the duplicated name
  it("story-file › People are referred to by name › Two people with one name", () => {
    const mac = freshHome();
    const story = minimalStoryFile();
    story.people = [...story.people, { name: "Weasley", who_they_are: "A redhead." }, { name: "Weasley", who_they_are: "Another redhead." }];
    const result = importStoryFile(writeStoryFile(story), mac);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.map(problem => problem.message).join("\n")).toMatch(/"Weasley"/);
    expect(storyCount(mac.db)).toBe(0);
  });

  // GIVEN a Story File whose Lead "Ginny Weasley" is not among its people and whose Portrait for Hermione is missing from the folder
  // WHEN it is imported
  // THEN nothing is created
  // AND the refusal names both problems and where each is
  it("story-file › An import is checked whole and taken in whole › Several problems at once", () => {
    const mac = freshHome();
    const story = malfoyProblemStoryFile();
    story.leads = [...story.leads!, "Ginny Weasley"];
    const result = importStoryFile(writeStoryFile(story, { omitPortraits: ["portraits/hermione.png"] }), mac);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(2);
    expect(result.problems).toContainEqual(expect.objectContaining({ where: "leads[3]", message: expect.stringMatching(/Ginny Weasley/) }));
    expect(result.problems).toContainEqual(expect.objectContaining({ where: "people[1].portrait", message: expect.stringMatching(/portraits\/hermione\.png/) }));
    expect(storyCount(mac.db)).toBe(0);
    expect(existsSync(join(mac.home, "portraits"))).toBe(false);
  });

  // WHEN a valid Story File is imported
  // THEN the Story exists in full on the Mac and appears on the phone's home screen
  it("story-file › An import is checked whole and taken in whole › A file with no problems", () => {
    const mac = freshHome();
    const result = importStoryFile(writeStoryFile(malfoyProblemStoryFile()), mac);
    if (!result.ok) throw new Error(result.problems.map(problem => problem.message).join("; "));
    const path = mac.tree.currentPath(result.storyId)!;
    expect(mac.tree.pathTo(path.headEntryId).map(entry => entry.payload.kind)).toEqual(["story_set_up", "scene_opened"]);
    expect(listStories(mac).map(story => story.title)).toEqual(["The Malfoy Problem"]);
  });

  // WHEN the same Story File is imported twice
  // THEN there are two separate Stories, and playing one leaves the other unchanged
  it("story-file › Importing never touches another Story › Importing the same file twice", () => {
    const mac = freshHome();
    const folder = writeStoryFile(minimalStoryFile());
    const first = importStoryFile(folder, mac);
    const second = importStoryFile(folder, mac);
    if (!first.ok || !second.ok) throw new Error("Both imports should succeed");
    expect(first.storyId).not.toBe(second.storyId);
    const secondHead = mac.tree.currentPath(second.storyId)!.headEntryId;
    const firstPath = mac.tree.currentPath(first.storyId)!;
    const move = mac.tree.append(first.storyId, firstPath.headEntryId, { kind: "move", text: "I offer her a seat." });
    mac.tree.moveHead(firstPath.id, firstPath.headEntryId, move.id);
    expect(mac.tree.currentPath(second.storyId)!.headEntryId).toBe(secondHead);
  });
});

describe("stories", () => {
  // GIVEN a Story File for "The Malfoy Problem" with 46 people, three Leads and an opening at a party
  // WHEN it is imported on the Mac
  // THEN the Story appears on the phone's home screen
  // AND opening it lands in the opening Scene with its title card
  it("stories › A Story File becomes a Story whole › The Harry Potter Story is imported", () => {
    const mac = freshHome();
    const result = importStoryFile(writeStoryFile(malfoyProblemStoryFile()), mac);
    if (!result.ok) throw new Error(result.problems.map(problem => problem.message).join("; "));
    expect(listStories(mac)).toEqual([expect.objectContaining({ title: "The Malfoy Problem", standing: "Scene 1 · The insult" })]);
    const state = mac.states.at(mac.tree.currentPath(result.storyId)!.headEntryId);
    expect(Object.keys(state.people)).toHaveLength(46);
    expect(state.leads).toHaveLength(3);
    expect(state.scene).toMatchObject({ title: "The insult", place: "The Three Broomsticks", at: "Day 1 21:40" });
  });

  // GIVEN a Story File whose Leads include "Ginny Weasley" but whose people do not
  // WHEN it is imported
  // THEN nothing is created
  // AND the refusal names Ginny Weasley as a Lead with no person
  it("stories › A Story File becomes a Story whole › A file names a Lead who is not in it", () => {
    const mac = freshHome();
    const story = minimalStoryFile();
    story.leads = ["Mira", "Ginny Weasley"];
    const result = importStoryFile(writeStoryFile(story), mac);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual([{ where: "leads[1]", message: "\"Ginny Weasley\" is a Lead but not one of the people" }]);
    expect(storyCount(mac.db)).toBe(0);
  });
});
