import { describe, expect, it } from "vitest";
import { besideOf } from "../../src/store/beside.js";
import { carryBeside } from "../../src/store/carry.js";
import { ledger } from "../agents/ledger.js";

/** Writes an entry the way the store kept it before Taste, the brief and reactions moved beside the Story. */
function oldEntry(story: ReturnType<typeof ledger>, parent: string, payload: Record<string, unknown>): string {
  const id = `old-${Math.random().toString(36).slice(2)}`;
  story.mac.db.prepare("INSERT INTO entries (id, story_id, parent_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, story.storyId, parent, payload.kind, JSON.stringify(payload), new Date().toISOString());
  return id;
}

describe("carrying what the Story learned beside it (docs/adr/0020)", () => {
  it("carries lessons, the brief and reactions from every branch, abandoned ones included, once", () => {
    const story = ledger();
    const head = story.head();
    // The kept branch: a brief and a reaction.
    const kept = oldEntry(story, head, { kind: "brief_set", more: ["danger"], less: ["the library"] });
    oldEntry(story, kept, { kind: "reaction_set", scene: 1, reaction: "more", note: null });
    // A branch a Redo left behind: the lesson the player taught with it.
    const abandoned = oldEntry(story, head, { kind: "beat_note", taste: "Never write her as a first-timer.", plan: null, here: [], goes: [], beats: [], note: "", call: "continue", intensity: 2, arcMoved: true, clock: "Day 1 21:40", inPlay: [], callId: "c", model: { provider: "claude", model: "x" } });
    oldEntry(story, abandoned, { kind: "taste_set", lines: ["Keep school procedure to a line."] });

    expect(carryBeside(story.mac, story.storyId)).toEqual({ lessons: 2, brief: true, reactions: 1 });
    const beside = besideOf(story.mac, story.storyId);
    expect(beside.taste).toEqual(["Never write her as a first-timer.", "Keep school procedure to a line."]);
    expect(beside.brief).toEqual({ more: ["danger"], less: ["the library"] });
    expect(beside.reactions).toEqual([expect.objectContaining({ scene: 1, reaction: "more" })]);

    expect(carryBeside(story.mac, story.storyId)).toEqual({ lessons: 0, brief: false, reactions: 0 });
  });
});
