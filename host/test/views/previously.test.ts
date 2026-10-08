import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sceneView } from "../../src/views/scene.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

const HOUR = 3600_000;

/** A Story mid-Scene with Hermione, played and then left: the player stepped away, so the Mac recorded where it stands. */
async function leftMidScene() {
  const played = playable(hogwartsStoryFile({ who: ["Hermione Granger"] }));
  await played.play("I sit at the other end of the sofa.");
  await played.play("I ask what she is reading.");
  const lastPlayed = played.mac.tree.entry(played.head())!.createdAt;
  await vi.advanceTimersByTimeAsync(2 * HOUR);
  await played.engine.chronicled(played.storyId);
  return { ...played, lastPlayed };
}

/** The Scene view the phone gets on opening the Story [hours] after it was last played. */
const openedAfter = (played: ReturnType<typeof playable>, lastPlayed: string, hours: number) =>
  sceneView(played.mac, played.engine, played.storyId, "trace-open", new Date(Date.parse(lastPlayed) + hours * HOUR));

describe("the Previously card", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] }); });
  afterEach(() => { vi.useRealTimers(); });

  // GIVEN the player stopped mid-Scene with Hermione and returns 30 hours later
  // WHEN they open the Story
  // THEN they are in that Scene at its latest Reply, with a "Previously" card above it
  it("stories › Opening a Story returns exactly where the player left › Back after a night away", async () => {
    const played = await leftMidScene();
    const view = openedAfter(played, played.lastPlayed, 30);
    expect(view.day_view).toBeNull();
    expect(view.head_entry_id).toBe(played.head());
    expect(view.exchanges.at(-1)?.move?.text).toBe("I ask what she is reading.");
    expect(view.previously).toEqual({ summary: "The Scene so far.", since: played.lastPlayed });
  });

  // GIVEN the player stopped mid-Scene with Hermione and returns three hours later
  // WHEN they open the Story
  // THEN they are in that Scene at its latest Reply, with no "Previously" card
  it("stories › Opening a Story returns exactly where the player left › Back the same evening", async () => {
    const played = await leftMidScene();
    const view = openedAfter(played, played.lastPlayed, 3);
    expect(view.exchanges.at(-1)?.move?.text).toBe("I ask what she is reading.");
    expect(view.previously).toBeNull();
  });

  // GIVEN the player ended "After curfew", stopped at the Day View, and returns two days later
  // WHEN they open the Story
  // THEN the Day View has a "Previously" card saying what happened in "After curfew"
  it("stories › Opening a Story returns exactly where the player left › Back to a Day View", async () => {
    const played = playable(hogwartsStoryFile({ title: "After curfew", who: ["Hermione Granger"] }));
    await played.play("I say goodnight to Hermione.");
    played.engine.endScene(played.storyId, played.head(), "trace-end");
    await played.engine.chronicled(played.storyId);
    const lastPlayed = played.mac.tree.entry(played.head())!.createdAt;
    const view = openedAfter(played, lastPlayed, 48);
    expect(view.day_view).not.toBeNull();
    expect(view.scene.title).toBe("After curfew");
    expect(view.previously).toEqual({ summary: "The Scene was played to its end.", since: lastPlayed });
  });

  // The card says how long ago they last played: editing the Story is not playing it.
  it("counts from when the player last played, not from an edit made since", async () => {
    const played = await leftMidScene();
    played.engine.setKnown(played.storyId, "Hermione Granger", "Reads in the common room until late.", played.head(), "trace-known");
    played.engine.setLead(played.storyId, "Hermione Granger", false, played.head(), "trace-lead");
    const view = openedAfter(played, played.lastPlayed, 30);
    expect(view.previously).toEqual({ summary: "The Scene so far.", since: played.lastPlayed });
  });

  it("counts from when the player last played, not from an edit to the rest of the Story made since", async () => {
    const played = await leftMidScene();
    played.engine.setStyle(played.storyId, "Dry and British.", played.head(), "trace-style");
    played.engine.setClock(played.storyId, "Day 4 09:00", undefined, played.head(), "trace-clock");
    played.engine.setLandmark(played.storyId, { name: "The Yule Ball", at: "Day 100 19:00", what: "A dance." }, true, played.head(), "trace-landmark");
    const view = openedAfter(played, played.lastPlayed, 30);
    expect(view.previously).toEqual({ summary: "The Scene so far.", since: played.lastPlayed });
  });

  it("has no card when the Scene has no summary yet, however long the player was away", async () => {
    const played = playable(hogwartsStoryFile({ who: ["Hermione Granger"] }));
    await played.play("I sit at the other end of the sofa.");
    const lastPlayed = played.mac.tree.entry(played.head())!.createdAt;
    expect(openedAfter(played, lastPlayed, 30).previously).toBeNull();
  });

  it("is the latest summary of the Scene the player is in, never an earlier Scene's", async () => {
    const played = playable(hogwartsStoryFile({ title: "After curfew", who: ["Hermione Granger"] }));
    await played.play("I say goodnight to Hermione.");
    played.engine.endScene(played.storyId, played.head(), "trace-end");
    await played.engine.chronicled(played.storyId);
    // The next Scene opens and is played, but nothing of it is recorded yet: the card stays away.
    await played.play("In the morning I go down to breakfast.");
    const lastPlayed = played.mac.tree.entry(played.head())!.createdAt;
    expect(openedAfter(played, lastPlayed, 30).previously).toBeNull();
  });
});
