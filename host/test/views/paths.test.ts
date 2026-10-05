import { describe, expect, it } from "vitest";
import { pathsView } from "../../src/views/paths.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

/** Three Scenes on Main, then another way tried from the third Scene's Reply. */
async function forked() {
  const played = playable(hogwartsStoryFile({ title: "The lantern", place: "The Gryffindor common room", at: "Day 3 23:47", who: ["Hermione Granger"] }));
  const { engine, storyId, head } = played;
  const next = async (move: string) => {
    engine.endScene(storyId, head(), "trace-end");
    await engine.woven(storyId);
    await played.play(move);
  };
  await played.play("I hold the lantern up to the window.");
  await next("I go down to the kitchens.");
  await next("I climb to the Astronomy Tower.");
  const fork = head();
  await played.play("I look out over the lake.");
  const main = played.mac.tree.currentPath(storyId)!;
  engine.tryAnotherWay(storyId, fork, head(), "trace-try");
  await played.play("I follow the lantern down to the forest.");
  const tried = played.mac.tree.currentPath(storyId)!;
  engine.openPath(storyId, main.id, "trace-main");
  return { ...played, main, tried };
}

describe("the Paths screen", () => {
  // WHEN the player taps a Path in the Paths screen
  // THEN they are at that Path's latest moment
  it("paths › The Paths screen › Returning by the Paths screen", async () => {
    const { mac, engine, storyId, view, main, tried } = await forked();
    const screen = pathsView(mac, storyId, "trace-paths");
    const third = view().scene;
    expect(screen.rows).toEqual([
      { kind: "scenes", depth: 0, label: expect.stringMatching(/^Scenes 1 – 2 · Saturday \d+:\d\d [ap]m$/), title: null, path: null },
      { kind: "fork", depth: 0, label: `Scene 3 · ${third.at_label}`, title: third.title, path: null },
      { kind: "path", depth: 1, label: "MAIN · YOU ARE HERE", title: null, path: {
        id: main.id, label: "MAIN · YOU ARE HERE", title: `Scene 3 · ${third.title}`, detail: expect.stringMatching(/^3 Scenes · Saturday /),
        current: true, played_at: expect.any(String), can_delete: false } },
      { kind: "path", depth: 1, label: "FROM SCENE 3 · TRIED ANOTHER WAY", title: null, path: {
        id: tried.id, label: "FROM SCENE 3 · TRIED ANOTHER WAY", title: `Scene 3 · ${third.title}`, detail: expect.stringMatching(/^1 Scene · Saturday /),
        current: false, played_at: expect.any(String), can_delete: true } }
    ]);
    expect(screen).toMatchObject({ story_id: storyId, clearable: 0, trace_id: "trace-paths" });

    engine.openPath(storyId, tried.id, "trace-open");
    expect(view()).toMatchObject({ path_id: tried.id, head_entry_id: mac.tree.path(tried.id)!.headEntryId });
    expect(view().exchanges.at(-1)!.move!.text).toBe("I follow the lantern down to the forest.");
  });

  it("calls a Path by the player's name for it, and shows a single Path as its card alone", async () => {
    const played = playable(hogwartsStoryFile());
    await played.play("I sit down.");
    const main = played.mac.tree.currentPath(played.storyId)!;
    played.engine.renamePath(played.storyId, main.id, "The long way", "trace-name");
    expect(pathsView(played.mac, played.storyId, "trace").rows).toEqual([
      { kind: "path", depth: 0, label: "MAIN · YOU ARE HERE", title: null, path: expect.objectContaining({ title: "The long way", detail: expect.stringMatching(/^1 Scene · Friday 9:40 pm$/) }) }
    ]);
  });
});
