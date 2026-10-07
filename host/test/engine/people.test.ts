import { describe, expect, it } from "vitest";
import type { Person } from "../../src/story/state.js";
import { backstageView } from "../../src/views/backstage.js";
import { sceneView } from "../../src/views/scene.js";
import { worldView } from "../../src/views/world.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile, nightTrainStoryFile } from "../support/story-files.js";

/** A person as the editor sends them. */
const theo = (changes: Partial<Omit<Person, "portrait">> = {}): Omit<Person, "portrait"> => ({
  name: "Theodore Nott", aliases: ["Theo"], whoTheyAre: "A quiet Slytherin who reads in the library.", known: null,
  appearance: "Thin, ink on his fingers.", after: "To be left alone.", knows: [], voice: ["Mm."], group: null, ...changes
});

describe("editing people on the Path (editing-people design decisions 1 and 2)", () => {
  it("creates a person, puts someone in a Group, makes a Lead and adds a Group, each as an entry the State reads", () => {
    const { engine, storyId, head, state, path, events } = playable(hogwartsWorldStoryFile());
    engine.setPerson(storyId, theo(), head(), "t", true);
    expect(state().people["Theodore Nott"]).toMatchObject({ whoTheyAre: "A quiet Slytherin who reads in the library.", portrait: null });
    expect(path().at(-1)).toMatchObject({ kind: "person_set", person: { name: "Theodore Nott" } });
    expect(events.at(-1)!.event.kind).toBe("path_changed");

    engine.setGroup(storyId, "The library regulars", "Who is always in the library after supper.", head(), "t");
    engine.setPerson(storyId, theo({ group: "The library regulars" }), head(), "t", false);
    expect(state().people["Theodore Nott"]!.group).toBe("The library regulars");
    expect(state().groups.at(-1)).toEqual({ name: "The library regulars", description: "Who is always in the library after supper." });

    engine.setLead(storyId, "Theodore Nott", true, head(), "t");
    expect(state().leads.at(-1)).toBe("Theodore Nott");
    engine.setLead(storyId, "theo", false, head(), "t");
    expect(state().leads).not.toContain("Theodore Nott");
  });

  it("keeps a Portrait already someone's when they are changed", () => {
    const { engine, storyId, head, state, mac } = playable(hogwartsWorldStoryFile());
    engine.setPerson(storyId, theo(), head(), "t", true);
    const path = mac.tree.currentPath(storyId)!;
    const portrait = mac.tree.append(storyId, head(), { kind: "portrait_set", person: "Theodore Nott", file: "theo.png" });
    mac.tree.moveHead(path.id, path.headEntryId, portrait.id);
    engine.setPerson(storyId, theo({ after: "A friend, maybe." }), head(), "t", false);
    expect(state().people["Theodore Nott"]).toMatchObject({ after: "A friend, maybe.", portrait: "theo.png" });
  });

  it("refuses a blank name or description, a name taken, a Group the Story lacks, and the Player Character as a Lead or in a Group", () => {
    const { engine, storyId, head } = playable(hogwartsWorldStoryFile());
    const refused = (attempt: () => unknown) => { try { attempt(); return null; } catch (error) { return (error as Error).message; } };
    expect(refused(() => engine.setPerson(storyId, theo({ name: " " }), head(), "t", true))).toBe("Give them a name.");
    expect(refused(() => engine.setPerson(storyId, theo({ whoTheyAre: "" }), head(), "t", true))).toBe("Say who Theodore Nott is.");
    expect(refused(() => engine.setPerson(storyId, theo({ name: "Hermione Granger" }), head(), "t", true))).toBe("Hermione Granger is already in the Story.");
    expect(refused(() => engine.setPerson(storyId, theo({ aliases: ["Hermione"] }), head(), "t", true))).toBe("\"Hermione\" is already Hermione Granger's name.");
    expect(refused(() => engine.setPerson(storyId, theo({ group: "The Chess Club" }), head(), "t", true))).toBe("The Story has no Group called The Chess Club.");
    expect(refused(() => engine.setPerson(storyId, theo(), head(), "t", false))).toBe("Theodore Nott is not in the Story.");
    expect(refused(() => engine.setLead(storyId, "Roopesh Gantasala", true, head(), "t"))).toBe("Roopesh Gantasala is the Player Character, not a Lead.");
    expect(refused(() => engine.setLead(storyId, "Gilderoy Lockhart", true, head(), "t"))).toBe("Gilderoy Lockhart is not in the Story.");
    const pc = playable(hogwartsWorldStoryFile());
    const roopesh = pc.state().people["Roopesh Gantasala"]!;
    expect(refused(() => pc.engine.setPerson(pc.storyId, { ...roopesh, group: "Crabbe and Goyle" }, pc.head(), "t", false))).toBe("Roopesh Gantasala is the Player Character, and is in no Group.");
    expect(refused(() => engine.setGroup(storyId, " ", "x", head(), "t"))).toBe("Give the Group a name.");
    expect(refused(() => engine.setPerson(storyId, theo(), "old-head", "t", true))).toMatch(/moved on/);
  });
});

