import { afterEach, describe, expect, it } from "vitest";
import type { BackstageView } from "../../src/protocol/generated/link.js";
import { playable } from "../support/play.js";
import { served } from "./served.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

describe("Backstage over the link", () => {
  // GIVEN ten Scenes have been played
  // WHEN the player opens Backstage
  // THEN How it's going shows how long their Scene ends took, how often a job needed its second model, how often the
  //   Editor set a Reply right, the pace of the ten Scenes, how often the Story's pick was taken, and the reactions given
  it("outside-the-scene › Backstage shows everything else, only when visited › How it's going", async () => {
    // The Weaver's own model is overloaded the first time it is asked, and its second model steps in. The Editor finds
    // the first Reply clean, sets a slip in the second right in place, and sends the third back to be written again.
    const clean = { answer: JSON.stringify({ fixes: [], breaks: [] }) };
    const fixed = { answer: JSON.stringify({ fixes: [{ wrong: "waits", right: "waits for you", why: "She is waiting for him." }], breaks: [] }) };
    const broken = { answer: JSON.stringify({ fixes: [], breaks: [{ kind: "decides_for_player", who: null, words: "She looks at you", why: "Only the player says what he does." }] }) };
    const scripts = { weaver: [{ fail: "Opus is overloaded" }], editor: [clean, fixed, broken, clean] } as Parameters<typeof playable>[1];
    const story = await served(playable(undefined, scripts));
    closers.push(story.close);
    const { call, storyId, engine, scene, post } = story;
    let picks = 0;
    for (let number = 1; number <= 10; number++) {
      const now = await scene();
      // At the Day View, the Story's own pick every other time, and the player's own Move otherwise.
      const pick = now.day_view?.happenings.find(happening => happening.pick);
      const opened = number > 1 && number % 2 === 0 && pick
        ? (picks++, await post("choose", { after: now.head_entry_id, kind: "story", gap: null }))
        : await post("moves", { text: number === 1 ? "I say goodnight." : "In the morning I go down to breakfast.", after: now.head_entry_id });
      expect(opened.status, `Scene ${number}`).toBe(200);
      await engine.settled(storyId);
      expect((await post("end-scene", { after: (await scene()).head_entry_id })).status, `Scene ${number}`).toBe(200);
      await engine.ended(storyId);
      expect((await scene()).day_view!.scene_end, `Scene ${number}`).toEqual({ step: null, failed: null, rethinking: null });
    }
    const react = async (scene_number: number, reaction: "more" | "less") =>
      expect((await post("reaction", { scene_number, reaction })).status).toBe(200);
    await react(2, "more");
    await react(3, "less");
    await react(5, "less");

    const how = (await (await call(`/stories/${storyId}/backstage`)).json() as BackstageView).how_its_going;
    expect(how.scene_end_seconds).toHaveLength(10);
    expect(how.scene_end_seconds.every(seconds => seconds >= 0)).toBe(true);
    const job = (name: string) => how.jobs.find(item => item.job === name)!;
    expect(how.jobs.map(item => item.job)).toEqual(["actor", "writer", "editor", "chronicler", "weaver", "director", "folder"]);
    expect(job("weaver")).toMatchObject({ second_model: 1, failed: 0 });
    expect(job("chronicler")).toEqual({ job: "chronicler", calls: 10, second_model: 0, failed: 0 });
    expect(job("writer")).toMatchObject({ calls: 10, second_model: 0, failed: 0 });
    expect(how.pace.map(row => row.scene_number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(how.pace.every(row => row.intensity === 2)).toBe(true);
    expect(picks).toBe(5);
    expect(how.picks_taken).toBe(picks);
    expect(how.picks_offered).toBe(10);
    expect({ more: how.more, less: how.less }).toEqual({ more: 1, less: 2 });
    // How long each Reply took, from the Writer's call to the Reply written, and what the Editor did with them.
    expect(how.reply_seconds).toHaveLength(10);
    expect(how.reply_seconds.every(seconds => seconds >= 0)).toBe(true);
    // The Editor read every Reply, under each Reply's trace, and checks an Act's account too when an Act ends.
    const accounts = story.path().filter(payload => payload.kind === "story_folded" && payload.into === "act").length;
    expect(job("editor")).toMatchObject({ calls: 10 + accounts, second_model: 0, failed: 0 });
    expect({ fixed: how.editor_fixed, rewrote: how.editor_rewrote }).toEqual({ fixed: 1, rewrote: 1 });
  }, 60_000);
});
