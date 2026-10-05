import { describe, expect, it } from "vitest";
import { actorPrompt } from "../../src/agents/actor.js";
import { recall } from "../../src/agents/recall.js";
import { writerPrompt } from "../../src/agents/writer.js";
import type { Script } from "../../src/models/scripted.js";
import { sceneEntries } from "../../src/views/scene.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
const opens = (comesIn: string[], clock: string, title: string): Script => ({ answer: JSON.stringify({ leaves_scene: false, frame: { title, place: title, purpose: "p", exit: "e" }, comes_in: comesIn, goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, clock, taste: null, in_play: [] }) });
// The first Scene opens with the Story File's prose, so its Move is E2; a Scene a Move opened starts with that Move.
const moment = (what: string, weight: number, there: string[], entry = "E1"): unknown => ({ what, quotes: [{ entry, text: "I sit down." }], there, weight });
const chronicle = (summary: string, moments: unknown[]): Script => ({ answer: JSON.stringify({ summary, moments, told: [] }) });

/** Four Scenes: two with Hermione holding three Moments each, one with Harry, and the one being played, with Hermione. */
async function story() {
  const { play, engine, storyId, head, mac } = playable(hogwartsStoryFile(), {
    writer: [opens(["Hermione Granger"], "Day 3 21:42", "After curfew"), opens(["Hermione Granger"], "Day 4 09:00", "Breakfast"), opens(["Harry Potter"], "Day 4 11:00", "The pitch"), opens(["Hermione Granger"], "Day 4 15:00", "The library")],
    chronicler: [
      chronicle("Scene one happened.", [moment("one, weight 1", 1, ["Hermione"], "E2"), moment("one, weight 2", 2, ["Hermione"], "E2"), moment("one, weight 5", 5, ["Hermione"], "E2")]),
      chronicle("Scene two happened.", [moment("two, weight 3", 3, ["Hermione"]), moment("two, weight 4", 4, ["Hermione"]), moment("two, weight 1", 1, ["Hermione"])]),
      chronicle("Scene three happened.", [moment("three, Harry's", 5, ["Harry"])])
    ]
  });
  await play("I sit down.");
  for (const where of ["Breakfast", "The pitch", "The library"]) {
    engine.endScene(storyId, head(), "end");
    await engine.chronicled(storyId);
    await play(where === "Breakfast" ? "I sit down." : `I go to ${where}. I sit down.`);
  }
  return { mac, head };
}

describe("recall", () => {
  it("brings at most five Moments that someone present knows, ranked by weight, knowers and recency, oldest first", async () => {
    const { mac, head } = await story();
    const recalled = recall(mac, head(), ["Hermione Granger"]);
    expect(recalled.moments.map(item => item.what)).toEqual(["one, weight 2", "one, weight 5", "two, weight 3", "two, weight 4", "two, weight 1"]);
    expect(recalled.moments[0]!.knownTo).toEqual(["Hermione Granger"]);
    expect(recalled.moments[0]!.words).toEqual([{ by: "Roopesh Gantasala", text: "I sit down." }]);
  });

  it("gives the Writer what each Moment was, the last day's summaries and the end of the last Scene; the Actor only the words", async () => {
    const { mac, head } = await story();
    const recalled = recall(mac, head(), ["Hermione Granger"]);
    expect(recalled.earlier).toEqual(["Scene 1 · After curfew: Scene one happened.", "Scene 2 · Breakfast: Scene two happened.", "Scene 3 · The pitch: Scene three happened."]);
    expect(recalled.lastSceneEnd.map(words => words.text)).toEqual(["I go to The pitch. I sit down.", "She looks at you, and waits."]);

    const { state, entries } = sceneEntries(mac, head());
    const writer = writerPrompt({ state, scene: entries, move: "I look up.", direction: null, recall: recalled }).prompt;
    expect(writer).toContain("one, weight 5");
    expect(writer).toContain("Scene 2 · Breakfast: Scene two happened.");
    expect(writer).toContain("I go to The pitch. I sit down.");

    const actor = actorPrompt(state, entries, recalled).system;
    expect(actor).toMatch(/<moment scene="Scene 1 · After curfew" known_to="Hermione Granger">\n<move by="Roopesh Gantasala">\nI sit down\.\n<\/move>\n<\/moment>/);
    expect(actor).not.toContain("one, weight 5");
    expect(actor).not.toContain("Scene two happened.");
    expect(actor).not.toContain("I go to The pitch.");
  });
});
