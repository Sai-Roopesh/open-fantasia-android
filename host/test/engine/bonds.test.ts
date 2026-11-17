import { describe, expect, it } from "vitest";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

const MOVE = "I catch you as everything floats.";
const BEFORE = "She bills him for the slap and keeps him on her terms.";
const STANDING = "She bills him for the slap and keeps him on her terms, but she let him hold her before she remembered to refuse it.";
const TURN = "She floated in his arms, ordered him to put her down, and did not thank him.";
const HERMIONE = "She corrects his wand-work and saves him a seat in Charms.";

/** The classroom Scene with Draconia, whose record gives her Bond a turn. */
function classroom(scripts: Parameters<typeof playable>[1] = {}) {
  const story = hogwartsStoryFile({ title: "Twenty-nine minutes", place: "An empty classroom", who: ["Draconia Malfoy"], prose: "Draconia sets out her notes." });
  story.people = story.people.map(person => person.name === "Draconia Malfoy" ? { ...person, bond: BEFORE }
    : person.name === "Hermione Granger" ? { ...person, bond: HERMIONE } : person) as StoryFile["people"];
  return playable(story, {
    chronicler: [{ answer: JSON.stringify({
      summary: "In the classroom Draconia floated in his arms and ordered him to put her down.",
      paragraph: "In an empty classroom everything floated, and Draconia ended up in his arms; she ordered him to put her down.",
      moments: [{ what: "He catches her as everything floats.", quotes: [{ entry: "P2", text: MOVE }], there: ["Draconia Malfoy"], weight: 4 }],
      told: [], known: [],
      bonds: [{ who: "Draconia Malfoy", standing: STANDING, turn: TURN }],
      engagements: [], changed: []
    }) }],
    ...scripts
  });
}

const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
const staying = { answer: JSON.stringify({ leaves_scene: false, frame: { title: "Twenty-nine minutes", place: "An empty classroom", purpose: "p", exit: "e" }, comes_in: ["Draconia Malfoy"], goes: [], beats, note: "n", call: "continue", intensity: 3, arc_moved: true, minutes: 2, taste: null, in_play: [], moves_to: null }) };
/** A week on, from the Day View at 9:42 pm on Friday to Friday week at three. */
const library = { answer: JSON.stringify({ leaves_scene: false, frame: { title: "A week on", place: "The library", purpose: "p", exit: "e" }, comes_in: ["Draconia Malfoy"], goes: [], beats, note: "Draconia is at the end table.", call: "continue", intensity: 2, arc_moved: true, minutes: 9678, taste: null, in_play: [], moves_to: null }) };

describe("a Bond read in later Scenes (lasting-records design decision 6)", () => {
  // GIVEN Draconia's Bond with that turn
  // WHEN a Scene with her opens a week later
  // THEN the Writer and the Actor are given where things stand and the latest turns, and her Replies keep to them
  // (Whether her Replies keep to them is the live check's; here, that both are given it.)
  it("living-world › Where things stand between him and each person is kept › A Bond read in a later Scene", async () => {
    const { play, engine, storyId, head, models, state } = classroom({ writer: [staying, library] });
    await play(MOVE);
    engine.endScene(storyId, head(), "t-end");
    await engine.ended(storyId);
    const writerCalls = models.writer.requests.length;
    const actorCalls = models.actor.requests.length;
    await play("A week later I find Draconia in the library.");
    expect(state().scene).toMatchObject({ number: 2, at: "Day 10 15:00", here: ["Draconia Malfoy"] });
    // Both read where things stand between the two of them, as he has seen it, with the turn that brought it there.
    const between = `Draconia Malfoy and Roopesh Gantasala, as he has seen it: ${STANDING}\n  Scene 1: ${TURN}`;
    expect(models.writer.requests[writerCalls]!.prompt).toContain(between);
    const actor = models.actor.requests[actorCalls]!;
    expect(actor.prompt).toContain(between);
    // The Actor is given only the Bonds of the people here: Hermione is not in the library.
    expect(`${actor.system}\n${actor.prompt}`).toContain(HERMIONE); // Author context includes absent Leads; it does not place them here.
  });

  it("gives the Director every Lead's Bond", async () => {
    const { play, engine, storyId, head, models } = classroom();
    await play(MOVE);
    engine.endScene(storyId, head(), "t-end");
    await engine.ended(storyId);
    const prompt = models.director.requests[0]!.prompt;
    expect(prompt).toContain(`Draconia Malfoy and Roopesh Gantasala, as he has seen it: ${STANDING}\n  Scene 1: ${TURN}`);
    expect(prompt).toContain(`Hermione Granger and Roopesh Gantasala, as he has seen it: ${HERMIONE}`);
  });
});
