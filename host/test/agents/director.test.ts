import { describe, expect, it } from "vitest";
import { checkPlan, directionDue, directorPrompt, PEAK, planFollows, SCENES, writePlan } from "../../src/agents/director.js";
import { foldDue } from "../../src/agents/folder.js";
import { outlinePrompt } from "../../src/agents/outline.js";
import { AgentFailed, BUDGETS } from "../../src/agents/step.js";
import { FakeModels } from "../../src/models/fake.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { nothingBeside } from "../../src/story/beside.js";
import type { Outline } from "../../src/story/outline.js";
import type { PlannedScene } from "../../src/story/state.js";
import { formatDate } from "../../src/time.js";
import { malfoyProblemStoryFile } from "../support/story-files.js";
import { ledger, SONNET, type Ledger } from "./ledger.js";

const ARC = "Draconia comes round to Roopesh, slowly, against everything she was raised to be.";
const HALLOWEEN = "The Halloween feast";
const TRIWIZARD = "The Triwizard Tournament";

/** The first Act of the Outline the Director wrote as the Story started: three turns, and a door set up to pay off. */
const YEAR_ONE: Omit<Outline, "version"> = {
  current: 1,
  acts: [{
    number: 1, title: "Year One", question: "Can a Malfoy owe a Muggle-born her life and keep her name?", buildsTo: HALLOWEEN, detail: "detailed",
    turns: [
      { id: "T1", when: "the first week", what: "Draconia claims him in front of Slytherin.", serves: ["Draconia Malfoy"], state: "ahead" },
      { id: "T2", when: "the second week", what: "The flying lesson shows who is better than whom.", serves: ["Harry Potter"], state: "ahead" },
      { id: "T3", when: "Halloween", what: "The troll.", serves: ["Hermione Granger"], state: "ahead" }
    ],
    relationships: [], movers: [], handsOn: ""
  }],
  ending: "The war ends.", intentions: [],
  setups: [{ id: "U1", what: "A locked door on the fourth floor nobody admits to.", planted: null, payoff: "The troll came through it.", turn: "T3", state: "waiting", settled: null }],
  promoted: [], revisedAfter: 0, deep: true, lookedUp: []
};

/**
 * The Malfoy Problem on its first night, Friday 6 September 1991 (Day 1) at 9:40 pm, with the Tournament ahead and Halloween added after
 * it, as the player would add a Landmark, and Year One's Outline written; [people] join the Story's people.
 */
function malfoy(people: { name: string; who_they_are: string }[] = []): Ledger {
  const file = malfoyProblemStoryFile();
  file.people = [...file.people, ...people] as typeof file.people;
  const story = ledger(file);
  story.add({ kind: "landmark_set", landmark: { name: HALLOWEEN, at: "Day 61 19:00", what: "The feast, and the troll." } });
  story.add({ kind: "outline_set", outline: YEAR_ONE, reason: "The Story is starting.", planFollows: false, dropped: [], callId: "c", model: SONNET });
  return story;
}

const signal = () => new AbortController().signal;
const at = (story: Ledger) => ({ storyId: story.storyId, head: story.head() });

/** The date the Director writes for a Story day: Day 1 is Friday 6 September 1991. */
const dateOf = (day: number) => formatDate(day, "1991-09-06");

const charms = { id: "S1", date: dateOf(4), time: "14:00", place: "The Charms classroom", who: ["Draconia Malfoy", "hermione"], serves: { turn: "T1", lives: ["Draconia Malfoy"] }, for: "Flitwick pairs him with Draconia, and Hermione watches.", offer: "Flitwick is pairing people up for the practical.", headline: "Charms: Flitwick pairs him with Draconia", lead: "Draconia Malfoy", engagement: null, quiet: false };
const pitch = { id: "S2", date: dateOf(6), time: "10:00", place: "The Quidditch pitch", who: ["Draconia Malfoy", "Harry Potter"], serves: { turn: "T2", lives: [] }, for: "The flying lesson: Harry is better than her, and Roopesh is there to see it.", offer: "The first-years have their flying lesson.", headline: "The pitch: the flying lesson", lead: "Harry Potter", engagement: null, quiet: false };

