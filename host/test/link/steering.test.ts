import { afterEach, describe, expect, it } from "vitest";
import { fakeWriterAnswer } from "../../src/models/fake.js";
import type { Script } from "../../src/models/scripted.js";
import type { BackstageView } from "../../src/protocol/generated/link.js";
import { playable } from "../support/play.js";
import { served } from "./served.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

type Refusal = { error: { code: string; message: string } };

/** The Writer's answer, with the Scene rated at the top of the scale: it peaked. */
const peaked: Script = { from: request => {
  const answer = fakeWriterAnswer(request) as { answer: string };
  return { answer: JSON.stringify({ ...JSON.parse(answer.answer) as object, intensity: 5 }) };
} };

describe("the player steers over the link", () => {
  // WHEN the player writes in the brief "more danger, more mysteries that aren't in the books"
  // THEN the next Stretch brings a danger or a mystery of the Story's own
  it("long-run › The player steers with a brief and reactions › A brief from the phone", async () => {
    const story = await served(playable());
    closers.push(story.close);
    const { call, storyId, engine, models, scene, post, path } = story;
    const wish = "more danger, more mysteries that aren't in the books";
    const set = await post<{ head_entry_id: string }>("brief", { after: (await scene()).head_entry_id, more: [` ${wish} `, ""], less: [] });
    expect(set.status).toBe(200);
    // It is kept on the Path, and the Scene shows it.
    expect(path().at(-1)).toEqual({ kind: "brief_set", more: [wish], less: [] });
    expect((await scene()).brief).toEqual({ more: [wish], less: [] });

    await post("moves", { text: "I say goodnight.", after: (await scene()).head_entry_id });
    await engine.settled(storyId);
    await post("end-scene", { after: (await scene()).head_entry_id });
    await engine.ended(storyId);
    // The Director plans the next Stretch from the brief, and the Stretch brings a mystery of the Story's own.
    const asked = models.director.requests.at(-1)!;
    expect(`${asked.system}\n${asked.prompt}`).toContain(`More of:\n- ${wish}`);
    const backstage = await (await call(`/stories/${storyId}/backstage`)).json() as BackstageView;
    expect(backstage.new_things).toEqual([{ kind: "mystery", what: "A locked door nobody admits to.", stretch: "This Stretch" }]);
  });

  it("refuses a brief that does not match the contract, or written on a Story that has moved on", async () => {
    const story = await served(playable());
    closers.push(story.close);
    const { scene, post } = story;
    expect((await post("brief", { after: (await scene()).head_entry_id, more: "danger" })).status).toBe(400);
    const stale = await post<Refusal>("brief", { after: "an-old-head", more: [], less: ["the library"] });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("stale_head");
  });

  it("takes a reaction to a played Scene, shows it on the Day View and in How it's going, and the next plan is made knowing it", async () => {
    // The second Scene peaks, so the Director plans again at its end.
    const story = await served(playable(undefined, { writer: [{ from: fakeWriterAnswer }, peaked] }));
    closers.push(story.close);
    const { call, storyId, engine, models, scene, post } = story;
    const backstage = async () => await (await call(`/stories/${storyId}/backstage`)).json() as BackstageView;
    await post("moves", { text: "I say goodnight.", after: (await scene()).head_entry_id });
    await engine.settled(storyId);
    await post("end-scene", { after: (await scene()).head_entry_id });
    await engine.ended(storyId);

    const unplayed = await post<Refusal>("reaction", { after: (await scene()).head_entry_id, scene_number: 9, reaction: "more" });
    expect(unplayed.status).toBe(400);
    expect(unplayed.body.error.message).toBe("Scene 9 has not been played on this Path.");
    expect((await post("reaction", { after: (await scene()).head_entry_id, scene_number: 1, reaction: "less", note: "too quiet" })).status).toBe(200);
    expect((await scene()).day_view!.reaction).toBe("less");
    expect((await backstage()).how_its_going).toMatchObject({ more: 0, less: 1 });
    // Taken back, then given again.
    await post("reaction", { after: (await scene()).head_entry_id, scene_number: 1, reaction: null });
    expect((await scene()).day_view!.reaction).toBeNull();
    expect((await backstage()).how_its_going).toMatchObject({ more: 0, less: 0 });
    await post("reaction", { after: (await scene()).head_entry_id, scene_number: 1, reaction: "less", note: "too quiet" });

    await post("moves", { text: "In the morning I go down to breakfast.", after: (await scene()).head_entry_id });
    await engine.settled(storyId);
    await post("end-scene", { after: (await scene()).head_entry_id });
    await engine.ended(storyId);
    expect(models.director.requests).toHaveLength(2);
    expect(models.director.requests[1]!.prompt).toContain("- Scene 1, After curfew: less like this (too quiet)");
  });
});
