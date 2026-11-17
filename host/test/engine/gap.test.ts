import { describe, expect, it } from "vitest";
import { emptyUpdate } from "../../src/story/truth.js";
import type { MoveWritten, WorldMoved } from "../../src/story/entries.js";
import { minutesOf, parseStoryTime } from "../../src/time.js";
import { betweenKey } from "../../src/story/truth.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
/** A Writer's answer, with [changes]. */
const writer = (changes: Record<string, unknown>) => ({ answer: JSON.stringify({ leaves_scene: false, frame: null, comes_in: [], goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, minutes: 2, taste: null, in_play: [], moves_to: null, ...changes }) });

/**
 * The Director's plan: Saturday's Scene that matters is the hospital wing at 11:00, about Draconia, serving the first
 * turn of the Act the scripted Director outlines, and bringing in that Outline's locked door.
 */
const plan = {
  days: 4, toward: "Draconia's flying test", landmark: null, phase: "build",
  scenes: [{ id: "S1", date: "1991-09-07", time: "11:00", place: "Outside the hospital wing", who: ["Draconia Malfoy", "Severus Snape"], serves: { turn: "T1", lives: ["Draconia Malfoy"] }, for: "Draconia needs a witness.", offer: "Draconia is fighting Snape for her bed back.", headline: "The hospital wing: Draconia wants out", lead: "Draconia Malfoy", engagement: null, quiet: false }],
  new: [{ setup: "U1", kind: "mystery", scene: "S1", person: null }],
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
    const order = models.requests.filter(request => ["weaver", "actor"].includes(request.agent)).map(request => request.agent);
    expect(order.slice(-2)).toEqual(["weaver", "actor"]);
    expect(models.weaver.requests.at(-1)!.prompt).toContain("- G1 Saturday 7 September 1991, 9:00 am, McGonagall's office: Your account of the troll. With Minerva McGonagall, Hermione Granger. He was expected.");
    // The World's move over the Gap is on the Path right after the Move, and what was missed keeps its time and place.
    const gap = mac.tree.pathTo(head()).find(entry => entry.parentId === move.id)!;
    expect(gap.payload).toMatchObject({ kind: "world_moved", truth: emptyUpdate(), gap: true, from: "Day 4 07:30", until: "Day 4 11:00",
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
    expect(mac.tree.pathTo(head()).find(entry => entry.parentId === lastMove().id)!.payload).toMatchObject({ kind: "world_moved", truth: emptyUpdate(), gap: true });
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
    expect(`${atTheHospital.system}\n${atTheHospital.prompt}`).toContain("asked Hermione where he was"); // Author knows; characters still use their own knowledge.

    models.writer.then(writer({ leaves_scene: true, frame: { title: "The office", place: "McGonagall's office", purpose: "p", exit: "e" }, comes_in: ["Minerva McGonagall"], minutes: 60 }));
    engine.move(storyId, "At noon I knock on McGonagall's door.", head(), "trace-office");
    await engine.settled(storyId);
    const withMcGonagall = models.actor.requests.at(-1)!;
    expect(withMcGonagall.prompt).toContain("McGonagall's office: McGonagall took the accounts of the troll without Roopesh, and asked Hermione where he was. Known to Minerva McGonagall and Hermione Granger.");
  });
});

