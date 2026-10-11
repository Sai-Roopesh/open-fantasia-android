import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import type { Script } from "../../src/models/scripted.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import type { Chronicle, Payload } from "../../src/story/entries.js";
import { NIGHT_TRAIN } from "../support/stories.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];

/**
 * A Writer's answer naming who comes in and who goes, the Reply [minutes] on; [opens] frames a new Scene from the Day
 * View. The first answer in a Story frames its opening, which is kept as it is.
 */
function writer(change: { comes_in?: string[]; goes?: string[] }, minutes: number, opens?: { title: string; place: string }): Script {
  const frame = opens ? { ...opens, purpose: "p", exit: "e" } : { title: "kept", place: "kept", purpose: "p", exit: "e" };
  return { answer: JSON.stringify({ leaves_scene: false, frame, comes_in: change.comes_in ?? [], goes: change.goes ?? [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, minutes, taste: null, in_play: [], moves_to: null }) };
}

/** A Chronicler's record: a line, a paragraph, and the Moments given. */
const chronicle = (summary: string, moments: unknown[]): Script => ({ answer: JSON.stringify({ summary, paragraph: summary, moments, told: [], known: [], bonds: [], engagements: [], changed: [] }) });

const told = "I tell her I'm going to Shimla for an interview I don't want.";

/** The Night Train played to a second Scene at Kalka, with Meera alone there and so in Focus. */
async function atKalka(writers: Script[]) {
  const nightTrain = parse(readFileSync(join(NIGHT_TRAIN, "story.yaml"), "utf8")) as StoryFile;
  const played = playable(nightTrain, {
    writer: [writer({}, 5), writer({ comes_in: ["Meera Kulkarni"] }, 0, { title: "The small train", place: "Kalka station" }), ...writers],
    chronicler: [chronicle("Ishaan told Meera about the interview.", [{ what: "Ishaan tells Meera he doesn't want the interview.", quotes: [{ entry: "P2", text: told }], there: ["Meera Kulkarni"], weight: 3 }])]
  });
  await played.play(told);
  played.engine.endScene(played.storyId, played.head(), "t-end");
  await played.engine.ended(played.storyId);
  await played.play("At Kalka I carry her bag to the toy train.");
  expect(played.state().scene).toMatchObject({ number: 2, at: "Day 2 07:30" });
  expect(played.state().scene).toMatchObject({ here: ["Meera Kulkarni"], focus: "Meera Kulkarni" });
  return played;
}

const lastActorSystem = (models: ReturnType<typeof playable>["models"]) => models.actor.requests.at(-1)!.system;

/** The Chronicles on the Path, oldest first. */
const chronicles = (path: Payload[]) => path.filter((payload): payload is Chronicle => payload.kind === "chronicle");

describe("who is in a Scene", () => {
  // GIVEN Meera is in the Scene with Focus on her
  // WHEN the player's Move brings nobody in and sends nobody away
  // THEN Meera is still in the Scene for the Reply
  // AND the Reply's Actor is given Meera and what she remembers
  it("scenes › People stay in a Scene until they go › Meera stays on the toy train", async () => {
    const { play, state, models } = await atKalka([writer({}, 10)]);
    await play("On the toy train I hold up the last biscuit from her packet.");
    expect(state().scene).toMatchObject({ here: ["Meera Kulkarni"], focus: "Meera Kulkarni" });
    expect(lastActorSystem(models)).toContain('<person name="Meera Kulkarni">');
    // What she remembers of him, in his own words.
    const remembered = models.actor.requests.at(-1)!.prompt;
    expect(remembered).toContain("<remembered>\n(Scene 1; known to Ishaan Mehra, Meera Kulkarni) Ishaan tells Meera he doesn't want the interview.");
    expect(remembered).toContain(`  "${told}"`);
  });

  // GIVEN Meera is in the Scene with Focus on her
  // WHEN the Move is "At Barog I watch her climb down to the jeep"
  // THEN Meera is out of the Scene for the Replies after, and Focus is off
  it("scenes › People stay in a Scene until they go › Meera gets off at Barog", async () => {
    const { play, state, models } = await atKalka([writer({ goes: ["Meera Kulkarni"] }, 100), writer({}, 10)]);
    await play("At Barog I watch her climb down to the jeep");
    // She is in the Reply that has her go, and out of the Scene once it is written.
    expect(lastActorSystem(models)).toContain('<person name="Meera Kulkarni">');
    expect(state().scene).toMatchObject({ here: [], focus: null });
    await play("I watch the jeep until the cloud takes it.");
    expect(lastActorSystem(models)).not.toContain('<person name="Meera Kulkarni">');
  });
});

/** Draconia walking back up the lane, with only Pansy named in the Scene, and Lucius in the Story but far away. */
function theLane(scripts: { writer: Script[]; actor: Script[]; chronicler?: Script[] }) {
  const story = hogwartsWorldStoryFile({ title: "The lane", place: "The lane up from Hogsmeade", at: "Day 3 17:00", who: ["Draconia Malfoy", "Pansy Parkinson"], prose: "Draconia turns back up the lane without waiting for anyone." });
  story.people = [...story.people,
    { name: "Pansy Parkinson", who_they_are: "Draconia's friend, Slytherin, quick to laugh at anyone else." },
    { name: "Lucius Malfoy", who_they_are: "Draconia's father, on the Hogwarts board of governors." }] as StoryFile["people"];
  return playable(story, scripts);
}

const SHADOWED = "Draconia walks fast, Pansy at her elbow. Crabbe and Goyle keep a step behind her the whole way, cracking their knuckles.";
const shadowedMoment = (there: string[]) => ({ answer: JSON.stringify({
  summary: "Draconia walked back up the lane with her friends.",
  moments: [{ what: "Crabbe and Goyle shadow Draconia up the lane.", quotes: [{ entry: "P3", text: "Crabbe and Goyle keep a step behind her the whole way" }], there, weight: 2 }],
  paragraph: "Draconia walked back up the lane, Pansy at her elbow and Crabbe and Goyle a step behind.",
  told: [], known: [], bonds: [], engagements: [], changed: []
}) });

describe("presence follows the page (lasting-records design decision 5)", () => {
  // GIVEN Draconia walks back up the lane with only Pansy named in the Scene
  // WHEN the Reply has Crabbe and Goyle a step behind her the whole way
  // THEN Crabbe and Goyle are in the Scene from that Reply on, and what happened on the lane is remembered by them too
  it("scenes › People stay in a Scene until they go › Crabbe and Goyle at her heels", async () => {
    const shadows = ["Draconia Malfoy", "Vincent Crabbe", "Gregory Goyle"];
    const { play, engine, storyId, head, path, models, state } = theLane({
      writer: [writer({}, 5), writer({ comes_in: ["Vincent Crabbe", "Gregory Goyle"] }, 5)],
      actor: [{ answer: SHADOWED }],
      chronicler: [shadowedMoment(shadows)]
    });
    await play("I follow Draconia back up the lane.");
    await play("I keep pace beside her.");
    // The Writer is told who the last Reply showed, and puts them in the Scene.
    expect(models.writer.requests[1]!.prompt).toContain("<shown_not_here>\nVincent Crabbe, Gregory Goyle\n</shown_not_here>");
    expect(models.writer.requests[0]!.prompt).not.toContain("<shown_not_here>");
    expect(state().scene?.here).toEqual(expect.arrayContaining(["Vincent Crabbe", "Gregory Goyle"]));
    engine.endScene(storyId, head(), "t-end");
    await engine.ended(storyId);
    const [record] = chronicles(path());
    expect(record!.moments[0]!.there).toEqual(shadows);
    expect(record!.dropped).toEqual([]);
    // Remembered by them too: the Moment is known to everyone who was there.
    expect(state().facts.find(fact => fact.source === "page")!.knownTo).toEqual(expect.arrayContaining(["Vincent Crabbe", "Gregory Goyle"]));
  });

  it("lets the Chronicler remember someone the page shows, though the Writer never named them", async () => {
    const shadows = ["Draconia Malfoy", "Vincent Crabbe", "Gregory Goyle"];
    const { play, engine, storyId, head, path } = theLane({ writer: [writer({}, 5)], actor: [{ answer: SHADOWED }], chronicler: [shadowedMoment(shadows)] });
    await play("I follow Draconia back up the lane.");
    engine.endScene(storyId, head(), "t-end");
    await engine.ended(storyId);
    const [record] = chronicles(path());
    expect(record!.moments[0]!.there).toEqual(shadows);
    expect(record!.dropped).toEqual([]);
  });

  // WHEN Draconia says "Father will hear of this" in a Reply
  // THEN Lucius Malfoy is not in the Scene
  it("scenes › People stay in a Scene until they go › A name mentioned is not a person present", async () => {
    const { play, models, state } = theLane({
      writer: [writer({}, 5), writer({}, 5)],
      actor: [{ answer: "\"Father will hear of this,\" Draconia says, not looking back. \"Lucius Malfoy does not forgive.\"" }]
    });
    await play("I tell her she can hate me later.");
    await play("I keep pace beside her.");
    // Named, so offered; the Writer, reading that she only mentions him, leaves him out.
    expect(models.writer.requests[1]!.prompt).toContain("<shown_not_here>\nLucius Malfoy\n</shown_not_here>");
    expect(state().scene?.here).not.toContain("Lucius Malfoy");
  });
});
