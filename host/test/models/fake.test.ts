import { describe, expect, it } from "vitest";
import { fakeReply } from "../../src/models/fake.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

describe("fantasia serve --fake-models", () => {
  it("plays turns end to end without a model, the Writer keeping every rule and the Reply quoting the Move", async () => {
    const { play, engine, storyId, head, view } = playable(hogwartsStoryFile(), {}, fakeReply);
    await play("I sit down by the fire.");
    expect(view().exchanges.at(-1)!.reply!.text).toBe("(A scripted Reply.) They hear you say: I sit down by the fire.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    // Every step of the Scene's end answered in its own format, so the Day View is ready.
    expect(view().day_view!.scene_end).toEqual({ step: null, failed: null, rethinking: null });
    await play("In the morning I go to breakfast.");
    expect(view().scene.number).toBe(2);
    engine.redo(storyId, head(), "shorter", true, "trace-redo");
    await engine.settled(storyId);
    expect(view().turn.kind).toBe("idle");
  });
});
