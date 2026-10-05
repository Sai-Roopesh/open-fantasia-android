import { describe, expect, it } from "vitest";
import { LinkError } from "../../src/link/errors.js";
import type { MoveWritten } from "../../src/story/entries.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

const summons = { id: "P1", at: "Day 4 09:00", place: "McGonagall's office", what: "Your account of the troll.", who: ["Minerva McGonagall", "Hermione Granger"], expected: true, pick: true };
const hospital = { id: "P2", at: "Day 4 11:00", place: "Outside the hospital wing", what: "Draconia is fighting Snape for her bed back.", who: ["Draconia Malfoy", "Severus Snape"], expected: false, pick: false };

const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
/** The Writer's answer for the evening, then any answers a test scripts for the Scene the choice opens. */
const writer = (changes: Record<string, unknown>) => ({ answer: JSON.stringify({ leaves_scene: false, frame: { title: "kept", place: "kept", purpose: "p", exit: "e" }, comes_in: [], goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, clock: "Day 3 22:50", taste: null, in_play: [], ...changes }) });

/** Saturday's Day View after the night after curfew, with McGonagall's summons and the hospital wing on. */
async function saturday(writers: object[] = []) {
  const story = hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] });
  story.world = { places: [{ name: "The library" }] };
  const played = playable(story, { writer: [writer({}), ...writers.map(answer => ({ answer: JSON.stringify(answer) }))], weaver: [{ answer: JSON.stringify({ lives: [], threads: [], happened: [], meanwhile: [], happenings: [summons, hospital] }) }] });
  await played.play("I say goodnight to Hermione and go up.");
  played.engine.endScene(played.storyId, played.head(), "trace-end");
  await played.engine.woven(played.storyId);
  const day = played.view().day_view!;
  const id = (place: string) => day.happenings.find(item => item.place === place)!.id;
  /** The Move the choice wrote. */
  const moved = () => played.mac.tree.pathTo(played.head()).filter(entry => entry.payload.kind === "move").at(-1)!.payload as MoveWritten;
  return { ...played, day, id, moved };
}

