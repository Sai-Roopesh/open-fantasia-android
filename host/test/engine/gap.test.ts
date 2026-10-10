import { describe, expect, it } from "vitest";
import type { MoveWritten, WorldMoved } from "../../src/story/entries.js";
import { worldOn } from "../../src/story/world.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

const summons = { id: "P1", at: "Day 4 09:00", place: "McGonagall's office", what: "Your account of the troll.", who: ["Minerva McGonagall", "Hermione Granger"], expected: true, pick: true };
const hospital = { id: "P2", at: "Day 4 11:00", place: "Outside the hospital wing", what: "Draconia is fighting Snape for her bed back.", who: ["Draconia Malfoy", "Severus Snape"], expected: false, pick: false };
const saturdayMorning = { lives: [], threads: [], happened: [], meanwhile: [], happenings: [summons, hospital] };
const quiet = { lives: [], threads: [], happened: [], meanwhile: [], happenings: [] };
const noticed = { ...quiet, happened: [{ id: "H1", what: "McGonagall took the accounts of the troll without Roopesh, and asked Hermione where he was.", at: "Day 4 09:20", where: "McGonagall's office", known_to: ["Minerva McGonagall", "Hermione Granger"], landmark: null, missed: "G1" }] };

/** Saturday 7:30 am, McGonagall's summons at 9:00 and the hospital wing at 11:00 on. */
async function saturday(weaver: object[], writer: object[] = []) {
  // A scripted failure goes to the Weaver as it is; anything else is its answer.
  const script = (answer: object) => ("fail" in answer ? answer as { fail: string } : { answer: JSON.stringify(answer) });
  const played = playable(hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] }),
    { weaver: [saturdayMorning, ...weaver].map(script), writer: writer.map(answer => ({ answer: JSON.stringify(answer) })), unplanned: true });
  await played.play("I say goodnight to Hermione and go up.");
  played.engine.endScene(played.storyId, played.head(), "trace-end");
  await played.engine.woven(played.storyId);
  const id = (place: string) => played.view().day_view!.happenings.find(item => item.place === place)!.id;
  return { ...played, id };
}

