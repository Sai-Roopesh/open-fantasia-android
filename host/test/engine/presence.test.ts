import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { Script } from "../../src/models/scripted.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { NIGHT_TRAIN } from "../support/stories.js";
import { playable } from "../support/play.js";

const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];

/** A Writer's answer naming who comes in and who goes; [opens] frames a new Scene from the Day View. */
function writer(change: { comes_in?: string[]; goes?: string[] }, clock: string, opens?: { title: string; place: string }): Script {
  const frame = opens ? { ...opens, purpose: "p", exit: "e" } : { title: "kept", place: "kept", purpose: "p", exit: "e" };
  return { answer: JSON.stringify({ leaves_scene: false, frame, comes_in: change.comes_in ?? [], goes: change.goes ?? [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, clock, taste: null, in_play: [] }) };
}

const chronicle = (summary: string, moments: unknown[]): Script => ({ answer: JSON.stringify({ summary, moments, told: [] }) });

const told = "I tell her I'm going to Shimla for an interview I don't want.";

/** The Night Train played to a second Scene at Kalka, with Meera alone there and so in Focus. */
async function atKalka(writers: Script[]) {
  const nightTrain = parse(readFileSync(join(NIGHT_TRAIN, "story.yaml"), "utf8")) as StoryFile;
  const played = playable(nightTrain, {
    writer: [writer({}, "Day 1 22:45"), writer({ comes_in: ["Meera Kulkarni"] }, "Day 2 07:30", { title: "The small train", place: "Kalka station" }), ...writers],
    chronicler: [chronicle("Ishaan told Meera about the interview.", [{ what: "Ishaan tells Meera he doesn't want the interview.", quotes: [{ entry: "E2", text: told }], there: ["Meera"], weight: 3 }])]
  });
  await played.play(told);
  played.engine.endScene(played.storyId, played.head(), "t-end");
  await played.engine.chronicled(played.storyId);
  await played.play("At Kalka I carry her bag to the toy train.");
  expect(played.state().scene).toMatchObject({ here: ["Meera Kulkarni"], focus: "Meera Kulkarni" });
  return played;
}

const lastActorSystem = (models: ReturnType<typeof playable>["models"]) => models.actor.requests.at(-1)!.system;

describe("who is in a Scene", () => {
  // GIVEN Meera is in the Scene with Focus on her
  // WHEN the player's Move brings nobody in and sends nobody away
  // THEN Meera is still in the Scene for the Reply
  // AND the Reply's Actor is given Meera and what she remembers
  it("scenes › People stay in a Scene until they go › Meera stays on the toy train", async () => {
    const { play, state, models } = await atKalka([writer({}, "Day 2 07:40")]);
    await play("On the toy train I hold up the last biscuit from her packet.");
    expect(state().scene).toMatchObject({ here: ["Meera Kulkarni"], focus: "Meera Kulkarni" });
    const system = lastActorSystem(models);
    expect(system).toContain('<person name="Meera Kulkarni">');
    expect(system).toContain(`<move by="Ishaan Mehra">\n${told}\n</move>`);
  });

  // GIVEN Meera is in the Scene with Focus on her
  // WHEN the Move is "At Barog I watch her climb down to the jeep"
  // THEN Meera is out of the Scene for the Replies after, and Focus is off
  it("scenes › People stay in a Scene until they go › Meera gets off at Barog", async () => {
    const { play, state, models } = await atKalka([writer({ goes: ["Meera Kulkarni"] }, "Day 2 09:10"), writer({}, "Day 2 09:20")]);
    await play("At Barog I watch her climb down to the jeep");
    // She is in the Reply that has her go, and out of the Scene once it is written.
    expect(lastActorSystem(models)).toContain('<person name="Meera Kulkarni">');
    expect(state().scene).toMatchObject({ here: [], focus: null });
    await play("I watch the jeep until the cloud takes it.");
    expect(lastActorSystem(models)).not.toContain('<person name="Meera Kulkarni">');
  });
});
