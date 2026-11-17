import { dropNote } from "../../src/store/beside.js";
import { describe, expect, it } from "vitest";
import { besideOf, learnLesson, lessonScope, tasteOf } from "../../src/store/beside.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile, nightTrainStoryFile, writeStoryFile } from "../support/story-files.js";

/** Everything a job was asked, its instructions and its message. */
const asked = (request: { system: string; prompt: string }) => `${request.system}\n${request.prompt}`;

describe("Taste", () => {
  // GIVEN Taste has the line "keep Ron in the background"
  // WHEN the player deletes it
  // THEN later Scenes no longer keep Ron in the background on that account
  it("long-run › Taste is short, readable and the player's › Deleting a lesson", async () => {
    const played = playable(hogwartsStoryFile());
    const { engine, storyId, head, mac, models } = played;
    await played.play("I sit down.");
    engine.redo(storyId, head(), "keep Ron in the background", true, "trace-redo");
    await engine.settled(storyId);
    expect(besideOf(mac, storyId).taste).toEqual([]);
    const note = besideOf(mac, storyId).notes.find(note => note.text === "keep Ron in the background")!;
    // Taste is the Story's, not a Path's: another Path has it too, and loses it with the rest.
    const main = mac.tree.currentPath(storyId)!;
    engine.tryAnotherWay(storyId, head(), head(), "trace-try");
    engine.openPath(storyId, main.id, "trace-main");

    expect(() => engine.removeTaste(storyId, "a lesson it never learned", "story", "trace")).toThrow(/not a line of Taste/);
    dropNote(mac, storyId, note.id);
    expect(besideOf(mac, storyId).taste).toEqual([]);
    await played.play("I ask Ron about the match.");
    const writer = models.requests.filter(request => request.agent === "actor").at(-1)!;
    expect(JSON.stringify(writer)).not.toContain("keep Ron in the background");
  });

  // GIVEN the player redid a Reply with the Direction "never write her as a first-timer", to be remembered
  // WHEN the player plays on along the Reply that was written again
  // THEN Taste has the lesson, and later Scenes keep to it
  it("long-run › Taste is short, readable and the player's › A lesson outlives its Redo", async () => {
    const played = playable(hogwartsStoryFile());
    const { engine, storyId, head, mac, models, path } = played;
    await played.play("I sit down beside Hermione.");
    engine.redo(storyId, head(), "never write her as a first-timer", true, "trace-redo");
    await engine.settled(storyId);
    // The Reply written with the lesson is redone again: the Redo and the Beat Note that carried the lesson leave the Path.
    engine.redo(storyId, head(), null, false, "trace-again");
    await engine.settled(storyId);
    expect(path().some(payload => payload.kind === "redo" && payload.direction !== null)).toBe(false);
    const lesson = "never write her as a first-timer";
    expect(besideOf(mac, storyId)).toMatchObject({ taste: [], playerTaste: [], notes: [expect.objectContaining({ text: lesson, active: true })] });

    // Played on, into the next Scene: its Writer and Actor read the lesson.
    await played.play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    await played.play("In the morning I go down to breakfast.");
    expect(played.state().scene!.number).toBe(2);
    expect(asked(models.writer.requests.at(-1)!)).toContain(lesson);
    expect(asked(models.actor.requests.at(-1)!)).toContain(lesson);
  });

  // GIVEN the player's own Taste says "don't decide what my character feels"
  // WHEN they start The Night Train to Kalka for the first time
  // THEN its Scenes keep to that line before anything is learned in it
  it("long-run › Taste is short, readable and the player's › The player's own Taste in a new Story", async () => {
    // Learned in another Story: a lesson about how the player reads goes to their own Taste, not that Story's.
    const hogwarts = playable(hogwartsStoryFile());
    const { engine, mac, head } = hogwarts;
    await hogwarts.play("I sit down.");
    engine.redo(hogwarts.storyId, head(), "don't decide what my character feels", true, "trace-redo");
    await engine.settled(hogwarts.storyId);
    const lesson = "Remember: don't decide what my character feels";
    expect(besideOf(mac, hogwarts.storyId)).toMatchObject({ taste: [], playerTaste: [] });
    expect(besideOf(mac, hogwarts.storyId).notes).toMatchObject([{ text: "don't decide what my character feels", active: true }]);

    const imported = importStoryFile(writeStoryFile(nightTrainStoryFile()), mac);
    if (!imported.ok) throw new Error(JSON.stringify(imported.problems));
    const train = imported.storyId;
    expect(besideOf(mac, train)).toMatchObject({ taste: [], playerTaste: [] });
    const writers = hogwarts.models.writer.requests.length;
    engine.move(train, "I follow Meera off the train.", mac.tree.currentPath(train)!.headEntryId, "trace-train");
    await engine.settled(train);
    expect(hogwarts.models.writer.requests.length).toBe(writers + 1);
    expect(asked(hogwarts.models.writer.requests.at(-1)!)).not.toContain(lesson);
    expect(asked(hogwarts.models.actor.requests.at(-1)!)).not.toContain(lesson);
  });

  it("files a lesson to the player's own Taste only when it is about how they read, and the Story's when in doubt", () => {
    const { state } = playable(hogwartsStoryFile());
    const scope = (lesson: string, flag: "story" | "player" | null = null) => lessonScope(state(), lesson, flag);
    expect(scope("don't decide what my character feels")).toBe("player");
    expect(scope("Shorter Replies when I am only walking somewhere.")).toBe("player");
    expect(scope("never write her as a first-timer")).toBe("story");
    expect(scope("keep Ron in the background")).toBe("story");
    expect(scope("Keep Gryffindor common room scenes short.")).toBe("story");
    expect(scope("Keep school procedure to a line.")).toBe("story");
    // The Writer's word counts, but never over a name in this World.
    expect(scope("Keep school procedure to a line.", "player")).toBe("player");
    expect(scope("Let Draconia keep her pride, and never decide what I feel.", "player")).toBe("story");
    expect(scope("don't decide what my character feels", "story")).toBe("story");
  });

  it("keeps each Taste to ten lessons, dropping the oldest, and a lesson only once", () => {
    const { mac, storyId } = playable(hogwartsStoryFile());
    for (let n = 1; n <= 11; n++) learnLesson(mac, storyId, "story", `lesson ${n}`);
    learnLesson(mac, storyId, "story", "lesson 11");
    learnLesson(mac, storyId, "player", "mine");
    expect(tasteOf(mac, storyId, "story")).toEqual(Array.from({ length: 11 }, (_, index) => `lesson ${index + 1}`));
    expect(tasteOf(mac, storyId, "player")).toEqual(["mine"]);
  });
});
