import { describe, expect, it } from "vitest";
import { Engine } from "../../src/engine/engine.js";
import { fakeChronicleAnswer } from "../../src/models/fake.js";
import { Models } from "../../src/models/model-call.js";
import { scriptedRunners } from "../../src/models/runners.js";
import type { Payload } from "../../src/story/entries.js";
import { emptyUpdate } from "../../src/story/truth.js";
import { playable } from "../support/play.js";

/** The player's words and the Story's Replies on a Path, in order: what a rebuild must keep exactly. */
const played = (payloads: Payload[]) => payloads.flatMap(payload => (payload.kind === "move" || payload.kind === "reply" ? [`${payload.kind}: ${payload.text}`] : []));

describe("rebuilding a Story from its own text (openspec the-truth)", () => {
  // GIVEN a Story played for nineteen Scenes
  // WHEN its truth is rebuilt
  // THEN the player carries on from Scene 19 with nothing replayed, and the people in the next Scene act from
  //   everything that happened in the nineteen
  it("the-truth › A Story's truth can be rebuilt from its own text › Rebuilt from the page", async () => {
    const story = playable();
    await story.play("I sit down beside Hermione.");
    story.engine.endScene(story.storyId, story.head(), "end-1");
    await story.engine.settled(story.storyId);
    await story.play("In the morning I go down to breakfast.");
    await story.play("I ask Ron what he heard.");
    story.engine.endScene(story.storyId, story.head(), "end-2");
    await story.engine.settled(story.storyId);

    const before = story.path();
    const oldPath = story.mac.tree.currentPath(story.storyId)!;
    const replies = story.models.actor.requests.length;
    const sceneNumber = story.state().scene?.number;

    const lines: string[] = [];
    const recorded = story.models.chronicler.requests.length;
    const rebuilt = await story.engine.rebuild(story.storyId, line => lines.push(line));

    // Nothing replayed: the same Moves and Replies, in order, and no Reply written again.
    expect(played(story.path())).toEqual(played(before));
    expect(story.models.actor.requests).toHaveLength(replies);
    expect(story.state().scene?.number).toBe(sceneNumber);
    expect(rebuilt.scenes).toBe(2);
    // Everything written afresh: the first Outline before anything else, and each Scene's end after it.
    const kinds = story.path().map(payload => payload.kind);
    expect(kinds.indexOf("outline_set")).toBeLessThan(kinds.indexOf("move"));
    expect(kinds.filter(kind => kind === "chronicle")).toHaveLength(2);
    expect(story.state().outline).not.toBeNull();
    expect(story.state().storySoFar.scenes.map(told => told.scene?.number)).toEqual([1, 2]);
    // The old Path is kept, and the player is on the rebuilt one.
    expect(story.mac.tree.paths(story.storyId).map(path => path.id)).toContain(oldPath.id);
    expect(story.mac.tree.currentPath(story.storyId)).toMatchObject({ id: rebuilt.pathId, name: "Rebuilt" });
    expect(lines[0]).toBe("Writing the Story's first Outline");
    // Each Scene's end is given that Scene's own Moves and Replies, from the Move that opened it.
    const second = story.models.chronicler.requests.slice(recorded).at(-1)!.prompt;
    expect(second).toContain("In the morning I go down to breakfast.");
    expect(second).toContain("I ask Ron what he heard.");
    const opened = story.path().filter(payload => payload.kind === "scene_opened").at(-1);
    expect(opened?.kind === "scene_opened" && story.mac.tree.pathTo(story.head()).some(entry => entry.id === opened.startsAt)).toBe(true);

    // The player carries on from where they were.
    await story.play("I tell Ron to keep it to himself.");
    expect(played(story.path()).at(-2)).toBe("move: I tell Ron to keep it to himself.");
  });

  it("lives a span the player skipped again from their Move, and lists what the old World had there", async () => {
    const story = playable();
    await story.play("I sit down beside Hermione.");
    story.engine.endScene(story.storyId, story.head(), "end-1");
    await story.engine.settled(story.storyId);
    // A month skipped, as the old store kept it: the Move with its time, then the World the old Weaver wrote over it.
    const month = "I let a month pass, and Hermione's feelings for me grow.";
    story.write({ kind: "move", text: month, choice: { kind: "skip", place: null, at: "Day 34 07:30", who: [], scene: null, engagement: null } });
    story.write({ kind: "world_moved", truth: emptyUpdate(), scene: 1, gap: true, from: "Day 3 22:00", until: "Day 34 07:30", lives: [], threads: [], meanwhile: [], on: [],
      happened: [{ id: "h-old", what: "Seven weeks pass and Roopesh never once shows his face in the common room or the library.", at: "Day 20 12:00", where: "The common room", knownTo: ["Hermione Granger"], landmark: null, move: null }],
      dropped: [], callId: null, model: null });
    const weaves = story.models.weaver.requests.length;

    const rebuilt = await story.engine.rebuild(story.storyId);

    // The span is lived again, from the player's Move, not copied.
    const asked = story.models.weaver.requests.slice(weaves).find(request => request.prompt.includes(month));
    expect(asked).toBeDefined();
    const gaps = story.path().filter(payload => payload.kind === "world_moved" && payload.gap);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ from: expect.any(String), until: "Day 34 07:30" });
    expect(JSON.stringify(gaps[0])).not.toContain("never once shows his face");
    expect(rebuilt.replaced).toEqual([{ what: "Seven weeks pass and Roopesh never once shows his face in the common room or the library.", mentionedIn: [] }]);
  });

  it("goes on with a rebuild that stopped from where it stopped, on the same Path, after the Mac restarts", async () => {
    const story = playable();
    await story.play("I sit down beside Hermione.");
    story.engine.endScene(story.storyId, story.head(), "end-1");
    await story.engine.settled(story.storyId);
    await story.play("In the morning I go down to breakfast.");
    story.engine.endScene(story.storyId, story.head(), "end-2");
    await story.engine.settled(story.storyId);
    const before = story.path();
    const old = story.mac.tree.currentPath(story.storyId)!;

    // Scene 1's end is recorded again; at Scene 2's the Chronicler's models are at their limit, both of them.
    story.models.chronicler.then({ from: fakeChronicleAnswer }, { fail: "You've hit your session limit" }, { fail: "You've hit your session limit" });
    await expect(story.engine.rebuild(story.storyId)).rejects.toThrow(/Scene 2's end stopped at the chronicler/);
    const stopped = story.mac.tree.currentPath(story.storyId)!;
    expect(stopped).toMatchObject({ name: "Rebuilt" });
    expect(story.path().filter(payload => payload.kind === "chronicle")).toHaveLength(1);

    // The Mac restarts, and the rebuild goes on from the old Path: nothing done again, nothing missed.
    const engine = new Engine(story.mac, new Models(story.mac.db, scriptedRunners(story.models)));
    // The Story is still on the Path that stopped; the rebuild is told the Path it rebuilds from.
    const lines: string[] = [];
    const outlines = story.path().filter(payload => payload.kind === "outline_set").length;
    const rebuilt = await engine.rebuild(story.storyId, line => lines.push(line), old.id);
    expect(rebuilt.pathId).toBe(stopped.id);
    expect(rebuilt.scenes).toBe(2);
    expect(played(story.path())).toEqual(played(before));
    expect(story.path().filter(payload => payload.kind === "chronicle")).toHaveLength(2);
    expect(story.path().filter(payload => payload.kind === "outline_set")).toHaveLength(outlines + 1);
    expect(lines[0]).toBe("Going on with the rebuild, from Scene 2's end");
  });

  it("refuses to go on with a rebuild from the Path it rebuilds from", async () => {
    const story = playable();
    await story.play("I sit down beside Hermione.");
    const path = story.mac.tree.currentPath(story.storyId)!;
    await expect(story.engine.rebuild(story.storyId, () => {}, path.id)).rejects.toThrow("The Story is on the Path it would be rebuilt from");
  });
});
