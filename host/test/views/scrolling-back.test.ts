import { describe, expect, it } from "vitest";
import { pastScene } from "../../src/views/scene.js";
import { playable } from "../support/play.js";

describe("earlier Scenes", () => {
  it("carry the summary the Chronicler wrote, once it has written one", async () => {
    const { play, engine, storyId, head, view, mac } = playable();
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end");
    // The Scene's end has only begun: nothing is recorded yet.
    expect(pastScene(mac, storyId, 1, "t").summary).toBe("");
    await engine.ended(storyId);
    expect(pastScene(mac, storyId, 1, "t").summary).toBe("The Scene was played to its end.");
    await play("In the morning I go down to breakfast.");
    expect(view().earlier_scenes).toEqual([{ number: 1, title: "After curfew", summary: "The Scene was played to its end." }]);
  });
});