describe("a span skipped as asked (openspec living-world: Off-screen time is resolved only as far as it reaches the player)", () => {
  const skip = "A month passes. I go to my classes, and spend my evenings in the library with Draconia and Hermione. Their feelings for me grow.";
  /** Overnight, Draconia sets him a session at the library's end table every Wednesday evening, and he is expected. */
  const wednesdays = {
    lives: [], threads: [], on: [],
    happened: [{ id: "H1", what: "Draconia left word: the end table in the library, every Wednesday at half past seven.", at: "Day 4 07:00", where: "The Slytherin common room", known_to: ["Draconia Malfoy", "Roopesh Gantasala"], landmark: null, move: null, missed: null }],
    meanwhile: [{ text: "Draconia's note: the end table, Wednesdays, half past seven. Don't be late.", how: "told", happened: "H1", told_by: "Draconia Malfoy", about: ["Draconia Malfoy"],
      engagement: { what: "Draconia's Wednesday session at the end table.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week" } }]
  };
  const grown = (who: string, feels: string) => ({ who, now: `${who.split(" ")[0]} spends her evenings in the library with him.`, feelings: [{ about: "Roopesh Gantasala", feels }], wants: "Him, though she would not say so.", hides: "How much she looks forward to the evenings." });
  const session = (label: string, at: string) => ({ id: label, what: "Draconia kept her Wednesday session at the end table, and Roopesh came.", at, where: "The library", known_to: ["Draconia Malfoy", "Roopesh Gantasala"], landmark: null, move: null, missed: label.replace("W", "G") });
  /** The month as his Move has it: with him there, the girls' feelings for him grown by its end. */
  const month = {
    lives: [], threads: [], meanwhile: [], on: [],
    happened: [
      { id: "H1", what: "Every evening that month, Draconia and Hermione sat with Roopesh at the library's end table.", at: "Day 20 20:00", where: "The library", known_to: ["Draconia Malfoy", "Hermione Granger", "Roopesh Gantasala"], landmark: null, move: null, missed: null },
      session("W1", "Day 8 19:30"), session("W2", "Day 15 19:30"), session("W3", "Day 22 19:30"), session("W4", "Day 29 19:30")
    ],
    truth: {
      people: [grown("Draconia Malfoy", "She waits for him at the end table, and has stopped pretending she comes for the books."), grown("Hermione Granger", "Fonder of him than she will admit.")],
      beliefs: { open: [], close: [] },
      between: [
        { people: ["Roopesh Gantasala", "Draconia Malfoy"], stands: "A month of evenings together; she waits for him now.", turn: "She stopped pretending she came for the books." },
        { people: ["Roopesh Gantasala", "Hermione Granger"], stands: "She saves him the seat beside hers.", turn: "A month of evenings in the library." }
      ],
      truths: { open: [], close: [] }, rules: { open: [], close: [] }, names: []
    }
  };

  // GIVEN the player skips a month and writes that the girls' feelings for him grow
  // WHEN the World moves on over the month
  // THEN it is lived with him there, as the Move said, and their feelings have grown at its end
  it("living-world › Off-screen time is resolved only as far as it reaches the player › A month skipped as asked", async () => {
    const story = hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] });
    story.landmarks = [{ name: "Half-term", at: "Day 34 08:00", what: "Half-term begins, and the school empties for the week." }];
    const played = playable(story, { weaver: [wednesdays, month].map(answer => ({ answer: JSON.stringify(answer) })) });
    const { engine, storyId, head, view, state, models, mac } = played;
    await played.play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    const halfTerm = view().day_view!.choices.skips.find(item => item.label === "Half-term")!;
    expect(halfTerm.days_away).toBe(30);

    engine.choose(storyId, { after: head(), kind: "skip", at: halfTerm.at, gap: skip }, "trace-skip");
    await engine.settled(storyId);

    // The month is lived as his Move says it was spent, with him there: Draconia's Wednesdays were on in it, and he
    // was expected at each.
    const asked = models.weaver.requests.at(-1)!;
    expect(asked.facts).toMatchObject({ gap: true, from: "Day 4 07:30", until: "Day 34 08:00" });
    expect(asked.prompt).toContain(`<the_gap>\n<move by="Roopesh Gantasala">\n${skip}`);
    expect(asked.prompt).toContain("Live the span as it says, with him there where it puts him");
    expect(asked.prompt).toContain("- G1 Wednesday 11 September 1991, 7:30 pm, The library: Draconia's Wednesday session at the end table. With Draconia Malfoy. He was expected.");
    expect(asked.prompt).toContain("- G4 Wednesday 2 October 1991, 7:30 pm, The library");
    expect(asked.prompt).not.toContain("<missed>");
    const lived = mac.tree.pathTo(head()).map(entry => entry.payload).find((payload): payload is WorldMoved => payload.kind === "world_moved" && payload.gap)!;
    expect(lived).toMatchObject({ gap: true, from: "Day 4 07:30", until: "Day 34 08:00" });
    // Every evening of it was with him: he knows it, and nothing says he did not come.
    const evenings = state().facts.filter(fact => lived.happened.some(item => item.id === fact.id));
    expect(evenings.map(fact => [fact.at, fact.knownTo.includes("Roopesh Gantasala")])).toEqual([
      ["Day 20 20:00", true], ["Day 8 19:30", true], ["Day 15 19:30", true], ["Day 22 19:30", true], ["Day 29 19:30", true]
    ]);
    expect(state().facts.some(fact => /did not come|without him/.test(fact.what))).toBe(false);

    // Their feelings have grown by its end, and the Scene it opens is written from the month as it was lived.
    expect(state().truth.now["Draconia Malfoy"]!.feelings).toEqual([{ about: "Roopesh Gantasala", feels: "She waits for him at the end table, and has stopped pretending she comes for the books." }]);
    expect(state().truth.now["Hermione Granger"]!.feelings[0]).toEqual({ about: "Roopesh Gantasala", feels: "Fonder of him than she will admit." });
    expect(state().truth.between[betweenKey("Draconia Malfoy", "Roopesh Gantasala")]).toMatchObject({ stands: "A month of evenings together; she waits for him now." });
    expect(state().scene).toMatchObject({ number: 2, at: "Day 34 08:00" });
    expect(models.writer.requests.at(-1)!.prompt).toContain("Every evening that month, Draconia and Hermione sat with Roopesh at the library's end table. Known to Draconia Malfoy, Hermione Granger and Roopesh Gantasala.");

    // The month is not lived again as one he missed when the next Scene ends.
    engine.endScene(storyId, head(), "trace-end-2");
    await engine.ended(storyId);
    const next = models.weaver.requests.at(-1)!;
    expect(next.facts).toMatchObject({ gap: false });
    const before = (at: string) => minutesOf(parseStoryTime(at)!) < minutesOf(parseStoryTime("Day 34 08:00")!);
    expect((next.facts as { missed: { at: string }[] }).missed.filter(item => before(item.at))).toEqual([]);
  });
});

