import { describe, expect, it } from "vitest";
import { AgentFailed } from "../../src/agents/step.js";
import { checkWeave, movesDue, weaverPrompt, writeWeave, type WeaveAsk } from "../../src/agents/weaver.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { offersOn } from "../../src/story/day.js";
import { hogwartsWorldStoryFile, nightTrainStoryFile } from "../support/story-files.js";
import { ledger, SONNET, type Ledger } from "./ledger.js";

/** The common room after curfew, Friday Day 3, played to its end at 10:10 pm; he is next free on Saturday at 7:30 am. */
function ended(before: (story: Ledger) => void = () => {}, peak = 2): Ledger {
  const story = ledger(hogwartsWorldStoryFile());
  before(story);
  story.move("I say goodnight to Hermione and go up.");
  story.note({ clock: "Day 3 22:10", intensity: peak });
  story.reply("Hermione doesn't look up from her book.");
  story.close();
  story.chronicle();
  return story;
}

function ask(story: Ledger, changes: Partial<WeaveAsk> = {}): WeaveAsk {
  const state = story.state();
  return { state, from: state.scene!.endedAt!, until: state.clock, gap: false, scene: story.scene(), missed: [], ...changes };
}

const happening = (id: string, what: string, at: string, where: string, knownTo: string[], changes: Record<string, unknown> = {}) =>
  ({ id, what, at, where, known_to: knownTo, landmark: null, move: null, missed: null, ...changes });

function answer(changes: Record<string, unknown> = {}) {
  return {
    lives: [{ who: "Crabbe and Goyle", where: "the Slytherin common room", doing: "asleep after Draconia's errands", after: "Draconia's errands, and whatever she wants hit." }],
    threads: [{ name: "Quirrell and the third-floor door", now: "Quirrell has tried the wards twice and scorched the door" }],
    happened: [
      happening("H1", "Quirrell tested the third-floor door and scorched it.", "Day 4 02:00", "the third-floor corridor", ["Quirinus Quirrell"]),
      happening("H2", "McGonagall slid a note under Roopesh's door asking for his account of the troll.", "Day 4 06:45", "the boys' dormitory", ["Minerva McGonagall", "Roopesh Gantasala"]),
      happening("H3", "Lavender told everyone Selwyn's bones broke one after another.", "Day 4 06:55", "the Gryffindor common room", ["Lavender Brown"])
    ],
    meanwhile: [
      { text: "A note under the door: \"My office, nine o'clock. Bring only what you saw.\" M. McGonagall.", how: "seen", happened: "H2", told_by: null, about: ["mcgonagall"], engagement: null },
      { text: "Lavender says Selwyn's bones broke one after another, \"like someone snapping kindling\".", how: "rumour", happened: "H3", told_by: null, about: [], engagement: null }
    ],
    on: [{ at: "Day 4 20:00", place: "The Three Broomsticks", what: "The twins buy a round for anyone who saw the troll.", who: ["Harry Potter"] }],
    ...changes
  };
}

