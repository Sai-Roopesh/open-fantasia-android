import { describe, expect, it } from "vitest";
import type { Entry } from "../../src/story/entries.js";
import { pathsView } from "../../src/views/paths.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

type Played = ReturnType<typeof playable>;

/** The passages on the Path the player is on, as words: Moves as "> …", Replies as they read. */
const passages = (played: Played) => played.mac.tree.pathTo(played.head()).flatMap(entry =>
  entry.payload.kind === "move" ? [`> ${entry.payload.text}`] : entry.payload.kind === "reply" ? [entry.payload.text] : []);
const last = (played: Played, kind: "move" | "reply"): Entry => played.mac.tree.pathTo(played.head()).filter(entry => entry.payload.kind === kind).at(-1)!;
const weaves = (played: Played) => played.models.requests.filter(request => request.agent === "weaver").length;
const chronicles = (played: Played) => played.models.requests.filter(request => request.agent === "chronicler").length;

describe("Editing", () => {
  // WHEN the player edits "Hermoine" to "Hermione" in the latest Reply
  // THEN the Reply reads "Hermione" and no new Path exists
  it("scenes › Editing › Fixing a typo in the latest Reply", async () => {
    const played = playable(hogwartsStoryFile(), { actor: [{ answer: "Hermoine folds the note in half." }] });
    const { engine, storyId, head, mac, view } = played;
    await played.play("I pass her the note.");
    engine.setFocus(storyId, head(), "Hermione Granger", "trace-focus");
    engine.endScene(storyId, head(), "trace-end");
    await engine.woven(storyId);
    await engine.chronicled(storyId);
    const main = mac.tree.currentPath(storyId)!;
    const [woven, chronicled] = [weaves(played), chronicles(played)];

    const accepted = engine.edit(storyId, last(played, "reply").id, "Hermione folds the note in half.", head(), "trace-edit");
    expect(accepted).toEqual({ head_entry_id: head(), trace_id: "trace-edit" });
    expect(passages(played)).toEqual(["> I pass her the note.", "Hermione folds the note in half."]);
    expect(mac.tree.paths(storyId)).toEqual([expect.objectContaining({ id: main.id, name: "Main", isCurrent: true })]);
    // What came after the Reply comes after the edit: Focus, the Scene's end, and the World that moved on.
    expect(mac.tree.pathTo(head()).map(entry => entry.payload.kind).slice(-3)).toEqual(["reply", "focus_set", "scene_closed"]);
    expect(view().day_view).toMatchObject({ world: "ready" });
    expect(mac.tree.recordsOn(head(), "world_moved")).toHaveLength(1);
    expect(mac.tree.recordsOn(head(), "chronicle").at(-1)!.payload).toMatchObject({ sceneEnded: true });
    engine.weave(storyId);
    engine.chronicle(storyId);
    await engine.woven(storyId);
    await engine.chronicled(storyId);
    expect([weaves(played), chronicles(played)]).toEqual([woven, chronicled]);
  });

  // GIVEN the latest Move reads "I sit at the other end of the sofa" and has its Reply
  // WHEN the player edits it to "I sit at the far end of the sofa"
  // THEN the Move reads "I sit at the far end of the sofa", its Reply is as it was, and no new Path exists
  it("scenes › Editing › Fixing the latest Move", async () => {
    const played = playable(hogwartsStoryFile(), { actor: [{ answer: "She doesn't look up." }] });
    const { engine, storyId, head, mac } = played;
    await played.play("I sit at the other end of the sofa.");
    const main = mac.tree.currentPath(storyId)!;

    engine.edit(storyId, last(played, "move").id, "I sit at the far end of the sofa.", head(), "trace-edit");
    await engine.settled(storyId);
    expect(passages(played)).toEqual(["> I sit at the far end of the sofa.", "She doesn't look up."]);
    expect(mac.tree.paths(storyId)).toEqual([expect.objectContaining({ id: main.id, isCurrent: true })]);
    expect(played.models.requests.filter(request => request.agent === "actor")).toHaveLength(1);
  });

  // GIVEN the player is ten exchanges past a Move
  // WHEN they edit that Move
  // THEN a new Path carries on from the edited Move
  // AND the ten exchanges after it remain on the Path they were on
  it("scenes › Editing › Editing an earlier Move", async () => {
    const played = playable(hogwartsStoryFile());
    const { engine, storyId, head, mac } = played;
    for (let move = 0; move <= 10; move++) await played.play(`I count to ${move}.`);
    const main = mac.tree.currentPath(storyId)!;
    const before = passages(played);
    const first = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "move")!;

    engine.edit(storyId, first.id, "I count backwards from ten.", head(), "trace-edit");
    await engine.settled(storyId);
    const edited = mac.tree.currentPath(storyId)!;
    expect(edited).toMatchObject({ origin: "edited", isCurrent: true });
    expect(passages(played)).toEqual(["> I count backwards from ten.", "She looks at you, and waits."]);
    expect(passages({ ...played, head: () => mac.tree.path(main.id)!.headEntryId })).toEqual(before);
    expect(before.filter(passage => passage.startsWith(">"))).toHaveLength(11);
    expect(pathsView(mac, storyId, "trace").rows.filter(row => row.kind === "path").map(row => row.path!.label))
      .toEqual(["FROM SCENE 1 · EDITED · YOU ARE HERE", "MAIN"]);
  });
});
