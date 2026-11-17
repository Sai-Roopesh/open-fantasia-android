import { describe, expect, it } from "vitest";
import type { Script } from "../../src/models/scripted.js";
import { playable } from "../support/play.js";

const frame = { title: "Another morning", place: "The lake shore", purpose: "Hermione wants company.", exit: "She finishes her tea." };
const writer = (changes: Record<string, unknown> = {}): Script => ({ answer: JSON.stringify({
  leaves_scene: false, frame, comes_in: [], goes: [],
  beats: [{ text: "Hermione drinks her tea.", status: "in_play" }],
  note: "Hermione takes another sip.", call: "continue", intensity: 1, arc_moved: false,
  minutes: 1, taste: null, in_play: [], moves_to: null, ...changes
}) });

describe("only End Scene closes a scene", () => {
  it("keeps an open scene through a model-requested transition and time skip without Linger", async () => {
    const story = playable(undefined, { writer: [writer(), writer({ leaves_scene: true, minutes: 600, call: "land" })] });
    await story.play("I sit beside Hermione.");
    await story.play("The next morning I go down to the lake.");
    expect(story.state().scene).toMatchObject({ number: 1, closed: null, linger: false, place: "The lake shore" });
    expect(story.path().filter(entry => entry.kind === "scene_closed")).toEqual([]);
    expect(story.path().filter(entry => entry.kind === "scene_opened")).toHaveLength(1);
    expect(story.events.some(event => event.event.kind === "scene_closed")).toBe(false);
    expect(story.models.chronicler.requests).toHaveLength(0);
    expect(story.models.weaver.requests).toHaveLength(0);
    expect(story.view().day_view).toBeNull();
    expect(story.view().turn.kind).toBe("idle");

    story.engine.endScene(story.storyId, story.head(), "manual-end");
    await story.engine.ended(story.storyId);
    expect(story.path().filter(entry => entry.kind === "scene_closed")).toEqual([{ kind: "scene_closed", by: "player" }]);
    expect(story.models.chronicler.requests).toHaveLength(1);
    expect(story.models.weaver.requests).toHaveLength(1);
    expect(story.view().day_view).not.toBeNull();
  });

  it("does not impose a beat deadline after three or four replies with Linger off", async () => {
    const story = playable(undefined, { writer: Array.from({ length: 9 }, () => writer()) });
    for (let turn = 0; turn < 9; turn++) await story.play(`I sit with her and drink my tea (${turn}).`);
    expect(story.state().scene).toMatchObject({ closed: null, linger: false, withoutArc: 9, beatInPlayFor: 9 });
    for (const request of story.models.writer.requests) {
      expect(request.prompt).not.toMatch(/make it happen now|No Arc has moved|close it: set leaves_scene/);
      expect(request.system).not.toContain("head for the exit");
    }
    expect(story.path().some(entry => entry.kind === "scene_closed")).toBe(false);
  });

  it("records a long scene without allowing the Writer to close it", async () => {
    const story = playable(undefined, { writer: [writer({ leaves_scene: true, minutes: 600 })] });
    for (let turn = 0; turn < 31; turn++) {
      story.write({ kind: "move", text: `I drink my tea (${turn}).` });
      story.write({ kind: "reply", text: "Hermione reads beside the fire.", callId: "fixture", model: { provider: "codex", model: "gpt-6.1-sol" } });
    }
    await story.play("The next morning we walk down to the lake.");
    expect(story.path().filter(entry => entry.kind === "scene_recorded")).toHaveLength(1);
    expect(story.path().some(entry => entry.kind === "scene_closed")).toBe(false);
    expect(story.state().scene).toMatchObject({ number: 1, closed: null, place: "The lake shore" });
    expect(story.models.chronicler.requests).toHaveLength(1);
    expect(story.models.weaver.requests).toHaveLength(0);
    expect(story.models.writer.requests[0]!.prompt).not.toContain("close it: set leaves_scene");
  });

  it("extends long-Scene memory again without recording earlier passages twice", async () => {
    const story = playable();
    const add = (label: string) => {
      for (let turn = 0; turn < 31; turn++) {
        story.write({ kind: "move", text: `${label}: I drink my tea (${turn}).` });
        story.write({ kind: "reply", text: `${label}: Hermione reads by the fire.`, callId: "fixture", model: { provider: "codex", model: "gpt-6.1-sol" } });
      }
    };
    add("before first record");
    await story.play("I refill the teapot.");
    const first = story.state().scene?.recorded?.through;
    add("after first record");
    await story.play("I ask her about the next chapter.");
    expect(story.models.chronicler.requests).toHaveLength(2);
    const second = story.models.chronicler.requests[1]!;
    expect(JSON.stringify(second.facts)).not.toContain("before first record");
    expect(second.prompt).toContain("<recorded_so_far>");
    expect(second.prompt).toContain("Record only NEW Moments");
    expect(story.state().scene?.recorded?.through).not.toBe(first);
    expect(story.path().some(entry => entry.kind === "scene_closed")).toBe(false);
  });
});
