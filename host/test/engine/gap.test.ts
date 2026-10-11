import { describe, expect, it } from "vitest";
import type { MoveWritten } from "../../src/story/entries.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
/** A Writer's answer, with [changes]. */
const writer = (changes: Record<string, unknown>) => ({ answer: JSON.stringify({ leaves_scene: false, frame: null, comes_in: [], goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, minutes: 2, taste: null, in_play: [], moves_to: null, ...changes }) });

/** The Director's plan: Saturday's Scene that matters is the hospital wing at 11:00, about Draconia. */
const plan = {
  days: 4, toward: "Draconia's flying test", landmark: null, phase: "build",
  scenes: [{ id: "S1", day: 0, time: "11:00", place: "Outside the hospital wing", who: ["Draconia Malfoy", "Severus Snape"], for: "Draconia needs a witness.", offer: "Draconia is fighting Snape for her bed back.", headline: "The hospital wing: Draconia wants out", lead: "Draconia Malfoy", engagement: null, quiet: false }],
  new: [{ kind: "mystery", what: "Who hexed Draconia's broom.", scene: "S1", person: null }],
  leads: [{ who: "Draconia Malfoy", move: "She makes him her witness.", scene: "S1" }, { who: "Hermione Granger", move: "She asks where he was.", scene: "S1" }],
  arcs: [], roadmap: [], premise: "The romance turns on a debt."
};

/** The World overnight: McGonagall's note summons him to her office at 9:00, and he is expected. */
const overnight = {
  lives: [], threads: [],
  happened: [{ id: "H1", what: "McGonagall left a note for Roopesh: his account of the troll, in her office, at nine.", at: "Day 4 07:00", where: "The Gryffindor common room", known_to: ["Minerva McGonagall", "Roopesh Gantasala"], landmark: null, move: null, missed: null }],
  meanwhile: [{ text: "McGonagall's note: your account of the troll, my office, nine o'clock.", how: "told", happened: "H1", told_by: "Minerva McGonagall", about: ["Minerva McGonagall"],
    engagement: { what: "Your account of the troll.", at: "Day 4 09:00", place: "McGonagall's office", who: ["Minerva McGonagall", "Hermione Granger"], expected: true, every: null } }],
  on: []
};

/** McGonagall's summons went on without him, and she noticed. */
const noticed = { lives: [], threads: [], happened: [{ id: "H1", what: "McGonagall took the accounts of the troll without Roopesh, and asked Hermione where he was.", at: "Day 4 09:20", where: "McGonagall's office", known_to: ["Minerva McGonagall", "Hermione Granger"], landmark: null, move: null, missed: "G1" }], meanwhile: [], on: [] };

/** Saturday 7:30 am: McGonagall's summons at 9:00, and the hospital wing at 11:00, the Story's pick. [weaver] answers after the night's. */
async function saturday(weaver: object[] = []) {
  const played = playable(hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] }),
    { director: [{ answer: JSON.stringify(plan) }], weaver: [overnight, ...weaver].map(answer => ({ answer: JSON.stringify(answer) })) });
  await played.play("I say goodnight to Hermione and go up.");
  played.engine.endScene(played.storyId, played.head(), "trace-end");
  await played.engine.ended(played.storyId);
  const id = (place: string) => played.view().day_view!.happenings.find(item => item.place === place)!.id;
  const lastMove = () => played.mac.tree.pathTo(played.head()).filter(entry => entry.payload.kind === "move").at(-1)!;
  return { ...played, id, lastMove };
}

describe("a blank Gap depends on the day (blank-gaps-and-headlines design decision 1)", () => {
  // GIVEN he is in the Three Broomsticks on Friday night
  // WHEN the player skips to next week and leaves the Gap blank
  // THEN the Gap says he goes about his days quietly, and nowhere says he spent the week in the Three Broomsticks
  it("day-view › The Gap is the player's, and everything in it goes on without them › A blank week", async () => {
    const played = playable(hogwartsWorldStoryFile({ title: "Freshers' Friday", place: "The Three Broomsticks", at: "Day 3 21:40", who: ["Hermione Granger"] }));
    await played.play("I finish my butterbeer.");
    played.engine.endScene(played.storyId, played.head(), "trace-end");
    await played.engine.ended(played.storyId);
    const week = played.view().day_view!.choices.skips.find(skip => skip.label === "Next week")!;
    played.engine.choose(played.storyId, { after: played.head(), kind: "skip", at: week.at, gap: null }, "trace-skip");
    await played.engine.settled(played.storyId);
    const move = (played.mac.tree.pathTo(played.head()).filter(entry => entry.payload.kind === "move").at(-1)!.payload as MoveWritten).text;
    expect(move).toMatch(/^I go about my days quietly until then\. I let the time pass until next week/);
    expect(move).not.toContain("Three Broomsticks");
  });
});