describe("the Story's people, as the player keeps them", () => {
  // GIVEN Meera's description says she is from Mumbai, and the player meant Pune
  // WHEN the player changes it in the app during Scene 9
  // THEN the Scenes from then on on that Path write her as from Pune
  // AND Scene 8, read back, is as it was
  it("stories › Anything can be edited or created in the app › Fixing someone mid-Story", async () => {
    const story = nightTrainStoryFile();
    story.people = story.people.map(person => person.name === "Meera Kulkarni" ? { ...person, who_they_are: person.who_they_are.replace("Pune", "Mumbai") } : person) as typeof story.people;
    const { mac, engine, storyId, head, state, play, models } = playable(story);
    await play("I ask where she is from.");
    const before = head();
    // Another Path, standing where the Story stood before the fix.
    const other = mac.tree.createPath(storyId, "Before", before, false);
    const meera = state().people["Meera Kulkarni"]!;
    expect(meera.whoTheyAre).toContain("Mumbai");
    engine.setPerson(storyId, { ...meera, whoTheyAre: meera.whoTheyAre.replace("Mumbai", "Pune") }, head(), "fix", false);
    await play("I ask about her birds.");
    const writer = models.writer.requests.at(-1)!;
    expect(writer.system).toContain("Pune");
    expect(writer.system).not.toContain("Mumbai");
    expect(mac.states.at(before).people["Meera Kulkarni"]!.whoTheyAre).toContain("Mumbai");
    expect(mac.states.at(other.headEntryId).people["Meera Kulkarni"]!.whoTheyAre).toContain("Mumbai");
  });

  // GIVEN a person who first appeared in Scene 30
  // WHEN the player toggles them to Lead
  // THEN the Story treats them as a Lead from then on
  it("stories › Leads are the player's to choose › A newcomer becomes a Lead", async () => {
    const { engine, storyId, head, state, play, models } = playable(hogwartsWorldStoryFile());
    engine.setPerson(storyId, theo(), head(), "add", true);
    engine.setLead(storyId, "Theodore Nott", true, head(), "lead");
    expect(state().leads).toContain("Theodore Nott");
    await play("I look for Theo in the library.");
    expect(models.writer.requests.at(-1)!.system).toMatch(/<leads>[\s\S]*Theodore Nott[\s\S]*<\/leads>/);
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    expect(models.weaver.requests.at(-1)!.system).toMatch(/<leads>[\s\S]*Theodore Nott/);
  });

  // GIVEN the Player Character has spent five Scenes in a row with Neville, who is not a Lead
  // THEN Neville is still not a Lead, and nothing suggests making him one
  it("stories › Leads are the player's to choose › The Story never promotes anyone", async () => {
    const story = hogwartsWorldStoryFile({ title: "Herbology", place: "Greenhouse Three", at: "Day 3 09:00", who: ["Neville Longbottom"] });
    const { mac, engine, storyId, head, state, play } = playable(story);
    const leads = [...state().leads];
    for (let scene = 0; scene < 5; scene++) {
      await play(`I spend the morning with Neville again (${scene + 1}).`);
      engine.endScene(storyId, head(), `end-${scene}`);
      await engine.directed(storyId);
      if (scene < 4) await play("I find Neville in the greenhouse.");
    }
    expect(state().leads).toEqual(leads);
    expect(mac.tree.pathTo(head()).some(entry => entry.payload.kind === "lead_set")).toBe(false);
    const views = JSON.stringify([sceneView(mac, engine, storyId, "t"), worldView(mac, storyId, "t"), backstageView(mac, storyId, "t")]);
    expect(views).not.toMatch(/make .*Lead|suggest/i);
  });

  // GIVEN Goyle is in the "Crabbe and Goyle" Group
  // WHEN Goyle saves the Player Character's life in a Scene
  // THEN Goyle is still in the Group until the player takes him out
  it("stories › Groups are the player's to arrange › Goyle starts to matter", async () => {
    const { mac, engine, storyId, head, state, play } = playable(hogwartsWorldStoryFile({ title: "The lake", place: "The Black Lake", at: "Day 3 16:00", who: ["Gregory Goyle"] }),
      { actor: [{ answer: "Goyle wades in without a word and hauls him out of the freezing water by his collar." }] });
    await play("I go through the ice.");
    engine.endScene(storyId, head(), "end");
    await engine.directed(storyId);
    expect(state().people["Gregory Goyle"]!.group).toBe("Crabbe and Goyle");
    expect(mac.tree.pathTo(head()).some(entry => entry.payload.kind === "person_set")).toBe(false);
    // The player takes him out.
    engine.setPerson(storyId, { ...state().people["Gregory Goyle"]!, group: null }, head(), "out", false);
    expect(state().people["Gregory Goyle"]!.group).toBeNull();
  });
});
