import { afterEach, describe, expect, it } from "vitest";
import type { WorldView } from "../../src/protocol/generated/link.js";
import { runningMac } from "../support/link.js";

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