describe("the Gap", () => {
  // GIVEN it is 7:40 am, McGonagall expects the Player Character at 9:00, and Draconia is in the hospital wing at 11:00
  // WHEN the player goes to the hospital wing at 11:00 and leaves the Gap blank
  // THEN he spent the morning quietly where he was
  // AND McGonagall took the accounts without him and noticed his absence
  it("day-view › The Gap is the player's, and everything in it goes on without them › Skipping a summons", async () => {
    const { engine, storyId, head, id, mac, models, state, lastMove } = await saturday([noticed]);
    engine.choose(storyId, { after: head(), kind: "go", happening: id("Outside the hospital wing"), gap: null }, "trace-go");
    await engine.settled(storyId);
    const move = lastMove();
    expect((move.payload as MoveWritten).text).toMatch(/^I spend the time until then quietly in the Gryffindor common room\./);
    // The Gap is woven before the Writer plans the Scene, and McGonagall's summons goes on without him, noticed.
    const order = models.requests.filter(request => ["weaver", "writer"].includes(request.agent)).map(request => request.agent);
    expect(order.slice(-2)).toEqual(["weaver", "writer"]);
    expect(models.weaver.requests.at(-1)!.prompt).toContain("- G1 Day 4 09:00 (Saturday 9:00 am), McGonagall's office: Your account of the troll. With Minerva McGonagall, Hermione Granger. He was expected.");
    // The World's move over the Gap is on the Path right after the Move, and what was missed keeps its time and place.
    const gap = mac.tree.pathTo(head()).find(entry => entry.parentId === move.id)!;
    expect(gap.payload).toMatchObject({ kind: "world_moved", gap: true, from: "Day 4 07:30", until: "Day 4 11:00",
      happened: [{ what: "McGonagall took the accounts of the troll without Roopesh, and asked Hermione where he was.", at: "Day 4 09:00", where: "McGonagall's office", knownTo: ["Minerva McGonagall", "Hermione Granger"] }] });
    expect(state().facts.filter(fact => fact.source === "world").at(-1)).toMatchObject({ at: "Day 4 09:00", knownTo: ["Minerva McGonagall", "Hermione Granger"] });
    expect(models.writer.requests.at(-1)!.prompt).toContain("McGonagall took the accounts of the troll without Roopesh");
  });

  // WHEN the player goes to the hospital wing at 11:00 and writes "I spent the morning in the library reading about life debts"
  // THEN that is what he did, and the Story can draw on it later
  it("day-view › The Gap is the player's, and everything in it goes on without them › Filling the Gap", async () => {
    const { engine, storyId, head, id, state, models } = await saturday();
    const filled = "I spent the morning in the library reading about life debts.";
    engine.choose(storyId, { after: head(), kind: "go", happening: id("Outside the hospital wing"), gap: filled }, "trace-go");
    await engine.settled(storyId);
    expect(models.weaver.requests.at(-1)!.prompt).toContain(filled);
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    const quoted = state().facts.filter(fact => fact.source === "page").flatMap(fact => fact.quotes.map(quote => quote.text));
    expect(quoted.some(text => text.includes("reading about life debts"))).toBe(true);
  });

  // GIVEN the player goes to McGonagall at 9:00 and that Scene ends at 9:40
  // THEN the Day View returns at 9:40 with the hospital wing at 11:00 still ahead
  it("day-view › The Gap is the player's, and everything in it goes on without them › Both, in turn", async () => {
    const { engine, storyId, head, id, view, models } = await saturday();
    engine.choose(storyId, { after: head(), kind: "go", happening: id("McGonagall's office"), gap: "I wash and dress and go down." }, "trace-go");
    await engine.settled(storyId);
    expect(view().scene).toMatchObject({ place: "McGonagall's office", at: "Day 4 09:00" });
    models.writer.then(writer({ minutes: 40 }));
    engine.move(storyId, "I tell her what I saw.", head(), "trace-move");
    await engine.settled(storyId);
    engine.endScene(storyId, head(), "trace-end-2");
    await engine.ended(storyId);
    const day = view().day_view!;
    expect(day).toMatchObject({ at: "Day 4 09:40", time: "9:40 am", scene_end: { step: null, failed: null } });
    expect(day.happenings.map(item => ({ place: item.place, time: item.time }))).toEqual([{ place: "Outside the hospital wing", time: "11:00 am" }]);
  });

  it("fails the turn when the Gap cannot be woven, with the reason, and Retry weaves it and goes on", async () => {
    const { engine, storyId, head, id, view, models, mac, lastMove } = await saturday();
    models.weaver.then({ fail: "Sonnet is overloaded" }, { fail: "GPT 6.1 Sol is overloaded" }, { answer: JSON.stringify(noticed) });
    engine.choose(storyId, { after: head(), kind: "go", happening: id("Outside the hospital wing"), gap: null }, "trace-go");
    await engine.settled(storyId);
    expect(view().turn).toMatchObject({ kind: "failed", job: "weaver", reason: expect.stringMatching(/could not be moved on: .*GPT 6\.1 Sol is overloaded/) });
    // The Move stays, waiting, and nothing after it was written.
    expect(mac.tree.entry(head())!.payload.kind).toBe("move");
    engine.retry(storyId, "trace-retry");
    await engine.settled(storyId);
    expect(view().turn.kind).toBe("idle");
    expect(view().scene.place).toBe("Outside the hospital wing");
    expect(mac.tree.pathTo(head()).find(entry => entry.parentId === lastMove().id)!.payload).toMatchObject({ kind: "world_moved", gap: true });
  });

  it("does not weave a short Gap with nothing in it", async () => {
    // Scene 1 ends and the Stretch is planned; the World makes Hermione's move, and has her in the courtyard at 10:30 on Sunday.
    const courtyard = { lives: [], threads: [], meanwhile: [], on: [{ at: "Day 5 10:30", place: "The courtyard", what: "Hermione is reading in the sun.", who: ["Hermione Granger"] }],
      happened: [{ id: "H1", what: "Hermione went to the library.", at: "Day 4 07:00", where: "The library", known_to: ["Hermione Granger"], landmark: null, move: "Hermione Granger", missed: null }] };
    const played = playable(hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] }), { weaver: [{ answer: JSON.stringify(courtyard) }] });
    const { engine, storyId, head, view, models } = played;
    await played.play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    // Scene 2 is the Stretch's first Scene that matters, on Sunday at 10:00; it ends two minutes on, with nothing due.
    engine.choose(storyId, { after: head(), kind: "story", gap: null }, "trace-story");
    await engine.settled(storyId);
    engine.endScene(storyId, head(), "trace-end-2");
    await engine.ended(storyId);
    const woven = models.weaver.requests.length;
    // Half an hour on, with nothing missed in it, no Lead's move still to make and no new plan to set going.
    const reading = view().day_view!.happenings.find(item => item.place === "The courtyard")!;
    engine.choose(storyId, { after: head(), kind: "go", happening: reading.id, gap: null }, "trace-go");
    await engine.settled(storyId);
    expect(models.weaver.requests).toHaveLength(woven);
    expect(view().scene).toMatchObject({ place: "The courtyard", at: "Day 5 10:30" });
  });

  // GIVEN the Player Character skipped McGonagall's 9:00 summons
  // WHEN he next meets McGonagall
  // THEN she knows he did not come, and acts on it
  it("day-view › Missing something has consequences › McGonagall answers the absence", async () => {
    const { engine, storyId, head, id, models } = await saturday([noticed]);
    engine.choose(storyId, { after: head(), kind: "go", happening: id("Outside the hospital wing"), gap: null }, "trace-go");
    await engine.settled(storyId);
    const atTheHospital = models.actor.requests.at(-1)!;
    expect(`${atTheHospital.system}\n${atTheHospital.prompt}`).not.toContain("asked Hermione where he was");

    models.writer.then(writer({ leaves_scene: true, frame: { title: "The office", place: "McGonagall's office", purpose: "p", exit: "e" }, comes_in: ["Minerva McGonagall"], minutes: 60 }));
    engine.move(storyId, "At noon I knock on McGonagall's door.", head(), "trace-office");
    await engine.settled(storyId);
    const withMcGonagall = models.actor.requests.at(-1)!;
    expect(withMcGonagall.system).toMatch(/<person name="Minerva McGonagall">[\s\S]*McGonagall took the accounts of the troll without Roopesh, and asked Hermione where he was\./);
    expect(withMcGonagall.prompt).toContain("known to Minerva McGonagall, Hermione Granger) McGonagall took the accounts of the troll without Roopesh, and asked Hermione where he was.");
  });
});
