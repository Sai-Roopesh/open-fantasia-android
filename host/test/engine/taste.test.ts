import { describe, expect, it } from "vitest";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

describe("Taste", () => {
  // GIVEN Taste has the line "keep Ron in the background"
  // WHEN the player deletes it
  // THEN later Scenes no longer keep Ron in the background on that account
  it("long-run › Taste is short, readable and the player's › Deleting a lesson", async () => {
    const played = playable(hogwartsStoryFile());
    const { engine, storyId, head, state, mac, models } = played;
    await played.play("I sit down.");
    engine.redo(storyId, head(), "keep Ron in the background", true, "trace-redo");
    await engine.settled(storyId);
    const lesson = "Remember: keep Ron in the background";
    expect(state().taste).toEqual([lesson]);
    const main = mac.tree.currentPath(storyId)!;
    engine.tryAnotherWay(storyId, head(), head(), "trace-try");
    const other = mac.tree.currentPath(storyId)!;
    engine.openPath(storyId, main.id, "trace-main");

    expect(() => engine.removeTaste(storyId, "a lesson it never learned", head(), "trace")).toThrow(/not a line of Taste/);
    engine.removeTaste(storyId, lesson, head(), "trace-remove");
    expect(state().taste).toEqual([]);
    await played.play("I ask Ron about the match.");
    const writer = models.requests.filter(request => request.agent === "writer").at(-1)!;
    expect(JSON.stringify(writer)).not.toContain("keep Ron in the background");
    expect(mac.states.at(mac.tree.path(other.id)!.headEntryId).taste).toEqual([lesson]);

    engine.move(storyId, "I wave.", head(), "trace-wave");
    expect(() => engine.removeTaste(storyId, lesson, head(), "trace")).toThrow(/still being written/);
    await engine.settled(storyId);
  });
});
