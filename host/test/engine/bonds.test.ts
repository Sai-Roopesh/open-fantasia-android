import { describe, expect, it } from "vitest";
import { recall } from "../../src/agents/recall.js";
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
      moments: [{ what: "He catches her as everything floats.", quotes: [{ entry: "E2", text: MOVE }], there: ["Draconia Malfoy"], weight: 4 }],
      told: [],
      bonds: [{ who: "Draconia Malfoy", standing: STANDING, turn: TURN }]
    }) }],
    ...scripts
  });
}

const staying = { answer: JSON.stringify({ leaves_scene: false, frame: { title: "Twenty-nine minutes", place: "An empty classroom", purpose: "p", exit: "e" }, comes_in: ["Draconia Malfoy"], goes: [], beats: [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }], note: "n", call: "continue", intensity: 3, arc_moved: true, clock: "Day 3 21:42", taste: null, in_play: [] }) };
const library = { answer: JSON.stringify({ leaves_scene: true, frame: { title: "A week on", place: "The library", purpose: "p", exit: "e" }, comes_in: ["Draconia Malfoy"], goes: [], beats: [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }], note: "Draconia is at the end table.", call: "continue", intensity: 2, arc_moved: true, clock: "Day 10 15:00", taste: null, in_play: [] }) };

describe("a Bond read in later Scenes (lasting-records design decision 6)", () => {
  // GIVEN Draconia's Bond with that turn
  // WHEN a Scene with her opens a week later
  // THEN the Writer and the Actor are given where things stand and the latest turns, and her Replies keep to them
  // (Whether her Replies keep to them is the live check's; here, that both are given it.)
  it("living-world › Where things stand between him and each person is kept › A Bond read in a later Scene", async () => {
    const { play, engine, storyId, head, models } = classroom({ writer: [staying, library] });
    await play(MOVE);
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    await engine.settled(storyId);
    const writerCalls = models.writer.requests.length;
    const actorCalls = models.actor.requests.length;
    await play("A week later I find Draconia in the library.");
    const between = `- Draconia Malfoy: ${STANDING}\n  - Scene 1 · Twenty-nine minutes: ${TURN}`;
    expect(models.writer.requests[writerCalls]!.prompt).toContain(`<between_you>\n${between}`);
    expect(models.actor.requests[actorCalls]!.system).toContain(`<between>\n${between}`);
    // The Actor is given only the Bonds of the people here: Hermione is not in the library.
    expect(models.actor.requests[actorCalls]!.system).not.toContain(HERMIONE);
  });

  it("gives the Director every Lead's Bond", async () => {
    const { play, engine, storyId, head, models } = classroom();
    await play(MOVE);
    engine.endScene(storyId, head(), "t-end");
    await engine.directed(storyId);
    const prompt = models.director.requests[0]!.prompt;
    expect(prompt).toContain(`<leads_between>\n- Draconia Malfoy: ${STANDING}\n  - Scene 1 · Twenty-nine minutes: ${TURN}\n- Hermione Granger: ${HERMIONE}\n</leads_between>`);
  });

  it("recalls where things stand and only the latest three turns", async () => {
    const { play, engine, storyId, head, mac } = classroom();
    await play(MOVE);
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    const closed = head();
    const scene = mac.tree.pathTo(closed).find(entry => entry.payload.kind === "scene_opened")!.id;
    for (const n of [2, 3, 4]) {
      mac.tree.append(storyId, closed, { kind: "chronicle", scene, summary: null, sceneEnded: true, moments: [], told: [], bonds: [{ who: "Draconia Malfoy", standing: `Standing ${n}.`, turn: `Turn ${n}.` }], callId: `c${n}`, model: { provider: "claude", model: "claude-sonnet-5-5" } });
    }
    const recalled = recall(mac, closed, ["Draconia Malfoy"]);
    expect(recalled.between).toEqual([{ who: "Draconia Malfoy", standing: "Standing 4.", turns: ["Scene 1 · Twenty-nine minutes: Turn 2.", "Scene 1 · Twenty-nine minutes: Turn 3.", "Scene 1 · Twenty-nine minutes: Turn 4."] }]);
  });
});
