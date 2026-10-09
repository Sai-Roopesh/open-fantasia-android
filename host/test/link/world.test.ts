import { afterEach, describe, expect, it } from "vitest";
import type { BackstageView, WorldView } from "../../src/protocol/generated/link.js";
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

describe("The record over the link (lasting-records design decision 7)", () => {
  it("is on GET /stories/{id}/backstage, and POST /stories/{id}/record/retry tries a Scene given up once more", async () => {
    const running = await runningMac();
    closers.push(running.close);
    const { mac, storyId, call } = running;
    const head = mac.tree.currentPath(storyId)!.headEntryId;
    const scene = mac.tree.pathTo(head).find(entry => entry.payload.kind === "scene_opened")!;
    // The opening Scene's record was given up after three tries.
    mac.tree.append(storyId, head, { kind: "record_gap", scene: scene.id, attempts: 3, reason: "Sonnet is overloaded", endedScenes: 0, givenUp: true });
    const backstage = await (await call(`/stories/${storyId}/backstage`)).json() as BackstageView;
    expect(backstage.record).toEqual([{ scene_number: 1, scene_title: expect.any(String), state: "given_up", reason: "Sonnet is overloaded", dropped: [] }]);

    const bad = await call(`/stories/${storyId}/record/retry`, { method: "POST", body: JSON.stringify({ after: head }) });
    expect(bad.status).toBe(400);
    const stale = await call(`/stories/${storyId}/record/retry`, { method: "POST", body: JSON.stringify({ after: "an-old-head", scene_number: 1 }) });
    expect(stale.status).toBe(409);
    const retried = await call(`/stories/${storyId}/record/retry`, { method: "POST", body: JSON.stringify({ after: head, scene_number: 1 }) });
    expect(retried.status).toBe(200);
    expect(mac.tree.recordsOn(head, "record_gap").map(entry => entry.payload).at(-1)).toMatchObject({ attempts: 0, givenUp: false });
  });
});