describe("the Weaver's move of the World (one-truth design decision 6)", () => {
  it("is taken with names as the Story keeps them, what happened given ids of the code's, and what is on after the span", () => {
    const story = ended();
    const checked = checkWeave(ask(story), answer({ lives: [{ who: "crabbe and goyle", where: "the dungeons", doing: "asleep", after: "Draconia's errands" }] }));
    expect(checked).toMatchObject({ ok: true, dropped: [] });
    if (!checked.ok) return;
    const { value } = checked;
    expect(value.lives).toEqual([{ who: "Crabbe and Goyle", where: "the dungeons", doing: "asleep", after: "Draconia's errands" }]);
    expect(value.happened.map(item => [item.at, item.knownTo])).toEqual([["Day 4 02:00", ["Quirinus Quirrell"]], ["Day 4 06:45", ["Minerva McGonagall", "Roopesh Gantasala"]], ["Day 4 06:55", ["Lavender Brown"]]]);
    const ids = value.happened.map(item => item.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every(id => /^h[0-9a-f]{8}$/.test(id))).toBe(true);
    expect(value.meanwhile.map(line => [line.fact, line.how, line.about])).toEqual([[ids[1], "seen", ["Minerva McGonagall"]], [ids[2], "rumour", []]]);
    expect(value.on).toEqual([{ id: expect.stringMatching(/^o/), at: "Day 4 20:00", place: "The Three Broomsticks", what: "The twins buy a round for anyone who saw the troll.", who: ["Harry Potter"] }]);
  });

  // Records degrade, never vanish (openspec living-world: Moments are remembered from one record).
  it("leaves out only the parts it cannot use, keeps happenings in the span, and asks nothing again", () => {
    const story = ended();
    const checked = checkWeave(ask(story), answer({
      lives: [{ who: "Roopesh Gantasala", where: "bed", doing: "sleeping", after: "x" }, { who: "Professor Dumbledore", where: "his office", doing: "thinking", after: "x" }],
      happened: [
        happening("H1", "Quirrell tested the door.", "Day 6 10:00", "the third floor", ["Quirinus Quirrell", "Lord Voldemort"]),
        happening("H2", "A note under the door.", "the small hours", "the dormitory", ["Minerva McGonagall"])
      ],
      meanwhile: [
        { text: "Someone was on the third floor.", how: "rumour", happened: "H1", told_by: "Lavender", about: ["Gilderoy Lockhart"], engagement: null },
        { text: "A note.", how: "seen", happened: "H2", told_by: null, about: [], engagement: null },
        ...Array.from({ length: 6 }, () => ({ text: "More talk.", how: "rumour", happened: "H1", told_by: null, about: [], engagement: null }))
      ],
      on: [{ at: "Day 4 06:00", place: "The Great Hall", what: "Breakfast.", who: [] }]
    }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.lives).toEqual([]);
    expect(checked.value.happened).toMatchObject([{ at: "Day 4 07:30", knownTo: ["Quirinus Quirrell"] }]);
    expect(checked.value.meanwhile).toHaveLength(5);
    expect(checked.value.meanwhile[0]).toMatchObject({ toldBy: "Lavender Brown", about: [] });
    expect(checked.value.on).toEqual([]);
    expect(checked.dropped).toEqual([
      "people: Lord Voldemort is not in the Story",
      "happened[1]: \"the small hours\" is not a story time",
      "people: Gilderoy Lockhart is not in the Story",
      "meanwhile[1]: H2 is not one of the happenings",
      "on[0]: \"Day 4 06:00\" is not after the span",
      "people: Professor Dumbledore is not in the Story"
    ]);
  });

  it("is sent back while a Landmark in the span has not happened, and takes it named as the Story names it", () => {
    const story = ended(before => before.add({ kind: "landmark_set", landmark: { name: "The Halloween feast", at: "Day 3 23:00", what: "The Great Hall feast, and the troll." } }));
    expect(checkWeave(ask(story), answer())).toEqual({ ok: false, problems: ["happened: The Halloween feast falls in the span (Day 3 23:00) and has not happened; write it, with landmark set to its name"] });
    const feast = happening("H4", "The troll came into the dungeons during the feast.", "Day 3 23:00", "the Great Hall", ["Minerva McGonagall"], { landmark: "the halloween feast" });
    const checked = checkWeave(ask(story), answer({ happened: [...answer().happened, feast] }));
    expect(checked.ok && checked.value.happened.at(-1)).toMatchObject({ landmark: "The Halloween feast", at: "Day 3 23:00" });
  });

  it("is sent back when it does not keep to its format", () => {
    expect(checkWeave(ask(ended()), { lives: [] }).ok).toBe(false);
  });

  it("is one step: an unusable move is sent back once, and the step fails only when neither model gives one", async () => {
    const story = ended();
    const runner = new ScriptedRunner([{ answer: JSON.stringify({ lives: [] }) }, { answer: JSON.stringify(answer()) }]);
    const record = await writeWeave(new Models(story.mac.db, { claude: runner }), [SONNET], ask(story), story.storyId, "trace-w", new AbortController().signal);
    expect(record.value.happened).toHaveLength(3);
    expect(runner.requests[1]!.prompt).toContain("- answer: must have required property 'threads'");
    const unusable = { answer: JSON.stringify({ lives: [] }) };
    await expect(writeWeave(new Models(story.mac.db, { claude: new ScriptedRunner([unusable, unusable]) }), [SONNET], ask(story), story.storyId, "trace-w", new AbortController().signal)).rejects.toBeInstanceOf(AgentFailed);
  });
});

describe("the Leads' moves off-screen (openspec long-run: Leads act every Stretch)", () => {
  const seating = "Draconia had his name taken off the Charms seating plan.";

  /** A Stretch in which Draconia's move is made off-screen. */
  const stretch = () => ended(before => {
    before.plan({ afterScene: 1, leads: [{ who: "Draconia Malfoy", move: "Has his name taken off the Charms seating plan.", scene: null }, { who: "Hermione Granger", move: "Asks him to revise.", scene: "s1.1" }] });
  });

  it("is given each Lead's move still to make off-screen, and keeps one made with its Lead's mark", () => {
    const story = stretch();
    expect(movesDue(story.state()).map(move => move.who)).toEqual(["Draconia Malfoy"]);
    expect(weaverPrompt(ask(story)).prompt).toContain("<lead_moves_offscreen>\n- Draconia Malfoy: Has his name taken off the Charms seating plan.\n</lead_moves_offscreen>");
    const made = happening("H4", seating, "Day 4 06:00", "Flitwick's office", ["Draconia Malfoy", "Neville Longbottom"], { move: "draconia" });
    const checked = checkWeave(ask(story), answer({ happened: [made] , meanwhile: [] }));
    expect(checked).toMatchObject({ ok: true, dropped: [] });
    if (!checked.ok) return;
    expect(checked.value.happened[0]).toMatchObject({ move: "Draconia Malfoy", knownTo: ["Draconia Malfoy", "Neville Longbottom"] });
    story.world({ happened: checked.value.happened });
    expect(movesDue(story.state())).toEqual([]);
  });

  // GIVEN no Lead has a move to make off-screen
  // WHEN the World's record marks Harry's evening in the common room as his move
  // THEN it is kept as an ordinary happening, and the World is not asked again
  it("living-world › Moments are remembered from one record › Set right, not asked again", async () => {
    const story = ended();
    expect(movesDue(story.state())).toEqual([]);
    const evening = happening("H4", "Harry spent the evening in the common room with Ron.", "Day 3 22:30", "the Gryffindor common room", ["Harry Potter"], { move: "Harry Potter" });
    const runner = new ScriptedRunner([{ answer: JSON.stringify(answer({ happened: [...answer().happened, evening] })) }]);
    const record = await writeWeave(new Models(story.mac.db, { claude: runner }), [SONNET], ask(story), story.storyId, "trace-w", new AbortController().signal);
    expect(record.value.happened.find(item => item.what === evening.what)).toMatchObject({ move: null });
    expect(record.dropped).toEqual([]);
    expect(runner.requests).toHaveLength(1);
  });
});

describe("what he missed (openspec day-view: Missing something has consequences)", () => {
  const library = { at: "Day 5 14:00", place: "The library", what: "Draconia's library session.", who: ["Draconia Malfoy"], expected: true };

  /** He skips from Saturday morning to next week, Monday. */
  const skipped = () => {
    const story = ended();
    return ask(story, { gap: true, from: "Day 4 07:30", until: "Day 6 07:30", scene: [story.move("I keep to myself until next week.")], missed: [library] });
  };

  // GIVEN Draconia's library Scene was on Sunday at 2:00 pm
  // WHEN the player skips to next week, and the World writes it going on without him on Saturday
  // THEN it went on on Sunday at 2:00 pm, in the library
  it("day-view › Missing something has consequences › What he missed keeps its time", () => {
    const without = happening("H9", "Draconia waited at the back table; he did not come.", "Day 4 10:00", "the Slytherin common room", ["Draconia Malfoy"], { missed: "G1" });
    const checked = checkWeave(skipped(), answer({ happened: [without], meanwhile: [], on: [] }));
    expect(checked).toMatchObject({ ok: true, dropped: [] });
    expect(checked.ok && checked.value.happened[0]).toMatchObject({ at: "Day 5 14:00", where: "The library" });
  });

  it("says the day of what he missed, and is sent back when what he was expected at did not go on", () => {
    const gap = skipped();
    expect(weaverPrompt(gap).prompt).toContain("<missed>\n- G1 Day 5 14:00 (Sunday 2:00 pm), The library: Draconia's library session. With Draconia Malfoy. He was expected.\n</missed>");
    expect(checkWeave(gap, answer({ meanwhile: [] }))).toEqual({ ok: false, problems: ["happened: G1, The library, went on without him and he was expected; write it, with the people there noticing he did not come (missed: \"G1\")"] });
  });

  it("offers nothing on over a Gap", () => {
    const checked = checkWeave(skipped(), answer({ happened: [happening("H9", "It went on.", "Day 5 14:00", "The library", ["Draconia Malfoy"], { missed: "G1" })], meanwhile: [] }));
    expect(checked.ok && checked.value.on).toEqual([]);
  });
});

describe("an Engagement carried by Meanwhile (docs/adr/0011)", () => {
  const note = { text: "A note under the door: \"My office, nine o'clock.\" M. McGonagall.", how: "seen", happened: "H2", told_by: null, about: [] };
  const summons = { what: "McGonagall wants his account of the troll.", at: "Day 4 09:00", place: "McGonagall's office", who: ["mcgonagall"], expected: true, every: null };

  it("keeps the Engagement a line of Meanwhile carries, after the span, and leaves out one before its end, keeping the line", () => {
    const story = ended();
    const kept = checkWeave(ask(story), answer({ meanwhile: [{ ...note, engagement: summons }] }));
    expect(kept.ok && kept.value.meanwhile[0]!.engagement).toEqual({ id: expect.stringMatching(/^g-/), what: summons.what, at: "Day 4 09:00", place: "McGonagall's office", who: ["Minerva McGonagall"], expected: true, every: null, quotes: [] });
    const early = checkWeave(ask(story), answer({ meanwhile: [{ ...note, engagement: { ...summons, at: "Day 4 07:00" } }] }));
    expect(early).toMatchObject({ ok: true, dropped: ["meanwhile[0]: the engagement at \"Day 4 07:00\" is not after the span"] });
    expect(early.ok && early.value.meanwhile[0]).toMatchObject({ text: note.text, engagement: null });
  });
});

describe("the Weaver's call", () => {
  it("gives the span, The Story So Far, the World as it stands, what is on ahead, the Scene that ended and the Landmarks in the span", () => {
    const story = ended(before => before.add({ kind: "landmark_set", landmark: { name: "The Halloween feast", at: "Day 3 23:00", what: "The Great Hall feast." } }));
    story.add({ kind: "chronicle", scene: 1, summary: "", paragraph: "Hermione would not say what she was reading.", moments: [], told: [], known: [], bonds: [], engagements: [], changed: [], dropped: [], callId: "c", model: SONNET });
    story.world({ on: [{ id: "o-1", at: "Day 4 20:00", place: "The Three Broomsticks", what: "The twins buy a round.", who: ["Harry Potter"] }] });
    const { system, prompt } = weaverPrompt(ask(story));
    expect(system).toContain("# The Weaver");
    expect(system.replace(/\s+/g, " ")).toContain("give again each item still ahead that is still going on, as it was, or it is gone.");
    expect(system).toContain("- Crabbe and Goyle: Draconia's errands, and whatever she wants hit.");
    expect(prompt).toContain('<span from="Day 3 22:10 (Friday 10:10 pm)" until="Day 4 07:30 (Saturday 7:30 am)">');
    expect(prompt).toContain("Hermione would not say what she was reading.");
    expect(prompt).toContain("- Quirrell and the third-floor door: Quirrell is testing the wards on the third-floor door, at night, alone");
    expect(prompt).toContain("What is on ahead:\n- Day 4 20:00 (Saturday 8:00 pm), The Three Broomsticks: The twins buy a round. (with Harry Potter)");
    expect(prompt).toContain('<scene_that_ended title="After curfew" place="The Gryffindor common room" from="Day 3 21:40 (Friday 9:40 pm)" until="Day 3 22:10 (Friday 10:10 pm)">\n<move by="Roopesh Gantasala">\nI say goodnight to Hermione and go up.\n</move>\n\nHermione doesn\'t look up from her book.\n</scene_that_ended>');
    expect(prompt).toContain("<landmarks_in_span>\n- The Halloween feast, Day 3 23:00 (Friday 11:00 pm): The Great Hall feast.\n</landmarks_in_span>");
  });

  // GIVEN the World last stood at 7:40 am at Kalka, and a Scene at Barog opens at 9:05 am and ends with Ishaan still on
  //   the platform, listening for a bird with Meera
  // WHEN the World moves on
  // THEN what happened at Barog happened at 9:05 am, as the Scene says
  // AND nothing that happened before 9:05 am is known to Ishaan, and nothing has him back on the train
  it("living-world › Only the player makes facts about the Player Character › The World moves on around him", () => {
    const story = ledger(nightTrainStoryFile());
    story.world({ from: "Day 2 07:00", until: "Day 2 07:40", lives: [{ who: "Meera Kulkarni", where: "Kalka", doing: "waiting for the toy train", after: "The hills" }] });
    story.move("I stay on the platform with Meera, listening for the bird.");
    story.note({ clock: "Day 2 09:40" });
    story.reply("Meera holds up a hand. Somewhere in the mist, the bird calls again.");
    story.close();
    story.chronicle({ moments: [{ what: "Ishaan and Meera listen for the bird at Barog.", quotes: [{ entry: "e", text: "I stay on the platform with Meera, listening for the bird." }], there: ["Meera Kulkarni"], weight: 3 }] });
    // What happened at Barog happened when the Scene says.
    expect(story.state().facts.at(-1)).toMatchObject({ at: "Day 2 09:05", where: "Barog station platform, hill mist, the toy train's engine taking water" });
    const weave = ask(story, { until: "Day 2 13:00" });
    const { system, prompt } = weaverPrompt(weave);
    expect(prompt).toContain('<scene_that_ended title="Water at Barog" place="Barog station platform, hill mist, the toy train\'s engine taking water" from="Day 2 09:05 (Friday 9:05 am)" until="Day 2 09:40 (Friday 9:40 am)">');
    expect(system.replace(/\s+/g, " ")).toContain("Before the Scene opened he was off-screen; the World moves on around him, not with him.");
    // Nothing the World writes is before the Scene ended, and nothing has him anywhere.
    const checked = checkWeave(weave, answer({
      lives: [{ who: "Ishaan Mehra", where: "back on the train", doing: "asleep", after: "Shimla" }, { who: "Meera", where: "Barog station platform", doing: "listening for the bird", after: "The hills" }],
      threads: [],
      happened: [happening("H1", "The guard blew his whistle twice.", "Day 2 07:50", "Kalka", ["Uncle Bhalla"])],
      meanwhile: [], on: []
    }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.lives.map(life => life.who)).toEqual(["Meera Kulkarni"]);
    expect(checked.value.happened[0]!.at).toBe("Day 2 09:40");
  });
});

describe("rest after a peak (openspec long-run: Rest is deliberate)", () => {
  // GIVEN a Scene just peaked, and the Director's new Stretch is a rest whose next Scene that matters is a quiet
  //   breakfast on Monday
  // THEN the Story's own pick at the Day View is Monday's breakfast, and the World moves on at the first answer that
  //   offers it
  it("long-run › Rest is deliberate › The rest the Director planned", async () => {
    const story = ended(() => {}, 5);
    expect(story.state().curve.at(-1)).toMatchObject({ scene: 1, peak: 5 });
    story.plan({ phase: "rest", scenes: [{ id: "s1.1", at: "Day 6 08:00", place: "The Great Hall", who: ["Hermione Granger"], for: "A slow breakfast after the night before.", offer: "Breakfast, late, with nothing to do after.", headline: "Breakfast: a slow one", lead: null, engagement: null, quiet: true }] });
    // The Weaver moves the World only: the pick is the Director's, and it is not asked for one.
    const weave = ask(story);
    expect(weaverPrompt(weave).prompt).not.toMatch(/peaked|quiet Happening|your pick/);
    const runner = new ScriptedRunner([{ answer: JSON.stringify(answer()) }]);
    const record = await writeWeave(new Models(story.mac.db, { claude: runner }), [SONNET], weave, story.storyId, "trace-w", new AbortController().signal);
    expect(runner.requests).toHaveLength(1);
    story.world({ ...record.value, from: weave.from, until: weave.until });
    const [pick, ...rest] = offersOn(story.state());
    expect(pick).toMatchObject({ pick: true, scene: "s1.1", at: "Day 6 08:00", place: "The Great Hall", what: "Breakfast, late, with nothing to do after." });
    expect(rest.map(item => item.place)).toEqual(["The Three Broomsticks"]);
  });
});
