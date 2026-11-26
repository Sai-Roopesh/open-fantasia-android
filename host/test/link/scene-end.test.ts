import { afterEach, describe, expect, it } from "vitest";
import { jobModels } from "../../src/models/jobs.js";
import { callsFor } from "../support/host.js";
import { openStream } from "../support/link.js";
import { playable } from "../support/play.js";
import { served } from "./served.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

describe("a Scene's end over the link", () => {
  it("stops at the step both models failed, says so on the stream and the Day View, and the one Retry goes on from there", async () => {
    // The Director's model and its second model are both overloaded.
    const story = await served(playable(undefined, { director: [{ fail: "Opus is overloaded" }, { fail: "Sonnet is overloaded" }] }));
    closers.push(story.close);
    const { base, headers, storyId, engine, models, scene, post, path } = story;
    const stream = openStream(base, storyId, headers, (await scene()).last_event_id);
    closers.push(stream.close);
    await post("moves", { text: "I say goodnight.", after: (await scene()).head_entry_id });
    await engine.settled(storyId);
    expect((await post("end-scene", { after: (await scene()).head_entry_id })).status).toBe(200);
    await engine.ended(storyId);

    const stopped = (await scene()).day_view!;
    expect(stopped.scene_end).toEqual({ step: null, failed: { step: "director", reason: expect.stringMatching(/Opus is overloaded.*Sonnet is overloaded/), trace_id: expect.any(String) }, rethinking: null });
    expect(stopped.happenings).toEqual([]);
    // The Outline was written; the World does not move on without the plan.
    expect(path().map(entry => entry.kind).slice(-3)).toEqual(["scene_closed", "chronicle", "outline_set"]);
    await stream.until(events => events.some(event => event.event.kind === "scene_end_failed"));
    expect(stream.received.find(event => event.event.kind === "scene_end_failed")!.event).toMatchObject({ step: "director", trace_id: stopped.scene_end.failed!.trace_id });

    // Retry, on another model for this one try: the end goes on from the Director, and the Chronicler is not asked again.
    const retried = await post("retry", { model: { provider: "codex", model: "gpt-6.1-sol", effort: null } });
    expect(retried.status).toBe(200);
    await engine.ended(storyId);
    expect(path().map(entry => entry.kind).slice(-5)).toEqual(["scene_closed", "chronicle", "outline_set", "director_plan", "world_moved"]);
    expect(models.chronicler.requests).toHaveLength(1);
    expect(models.outline.requests).toHaveLength(1);
    expect(callsFor(story.mac.db, "director").at(-1)).toMatchObject({ provider: "codex", model: "gpt-6.1-sol" });
    expect(jobModels(story.mac.home).director).toEqual({ provider: "claude", model: "claude-fable-5-1", effort: "high" });
    const ready = (await scene()).day_view!;
    expect(ready.scene_end).toEqual({ step: null, failed: null, rethinking: null });
    expect(ready.happenings.length).toBeGreaterThan(0);
    await stream.until(events => events.some(event => event.event.kind === "scene_end_step" && event.event.step === null));
    const steps = stream.received.filter(event => event.event.kind === "scene_end_step").map(event => event.event.step);
    expect(steps).toEqual(["chronicler", "director", "director", "weaver", null]);
    // Nothing is left to retry.
    expect((await post("retry", {})).status).toBe(400);
  });

  it("refuses a Move at the Day View while the Scene's end is stopped, until it is retried", async () => {
    const story = await served(playable(undefined, { weaver: [{ fail: "Sonnet is overloaded" }, { fail: "GPT 6.1 Sol is overloaded" }] }));
    closers.push(story.close);
    const { storyId, engine, scene, post } = story;
    await post("moves", { text: "I say goodnight.", after: (await scene()).head_entry_id });
    await engine.settled(storyId);
    await post("end-scene", { after: (await scene()).head_entry_id });
    await engine.ended(storyId);
    const day = await scene();
    expect(day.day_view!.scene_end.failed).toMatchObject({ step: "weaver" });
    const refused = await post<{ error: { code: string } }>("moves", { text: "In the morning I go to breakfast.", after: day.head_entry_id });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("busy");
  });
});