describe("choosing at the Day View", () => {
  it("writes the choice as one Move in the player's words, what he did in the Gap first", async () => {
    const { engine, storyId, head, id, moved } = await saturday();
    const accepted = engine.choose(storyId, { after: head(), kind: "go", happening: id("Outside the hospital wing"), gap: "I spent the morning in the library reading about life debts." }, "trace-go");
    expect(accepted.trace_id).toBe("trace-go");
    expect(moved()).toMatchObject({
      text: "I spent the morning in the library reading about life debts. I go along at 11:00 am: Outside the hospital wing.",
      choice: { kind: "go", place: "Outside the hospital wing", at: "Day 4 11:00", who: ["Draconia Malfoy", "Severus Snape"] }
    });
  });

  it("spends a blank Gap quietly where he was, and writes each kind of choice", async () => {
    const story = await saturday();
    story.engine.choose(story.storyId, { after: story.head(), kind: "story", gap: null }, "trace-story");
    expect(story.moved()).toMatchObject({ text: "I spend the time until then quietly in the Gryffindor common room. I go along at 9:00 am: McGonagall's office.", choice: { kind: "story", at: "Day 4 09:00" } });

    const following = await saturday();
    following.engine.choose(following.storyId, { after: following.head(), kind: "follow", who: "Hermione Granger", gap: null }, "trace-follow");
    expect(following.moved()).toMatchObject({ text: "I follow Hermione.", choice: { kind: "follow", who: ["Hermione Granger"], place: null, at: null } });

    const going = await saturday();
    going.engine.choose(going.storyId, { after: going.head(), kind: "somewhere", place: "The library", gap: null }, "trace-somewhere");
    expect(going.moved()).toMatchObject({ text: "I go to the library.", choice: { kind: "somewhere", place: "The library" } });

    const skipping = await saturday();
    skipping.engine.choose(skipping.storyId, { after: skipping.head(), kind: "skip", at: "Day 4 18:00", gap: "I sleep most of the day." }, "trace-skip");
    expect(skipping.moved()).toMatchObject({ text: "I sleep most of the day. I let the time pass until this evening: Saturday 6:00 pm.", choice: { kind: "skip", at: "Day 4 18:00" } });
  });

  it("refuses a choice the Day View does not offer, with the reason", async () => {
    const { engine, storyId, head } = await saturday();
    const refused = (request: Parameters<typeof engine.choose>[1]) => {
      try { engine.choose(storyId, request, "trace"); } catch (error) { return error instanceof LinkError ? error.message : String(error); }
      return "accepted";
    };
    expect(refused({ after: head(), kind: "go", happening: "p-unknown", gap: null })).toMatch(/not on today/);
    expect(refused({ after: head(), kind: "follow", who: "Severus Snape", gap: null })).toMatch(/cannot follow Severus Snape/);
    expect(refused({ after: head(), kind: "somewhere", place: "Azkaban", gap: null })).toMatch(/not one of the Story's places/);
    expect(refused({ after: head(), kind: "skip", at: "Day 3 08:00", gap: null })).toMatch(/not one of the times/);
  });

  it("refuses a choice while the World is still moving on", async () => {
    const played = playable(hogwartsWorldStoryFile({ at: "Day 3 22:40" }));
    await played.play("I say goodnight.");
    played.engine.endScene(played.storyId, played.head(), "trace-end");
    expect(() => played.engine.choose(played.storyId, { after: played.head(), kind: "story", gap: null }, "trace")).toThrow(/still moving on/);
  });
});

/** A Writer's answer opening a new Scene: [frame], at [clock], with [comesIn]. */
const opening = (frame: { title: string; place: string }, clock: string, comesIn: string[]) =>
  ({ leaves_scene: false, frame: { ...frame, purpose: "p", exit: "e" }, comes_in: comesIn, goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, clock, taste: null, in_play: [] });

describe("the Scene a choice opens", () => {
  // WHEN the player taps Let the Story choose
  // THEN the next Scene opens on the Story's own pick
  it("day-view › The player chooses where to be › Letting the Story choose", async () => {
    const elsewhere = opening({ title: "The library", place: "The library" }, "Day 4 08:00", ["Hermione Granger"]);
    const onThePick = opening({ title: "Accounts", place: "McGonagall's office" }, "Day 4 09:00", ["Minerva McGonagall", "Hermione Granger"]);
    const { engine, storyId, head, view, models } = await saturday([elsewhere, onThePick]);
    engine.choose(storyId, { after: head(), kind: "story", gap: null }, "trace-story");
    await engine.settled(storyId);
    expect(models.writer.requests.at(-1)!.prompt).toMatch(/frame: the player chose McGonagall's office; the Scene opens there/);
    expect(models.writer.requests.at(-1)!.prompt).toMatch(/clock: the Scene opens when the player chose, Day 4 09:00/);
    expect(models.writer.requests.at(-1)!.prompt).toMatch(/comes_in: Minerva McGonagall will be there/);
    expect(view().scene).toMatchObject({ title: "Accounts", place: "McGonagall's office", at: "Day 4 09:00" });
    expect(view().scene.people.map(person => person.name)).toEqual(["Minerva McGonagall", "Hermione Granger"]);
  });

  // WHEN the player chooses Follow and picks Hermione
  // THEN the next Scene opens wherever Hermione is going next, with her in it
  it("day-view › The player chooses where to be › Following someone", async () => {
    const without = opening({ title: "Breakfast", place: "The Great Hall" }, "Day 4 07:40", []);
    const withHer = opening({ title: "The library", place: "The library" }, "Day 4 07:40", ["Hermione Granger"]);
    const { engine, storyId, head, view, models } = await saturday([without, withHer]);
    engine.choose(storyId, { after: head(), kind: "follow", who: "Hermione Granger", gap: null }, "trace-follow");
    await engine.settled(storyId);
    expect(models.writer.requests.at(-2)!.prompt).toMatch(/The player follows Hermione Granger/);
    expect(models.writer.requests.at(-1)!.prompt).toMatch(/comes_in: Hermione Granger will be there/);
    expect(view().scene.people.map(person => person.name)).toContain("Hermione Granger");
  });

  it("opens at the place chosen, and at the time skipped to", async () => {
    const going = await saturday();
    going.engine.choose(going.storyId, { after: going.head(), kind: "somewhere", place: "The library", gap: null }, "trace-somewhere");
    await going.engine.settled(going.storyId);
    expect(going.view().scene).toMatchObject({ place: "The library" });
    const skipping = await saturday();
    skipping.engine.choose(skipping.storyId, { after: skipping.head(), kind: "skip", at: "Day 4 18:00", gap: null }, "trace-skip");
    await skipping.engine.settled(skipping.storyId);
    expect(skipping.view().scene).toMatchObject({ at: "Day 4 18:00" });
  });
});
