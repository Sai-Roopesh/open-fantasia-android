import { describe, expect, it } from "vitest";
import { LinkError } from "../../src/errors.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

/** The common room with Hermione at the lantern, at 11:47 pm: the Scene opens at 11:45, and its first Reply comes two minutes on. */
async function atTheLantern() {
  const played = playable(hogwartsStoryFile({ title: "The lantern", place: "The Gryffindor common room", at: "Day 3 23:45", who: ["Hermione Granger"] }));
  await played.play("I hold the lantern up to the window and watch the light move across the lawn.");
  return played;
}

/** Ends the Scene and opens the next one with a Move at the Day View: one Scene further along. */
async function nextScene(played: Awaited<ReturnType<typeof atTheLantern>>, move: string) {
  played.engine.endScene(played.storyId, played.head(), "trace-end");
  await played.engine.ended(played.storyId);
  await played.play(move);
}

const paths = (played: Awaited<ReturnType<typeof atTheLantern>>) => played.mac.tree.paths(played.storyId);

describe("Paths", () => {
  // GIVEN the player is with Hermione at the lantern at 11:47 pm
  // WHEN they Try another way and follow the lantern into the forest for three Scenes, then switch back
  // THEN they are with Hermione at 11:47 pm, with nothing on that Path changed
  // AND the forest Path is still there
  it("paths › Try another way from any Reply › Following the lantern", async () => {
    const played = await atTheLantern();
    const { engine, storyId, head, state, mac } = played;
    const lantern = head();
    const main = mac.tree.currentPath(storyId)!;
    const mainBefore = mac.tree.pathTo(lantern).map(entry => entry.id);

    expect(engine.tryAnotherWay(storyId, lantern, lantern, "trace-try")).toEqual({ head_entry_id: lantern, trace_id: "trace-try" });
    const forest = mac.tree.currentPath(storyId)!;
    expect(forest).toMatchObject({ origin: "tried", forkedAt: lantern, headEntryId: lantern, opened: true });
    expect(mac.tree.path(main.id)).toMatchObject({ isCurrent: false, headEntryId: lantern });
    await played.play("I follow the lantern out of the portrait hole and into the forest.");
    await nextScene(played, "I follow the light deeper, past the first of the trees.");
    await nextScene(played, "I follow it to the edge of the clearing.");
    expect(state().scene!.number).toBe(3);

    engine.openPath(storyId, main.id, "trace-back");
    expect(head()).toBe(lantern);
    expect(mac.tree.pathTo(head()).map(entry => entry.id)).toEqual(mainBefore);
    expect(state()).toMatchObject({ clock: "Day 3 23:47", scene: { title: "The lantern", here: ["Hermione Granger"] } });
    expect(paths(played).map(path => [path.id, path.isCurrent])).toEqual([[main.id, true], [forest.id, false]]);
    expect(mac.states.at(mac.tree.path(forest.id)!.headEntryId).scene!.number).toBe(3);
  });

  it("refuses to try another way from anything but a Reply or a Move on the Path", async () => {
    const played = await atTheLantern();
    const note = played.mac.tree.pathTo(played.head()).find(entry => entry.payload.kind === "beat_note")!;
    const refused = () => played.engine.tryAnotherWay(played.storyId, note.id, played.head(), "trace");
    expect(refused).toThrow(LinkError);
    expect(refused).toThrow(/not a Reply or a Move on this Path/);
  });
  // GIVEN one Path stands on Tuesday afternoon and another on Saturday night
  // WHEN the player switches from the first to the second
  // THEN the clock, the Day View and the World screen all show Saturday night
  it("paths › Everything belongs to the Path › Two clocks", async () => {
    const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
    const writer = (changes: Record<string, unknown>) => ({ answer: JSON.stringify({ frame: { title: "kept", place: "kept", purpose: "p", exit: "e" },
      comes_in: [], goes: [], beats, note: "n", call: "continue", intensity: 2, minutes: 0, in_play: [], moves_to: null, ...changes }) });
    // Saturday 9:30 pm is four days and six and a half hours after Tuesday 3:00 pm.
    const played = playable(hogwartsStoryFile({ title: "Tuesday afternoon", place: "The library", at: "Day 7 15:00", who: ["Hermione Granger"] }), {
      writer: [writer({}), writer({ moves_to: "The Three Broomsticks", frame: { title: "Saturday night", place: "The Three Broomsticks", purpose: "p", exit: "e" }, minutes: (4 * 24 + 6.5) * 60 })]
    });
    const { engine, storyId, head, state, view, mac } = played;
    await played.play("I read beside Hermione.");
    const tuesday = mac.tree.currentPath(storyId)!;
    const opening = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "scene_opened")!;
    engine.tryAnotherWay(storyId, opening.id, head(), "trace-try");
    await played.play("I wait for Saturday night and go down to the Three Broomsticks.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    const saturday = mac.tree.currentPath(storyId)!;
    engine.openPath(storyId, tuesday.id, "trace-tuesday");
    expect(state().clock).toBe("Day 7 15:00");
    expect(view().day_view).toBeNull();

    engine.openPath(storyId, saturday.id, "trace-saturday");
    expect(state().clock).toBe("Day 11 21:30");
    expect(view().day_view).toMatchObject({ at: "Day 11 21:30", day: "Saturday 14 September", time: "9:30 pm" });
    expect(view().scene).toMatchObject({ title: "Tuesday afternoon", place: "The Three Broomsticks" });
  });

  // GIVEN five exchanges after a Reply
  // WHEN the player Rewinds to that Reply and makes a different Move
  // THEN the five exchanges are on a Path of their own in the Paths screen
  it("paths › Rewind sets aside, never destroys › Going back and carrying on", async () => {
    const played = await atTheLantern();
    const { engine, storyId, head, mac } = played;
    const lantern = head();
    for (const move of ["I wait.", "I wait longer.", "I sit down.", "I look at Hermione.", "I say nothing."]) await played.play(move);
    const latest = head();
    const main = mac.tree.currentPath(storyId)!;

    expect(engine.rewind(storyId, lantern, latest, "trace-rewind")).toEqual({ head_entry_id: lantern, trace_id: "trace-rewind" });
    expect(mac.tree.currentPath(storyId)).toMatchObject({ id: main.id, name: "Main", headEntryId: lantern });
    const aside = paths(played).find(path => path.origin === "set_aside")!;
    expect(aside).toMatchObject({ headEntryId: latest, forkedAt: lantern, isCurrent: false, opened: false });
    const after = mac.tree.pathTo(aside.headEntryId).slice(mac.tree.pathTo(lantern).length);
    expect(after.filter(entry => entry.payload.kind === "move").map(entry => entry.payload.kind === "move" && entry.payload.text))
      .toEqual(["I wait.", "I wait longer.", "I sit down.", "I look at Hermione.", "I say nothing."]);

    await played.play("I blow the lantern out.");
    const carried = mac.tree.pathTo(head());
    expect(carried.find(entry => entry.payload.kind === "move" && entry.payload.text === "I blow the lantern out.")!.parentId).toBe(lantern);
    expect(mac.tree.path(aside.id)!.headEntryId).toBe(latest);
  });

  // GIVEN two Paths set aside by Rewind, one of which the player has since opened, and a Path they tried another way on and left
  // WHEN the player taps Clear Paths you never went back to
  // THEN only the set-aside Path they never opened is gone, and the other two are still in the Paths screen
  it("paths › Rewind sets aside, never destroys › Clearing what was set aside", async () => {
    const played = await atTheLantern();
    const { engine, storyId, head, mac } = played;
    const lantern = head();
    const main = mac.tree.currentPath(storyId)!;
    await played.play("I wait.");
    engine.rewind(storyId, lantern, head(), "trace-1");
    await played.play("I sit down.");
    engine.rewind(storyId, lantern, head(), "trace-2");
    const [opened, never] = paths(played).filter(path => path.origin === "set_aside");
    engine.openPath(storyId, opened!.id, "trace-open");
    engine.openPath(storyId, main.id, "trace-main");
    engine.tryAnotherWay(storyId, lantern, head(), "trace-try");
    const tried = mac.tree.currentPath(storyId)!;
    engine.openPath(storyId, main.id, "trace-back");

    engine.clearPaths(storyId, "trace-clear");
    expect(paths(played).map(path => path.id)).toEqual([main.id, opened!.id, tried.id]);
    expect(mac.tree.path(never!.id)).toBeNull();
  });

  // GIVEN the player is on Main and "Following the lantern" is another Path
  // WHEN they delete "Following the lantern" and confirm
  // THEN it is gone from the Paths screen, Main is as it was, and Main offers no Delete
  it("paths › The Paths screen › Deleting a Path", async () => {
    const played = await atTheLantern();
    const { engine, storyId, head, mac } = played;
    const main = mac.tree.currentPath(storyId)!;
    engine.tryAnotherWay(storyId, head(), head(), "trace-try");
    const lantern = mac.tree.currentPath(storyId)!;
    engine.renamePath(storyId, lantern.id, "  Following the lantern ", "trace-name");
    expect(mac.tree.path(lantern.id)).toMatchObject({ name: "Following the lantern", named: true });
    engine.openPath(storyId, main.id, "trace-main");
    const mainBefore = mac.tree.path(main.id);

    engine.deletePath(storyId, lantern.id, "trace-delete");
    expect(paths(played).map(path => path.id)).toEqual([main.id]);
    expect(mac.tree.path(main.id)).toEqual(mainBefore);
    expect(() => engine.deletePath(storyId, main.id, "trace-delete-main")).toThrow(/You are on this Path/);
  });

  // WHEN the player starts a Path from the beginning
  // THEN they are in the opening Scene, with the setup as the Story File made it, and every other Path untouched
  it("paths › Starting again from the beginning › Re-experiencing the Story", async () => {
    const played = await atTheLantern();
    const { engine, storyId, head, state, view, mac } = played;
    await played.play("I blow the lantern out.");
    const main = mac.tree.currentPath(storyId)!;
    const opening = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "scene_opened")!;
    const setUp = mac.states.at(opening.id);

    engine.tryAnotherWay(storyId, null, head(), "trace-again");
    expect(mac.tree.currentPath(storyId)).toMatchObject({ origin: "beginning", forkedAt: null, headEntryId: opening.id });
    expect(state()).toEqual(setUp);
    expect(view().exchanges).toEqual([{ move: null, reply: { entry_id: opening.id, text: expect.stringContaining("The fire has burned down") } }]);
    expect(mac.tree.path(main.id)).toMatchObject({ headEntryId: main.headEntryId, isCurrent: false });
  });
  // GIVEN the player's Move "I sit at the other end of the sofa" has a Reply after it
  // WHEN the player holds that Move
  // THEN Copy, Rewind to here, Try another way from here and Edit are offered
  // AND Rewind to here goes back to the moment before that Move, with the Move and everything after it set aside
  it("scenes › The latest Reply has its actions in view › Holding an earlier Move", async () => {
    const played = await atTheLantern();
    const { engine, storyId, head, mac } = played;
    const before = head();
    await played.play("I sit at the other end of the sofa.");
    const latest = head();
    const move = mac.tree.pathTo(latest).filter(entry => entry.payload.kind === "move").at(-1)!;
    const main = mac.tree.currentPath(storyId)!;

    engine.rewind(storyId, move.id, latest, "trace-rewind");
    expect(mac.tree.currentPath(storyId)).toMatchObject({ id: main.id, headEntryId: before });
    const aside = paths(played).find(path => path.origin === "set_aside")!;
    expect(aside).toMatchObject({ headEntryId: latest, forkedAt: before });
    expect(mac.tree.pathTo(aside.headEntryId).some(entry => entry.id === move.id)).toBe(true);

    engine.openPath(storyId, aside.id, "trace-back");
    engine.tryAnotherWay(storyId, move.id, latest, "trace-try");
    expect(mac.tree.currentPath(storyId)).toMatchObject({ origin: "tried", headEntryId: before, forkedAt: before });
  });

  it("isolates non-remembered Redo notes and Scene reactions per Path, and preserves initial Outline from the beginning", async () => {
    const played = await atTheLantern();
    const { engine, storyId, head, mac, models } = played;
    // Write a non-remembered Redo direction on Main, then start again from the beginning.
    const localNote = "she is repeating the same thing like a parrot";
    engine.redo(storyId, head(), localNote, false, "trace-redo");
    await engine.settled(storyId);
    expect(models.requests.filter(r => r.agent === "actor").at(-1)!.prompt).toContain(localNote);

    // Attach a pre-play initial Outline directly under the opening Scene (as prepareStories does).
    const opening = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "scene_opened")!;
    const initialOutline = mac.tree.append(storyId, opening.id, {
      kind: "outline_set", reason: "Start.", planFollows: false, dropped: [], callId: "c-out",
      model: { provider: "codex", model: "gpt-6.1-sol" },
      outline: { current: 1, acts: [], ending: "The end.", intentions: [], setups: [], promoted: [], revisedAfter: 0, deep: true, lookedUp: [] }
    });

    // React to Scene 1 on Main after closing it.
    engine.endScene(storyId, head(), "trace-end-main");
    await engine.ended(storyId);
    engine.setReaction(storyId, 1, "less", "too repetitive", "trace-react-main");
    expect(played.view().day_view?.reaction).toBe("less");

    // Start again from the beginning: inherits the initial Outline and sees NEITHER Main's local Redo note NOR Main's Scene 1 reaction.
    engine.tryAnotherWay(storyId, null, head(), "trace-begin");
    expect(mac.tree.currentPath(storyId)!.headEntryId).toBe(initialOutline.id);
    expect(played.state().outline).not.toBeNull();
    await played.play("I set the lantern down quietly.");
    const freshPrompt = models.requests.filter(r => r.agent === "actor").at(-1)!.prompt;
    expect(freshPrompt).not.toContain(localNote);
    expect(freshPrompt).not.toContain("too repetitive");
  });

  it("tracks Backstage steering note answers per Path so answering on one Path does not suppress another Path", async () => {
    const played = await atTheLantern();
    const { engine, storyId, head, mac } = played;
    const { besideOf, writeNote } = await import("../../src/store/beside.js");
    const fork = head();
    const main = mac.tree.currentPath(storyId)!;
    engine.tryAnotherWay(storyId, fork, fork, "trace-branch");
    const branch = mac.tree.currentPath(storyId)!;

    // Write a Backstage steering note, then end Scene 1 on Branch (which answers it on Branch).
    const note = writeNote(mac, storyId, "Bring Hagrid into the next Act.");
    engine.endScene(storyId, head(), "trace-end-branch");
    await engine.ended(storyId);
    expect(besideOf(mac, storyId, head()).notes.find(n => n.id === note.id)?.answeredBy).not.toBeNull();

    // Switch back to Main: the note has NOT been answered on Main's Outline yet.
    engine.openPath(storyId, main.id, "trace-main");
    expect(besideOf(mac, storyId, head()).notes.find(n => n.id === note.id)?.answeredBy).toBeNull();
    // Branch still knows it was answered.
    expect(besideOf(mac, storyId, mac.tree.path(branch.id)!.headEntryId).notes.find(n => n.id === note.id)?.answeredBy).not.toBeNull();
  });
});
