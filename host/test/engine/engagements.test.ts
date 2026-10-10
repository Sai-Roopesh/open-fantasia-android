import { describe, expect, it } from "vitest";
import type { Script } from "../../src/models/scripted.js";
import type { Chronicle, Entry, WorldMoved } from "../../src/story/entries.js";
import { engagementsOn } from "../../src/story/engagements.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile, hogwartsWorldStoryFile } from "../support/story-files.js";

const ORDER = "\"Wednesdays, in the library, half past seven. You'll be there before me.\"";
const AGREED = "yeah alright i will be there";

/** Sunday morning, Day 5 (Day 1 was a Wednesday): Draconia sets the price of the slap. */
function sundayMorning(chronicler: Script[]) {
  const story = hogwartsStoryFile({ title: "The price of a slap", place: "The Great Hall", at: "Day 5 07:30", who: ["Draconia Malfoy"], prose: "Draconia sits down opposite him without asking." });
  return playable(story, { actor: [{ answer: `She does not look up from her toast. ${ORDER}` }], chronicler });
}

const record = (engagements: unknown[], changed: unknown[] = []): Script => ({ answer: JSON.stringify({
  summary: "Draconia set Wednesdays in the library as the price of the slap, and he agreed.",
  moments: [{ what: "She sets the price of the slap.", quotes: [{ entry: "E3", text: ORDER }], there: ["Draconia Malfoy"], weight: 3 }],
  told: [], engagements, changed
}) });

const wednesdays = (quotes: unknown[]) => ({ what: "Draconia's hour on the Charms practical, in the library.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week", quotes });

describe("an Engagement is recorded where it is made (openspec living-world)", () => {
  // WHEN a Scene ends in which Draconia says "Wednesdays, in the library, half past seven. You'll be there before me."
  //   and the player's Move answers "yeah alright i will be there"
  // THEN a weekly Engagement is recorded for Wednesdays at 7:30 pm in the library, with Draconia, he is expected, and
  //   it quotes her words and his
  it("living-world › An Engagement is recorded where it is made › Made in a Reply", async () => {
    const { play, engine, storyId, head, mac } = sundayMorning([record([wednesdays([{ entry: "E3", text: ORDER }, { entry: "E4", text: AGREED }])])]);
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.chronicled(storyId);
    const [chronicle] = mac.tree.recordsOn(head(), "chronicle") as Entry<Chronicle>[];
    const reply = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "reply")!;
    const move = mac.tree.pathTo(head()).filter(entry => entry.payload.kind === "move")[1]!;
    expect(chronicle!.payload.engagements).toEqual([{ id: expect.stringMatching(/^g-/), what: "Draconia's hour on the Charms practical, in the library.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week",
      quotes: [{ entry: reply.id, text: ORDER }, { entry: move.id, text: AGREED }] }]);
  });

  // WHEN the record of a Scene gives an Engagement whose quote is not in any Move or Reply of that Scene
  // THEN that Engagement is left out and noted, and the rest of the record is kept
  it("living-world › An Engagement is recorded where it is made › Words that are not on the page", async () => {
    const invented = record([wednesdays([{ entry: "E3", text: "Thursdays at the Owlery, at six." }])]);
    const { play, engine, storyId, head, mac } = sundayMorning([invented, invented]);
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.chronicled(storyId);
    const [chronicle] = mac.tree.recordsOn(head(), "chronicle") as Entry<Chronicle>[];
    expect(chronicle!.payload.engagements).toEqual([]);
    expect(chronicle!.payload.moments).toHaveLength(1);
    expect(chronicle!.payload.dropped).toEqual([
      "engagements: engagement 1, quote 1 is not word for word in E3; copy the words exactly",
      "engagements: engagement 1 has no quote that could be kept, so it is left out"
    ]);
  });

  // WHEN Pansy and Draconia agree, in the Slytherin common room, to meet at the Owlery at six
  // THEN no Engagement of his is recorded
  it("living-world › An Engagement is recorded where it is made › Arranged behind his back", async () => {
    const owlery = { answer: JSON.stringify({ lives: [], threads: [], meanwhile: [], happenings: [],
      happened: [{ id: "H1", what: "Pansy and Draconia agreed to meet at the Owlery at six.", at: "Day 5 08:30", where: "The Slytherin common room", known_to: ["Draconia Malfoy"], landmark: null }] }) };
    const story = hogwartsStoryFile({ title: "The price of a slap", place: "The Great Hall", at: "Day 5 07:30", who: ["Draconia Malfoy"], prose: "Draconia sits down opposite him without asking." });
    const { play, engine, storyId, head, mac } = playable(story, { weaver: [owlery], unplanned: true });
    await play("I finish my toast and leave.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    await engine.chronicled(storyId);
    expect(engagementsOn(mac, head(), "Day 5 09:00")).toEqual([]);
  });

  it("shows the Chronicler what is on, so a Scene can move or call one off", async () => {
    const { play, engine, storyId, head, models } = sundayMorning([record([wednesdays([{ entry: "E3", text: ORDER }, { entry: "E4", text: AGREED }])])]);
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.chronicled(storyId);
    await play("Later, I find her in the corridor.");
    engine.endScene(storyId, head(), "end-2");
    await engine.chronicled(storyId);
    expect(models.chronicler.requests.at(-1)!.prompt).toContain("<engagements_on>\n- E1: Draconia's hour on the Charms practical, in the library. Every Wednesday at 7:30 pm from Day 8 19:30, The library, with Draconia Malfoy, he is expected");
  });
});