/** A Stretch plan in the Director's format: six days from tonight, with two Scenes that matter and the Outline's door. */
function plan(changes: Record<string, unknown> = {}) {
  return {
    days: 6, toward: "the first flying lesson", landmark: null, phase: "build",
    scenes: [charms, pitch],
    new: [{ setup: "U1", kind: "mystery", scene: "S2", person: null }],
    leads: [
      { who: "Draconia Malfoy", move: "Has herself paired with him in Charms, and calls it a punishment.", scene: "S1" },
      { who: "Hermione Granger", move: "Leaves her Charms notes on his bed, annotated.", scene: null },
      { who: "Harry Potter", move: "Asks him to the pitch to watch the lesson.", scene: "S2" }
    ],
    arcs: [{ arc: ARC, now: "open contempt", next: "she defends him in front of Slytherin without meaning to", not_yet: "any kindness she admits to" }],
    roadmap: [{ arc: ARC, by: HALLOWEEN, stands: "She has claimed him in public once, and called it a debt." }, { arc: ARC, by: TRIWIZARD, stands: "She would not let anyone else near him, and still says nothing." }],
    premise: "Two Scenes with Draconia; the others with Hermione and classes.",
    ...changes
  };
}

const scene = (id: string, at: string, place: string, who: string[], headline: string, changes: Partial<PlannedScene> = {}): PlannedScene =>
  ({ id, at, place, who, serves: { turn: null, lives: who }, for: headline, offer: headline, headline, lead: null, engagement: null, quiet: false, ...changes });

/** Plays a Scene to its end on the ledger: opened, played at [peak], closed and recorded. */
function played(story: Ledger, title: string, at: string, who: string[], paragraph = `${title} was played.`, peak = 2) {
  story.open(title, title, at, who);
  story.move("I stay.");
  story.note({ intensity: peak });
  story.reply("They stay too.");
  story.close();
  story.chronicle({ paragraph });
}

