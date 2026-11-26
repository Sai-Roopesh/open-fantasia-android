import { afterEach, describe, expect, it } from "vitest";
import type { BackstageView, WorldView } from "../../src/protocol/generated/link.js";
import { runningMac } from "../support/link.js";
import { playable } from "../support/play.js";
import { served } from "./served.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

describe("the World screen over the link", () => {
  it("is GET /stories/{id}/world, and a Story the Mac does not have is not found", async () => {
    const running = await runningMac();
    closers.push(running.close);
    const response = await running.call(`/stories/${running.storyId}/world`);
    expect(response.status).toBe(200);
    const world = await response.json() as WorldView;
    expect(world.story_id).toBe(running.storyId);
    expect(world.places.map(place => place.name)).toContain("The Three Broomsticks");
    expect((await running.call("/stories/nowhere/world")).status).toBe(404);
  });
});

describe("The record over the link", () => {
  it("is on GET /stories/{id}/backstage: each Scene recorded with a part left out, and why", async () => {
    // The Chronicler quotes words that are not on the page, so that Moment is left out of the record.
    const recorded = { summary: "They said goodnight.", paragraph: "He said goodnight in the common room.", moments: [{ what: "Hermione promised to help.", quotes: [{ entry: "P2", text: "I promise I will help you." }], there: ["Hermione Granger"], weight: 3 }], told: [], known: [], bonds: [], engagements: [], changed: [] };
    const story = await served(playable(undefined, { chronicler: [{ answer: JSON.stringify(recorded) }] }));
    closers.push(story.close);
    const { call, storyId, engine, play, head } = story;
    const backstage = async () => await (await call(`/stories/${storyId}/backstage`)).json() as BackstageView;
    expect((await backstage()).record).toEqual([]);
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect((await backstage()).record).toEqual([{ scene_number: 1, scene_title: "After curfew", dropped: expect.arrayContaining(["moments[0]: none of its words are on the page"]) }]);
  });
});