/** Friday night after curfew (Day 3), the World moving on to Saturday 7:30 am with what [weave] says. */
function fridayNight(weave: Record<string, unknown>) {
  const story = hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] });
  return playable(story, { weaver: [{ answer: JSON.stringify({ lives: [], threads: [], happened: [], meanwhile: [], happenings: [], ...weave }) }], unplanned: true });
}

const noteSeen = { id: "H1", what: "Draconia pushed a note under his door.", at: "Day 4 07:00", where: "The boys' dormitory", known_to: ["Draconia Malfoy", "Roopesh Gantasala"], landmark: null };
const note = (engagement: Record<string, unknown>) => ({ text: "A note under the door: \"Library. Ten o'clock.\" D.M.", how: "seen", happened: "H1", told_by: null, engagement });
const atTen = { what: "Draconia, in the library, about the note.", at: "Day 4 10:00", place: "The library", who: ["Draconia Malfoy"], expected: true, every: null };

describe("what he has arranged is on (openspec day-view)", () => {
  // GIVEN Meanwhile shows him Draconia's note: "Library. Ten o'clock."
  // THEN the Day View offers the library at ten, with Draconia, among its Happenings
  it("day-view › What he has arranged is on › A note under the door", async () => {
    const { play, engine, storyId, head, view } = fridayNight({ happened: [noteSeen], meanwhile: [note(atTen)] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    expect(view().day_view!.happenings).toEqual([expect.objectContaining({ at: "Day 4 10:00", time: "10:00 am", every: null, place: "The library", who: ["Draconia Malfoy"], expected: true })]);
  });

  // GIVEN Hermione said she would be at the library's end table if anyone wanted to do the Charms essay properly
  // THEN the Day View offers the library with Hermione, and it is not marked "You're expected"
  it("day-view › What he has arranged is on › An invitation, not a summons", async () => {
    const invited = { what: "Hermione at the end table, doing the Charms essay properly.", at: "Day 4 09:00", place: "The library", who: ["Hermione Granger"], expected: false, every: null };
    const { play, engine, storyId, head, view } = fridayNight({ happened: [{ ...noteSeen, what: "Hermione said where she would be.", known_to: ["Hermione Granger", "Roopesh Gantasala"] }], meanwhile: [{ text: "Hermione says she will be at the end table if anyone wants to do the essay properly.", how: "told", happened: "H1", told_by: "Hermione Granger", engagement: invited }] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    expect(view().day_view!.happenings).toEqual([expect.objectContaining({ place: "The library", who: ["Hermione Granger"], expected: false })]);
  });

  // GIVEN five things are on before Thursday's Scene that matters, one of them McGonagall's summons at 9:00
  // THEN the Day View offers four, and McGonagall's summons is among them, marked "You're expected"
  it("day-view › Up to four Happenings › What he is expected at is never crowded out", async () => {
    const happening = (id: string, at: string, place: string, pick = false) => ({ id, at, place, what: `${place}.`, who: ["Harry Potter"], expected: false, pick });
    const summons = { what: "McGonagall wants his account of the troll.", at: "Day 4 09:00", place: "McGonagall's office", who: ["Minerva McGonagall"], expected: true, every: null };
    const { play, engine, storyId, head, view } = fridayNight({
      happened: [{ ...noteSeen, what: "McGonagall sent for him.", known_to: ["Minerva McGonagall", "Roopesh Gantasala"] }],
      meanwhile: [{ text: "A note from McGonagall: her office, nine o'clock.", how: "seen", happened: "H1", told_by: null, engagement: summons }],
      happenings: [happening("P1", "Day 9 10:00", "The Charms corridor", true), happening("P2", "Day 4 11:00", "The Great Hall"), happening("P3", "Day 4 14:00", "The Quidditch pitch"), happening("P4", "Day 4 20:00", "The Three Broomsticks")]
    });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    const on = view().day_view!.happenings;
    expect(on.map(item => [item.place, item.pick, item.expected])).toEqual([
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
    const weave = {
      lives: [], threads: [],
      happened: [{ ...noteSeen, at: "Day 3 07:00", what: "Hermione left a note on his bed.", known_to: ["Hermione Granger", "Roopesh Gantasala"] }],
      meanwhile: [{ text: "Hermione's note: \"Library, seven. You promised.\"", how: "seen", happened: "H1", told_by: null, engagement: promise }],
      happenings: [
        { id: "P1", at: "Day 5 14:00", place: "The Quidditch pitch", what: "Draconia is watching the Slytherin trials.", who: ["Draconia Malfoy"], expected: false, pick: true },
        { id: "P2", at: "Day 3 09:00", place: "The Charms classroom", what: "The Charms lecture, then the practical.", who: ["Neville Longbottom"], expected: true, pick: false }
      ]
    };
    const { play, engine, storyId, head, view } = playable(story, { weaver: [{ answer: JSON.stringify(weave) }], unplanned: true });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    expect(view().day_view!.at).toBe("Day 3 07:30");
    expect(view().day_view!.happenings.map(item => [item.time, item.place])).toEqual([
      ["Sunday 2:00 pm", "The Quidditch pitch"], ["9:00 am", "The Charms classroom"], ["7:00 pm", "The library"]
    ]);
  });

  it("keeps one card for an Engagement the Weaver also offered", async () => {
    const { play, engine, storyId, head, view } = fridayNight({ happened: [noteSeen], meanwhile: [note(atTen)],
      happenings: [{ id: "P1", at: "Day 4 10:15", place: "the library", what: "Draconia is in the library.", who: ["Draconia Malfoy"], expected: false, pick: false }] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    expect(view().day_view!.happenings).toEqual([expect.objectContaining({ at: "Day 4 10:00", place: "The library", expected: true })]);
  });
});

describe("weekly, and called off (openspec day-view: What he has arranged is on)", () => {
  // GIVEN in Sunday's Scene Draconia set Wednesday evenings at half past seven in the library, and he said he would be
  //   there
  // THEN every Day View until then offers Wednesday 7:30 pm in the library, marked "You're expected"
  // AND after that Wednesday, the Day View offers the next Wednesday, until she calls it off
  it("day-view › What he has arranged is on › Wednesday evenings in the library", async () => {
    const { play, engine, storyId, head, view } = sundayMorning([record([wednesdays([{ entry: "E3", text: ORDER }, { entry: "E4", text: AGREED }])])]);
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.chronicled(storyId);
    await engine.woven(storyId);
    const library = (at: string) => view().day_view!.happenings.find(item => item.place === "The library" && item.at === at);
    expect(library("Day 8 19:30")).toMatchObject({ every: "Wednesday", time: "7:30 pm", days_away: 3, expected: true });
    // A week on: the first Wednesday is behind him, and the next one is on.
    const nextWeek = view().day_view!.choices.skips.find(skip => skip.label === "Next week")!;
    engine.choose(storyId, { after: head(), kind: "skip", at: nextWeek.at, gap: "I keep my head down all week." }, "skip");
    await engine.settled(storyId);
    engine.endScene(storyId, head(), "end-2");
    await engine.woven(storyId);
    expect(library("Day 8 19:30")).toBeUndefined();
    expect(library("Day 15 19:30")).toMatchObject({ every: "Wednesday", time: "7:30 pm", expected: true });
  });

  // GIVEN Draconia's Wednesday sessions are on
  // WHEN a Scene ends in which she tells him not to bother coming any more
  // THEN the Day View no longer offers them
  it("day-view › What he has arranged is on › Called off", async () => {
    const dismissal = "\"Don't bother coming on Wednesday. Or any Wednesday.\"";
    const calledOff = { answer: JSON.stringify({ summary: "Draconia called the Wednesdays off.", moments: [], told: [], changed: [{ engagement: "E1", to: "off", quotes: [{ entry: "E2", text: dismissal }] }] }) };
    const story = hogwartsStoryFile({ title: "The price of a slap", place: "The Great Hall", at: "Day 5 07:30", who: ["Draconia Malfoy"], prose: "Draconia sits down opposite him without asking." });
    const { play, engine, storyId, head, view } = playable(story, {
      actor: [{ answer: `She does not look up from her toast. ${ORDER}` }, { answer: "She looks at him, and waits." }, { answer: `She says it to the window. ${dismissal}` }],
      chronicler: [record([wednesdays([{ entry: "E3", text: ORDER }, { entry: "E4", text: AGREED }])]), calledOff]
    });
    await play("I ask her what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end");
    await engine.chronicled(storyId);
    await engine.woven(storyId);
    expect(view().day_view!.happenings.some(item => item.place === "The library")).toBe(true);
    await play("At lunch I sit down across from her.");
    engine.endScene(storyId, head(), "end-2");
    await engine.chronicled(storyId);
    await engine.woven(storyId);
    expect(view().day_view!.happenings.some(item => item.place === "The library")).toBe(false);
  });
});

describe("kept or missed (openspec day-view: Missing something has consequences)", () => {
  const summons = { what: "McGonagall wants his account of the troll.", at: "Day 5 09:00", place: "McGonagall's office", who: ["Minerva McGonagall"], expected: true, every: null };

  // GIVEN Meanwhile told him McGonagall wants his account in her office at nine on Sunday
  // WHEN the player skips to Sunday afternoon
  // THEN McGonagall took the accounts without him and noticed he did not come
  // (Sunday's later times on offer are "This evening"; it passes nine all the same.)
  it("day-view › Missing something has consequences › A summons he only heard of is still missed", async () => {
    const story = hogwartsWorldStoryFile({ title: "Saturday night", place: "The Gryffindor common room", at: "Day 4 22:40", who: ["Hermione Granger"] });
    const told = { answer: JSON.stringify({ lives: [], threads: [], happenings: [],
      happened: [{ id: "H1", what: "McGonagall sent word for his account.", at: "Day 5 07:00", where: "The Gryffindor common room", known_to: ["Minerva McGonagall", "Hermione Granger", "Roopesh Gantasala"], landmark: null }],
      meanwhile: [{ text: "Hermione says McGonagall wants your account in her office at nine.", how: "told", happened: "H1", told_by: "Hermione Granger", engagement: summons }] }) };
    const { play, engine, storyId, head, view, models, mac } = playable(story, { weaver: [told], unplanned: true });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    const evening = view().day_view!.choices.skips.find(skip => skip.label === "This evening")!;
    engine.choose(storyId, { after: head(), kind: "skip", at: evening.at, gap: null }, "skip");
    await engine.settled(storyId);
    expect(models.weaver.requests.at(-1)!.prompt).toMatch(/G1 Sunday 9:00 am, McGonagall's office: McGonagall wants his account of the troll\..*he was expected/);
    const world = mac.tree.recordsOn(head(), "world_moved").at(-1)!.payload as WorldMoved;
    expect(world.happened.find(item => item.what.includes("went on without him"))).toMatchObject({ knownTo: ["Minerva McGonagall"] });
  });

  // GIVEN he is expected in Draconia's library session at 7:30 pm
  // WHEN a Scene in the common room runs from 7:00 pm to 8:15 pm
  // THEN the library session went on without him, and Draconia noticed
  it("day-view › Missing something has consequences › Missed while in another Scene", async () => {
    const story = hogwartsWorldStoryFile({ title: "Chess", place: "The Gryffindor common room", at: "Day 8 19:00", who: ["Ron Weasley"] });
    const session = { id: "g-session", what: "Draconia's hour on the Charms practical.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week" as const, quotes: [{ entry: "E1", text: "x" }] };
    const late = { answer: JSON.stringify({ leaves_scene: false, frame: { title: "Chess", place: "The Gryffindor common room", purpose: "p", exit: "e" }, comes_in: ["Ron Weasley"], goes: [], beats: [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }], note: "n", call: "continue", intensity: 2, arc_moved: true, clock: "Day 8 20:15", taste: null, in_play: [] }) };
    const { play, engine, storyId, head, models, mac } = playable(story, { writer: [late], unplanned: true });
    // The session was made in an earlier Scene; it hangs off the opening here, as a record would.
    const opening = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "scene_opened")!;
    mac.tree.append(storyId, opening.id, { kind: "chronicle", scene: opening.id, summary: null, sceneEnded: false, moments: [], told: [], engagements: [session], callId: "c", model: { provider: "claude", model: "claude-sonnet-5-5" } });
    await play("I play Ron at chess until the clock strikes the quarter past eight.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    expect(models.weaver.requests.at(-1)!.prompt).toMatch(/G1 Wednesday 7:30 pm, The library: Draconia's hour on the Charms practical\..*he was expected/);
    const world = mac.tree.recordsOn(head(), "world_moved").at(-1)!.payload as WorldMoved;
    expect(world.happened.find(item => item.what.includes("went on without him"))).toMatchObject({ knownTo: ["Draconia Malfoy"] });
  });

  it("is kept when he chose it, or when a Scene at its place ran over its time", async () => {
    const story = hogwartsWorldStoryFile({ title: "The library", place: "The library", at: "Day 8 19:00", who: ["Draconia Malfoy"] });
    const session = { id: "g-session", what: "Draconia's hour on the Charms practical.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week" as const, quotes: [{ entry: "E1", text: "x" }] };
    const late = { answer: JSON.stringify({ leaves_scene: false, frame: { title: "The library", place: "The library", purpose: "p", exit: "e" }, comes_in: ["Draconia Malfoy"], goes: [], beats: [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }], note: "n", call: "continue", intensity: 2, arc_moved: true, clock: "Day 8 20:15", taste: null, in_play: [] }) };
    const { play, engine, storyId, head, models, mac } = playable(story, { writer: [late], unplanned: true });
    const opening = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "scene_opened")!;
    mac.tree.append(storyId, opening.id, { kind: "chronicle", scene: opening.id, summary: null, sceneEnded: false, moments: [], told: [], engagements: [session], callId: "c", model: { provider: "claude", model: "claude-sonnet-5-5" } });
    await play("I work through the wrist movement with her until a quarter past eight.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    expect(models.weaver.requests.at(-1)!.prompt).not.toMatch(/G1 Wednesday 7:30 pm/);
  });
});

describe("the Writer is told what he has arranged (engagements design decision 7)", () => {
  it("carries his Engagements ahead into the Writer's prompt, expected ones marked", async () => {
    const story = hogwartsWorldStoryFile({ title: "Supper", place: "The Great Hall", at: "Day 8 19:10", who: ["Ron Weasley"] });
    const session = { id: "g-session", what: "Draconia's hour on the Charms practical.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week" as const, quotes: [{ entry: "E1", text: "x" }] };
    const { play, storyId, head, models, mac } = playable(story, { unplanned: true });
    const opening = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "scene_opened")!;
    mac.tree.append(storyId, opening.id, { kind: "chronicle", scene: opening.id, summary: null, sceneEnded: false, moments: [], told: [], engagements: [session], callId: "c", model: { provider: "claude", model: "claude-sonnet-5-5" } });
    await play("I finish my pudding.");
    expect(models.writer.requests[0]!.prompt).toContain("<his_engagements>\n- Wednesday 7:30 pm (Day 8 19:30), every week, The library: Draconia's hour on the Charms practical. With Draconia Malfoy. He is expected.\n</his_engagements>");
  });
});

describe("the Day View fills in (openspec presence)", () => {
  // GIVEN the Day View is ready, and the record of the Scene that ended is still being written
  // WHEN the record lands with Draconia's Wednesday library session
  // THEN the session appears on the Day View the player is looking at
  it("presence › Between Scenes is quiet, and shows progress › An Engagement fills in", async () => {
    const story = hogwartsStoryFile({ title: "Breakfast", place: "The Great Hall", at: "Day 5 07:30", who: ["Draconia Malfoy"], prose: "Draconia sits down opposite him without asking." });
    // The second Scene's record is long, and slow to come; the World does not wait for it, no plan being due.
    const slow = { answer: JSON.stringify({ summary: "Draconia set Wednesdays.", told: [],
      moments: [{ what: `She sets the price of the slap. ${"And so on. ".repeat(1500)}`, quotes: [{ entry: "E2", text: ORDER }], there: ["Draconia Malfoy"], weight: 3 }],
      engagements: [wednesdays([{ entry: "E2", text: ORDER }, { entry: "E3", text: AGREED }])] }) };
    const { play, engine, storyId, head, view, events } = playable(story, {
      actor: [{ answer: "She looks at him, and waits." }, { answer: `She does not look up from her toast. ${ORDER}` }],
      chronicler: [{ answer: JSON.stringify({ summary: "Breakfast.", moments: [], told: [] }) }, slow]
    });
    await play("I eat my toast.");
    engine.endScene(storyId, head(), "end-1");
    await engine.woven(storyId);
    await engine.chronicled(storyId);
    await play("At lunch I ask Draconia what the slap is going to cost me.");
    await play(AGREED);
    engine.endScene(storyId, head(), "end-2");
    await engine.woven(storyId);
    const kinds = () => events.map(event => event.event.kind);
    expect(kinds()).not.toContain("record_written");
    await engine.chronicled(storyId);
    expect(kinds().lastIndexOf("record_written")).toBeGreaterThan(kinds().lastIndexOf("world_moved"));
    expect(view().day_view!.happenings.find(item => item.place === "The library")).toMatchObject({ every: "Wednesday", expected: true });
  });
});