describe("the Director's plan (openspec long-run: The Director shapes the long run around Arcs and Landmarks)", () => {
  it("is taken as a Stretch from today: its Scenes at their day and time, with ids of the code's, names as the Story keeps them", () => {
    const checked = checkPlan(malfoy().state(), plan());
    expect(checked).toMatchObject({ ok: true, dropped: [] });
    if (!checked.ok) return;
    const { value } = checked;
    expect(value).toMatchObject({ from: 1, until: 6, toward: "the first flying lesson", phase: "build", landmark: null, premise: "Two Scenes with Draconia; the others with Hermione and classes." });
    expect(value.scenes.map(item => ({ id: item.id, at: item.at, who: item.who, lead: item.lead, offer: item.offer, headline: item.headline }))).toEqual([
      { id: "s1.1", at: "Day 4 14:00", who: ["Draconia Malfoy", "Hermione Granger"], lead: "Draconia Malfoy", offer: charms.offer, headline: charms.headline },
      { id: "s1.2", at: "Day 6 10:00", who: ["Draconia Malfoy", "Harry Potter"], lead: "Harry Potter", offer: pitch.offer, headline: pitch.headline }
    ]);
    expect(value.leads).toEqual([
      { who: "Draconia Malfoy", move: "Has herself paired with him in Charms, and calls it a punishment.", scene: "s1.1" },
      { who: "Hermione Granger", move: "Leaves her Charms notes on his bed, annotated.", scene: null },
      { who: "Harry Potter", move: "Asks him to the pitch to watch the lesson.", scene: "s1.2" }
    ]);
    expect(value.newThings).toEqual([{ setup: "U1", kind: "mystery", what: "A locked door on the fourth floor nobody admits to.", scene: "s1.2", person: null }]);
    expect(value.scenes.map(item => item.serves)).toEqual([{ turn: "T1", lives: ["Draconia Malfoy"] }, { turn: "T2", lives: [] }]);
    expect(value.arcs).toEqual([{ arc: ARC, now: "open contempt", next: "she defends him in front of Slytherin without meaning to", notYet: "any kindness she admits to" }]);
  });

  it("keeps the Scenes that matter within the Stretch's days", () => {
    const state = malfoy().state();
    const short = checkPlan(state, plan({ days: 3 }));
    expect(short.ok && short.value.until).toBe(3);
    // A Scene put past the Stretch's last day is on its last day.
    expect(short.ok && short.value.scenes.map(item => item.at)).toEqual(["Day 3 10:00", "Day 3 14:00"]);
  });

  it("keeps the first five Scenes that matter, leaves out one not after now, and is sent back only with none it can keep", () => {
    const state = malfoy().state();
    const six = Array.from({ length: 6 }, (_, index) => ({ ...charms, id: `S${index + 1}`, date: dateOf(index + 1) }));
    const many = checkPlan(state, plan({ scenes: six }));
    expect(SCENES.max).toBe(5);
    expect(many.ok && many.value.scenes.map(item => item.at)).toEqual(["Day 2 14:00", "Day 3 14:00", "Day 4 14:00", "Day 5 14:00"]);
    expect(many.ok && many.dropped).toEqual(["scenes: S1 is not at a time after now"]);
    expect(checkPlan(state, plan({ scenes: [{ ...charms, date: dateOf(1), time: "08:00" }, { ...pitch, time: "ten" }] }))).toEqual({ ok: false, problems: ["scenes: none of the Scenes that matter can be kept; plan two to five, each after now, within the Stretch, each serving a turn of the current Act or someone's Life"] });
  });

  // GIVEN the Story has Rolanda Hooch and Minerva McGonagall
  // WHEN the plan's flying lesson names "Madam Hooch" and "Professor McGonagall"
  // THEN the Scene that matters has Rolanda Hooch and Minerva McGonagall in it, and nothing is left out or asked again
  it("living-world › Moments are remembered from one record › Named with a title", async () => {
    const story = malfoy([{ name: "Rolanda Hooch", who_they_are: "The flying instructor." }, { name: "Minerva McGonagall", who_they_are: "Head of Gryffindor." }]);
    const lesson = plan({ scenes: [charms, { ...pitch, who: ["Harry Potter", "Madam Hooch", "Professor McGonagall"] }] });
    const checked = checkPlan(story.state(), lesson);
    expect(checked.ok && checked.value.scenes[1]!.who).toEqual(["Harry Potter", "Rolanda Hooch", "Minerva McGonagall"]);
    expect(checked.ok && checked.dropped).toEqual([]);
    const runner = new ScriptedRunner([{ answer: JSON.stringify(lesson) }]);
    await writePlan(new Models(story.mac.db, { claude: runner }), [SONNET], story.state(), nothingBeside(), "A plan is due.", at(story), "trace-d", signal());
    expect(runner.requests).toHaveLength(1);
  });

  // GIVEN the Story has no librarian among its people
  // WHEN the Director plans a Scene that matters in the library
  // THEN everyone the Scene names is one of the Story's people, and the plan is not sent back for a name
  it("long-run › The Director shapes the long run around Arcs and Landmarks › Only the Story's people", async () => {
    const story = malfoy();
    const library = plan({ scenes: [charms, { ...pitch, place: "The library", who: ["Hermione Granger", "Madam Pince"] }] });
    const runner = new ScriptedRunner([{ answer: JSON.stringify(library) }]);
    const written = await writePlan(new Models(story.mac.db, { claude: runner }), [SONNET], story.state(), nothingBeside(), "A plan is due.", at(story), "trace-d", signal());
    expect(written.value.scenes[1]!.who).toEqual(["Hermione Granger"]);
    expect(written.value.scenes.flatMap(item => item.who).every(name => story.state().people[name])).toBe(true);
    expect(written.dropped).toEqual(["scenes.who: Madam Pince is not in the Story"]);
    expect(runner.requests).toHaveLength(1);
    const { system } = directorPrompt(story.state(), nothingBeside(), "A plan is due.");
    expect(system).toContain("`who` (story people besides the player's character)");
    expect(system).toContain("Places:\n- The Three Broomsticks: A pub in Hogsmeade.");
    // The Story's people are in layer 1, his character marked as the player's: never one the Director names in `who`.
    expect(system).toMatch(/<people>[^]*- Roopesh Gantasala, the player's character:/);
  });

  it("brings in a new person only as a setup of the Outline, and they join the Story's people and the Scene they enter in", () => {
    const story = malfoy();
    story.add({ kind: "outline_set", outline: { ...YEAR_ONE, setups: [...YEAR_ONE.setups, { id: "U2", what: "A stranger in Hogsmeade asking about the train.", planted: null, payoff: "He hired the masked wizards.", turn: "T3", state: "waiting", settled: null }] }, reason: "Revised.", planFollows: false, dropped: [], callId: "c", model: SONNET });
    const stranger = { setup: "U2", kind: "person", scene: "S1", person: { name: "Elspeth Vane", who_they_are: "A seventh-year who runs the Hogsmeade duelling club.", appearance: "Tall, ink on her cuffs." } };
    const checked = checkPlan(story.state(), plan({ new: [stranger, { ...stranger, setup: "U1", person: { ...stranger.person, name: "Draconia Malfoy" } }] }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.people).toEqual([{ name: "Elspeth Vane", aliases: [], whoTheyAre: "A seventh-year who runs the Hogsmeade duelling club.", known: null, appearance: "Tall, ink on her cuffs.", after: "", knows: [], voice: [], group: null }]);
    expect(checked.value.newThings).toEqual([{ setup: "U2", kind: "person", what: "A stranger in Hogsmeade asking about the train.", scene: "s1.1", person: "Elspeth Vane" }]);
    expect(checked.value.scenes[0]!.who).toEqual(["Draconia Malfoy", "Hermione Granger", "Elspeth Vane"]);
    expect(checked.dropped).toEqual(["new: Draconia Malfoy cannot be brought in: the story already has them"]);
  });

  it("gives every Lead a move, on screen in a Scene of the plan or off it, and holds an Arc it forgot", () => {
    const checked = checkPlan(malfoy().state(), plan({ leads: [{ who: "Draconia Malfoy", move: "Pairs herself with him.", scene: "S9" }, { who: "Harry Potter", move: "Asks him to the pitch.", scene: "S2" }], arcs: [] }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.leads).toEqual([
      { who: "Draconia Malfoy", move: "Pairs herself with him.", scene: null },
      { who: "Hermione Granger", move: "goes about their own life", scene: null },
      { who: "Harry Potter", move: "Asks him to the pitch.", scene: "s1.2" }
    ]);
    expect(checked.value.arcs).toEqual([{ arc: ARC, now: "where the last Scenes left it", next: "nothing; let the last step settle", notYet: "any step at all" }]);
    expect(checked.dropped).toEqual(["leads: no move for Hermione Granger", `arcs: no row for "${ARC}"; it holds where it is`]);
  });

  it("builds toward a Landmark by the Story's name for it, and toward none it does not have", () => {
    const state = malfoy().state();
    expect(checkPlan(state, plan({ landmark: "the halloween feast" }))).toMatchObject({ ok: true, value: { landmark: HALLOWEEN }, dropped: [] });
    expect(checkPlan(state, plan({ landmark: "The Yule Ball" }))).toMatchObject({ ok: true, value: { landmark: null }, dropped: ["landmark: \"The Yule Ball\" is not one of the Story's Landmarks; the Stretch builds toward none"] });
  });

  it("knows what he has arranged: a Scene that matters about it is that Engagement, at its time and place", () => {
    const story = malfoy();
    story.close();
    story.chronicle({ engagements: [{ id: "g-library", what: "Draconia, about the train and what she owes.", at: "Day 2 10:00", place: "The library", who: ["Draconia Malfoy"], expected: true, every: null, quotes: [] }] });
    const { prompt } = directorPrompt(story.state(), nothingBeside(), "A plan is due.");
    expect(prompt).toContain("- E1 Saturday 7 September 1991, 10:00 am, The library: Draconia, about the train and what she owes. With Draconia Malfoy. He is expected.");
    const checked = checkPlan(story.state(), plan({ scenes: [{ ...charms, who: ["Hermione Granger"], engagement: "E1" }, pitch] }));
    expect(checked.ok && checked.value.scenes[0]).toMatchObject({ at: "Day 2 10:00", place: "The library", who: ["Hermione Granger", "Draconia Malfoy"], engagement: "g-library" });
  });
});

describe("when the Director plans (one-truth design decision 8)", () => {
  /** The opening Scene ended, and the first Stretch planned: breakfast with Draconia on Monday, Charms on Wednesday. */
  function planned() {
    const story = malfoy();
    story.close();
    story.chronicle();
    expect(directionDue(story.state())).toBe("There is no plan yet: this is the Story's first.");
    story.plan({ from: 1, until: 6, scenes: [
      scene("s1.1", "Day 4 08:00", "The Great Hall", ["Draconia Malfoy"], "Breakfast: Draconia at the Slytherin table"),
      scene("s1.2", "Day 6 14:00", "The Charms classroom", ["Draconia Malfoy"], "Charms: paired with Draconia")
    ] });
    story.world();
    return story;
  }

  it("plans nothing new while the Stretch runs its course", () => {
    const story = planned();
    expect(directionDue(story.state())).toBeNull();
    story.move("I go to breakfast.", { kind: "story", place: "The Great Hall", at: "Day 4 08:00", who: ["Draconia Malfoy"], scene: "s1.1", engagement: null });
    played(story, "Breakfast", "Day 4 08:00", ["Draconia Malfoy"]);
    expect(directionDue(story.state())).toBeNull();
  });

  // GIVEN the Stretch's next Scene that matters is Draconia at breakfast on Monday
  // WHEN the player skips to Tuesday instead
  // THEN the Director plans again from where the Story now stands
  it("long-run › The Director shapes the long run around Arcs and Landmarks › Off the plan", () => {
    const story = planned();
    story.move("I keep to my room until Tuesday.", { kind: "skip", place: null, at: "Day 5 09:00", who: [], scene: null, engagement: null });
    played(story, "Tuesday", "Day 5 09:00", []);
    const reason = directionDue(story.state());
    expect(reason).toBe("The player went off the plan: Breakfast: Draconia at the Slytherin table (Monday 9 September 1991, 8:00 am) passed without him. Plan from where the story now is.");
    const { prompt } = directorPrompt(story.state(), nothingBeside(), reason!);
    expect(prompt).toContain(`<task>\n${reason} Plan the next Stretch, from today, Tuesday 10 September 1991.\nIt is the next step of Act 1, Year One:`);
    expect(prompt).toContain("Scene 2, Tuesday (Tuesday 10 September 1991, 9:00 am): Tuesday was played.");
    expect(checkPlan(story.state(), plan()).ok && (checkPlan(story.state(), plan()) as { value: { from: number } }).value.from).toBe(5);
  });

  it("plans again once the Stretch's days have passed, or a Landmark it built toward has", () => {
    const story = planned();
    played(story, "A week on", "Day 8 09:00", []);
    expect(directionDue(story.state())).toBe("The player went off the plan: Breakfast: Draconia at the Slytherin table (Monday 9 September 1991, 8:00 am) passed without him. Plan from where the story now is.");
    const over = planned();
    over.plan({ from: 1, until: 3, landmark: null, scenes: [] });
    played(over, "Sunday", "Day 4 09:00", []);
    expect(directionDue(over.state())).toBe("The last Stretch has run its course.");
  });

  it("plans again once the Outline was re-planned deeply since the plan, and not after a focused revision", () => {
    const story = planned();
    played(story, "Breakfast", "Day 4 08:00", ["Draconia Malfoy"]);
    story.add({ kind: "outline_set", outline: { ...YEAR_ONE, revisedAfter: 2, deep: false }, reason: "Scene 2 has ended.", planFollows: false, dropped: [], callId: "c", model: SONNET });
    expect(directionDue(story.state())).toBeNull();
    story.add({ kind: "outline_set", outline: { ...YEAR_ONE, revisedAfter: 2, deep: true }, reason: "Lucius is dead.", planFollows: true, dropped: [], callId: "c", model: SONNET });
    expect(directionDue(story.state())).toBe("The Outline was re-planned after Scene 2: plan the Stretch as the next step of Year One as it now stands.");
  });

  it("says whether a Stretch plan follows the Outline in the same step: always after a deep re-plan, after a focused one only when due", () => {
    const story = planned();
    played(story, "Breakfast", "Day 4 08:00", ["Draconia Malfoy"]);
    expect(planFollows(story.state(), { ...YEAR_ONE, revisedAfter: 2, deep: false })).toBe(false);
    expect(planFollows(story.state(), { ...YEAR_ONE, revisedAfter: 2, deep: true })).toBe(true);
    played(story, "A week on", "Day 12 09:00", []);
    expect(planFollows(story.state(), { ...YEAR_ONE, revisedAfter: 3, deep: false })).toBe(true);
  });

  // GIVEN Scene 7 peaked
  // WHEN the Director plans the Stretch after it
  // THEN its first Scene that matters is quiet, and its others build again
  // (Whether the plan's Scenes are right for a breath is the live check's; here, that the Director is told of the peak
  // and the rule, that nothing forces a rest Stretch, and that a quiet first Scene is kept as one.)
  it("long-run › Rest is deliberate › A breath, not a week", async () => {
    const story = planned();
    for (const [index, day] of [2, 3, 4, 5, 5].entries()) played(story, `Scene ${index + 2}`, `Day ${day} ${10 + index}:00`, []);
    played(story, "The Great Hall", "Day 5 19:00", ["Draconia Malfoy"], "Draconia chose him in front of her House.", PEAK);
    expect(story.state().curve.at(-1)).toEqual({ scene: 7, title: "The Great Hall", peak: 5 });
    const reason = directionDue(story.state());
    expect(reason).toBe("Scene 7, The Great Hall, peaked: give the characters a breath, then build again.");
    const { system, prompt } = directorPrompt(story.state(), nothingBeside(), reason!);
    expect(prompt).toContain("- Scene 6, Scene 6: 2\n- Scene 7, The Great Hall: 5\n</pace>");
    expect(system.replace(/\s+/g, " ")).toContain("After a peak, make the first Scene `quiet: true` (ordinary breath, zero threats or hooks).");
    // A breath, then building again, is kept as planned: nothing makes the Stretch a rest.
    const breath = checkPlan(story.state(), plan({ scenes: [{ ...charms, date: dateOf(6), quiet: true }, { ...pitch, date: dateOf(10) }] }));
    expect(breath.ok && breath.value).toMatchObject({ phase: "build", scenes: [{ quiet: true }, { quiet: false }] });
    // The Director the pipeline runs on when no model answers is told of the peak, and answers so.
    const fake = new FakeModels();
    const written = await writePlan(new Models(story.mac.db, { claude: fake }), [SONNET], story.state(), nothingBeside(), reason!, at(story), "trace-d", signal());
    expect(fake.requests[0]!.facts).toMatchObject({ afterPeak: true });
    expect(written.value.scenes.map(item => item.quiet)).toEqual([true, false]);
    // Once the Director has planned after the peak, the peak does not call for another plan.
    story.plan({ ...written.value, afterScene: 7 });
    expect(directionDue(story.state())).toBeNull();
  });

  // GIVEN the last three Stretches each had Hermione at the library's end table
  // WHEN the Director plans the next Stretch
  // THEN no Scene that matters in it puts Hermione at the library's end table
  // (What it plans instead is the live check's; here, that it is shown the last three Stretches' Scenes, with who was
  // where, and told to plan none of the same shape.)
  it("long-run › The Director shapes the long run around Arcs and Landmarks › Not the same week twice", () => {
    const story = malfoy();
    story.close();
    story.chronicle();
    const endTable = (id: string, at: string) => scene(id, at, "The library's end table", ["Hermione Granger"], "The end table: revision with Hermione");
    story.plan({ scenes: [endTable("s1.1", "Day 2 19:30"), scene("s1.2", "Day 3 10:00", "The Great Hall", ["Draconia Malfoy"], "Breakfast: Draconia")] });
    story.plan({ scenes: [endTable("s2.1", "Day 9 19:30"), scene("s2.2", "Day 10 10:00", "The Quidditch pitch", ["Harry Potter"], "The pitch: Harry flies")] });
    story.plan({ scenes: [endTable("s3.1", "Day 16 19:30"), scene("s3.2", "Day 17 15:00", "The owlery", ["Draconia Malfoy"], "The owlery: a letter from her father")] });
    const { system, prompt } = directorPrompt(story.state(), nothingBeside(), "The last Stretch has run its course.");
    expect(prompt).toContain([
      "<recent_stretches>",
      "Stretch 1:\n- The end table: revision with Hermione (The library's end table; Hermione Granger)\n- Breakfast: Draconia (The Great Hall; Draconia Malfoy)",
      "Stretch 2:\n- The end table: revision with Hermione (The library's end table; Hermione Granger)\n- The pitch: Harry flies (The Quidditch pitch; Harry Potter)",
      "Stretch 3:\n- The end table: revision with Hermione (The library's end table; Hermione Granger)\n- The owlery: a letter from her father (The owlery; Draconia Malfoy)",
      "</recent_stretches>"
    ].join("\n"));
    expect(system.replace(/\s+/g, " ")).toContain("Avoid repeating shapes from `recent_stretches`.");
  });

  // GIVEN in Scene 4 Hermione confronted him about the light on the train, and he lied to her
  // WHEN the Director plans the Stretch after Scene 9
  // THEN it is given the confrontation and the lie, not only Scene 4's title
  it("living-world › Every agent knows the Story So Far › The Director knows what happened", async () => {
    const story = malfoy();
    story.close();
    story.chronicle();
    const confrontation = "On the stairs Hermione confronted Roopesh about the light she saw on the train; he told her it was a lantern, and she knew it was a lie.";
    for (let number = 2; number <= 9; number++) {
      played(story, number === 4 ? "The stairs" : `Scene ${number}`, `Day ${number} 10:00`, ["Hermione Granger"], number === 4 ? confrontation : `Scene ${number} passed quietly.`);
      // The Scene's end goes on as the pipeline runs it: the Folder folds when The Story So Far needs it.
      const due = foldDue(story.state());
      if (due) story.fold({ into: due.into, count: due.parts.length, from: due.parts[0]!.from, until: due.parts.at(-1)!.until, text: due.parts.map(part => part.text).join(" ") });
    }
    expect(story.state().clock).toMatch(/^Day 9 /);
    const runner = new ScriptedRunner([{ answer: JSON.stringify(plan({ scenes: [{ ...charms, date: dateOf(12) }, { ...pitch, date: dateOf(14) }] })) }]);
    await writePlan(new Models(story.mac.db, { claude: runner }), [SONNET], story.state(), nothingBeside(), directionDue(story.state())!, at(story), "trace-d", signal());
    const sent = runner.requests[0]!.prompt;
    expect(sent).toContain(confrontation);
    expect(sent.indexOf(confrontation)).toBeGreaterThan(sent.indexOf("<story_so_far>"));
    expect(sent.indexOf(confrontation)).toBeLessThan(sent.indexOf("</story_so_far>"));
  });
});

describe("Arcs keep pace with the run (openspec long-run)", () => {
  /** The Malfoy Problem as the player built it: four years and a fifth, with Halloween eight weeks off. */
  function fourYears() {
    const story = malfoy();
    story.add({ kind: "landmark_set", landmark: { name: "Voldemort's defeat", at: "Day 1825 23:00", what: "The end of the war." } });
    return story;
  }

  // GIVEN a Story whose romance Arc must run four years, with the Halloween troll eight weeks away
  // WHEN the Director plans a Stretch in the first month
  // THEN its roadmap says where Draconia should stand with him by Halloween, and the Stretch's step moves her toward it
  // (That the step moves her toward it is the live check's; here, that the Director is given the run, soonest
  // Landmark first, and the rule, and that its roadmap by Halloween is kept.)
  it("long-run › Arcs keep pace with the run › Four years of romance, paced", async () => {
    const story = fourYears();
    const { system, prompt } = directorPrompt(story.state(), nothingBeside(), "There is no plan yet: this is the Story's first.");
    expect(prompt).toContain(`<the_run>\nToday is Friday 6 September 1991. The dates a Stretch from today can use: 1991-09-06 (Friday 6 September), 1991-09-07 (Saturday 7 September), 1991-09-08 (Sunday 8 September), 1991-09-09 (Monday 9 September), 1991-09-10 (Tuesday 10 September), 1991-09-11 (Wednesday 11 September). The Story runs to Voldemort's defeat, Tuesday 3 September 1996, 11:00 pm. Next: ${HALLOWEEN}, Tuesday 5 November 1991, 7:00 pm; then ${TRIWIZARD}, Wednesday 25 August 1993, 6:00 pm.\n</the_run>`);
    const rules = system.replace(/\s+/g, " ");
    expect(rules).toContain("exact Arc names with `now` / `next` / `not_yet`, and `roadmap` targets by the next two Landmarks.");
    const fake = new FakeModels();
    const written = await writePlan(new Models(story.mac.db, { claude: fake }), [SONNET], story.state(), nothingBeside(), "There is no plan yet: this is the Story's first.", at(story), "trace-d", signal());
    expect(fake.requests[0]!.facts).toMatchObject({ coming: [HALLOWEEN, TRIWIZARD] });
    expect(written.value.roadmap.map(point => [point.arc, point.by])).toEqual([[ARC, HALLOWEEN], [ARC, TRIWIZARD]]);
  });

  // GIVEN the roadmap expected a first public claim by Halloween
  // WHEN the player's Moves bring it about in the second week
  // THEN the next Stretch's roadmap moves its later points on from there, and does not hold the Arc back to wait for
  //   its dates
  // (Whether the Director moves it on is the live check's; here, that it reads its last roadmap, what happened, and
  // the rule.)
  it("long-run › Arcs keep pace with the run › The roadmap follows the player", () => {
    const story = fourYears();
    story.close();
    story.chronicle();
    story.plan({ arcs: [{ arc: ARC, now: "open contempt", next: "a grudging truce", notYet: "any public claim" }], roadmap: [{ arc: ARC, by: HALLOWEEN, stands: "Her first public claim on him." }] });
    played(story, "The Great Hall", "Day 9 08:00", ["Draconia Malfoy"], "In front of all Slytherin, Draconia said he was hers to insult and no one else's.");
    const { system, prompt } = directorPrompt(story.state(), nothingBeside(), "The last Stretch has run its course.");
    expect(prompt).toContain(`<last_plan>\n- ${ARC}: was open contempt; next a grudging truce; not yet any public claim\n- Roadmap: ${ARC}, by ${HALLOWEEN}: Her first public claim on him.\n</last_plan>`);
    expect(prompt).toContain("In front of all Slytherin, Draconia said he was hers to insult and no one else's.");
    expect(system.replace(/\s+/g, " ")).toContain("Build on what happened; never rewrite the past or force the story back onto an obsolete track.");
  });
});

describe("the Director's call", () => {
  // The four layers (docs/research/design.md decision 14), as every agent reads the Story.
  it("reads the Story in four layers: its instructions and the Story, where things stand, the Scene, then the run, the pace and its task", () => {
    const story = malfoy();
    story.close();
    story.chronicle({ paragraph: "Draconia mocked Roopesh in front of the whole pub." });
    const beside = { ...nothingBeside(), brief: { more: ["more danger"], less: ["the library"] }, playerTaste: ["don't decide what my character feels"] };
    const { system, prompt } = directorPrompt(story.state(), beside, "There is no plan yet: this is the Story's first.");
    // Layer 1, cached: the shared Story Bible first, then how the Director works.
    expect(system.startsWith("<story>\nTitle:")).toBe(true);
    expect(system).toContain("You are the Story's Director.");
    expect(system).toContain("Premise: An enemies-to-lovers romance with Draconia Malfoy");
    expect(system).toContain(`- ${ARC}`);
    // Layer 2, where things stand: The Story So Far first, the Outline, the player's wishes, who matters now.
    expect(prompt.indexOf("<story_so_far>")).toBe(0);
    expect(prompt).toContain("Scene 1, The insult (Friday 6 September 1991, 9:40 pm): Draconia mocked Roopesh in front of the whole pub.");
    expect(prompt).toContain("<outline>\nWhere the Story is going, the Outline, as last revised when the Story started.\nAct 1, Year One, now. Its question: Can a Malfoy owe a Muggle-born her life and keep her name? It builds to The Halloween feast.");
    expect(prompt).toContain("Less of:\n- the library");
    expect(prompt).toContain("Taste, the lessons the player has taught:\n- don't decide what my character feels");
    expect(prompt).toContain("<people_now>\nWho each person who matters is now, as of the last Scene's end.");
    expect(prompt).toContain("\nDraconia Malfoy\n  Now: as when the Story began.");
    // Layer 3, the Scene that ended; layer 4, this moment: the time, whose Life is kept how, the run, the pace, the task.
    expect(prompt.indexOf("<scene>\nThe insult.")).toBeGreaterThan(prompt.indexOf("</people_now>"));
    expect(prompt.indexOf("<now>\nIt is Friday 6 September 1991, 9:40 pm (1991-09-06 21:40).\n</now>")).toBeGreaterThan(prompt.indexOf("</scene>"));
    expect(prompt).toContain("<lives_by_tier>\nClose, each with a full Life: Draconia Malfoy (a Lead), Hermione Granger (a Lead), Harry Potter (a Lead).");
    expect(prompt).toContain("<pace>\n- Scene 1, The insult: 0\n</pace>");
    expect(prompt.endsWith("<task>\nThere is no plan yet: this is the Story's first. Plan the next Stretch, from today, Friday 6 September 1991.\nIt is the next step of Act 1, Year One: every Scene that matters serves one of its turns or someone's Life, and nothing enters but a setup the Outline means to pay off.\n</task>")).toBe(true);
  });

  it("is given the same layer 1 for the Stretch as for the Outline, so the provider caches it across both", () => {
    const story = malfoy();
    story.close();
    story.chronicle();
    const stretch = directorPrompt(story.state(), nothingBeside(), "A plan is due.");
    const outline = outlinePrompt(story.state(), nothingBeside(), { why: "focused", reason: "Scene 1 has ended." });
    expect(stretch.system).toBe(outline.system);
    expect(stretch.prompt.slice(0, stretch.prompt.indexOf("<now>"))).toBe(outline.prompt.slice(0, outline.prompt.indexOf("<now>")));
  });

  it("is one step: a plan with nothing it can keep is sent back once, and the step fails only when neither model gives one", async () => {
    const story = malfoy();
    const servingNothing = plan({ scenes: [charms, pitch].map(item => ({ ...item, serves: { turn: null, lives: [] } })) });
    const runner = new ScriptedRunner([{ answer: JSON.stringify(servingNothing) }, { answer: JSON.stringify(plan()) }]);
    const written = await writePlan(new Models(story.mac.db, { claude: runner }), [SONNET], story.state(), nothingBeside(), "A plan is due.", at(story), "trace-d", signal());
    expect(written.value.toward).toBe("the first flying lesson");
    expect(runner.requests[1]!.prompt).toContain("- scenes: none of the Scenes that matter can be kept; plan two to five, each after now, within the Stretch, each serving a turn of the current Act or someone's Life");
    const failing = new ScriptedRunner([{ answer: JSON.stringify({ toward: "x" }) }, { answer: JSON.stringify(plan({ scenes: [] })) }]);
    await expect(writePlan(new Models(story.mac.db, { claude: failing }), [SONNET], story.state(), nothingBeside(), "A plan is due.", at(story), "trace-d", signal())).rejects.toBeInstanceOf(AgentFailed);
  });

  it("works in the Director's few steps, with the Story's tools and not the web", async () => {
    const story = malfoy();
    const runner = new ScriptedRunner([{ answer: JSON.stringify(plan()) }]);
    await writePlan(new Models(story.mac.db, { claude: runner }), [SONNET], story.state(), nothingBeside(), "A plan is due.", at(story), "trace-d", signal());
    expect(runner.requests[0]).toMatchObject({ tools: { story: at(story), web: false }, turns: BUDGETS.directorFocused.turns });
  });
});
