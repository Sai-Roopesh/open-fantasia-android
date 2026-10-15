import { describe, expect, it } from "vitest";
import type { Script } from "../../src/models/scripted.js";
import type { Chronicle, Payload } from "../../src/story/entries.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile, hogwartsWorldStoryFile } from "../support/story-files.js";

const ORDER = "\"Wednesdays, in the library, half past seven. You'll be there before me.\"";
const AGREED = "yeah alright i will be there";
const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];

/** A Writer's answer, the Reply [minutes] on; [opens] frames the Scene a Move at the Day View opens. */
function writer(minutes: number, opens: { title: string; place: string } | null = null, comesIn: string[] = []): Script {
  const frame = opens ? { ...opens, purpose: "p", exit: "e" } : { title: "kept", place: "kept", purpose: "p", exit: "e" };
  return { answer: JSON.stringify({ leaves_scene: false, frame, comes_in: comesIn, goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, minutes, taste: null, in_play: [], moves_to: null }) };
}

/** Sunday morning, Day 5 (Day 1 was a Wednesday): Draconia sets the price of the slap. */
function sundayMorning(chronicler: Script[]) {
  const story = hogwartsStoryFile({ title: "The price of a slap", place: "The Great Hall", at: "Day 5 07:30", who: ["Draconia Malfoy"], prose: "Draconia sits down opposite him without asking." });
  return playable(story, { actor: [{ answer: `She does not look up from her toast. ${ORDER}` }], chronicler });
}

/** The Chronicler's record of a Scene in which Draconia set her price (her words are the Scene's third passage). */
const record = (engagements: unknown[], changed: unknown[] = []): Script => ({ answer: JSON.stringify({
  summary: "Draconia set Wednesdays in the library as the price of the slap, and he agreed.",
  paragraph: "At breakfast Draconia named the price of the slap: Wednesdays in the library, half past seven. He agreed.",
  moments: [{ what: "She sets the price of the slap.", quotes: [{ entry: "P3", text: ORDER }], there: ["Draconia Malfoy"], weight: 3 }],
  told: [], known: [], bonds: [], engagements, changed
}) });

const wednesdays = (quotes: unknown[]) => ({ what: "Draconia's hour on the Charms practical, in the library.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week", quotes });

const chronicles = (path: Payload[]) => path.filter((payload): payload is Chronicle => payload.kind === "chronicle");

describe("an Engagement is recorded where it is made (openspec living-world)", () => {
  // WHEN a Scene ends in which Draconia says "Wednesdays, in the library, half past seven. You'll be there before me."
  //   and the player's Move answers "yeah alright i will be there"
  // THEN a weekly Engagement is recorded for Wednesdays at 7:30 pm in the library, with Draconia, he is expected, and
  //   it quotes her words and his
  it("living-world › An Engagement is recorded where it is made › Made in a Reply", async () => {
    const { play, engine, storyId, head, mac, state } = sundayMorning([record([wednesdays([{ entry: "P3", text: ORDER }, { entry: "P4", text: AGREED }])])]);
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const reply = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "reply")!;
    const move = mac.tree.pathTo(head()).filter(entry => entry.payload.kind === "move")[1]!;
    expect(state().calendar).toEqual([{ id: expect.stringMatching(/^g-/), what: "Draconia's hour on the Charms practical, in the library.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week",
      quotes: [{ entry: reply.id, text: ORDER }, { entry: move.id, text: AGREED }] }]);
  });

  // WHEN the record of a Scene gives an Engagement whose quote is not in any Move or Reply of that Scene
  // THEN that Engagement is left out and noted, and the rest of the record is kept
  it("living-world › An Engagement is recorded where it is made › Words that are not on the page", async () => {
    const invented = record([wednesdays([{ entry: "P3", text: "Thursdays at the Owlery, at six." }])]);
    const { play, engine, storyId, head, path, state, models } = sundayMorning([invented]);
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const [chronicle] = chronicles(path());
    expect(chronicle!.engagements).toEqual([]);
    expect(chronicle!.moments).toHaveLength(1);
    expect(chronicle!.dropped).toEqual([
      "engagements[0]: \"Thursdays at the Owlery, at six.\" is not in P3",
      "engagements[0]: it was not arranged on the page"
    ]);
    expect(state().calendar).toEqual([]);
    // Left out, not sent back: the record was asked for once.
    expect(models.chronicler.requests).toHaveLength(1);
  });

  // WHEN Pansy and Draconia agree, in the Slytherin common room, to meet at the Owlery at six
  // THEN no Engagement of his is recorded
  it("living-world › An Engagement is recorded where it is made › Arranged behind his back", async () => {
    const owlery = { answer: JSON.stringify({ lives: [], threads: [], meanwhile: [], on: [],
      happened: [{ id: "H1", what: "Pansy and Draconia agreed to meet at the Owlery at six.", at: "Day 5 08:30", where: "The Slytherin common room", known_to: ["Draconia Malfoy"], landmark: null, move: null, missed: null }] }) };
    const story = hogwartsStoryFile({ title: "The price of a slap", place: "The Great Hall", at: "Day 5 07:30", who: ["Draconia Malfoy"], prose: "Draconia sits down opposite him without asking." });
    const { play, engine, storyId, head, state } = playable(story, { weaver: [owlery] });
    await play("I finish my toast and leave.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(state().facts.some(fact => fact.what.startsWith("Pansy and Draconia agreed"))).toBe(true);
    expect(state().calendar).toEqual([]);
  });

  it("shows the Chronicler what is on, so a Scene can move or call one off", async () => {
    const { play, engine, storyId, head, models } = sundayMorning([record([wednesdays([{ entry: "P3", text: ORDER }, { entry: "P4", text: AGREED }])])]);
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    await play("Later, I find her in the corridor.");
    engine.endScene(storyId, head(), "end-2");
    await engine.ended(storyId);
    expect(models.chronicler.requests.at(-1)!.prompt).toContain("<engagements_on>\nE1: Draconia's hour on the Charms practical, in the library. Wednesday 11 September 1991, 7:30 pm, every week, The library\n</engagements_on>");
  });
});