describe("the Gap", () => {
  // GIVEN it is 7:40 am, McGonagall expects the Player Character at 9:00, and Draconia is in the hospital wing at 11:00
  // WHEN the player goes to the hospital wing at 11:00 and leaves the Gap blank
  // THEN he spent the morning in his room
  // AND McGonagall took the accounts without him and noticed his absence
  it("day-view › The Gap is the player's, and everything in it goes on without them › Skipping a summons", async () => {
    const { engine, storyId, head, id, mac, models } = await saturday([quiet, noticed]);
    engine.choose(storyId, { after: head(), kind: "go", happening: id("Outside the hospital wing"), gap: null }, "trace-go");
    await engine.settled(storyId);
    const move = mac.tree.pathTo(head()).filter(entry => entry.payload.kind === "move").at(-1)!;
    expect((move.payload as MoveWritten).text).toMatch(/^I spend the time until then quietly in the Gryffindor common room\./);
    // The Gap is woven before the Writer plans the Scene, and McGonagall's summons goes on without him, noticed.
    const order = models.requests.filter(request => ["weaver", "writer"].includes(request.agent)).map(request => request.agent);
    expect(order.slice(-3)).toEqual(["weaver", "weaver", "writer"]);
    expect(models.weaver.requests.at(-2)!.prompt).toMatch(/G1 Saturday 9:00 am, McGonagall's office: Your account of the troll\..*he was expected/);
    expect(models.weaver.requests.at(-1)!.prompt).toMatch(/happened: McGonagall's office at 9:00 am went on without him, and he was expected/);
    const [gap] = mac.tree.recordsOn(head(), "world_moved").filter(entry => entry.parentId === move.id);
    expect(gap!.payload as WorldMoved).toMatchObject({ from: "Day 4 07:30", until: "Day 4 11:00" });
    expect(worldOn(mac, head()).happened.at(-1)).toMatchObject({ knownTo: ["Minerva McGonagall", "Hermione Granger"] });
    expect(models.writer.requests.at(-1)!.prompt).toContain("McGonagall took the accounts of the troll without Roopesh");
  });

  // WHEN the player goes to the hospital wing at 11:00 and writes "I spent the morning in the library reading about life debts"
  // THEN that is what he did, and the Story can draw on it later
  it("day-view › The Gap is the player's, and everything in it goes on without them › Filling the Gap", async () => {
    const { engine, storyId, head, id, mac } = await saturday([noticed]);
    const filled = "I spent the morning in the library reading about life debts.";
    engine.choose(storyId, { after: head(), kind: "go", happening: id("Outside the hospital wing"), gap: filled }, "trace-go");
    await engine.settled(storyId);
    engine.endScene(storyId, head(), "trace-end");
    await engine.chronicled(storyId);
    const quoted = mac.tree.recordsOn(head(), "chronicle").flatMap(entry => (entry.payload as { moments: { quotes: { text: string }[] }[] }).moments.flatMap(moment => moment.quotes.map(quote => quote.text)));
    expect(quoted.some(text => text.includes("reading about life debts"))).toBe(true);
  });

  // GIVEN the player goes to McGonagall at 9:00 and that Scene ends at 9:40
  // THEN the Day View returns at 9:40 with the hospital wing at 11:00 still ahead
  it("day-view › The Gap is the player's, and everything in it goes on without them › Both, in turn", async () => {
    const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
    const accounts = { leaves_scene: false, frame: { title: "Accounts", place: "McGonagall's office", purpose: "p", exit: "e" }, comes_in: ["Minerva McGonagall", "Hermione Granger"], goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, clock: "Day 4 09:00", taste: null, in_play: [] };
    const tenToTen = { ...accounts, frame: null, comes_in: [], clock: "Day 4 09:40" };
    const { engine, storyId, head, id, view } = await saturday([quiet, quiet], [{ leaves_scene: false, frame: { title: "kept", place: "kept", purpose: "p", exit: "e" }, comes_in: [], goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, clock: "Day 3 22:50", taste: null, in_play: [] }, accounts, tenToTen]);
    engine.choose(storyId, { after: head(), kind: "go", happening: id("McGonagall's office"), gap: "I wash and dress and go down." }, "trace-go");
    await engine.settled(storyId);
    await engine.move(storyId, "I tell her what I saw.", head(), "trace-move");
    await engine.settled(storyId);
    engine.endScene(storyId, head(), "trace-end-2");
    await engine.woven(storyId);
    const day = view().day_view!;
    expect(day).toMatchObject({ at: "Day 4 09:40", time: "9:40 am", world: "ready" });
    expect(day.happenings.map(item => ({ place: item.place, time: item.time }))).toEqual([{ place: "Outside the hospital wing", time: "11:00 am" }]);
  });

  it("fails the turn when the Gap cannot be woven, with the reason, and Retry weaves it and goes on", async () => {
    const { engine, storyId, head, id, view } = await saturday([{ fail: "Sonnet is overloaded" }, { fail: "Sonnet is overloaded" }, noticed]);
    engine.choose(storyId, { after: head(), kind: "go", happening: id("Outside the hospital wing"), gap: null }, "trace-go");
    await engine.settled(storyId);
    expect(view().turn).toMatchObject({ kind: "failed", reason: expect.stringMatching(/The World could not move on/) });
    engine.retry(storyId, "trace-retry");
    await engine.settled(storyId);
    expect(view().turn.kind).toBe("idle");
    expect(view().scene.place).toBe("Outside the hospital wing");
  });

  it("does not weave a short Gap with nothing on in it", async () => {
    const breakfast = { id: "P3", at: "Day 4 08:00", place: "The Great Hall", what: "Breakfast.", who: ["Hermione Granger"], expected: false, pick: true };
    const played = playable(hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] }),
      { weaver: [{ answer: JSON.stringify({ ...saturdayMorning, happenings: [breakfast] }) }], unplanned: true });
    await played.play("I say goodnight to Hermione and go up.");
    played.engine.endScene(played.storyId, played.head(), "trace-end");
    await played.engine.woven(played.storyId);
    played.engine.choose(played.storyId, { after: played.head(), kind: "story", gap: null }, "trace-story");
    await played.engine.settled(played.storyId);
    expect(played.models.weaver.requests).toHaveLength(1);
    expect(played.view().scene).toMatchObject({ place: "The Great Hall", at: "Day 4 08:00" });
  });

  // GIVEN the Player Character skipped McGonagall's 9:00 summons
  // WHEN he next meets McGonagall
  // THEN she knows he did not come, and acts on it
  it("day-view › Missing something has consequences › McGonagall answers the absence", async () => {
    const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
    const opening = (title: string, place: string, clock: string, comesIn: string[], leaves = false) =>
      ({ leaves_scene: leaves, frame: { title, place, purpose: "p", exit: "e" }, comes_in: comesIn, goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, clock, taste: null, in_play: [] });
    const evening = { leaves_scene: false, frame: { title: "kept", place: "kept", purpose: "p", exit: "e" }, comes_in: [], goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, clock: "Day 3 22:50", taste: null, in_play: [] };
    const { engine, storyId, head, id, models } = await saturday([noticed, quiet], [
      evening,
      opening("The hospital wing", "Outside the hospital wing", "Day 4 11:00", ["Draconia Malfoy", "Severus Snape"]),
      opening("The office", "McGonagall's office", "Day 4 12:00", ["Minerva McGonagall"], true)
    ]);
    engine.choose(storyId, { after: head(), kind: "go", happening: id("Outside the hospital wing"), gap: null }, "trace-go");
    await engine.settled(storyId);
    const atTheHospital = models.actor.requests.at(-1)!;
    expect(`${atTheHospital.system}\n${atTheHospital.prompt}`).not.toContain("asked Hermione where he was");

    engine.move(storyId, "At noon I knock on McGonagall's door.", head(), "trace-office");
    await engine.settled(storyId);
    const withMcGonagall = models.actor.requests.at(-1)!;
    expect(withMcGonagall.system).toMatch(/McGonagall took the accounts of the troll without Roopesh, and asked Hermione where he was\./);
    expect(withMcGonagall.system).toMatch(/known_to="Minerva McGonagall"/);
  });
});
