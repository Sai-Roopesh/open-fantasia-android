import { describe, expect, it } from "vitest";
import { fakeWriterAnswer } from "../../src/models/fake.js";
import type { Script } from "../../src/models/scripted.js";
import { playable } from "../support/play.js";
import { nightTrainStoryFile } from "../support/story-files.js";

/** The Writer's ordinary answer, with its Reply beginning [minutes] after now: the code makes the clock from it. */
const writerIn = (minutes: number): Script => ({ from: request => ({ answer: JSON.stringify({ ...JSON.parse((fakeWriterAnswer(request) as { answer: string }).answer) as object, minutes }) }) });

const GAP = "I ride on to Shimla, go to the interview at eleven, and come out not sure of anything.";

describe("the next Scene, while it is being written", () => {
  // GIVEN the Night Train's Day View at 9:05 am
  // WHEN the player chooses Skip to later, This evening, and writes "I ride on to Shimla, go to the interview at eleven, and come out not sure of anything."
  // THEN the Scene opens at once with that Move, under a card that says Friday 6:00 pm and that the Scene is being written
  // AND the card takes the Scene's title, place and Portraits when the Scene has opened
  it("presence › Between Scenes is quiet, and shows progress › The next Scene is being written", async () => {
    const { play, engine, storyId, head, view } = playable(nightTrainStoryFile(), { writer: [writerIn(0)] });
    await play("I get down after her to stretch my legs while the engine takes water.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    const day = view();
    expect(day.day_view!.at).toBe("Day 2 09:05");
    expect(day.opening).toBeNull();
    const evening = day.day_view!.choices.skips.find(skip => skip.label === "This evening")!;

    engine.choose(storyId, { after: head(), kind: "skip", at: evening.at, gap: GAP }, "trace-skip");
    const opening = view();
    expect(opening.day_view).toBeNull();
    expect(opening.opening).toEqual({ at: "Day 2 18:00", at_label: "Friday 6:00 pm" });
    expect(opening.exchanges).toEqual([{ move: { entry_id: head(), text: `${GAP} I let the time pass until this evening: Friday 6:00 pm.` }, reply: null }]);
    expect(opening.earlier_scenes.map(line => line.title)).toEqual(["Water at Barog"]);

    await engine.settled(storyId);
    const opened = view();
    expect(opened.opening).toBeNull();
    expect(opened.day_view).toBeNull();
    expect(opened.scene).toMatchObject({ number: 2, at: "Day 2 18:00" });
    expect(opened.exchanges[0]!.move!.text).toMatch(/^I ride on to Shimla/);
  });

  it("has no time on the card when the Move at the Day View set none", async () => {
    const { play, engine, storyId, head, view } = playable(nightTrainStoryFile());
    await play("I get down after her to stretch my legs while the engine takes water.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    engine.move(storyId, "I walk up the platform to find the tea seller.", head(), "trace-own");
    expect(view().opening).toEqual({ at: null, at_label: null });
    await engine.settled(storyId);
    expect(view().opening).toBeNull();
  });
  it("carries the next Scene on the Move's live event when the Move is written at the Day View, and on no other", async () => {
    const atTheDayView = async () => {
      const played = playable(nightTrainStoryFile());
      await played.play("I get down after her to stretch my legs while the engine takes water.");
      played.engine.endScene(played.storyId, played.head(), "trace-end");
      await played.engine.ended(played.storyId);
      return played;
    };
    const moveEvents = (played: Awaited<ReturnType<typeof atTheDayView>>) => played.events.filter(item => item.event.kind === "move").map(item => item.event.opening);

    const skipping = await atTheDayView();
    const evening = skipping.view().day_view!.choices.skips.find(skip => skip.label === "This evening")!;
    skipping.engine.choose(skipping.storyId, { after: skipping.head(), kind: "skip", at: evening.at, gap: null }, "trace-skip");
    expect(moveEvents(skipping)).toEqual([undefined, { at: "Day 2 18:00", at_label: "Friday 6:00 pm" }]);

    const following = await atTheDayView();
    following.engine.choose(following.storyId, { after: following.head(), kind: "follow", who: "Meera Kulkarni", gap: null }, "trace-follow");
    expect(moveEvents(following)).toEqual([undefined, { at: null, at_label: null }]);

    const own = await atTheDayView();
    own.engine.move(own.storyId, "I walk up the platform to find the tea seller.", own.head(), "trace-own");
    expect(moveEvents(own)).toEqual([undefined, { at: null, at_label: null }]);
    await Promise.all([skipping, following, own].map(played => played.engine.settled(played.storyId)));
  });
  it("keeps the next Scene's card when the turn fails before the Scene opens, and Retry opens it", async () => {
    // The World moves on quietly after the Scene at Barog; over the Gap to the evening, the Weaver and its second model fail.
    const quiet = { answer: JSON.stringify({ lives: [], threads: [], happened: [], meanwhile: [], on: [] }) };
    const { play, engine, storyId, head, view } = playable(nightTrainStoryFile(), { writer: [writerIn(65)], weaver: [quiet, { fail: "Sonnet is overloaded" }, { fail: "Sonnet is overloaded" }] });
    await play("I get down after her to stretch my legs while the engine takes water.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    const evening = view().day_view!.choices.skips.find(skip => skip.label === "This evening")!;
    engine.choose(storyId, { after: head(), kind: "skip", at: evening.at, gap: GAP }, "trace-skip");
    await engine.settled(storyId);
    const failed = view();
    expect(failed.turn).toMatchObject({ kind: "failed", reason: expect.stringMatching(/Sonnet is overloaded/) });
    expect(failed.day_view).toBeNull();
    expect(failed.opening).toEqual({ at: "Day 2 18:00", at_label: "Friday 6:00 pm" });
    expect(failed.exchanges.map(exchange => exchange.move?.text)).toEqual([expect.stringMatching(/^I ride on to Shimla/)]);

    engine.retry(storyId, "trace-retry");
    await engine.settled(storyId);
    expect(view().opening).toBeNull();
    expect(view().scene).toMatchObject({ number: 2, at: "Day 2 18:00" });
  });
});