/** The World's move, in its answer's words, with nothing but what [weave] says. */
const weaveOf = (weave: Record<string, unknown>): Script => ({ answer: JSON.stringify({ lives: [], threads: [], happened: [], meanwhile: [], on: [], ...weave }) });

/** Friday night after curfew (Day 3), the World moving on to Saturday 7:30 am with what [weave] says. */
function fridayNight(weave: Record<string, unknown>, director: Script[] = []) {
  const story = hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] });
  return playable(story, { weaver: [weaveOf(weave)], director });
}

/**
 * A Director's plan for the Stretch from the Day View's day: its Scenes that matter, the rest by default, each serving
 * the first turn of the Act the scripted Director outlines, and bringing in that Outline's locked door.
 */
function plan(scenes: Record<string, unknown>[], changes: Record<string, unknown> = {}): Script {
  return { answer: JSON.stringify({
    days: 6, toward: "the flying test", landmark: null, phase: "build",
    scenes: scenes.map((scene, index) => ({ id: `S${index + 1}`, date: "1991-09-08", time: "10:00", place: "The Great Hall", who: [], serves: { turn: "T1", lives: [] }, for: "A step for the Story.", offer: "Something is on.", headline: "A step", lead: null, engagement: null, quiet: false, ...scene })),
    new: [{ setup: "U1", kind: "mystery", scene: null, person: null }],
    leads: [], arcs: [], roadmap: [], premise: "Some Scenes serve it.", ...changes
  }) };
}

const happened = (changes: Record<string, unknown>) => ({ id: "H1", what: "Draconia pushed a note under his door.", at: "Day 4 07:00", where: "The boys' dormitory", known_to: ["Draconia Malfoy", "Roopesh Gantasala"], landmark: null, move: null, missed: null, ...changes });
const note = (engagement: Record<string, unknown>) => ({ text: "A note under the door: \"Library. Ten o'clock.\" D.M.", how: "seen", happened: "H1", told_by: null, about: ["Draconia Malfoy"], engagement });
const atTen = { what: "Draconia, in the library, about the note.", at: "Day 4 10:00", place: "The library", who: ["Draconia Malfoy"], expected: true, every: null };

