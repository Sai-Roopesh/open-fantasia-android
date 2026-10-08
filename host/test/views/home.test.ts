import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listStories } from "../../src/views/stories.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

const HOUR = 3600_000;

describe("Home's time for each Story", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] }); });
  afterEach(() => { vi.useRealTimers(); });

  // Home says how long ago each Story was last played (Main.dc.html: "2 h ago"): editing the Story, or going back to
  // another Path, is not playing it.
  it("is when the Story was last played, not when it was last edited or a Path was opened", async () => {
    const played = playable(hogwartsStoryFile({ who: ["Hermione Granger"] }));
    await played.play("I sit at the other end of the sofa.");
    const lastPlayed = played.mac.tree.entry(played.head())!.createdAt;
    const main = played.mac.tree.currentPath(played.storyId)!;
    await vi.advanceTimersByTimeAsync(2 * HOUR);
    played.engine.setStyle(played.storyId, "Dry and British.", played.head(), "trace-style");
    played.engine.setLead(played.storyId, "Hermione Granger", false, played.head(), "trace-lead");
    expect(listStories(played.mac)[0]!.updated_at).toBe(lastPlayed);
    played.engine.tryAnotherWay(played.storyId, null, played.head(), "trace-try");
    await vi.advanceTimersByTimeAsync(HOUR);
    played.engine.openPath(played.storyId, main.id, "trace-main");
    expect(listStories(played.mac)[0]!.updated_at).toBe(lastPlayed);
  });
});
