import { describe, expect, it } from "vitest";
import { playable } from "../support/play.js";

describe("earlier Scenes", () => {
  it("carry the summary the Chronicler wrote, once it has written one", async () => {
    const { play, engine, storyId, head, view } = playable();
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end");
    await play("In the morning I go down to breakfast.");
    expect(view().earlier_scenes).toEqual([{ number: 1, title: "After curfew", summary: expect.any(String) }]);
    await engine.chronicled(storyId);
    expect(view().earlier_scenes).toEqual([{ number: 1, title: "After curfew", summary: "The Scene was played to its end." }]);
  });
});