describe("what he has arranged is on (openspec day-view)", () => {
  // GIVEN Meanwhile shows him Draconia's note: "Library. Ten o'clock."
  // THEN the Day View offers the library at ten, with Draconia, among its Happenings
  it("day-view › What he has arranged is on › A note under the door", async () => {
    const { play, engine, storyId, head, view } = fridayNight({ happened: [happened({})], meanwhile: [note(atTen)] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(view().day_view!.happenings).toEqual(expect.arrayContaining([expect.objectContaining({ at: "Day 4 10:00", time: "10:00 am", every: null, place: "The library", who: ["Draconia Malfoy"], expected: true })]));
  });

  // GIVEN Hermione said she would be at the library's end table if anyone wanted to do the Charms essay properly
  // THEN the Day View offers the library with Hermione, and it is not marked "You're expected"
  it("day-view › What he has arranged is on › An invitation, not a summons", async () => {
    const invited = { what: "Hermione at the end table, doing the Charms essay properly.", at: "Day 4 09:00", place: "The library", who: ["Hermione Granger"], expected: false, every: null };
    const { play, engine, storyId, head, view } = fridayNight({
      happened: [happened({ what: "Hermione said where she would be.", known_to: ["Hermione Granger", "Roopesh Gantasala"] })],
      meanwhile: [{ text: "Hermione says she will be at the end table if anyone wants to do the essay properly.", how: "told", happened: "H1", told_by: "Hermione Granger", about: ["Hermione Granger"], engagement: invited }]
    });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const library = view().day_view!.happenings.filter(item => item.place === "The library");
    expect(library).toEqual([expect.objectContaining({ who: ["Hermione Granger"], expected: false })]);
  });

  // GIVEN five things are on before Thursday's Scene that matters, one of them McGonagall's summons at 9:00
  // THEN the Day View offers four, and McGonagall's summons is among them, marked "You're expected"
  it("day-view › Up to four Happenings › What he is expected at is never crowded out", async () => {
    const on = (at: string, place: string) => ({ at, place, what: `${place}.`, who: ["Harry Potter"] });
    const summons = { what: "McGonagall wants his account of the troll.", at: "Day 4 09:00", place: "McGonagall's office", who: ["Minerva McGonagall"], expected: true, every: null };
    // Saturday's Day View: the Stretch's next Scene that matters is Thursday's, five days on.
    const thursday = plan([{ date: "1991-09-12", time: "10:00", place: "The Charms corridor", who: ["Draconia Malfoy"], lead: "Draconia Malfoy" }]);
    const { play, engine, storyId, head, view } = fridayNight({
      happened: [happened({ what: "McGonagall sent for him.", known_to: ["Minerva McGonagall", "Roopesh Gantasala"] })],
      meanwhile: [{ text: "A note from McGonagall: her office, nine o'clock.", how: "seen", happened: "H1", told_by: null, about: ["Minerva McGonagall"], engagement: summons }],
      on: [on("Day 4 11:00", "The Great Hall"), on("Day 4 14:00", "The Quidditch pitch"), on("Day 4 20:00", "The Three Broomsticks")]
    }, [thursday]);
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const happenings = view().day_view!.happenings;
    expect(happenings.map(item => [item.place, item.pick, item.expected])).toEqual([
      ["The Charms corridor", true, false], ["McGonagall's office", false, true], ["The Great Hall", false, false], ["The Quidditch pitch", false, false]
    ]);
  });

  // GIVEN it is Friday morning, he is expected in the library at 7:00 pm and at Charms at 9:00 am, and the Story's pick
  //   is Sunday's
  // THEN the Day View offers Sunday's first, then Charms at 9:00 am, then the library at 7:00 pm
  it("day-view › Up to four Happenings › In time order", async () => {
    // Thursday night (Day 2; Day 1 was a Wednesday), the World moving on to Friday 7:30 am.
    const story = hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 2 22:40", who: ["Hermione Granger"] });
    const promise = { what: "He is to tell Hermione what he can about the train.", at: "Day 3 19:00", place: "The library", who: ["Hermione Granger"], expected: true, every: null };
    const charms = { what: "The Charms lecture, then the practical.", at: "Day 3 09:00", place: "The Charms classroom", who: ["Neville Longbottom"], expected: true, every: null };
    const weave = weaveOf({
      happened: [happened({ at: "Day 3 07:00", what: "Hermione left a note on his bed.", known_to: ["Hermione Granger", "Roopesh Gantasala"] }), happened({ id: "H2", at: "Day 3 07:10", what: "Neville reminded him of the Charms practical.", known_to: ["Neville Longbottom", "Roopesh Gantasala"] })],
      meanwhile: [
        { text: "Hermione's note: \"Library, seven. You promised.\"", how: "seen", happened: "H1", told_by: null, about: ["Hermione Granger"], engagement: promise },
        { text: "Neville says the Charms practical is at nine, and everyone has to be there.", how: "told", happened: "H2", told_by: "Neville Longbottom", about: [], engagement: charms }
      ]
    });
    // Friday's Day View: the Story's pick is Sunday afternoon, at the pitch.
    const sunday = plan([{ date: "1991-09-08", time: "14:00", place: "The Quidditch pitch", who: ["Draconia Malfoy"], lead: "Draconia Malfoy" }]);
    const { play, engine, storyId, head, view } = playable(story, { weaver: [weave], director: [sunday] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(view().day_view!.at).toBe("Day 3 07:30");
    expect(view().day_view!.happenings.map(item => [item.time, item.place, item.pick])).toEqual([
      ["Sunday 2:00 pm", "The Quidditch pitch", true], ["9:00 am", "The Charms classroom", false], ["7:00 pm", "The library", false]
    ]);
  });

  it("keeps one card for an Engagement the World also has on", async () => {
    const { play, engine, storyId, head, view } = fridayNight({ happened: [happened({})], meanwhile: [note(atTen)],
      on: [{ at: "Day 4 10:15", place: "the library", what: "Draconia is in the library.", who: ["Draconia Malfoy"] }] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const library = view().day_view!.happenings.filter(item => item.place.toLowerCase() === "the library");
    expect(library).toEqual([expect.objectContaining({ at: "Day 4 10:00", place: "The library", expected: true })]);
  });
});

describe("weekly, and called off (openspec day-view: What he has arranged is on)", () => {
  // GIVEN in Sunday's Scene Draconia set Wednesday evenings at half past seven in the library, and he said he would be
  //   there
  // THEN every Day View until then offers Wednesday 7:30 pm in the library, marked "You're expected"
  // AND after that Wednesday, the Day View offers the next Wednesday, until she calls it off
  it("day-view › What he has arranged is on › Wednesday evenings in the library", async () => {
    const { play, engine, storyId, head, view } = sundayMorning([record([wednesdays([{ entry: "P3", text: ORDER }, { entry: "P4", text: AGREED }])])]);
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const library = (at: string) => view().day_view!.happenings.find(item => item.place === "The library" && item.at === at);
    expect(library("Day 8 19:30")).toMatchObject({ every: "Wednesday", time: "7:30 pm", days_away: 3, expected: true });
    // A week on: the first Wednesday is behind him, and the next one is on.
    const nextWeek = view().day_view!.choices.skips.find(skip => skip.label === "Next week")!;
    engine.choose(storyId, { after: head(), kind: "skip", at: nextWeek.at, gap: "I keep my head down all week." }, "skip");
    await engine.settled(storyId);
    engine.endScene(storyId, head(), "end-2");
    await engine.ended(storyId);
    expect(library("Day 8 19:30")).toBeUndefined();
    expect(library("Day 15 19:30")).toMatchObject({ every: "Wednesday", time: "7:30 pm", expected: true });
  });

  // GIVEN Draconia's Wednesday sessions are on
  // WHEN a Scene ends in which she tells him not to bother coming any more
  // THEN the Day View no longer offers them
  it("day-view › What he has arranged is on › Called off", async () => {
    const dismissal = "\"Don't bother coming on Wednesday. Or any Wednesday.\"";
    // The second Scene opens with his Move, and her answer is its second passage.
    const calledOff = { answer: JSON.stringify({ summary: "Draconia called the Wednesdays off.", paragraph: "At lunch Draconia called the Wednesdays off.", moments: [], told: [], known: [], bonds: [], engagements: [],
      changed: [{ engagement: "E1", to: "off", quotes: [{ entry: "P2", text: dismissal }] }] }) };
    const story = hogwartsStoryFile({ title: "The price of a slap", place: "The Great Hall", at: "Day 5 07:30", who: ["Draconia Malfoy"], prose: "Draconia sits down opposite him without asking." });
    const { play, engine, storyId, head, view, state } = playable(story, {
      actor: [{ answer: `She does not look up from her toast. ${ORDER}` }, { answer: "She looks at him, and waits." }, { answer: `She says it to the window. ${dismissal}` }],
      chronicler: [record([wednesdays([{ entry: "P3", text: ORDER }, { entry: "P4", text: AGREED }])]), calledOff]
    });
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(view().day_view!.happenings.some(item => item.place === "The library")).toBe(true);
    await play("At lunch I sit down across from her.");
    engine.endScene(storyId, head(), "end-2");
    await engine.ended(storyId);
    expect(state().calendar).toEqual([]);
    expect(view().day_view!.happenings.some(item => item.place === "The library")).toBe(false);
  });
});

/**
 * Wednesday noon (Day 8) in the Great Hall, where Draconia sets her library hour at half past seven tonight; then, from
 * the Day View, a Scene at [place] from seven until a quarter past eight.
 */
async function wednesdayEvening(place: string, with_: string) {
  const story = hogwartsWorldStoryFile({ title: "Lunch", place: "The Great Hall", at: "Day 8 12:00", who: ["Draconia Malfoy"], prose: "Draconia sits down opposite him without asking." });
  const tonight = { what: "Draconia's hour on the Charms practical.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week", quotes: [{ entry: "P3", text: ORDER }, { entry: "P4", text: AGREED }] };
  const played = playable(story, {
    actor: [{ answer: `She does not look up from her plate. ${ORDER}` }],
    chronicler: [record([tonight])],
    // Lunch ends at 12:04; the next Scene opens at seven and runs to a quarter past eight.
    writer: [writer(2), writer(2), writer(416, { title: "The evening", place }, [with_]), writer(75)]
  });
  await played.play("I ask her what the slap is going to cost me.");
  await played.play(AGREED);
  played.engine.endScene(played.storyId, played.head(), "end-lunch");
  await played.engine.ended(played.storyId);
  await played.play(`At seven I go to ${place.replace(/^The /, "the ")}.`);
  expect(played.state().scene).toMatchObject({ number: 2, at: "Day 8 19:00", place });
  await played.play("I stay until a quarter past eight.");
  expect(played.state().clock).toBe("Day 8 20:15");
  played.engine.endScene(played.storyId, played.head(), "end-evening");
  await played.engine.ended(played.storyId);
  return played;
}

describe("kept or missed (openspec day-view: Missing something has consequences)", () => {
  const summons = { what: "McGonagall wants his account of the troll.", at: "Day 5 09:00", place: "McGonagall's office", who: ["Minerva McGonagall"], expected: true, every: null };

  // GIVEN Meanwhile told him McGonagall wants his account in her office at nine on Sunday
  // WHEN the player skips to Sunday afternoon
  // THEN McGonagall took the accounts without him and noticed he did not come
  // (Sunday's later times on offer are "This evening"; it passes nine all the same.)
  it("day-view › Missing something has consequences › A summons he only heard of is still missed", async () => {
    const story = hogwartsWorldStoryFile({ title: "Saturday night", place: "The Gryffindor common room", at: "Day 4 22:40", who: ["Hermione Granger"] });
    const told = weaveOf({
      happened: [happened({ what: "McGonagall sent word for his account.", at: "Day 5 07:00", where: "The Gryffindor common room", known_to: ["Minerva McGonagall", "Hermione Granger", "Roopesh Gantasala"] })],
      meanwhile: [{ text: "Hermione says McGonagall wants your account in her office at nine.", how: "told", happened: "H1", told_by: "Hermione Granger", about: ["Minerva McGonagall"], engagement: summons }]
    });
    const { play, engine, storyId, head, view, models, state } = playable(story, { weaver: [told] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const evening = view().day_view!.choices.skips.find(skip => skip.label === "This evening")!;
    engine.choose(storyId, { after: head(), kind: "skip", at: evening.at, gap: null }, "skip");
    await engine.settled(storyId);
    expect(models.weaver.requests.at(-1)!.prompt).toMatch(/G1 Sunday 8 September 1991, 9:00 am, McGonagall's office: McGonagall wants his account of the troll\..*He was expected\./);
    const gap = state().facts.filter(fact => fact.source === "world" && fact.what.includes("went on without him"));
    expect(gap).toEqual([expect.objectContaining({ at: "Day 5 09:00", where: "McGonagall's office", knownTo: ["Minerva McGonagall"] })]);
  });

  // GIVEN he is expected in Draconia's library session at 7:30 pm
  // WHEN a Scene in the common room runs from 7:00 pm to 8:15 pm
  // THEN the library session went on without him, and Draconia noticed
  it("day-view › Missing something has consequences › Missed while in another Scene", async () => {
    const { models, state } = await wednesdayEvening("The Gryffindor common room", "Ron Weasley");
    expect(models.weaver.requests.at(-1)!.prompt).toMatch(/G1 Wednesday 11 September 1991, 7:30 pm, The library: Draconia's hour on the Charms practical\..*He was expected\./);
    const missed = state().facts.filter(fact => fact.source === "world" && fact.what.includes("went on without him"));
    expect(missed).toEqual([expect.objectContaining({ at: "Day 8 19:30", where: "The library", knownTo: ["Draconia Malfoy"] })]);
  });

  it("is kept when a Scene at its place ran over its time", async () => {
    const { models } = await wednesdayEvening("The library", "Draconia Malfoy");
    expect(models.weaver.requests.at(-1)!.prompt).not.toMatch(/Draconia's hour on the Charms practical\..*He was expected/);
  });
});

describe("the Writer is told what he has arranged (engagements design decision 7)", () => {
  it("carries his Engagements ahead into the Writer's prompt, expected ones marked", async () => {
    const story = hogwartsWorldStoryFile({ title: "Lunch", place: "The Great Hall", at: "Day 8 12:00", who: ["Draconia Malfoy"], prose: "Draconia sits down opposite him without asking." });
    const tonight = { what: "Draconia's hour on the Charms practical.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week", quotes: [{ entry: "P3", text: ORDER }] };
    const { play, engine, storyId, head, models } = playable(story, { actor: [{ answer: `She does not look up. ${ORDER}` }], chronicler: [record([tonight])] });
    await play("I ask her what the slap is going to cost me.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    await play("I go to supper.");
    expect(models.writer.requests.at(-1)!.prompt).toContain("What he has arranged:\n- E1 Wednesday 11 September 1991, 7:30 pm, every week, The library: Draconia's hour on the Charms practical. With Draconia Malfoy. He is expected.");
  });
});

describe("the Day View fills in (openspec presence)", () => {
  // GIVEN a Scene ended in which Hermione said she would be at the library's end table at seven
  // WHEN the Day View shows its choices
  // THEN the library at seven is already among them: the Scene was recorded before the World moved on
  it("presence › Between Scenes is quiet, and shows progress › An Engagement fills in", async () => {
    const story = hogwartsStoryFile({ title: "Charms", place: "The Charms classroom", at: "Day 4 11:00", who: ["Hermione Granger"], prose: "Hermione packs her quills." });
    const endTable = "\"I'll be at the end table at seven, if anyone wants to do the essay properly.\"";
    const recorded = { answer: JSON.stringify({ summary: "Hermione said where she would be at seven.", paragraph: "After Charms, Hermione said she would be at the library's end table at seven.", moments: [], told: [], known: [], bonds: [],
      engagements: [{ what: "Hermione at the end table, doing the essay properly.", at: "Day 4 19:00", place: "The library", who: ["Hermione Granger"], expected: false, every: null, quotes: [{ entry: "P3", text: endTable }] }], changed: [] }) };
    const { play, engine, storyId, head, view, path } = playable(story, { actor: [{ answer: `She doesn't look up. ${endTable}` }], chronicler: [recorded] });
    await play("I ask Hermione if she's done the essay.");
    engine.endScene(storyId, head(), "end");
    // The Day View shows its choices only when every step of the Scene's end is done.
    expect(view().day_view).toMatchObject({ scene_end: { step: "chronicler", failed: null }, happenings: [] });
    await engine.ended(storyId);
    expect(view().day_view!.scene_end).toEqual({ step: null, failed: null, rethinking: null });
    expect(view().day_view!.happenings).toEqual(expect.arrayContaining([expect.objectContaining({ time: "7:00 pm", place: "The library", who: ["Hermione Granger"], expected: false })]));
    const kinds = path().map(payload => payload.kind);
    expect(kinds.indexOf("chronicle")).toBeLessThan(kinds.indexOf("world_moved"));
  });
});
