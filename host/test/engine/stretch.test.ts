import { describe, expect, it } from "vitest";
import { fakeWeaveAnswer } from "../../src/models/fake.js";
import type { ModelRequest } from "../../src/models/model-call.js";
import type { Script } from "../../src/models/scripted.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import type { Payload, WorldMoved } from "../../src/story/entries.js";
import { backstageView } from "../../src/views/backstage.js";
import { journalView } from "../../src/views/journal.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

/** Friday night after curfew, Day 3 (Day 1 was a Wednesday), with Hermione: the Day View opens on Saturday morning. */
function fridayNight(): StoryFile {
  return hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] });
}

const CORNERS = "She corners him about the seating plan.";

/**
 * The Director's answer on Saturday (Day 4): a Stretch to Thursday whose next Scene that matters is Draconia cornering
 * him after Charms on Thursday at ten. Each Scene serves the first turn of the Act the scripted Director outlines, and
 * the Stretch brings in that Outline's locked door.
 */
function charmsWeek(story: StoryFile, changes: Record<string, unknown> = {}): Script {
  return { answer: JSON.stringify({
    days: 6, toward: "the flying test", landmark: null, phase: "build",
    scenes: [
      { id: "S1", date: "1991-09-12", time: "10:00", place: "The corridor outside Charms", who: ["Draconia Malfoy"], serves: { turn: "T1", lives: ["Draconia Malfoy"] }, for: CORNERS, offer: "Draconia is waiting outside Charms.", headline: "Charms: she corners him", lead: "Draconia Malfoy", engagement: null, quiet: false },
      { id: "S2", date: "1991-09-12", time: "15:00", place: "The library", who: ["Hermione Granger"], serves: { turn: "T1", lives: ["Hermione Granger"] }, for: "Hermione's flying notes.", offer: "Hermione is in the library with her flying notes.", headline: "The library: Hermione's notes", lead: "Hermione Granger", engagement: null, quiet: false }
    ],
    new: [{ setup: "U1", kind: "mystery", scene: "S1", person: null }],
    leads: [{ who: "Draconia Malfoy", move: "Corners him after Charms.", scene: "S1" }, { who: "Hermione Granger", move: "Lends him her notes.", scene: "S2" }],
    arcs: story.arcs!.map(arc => ({ arc, now: "where it was", next: "a step", not_yet: "anything declared" })),
    roadmap: [], premise: "Draconia's Scenes serve it; Hermione's leave it alone.",
    ...changes
  }) };
}

/** A Scene that matters, as the Director writes one, changed as a scenario needs. */
const scene = (changes: Record<string, unknown>) => ({ id: "S1", date: "1991-09-08", time: "10:00", place: "The Great Hall", who: [], serves: { turn: "T1", lives: [] }, for: "A step.", offer: "Something is on.", headline: "A step", lead: null, engagement: null, quiet: false, ...changes });

/** The World as the fakes move it, with [happened] and [meanwhile] added and the fakes' Lead moves left out. */
function worldWith(happened: Record<string, unknown>[], meanwhile: Record<string, unknown>[]): Script {
  return { from: (request: ModelRequest) => {
    const weave = JSON.parse((fakeWeaveAnswer(request) as { answer: string }).answer) as { happened: { move: string | null }[] };
    const item = (changes: Record<string, unknown>) => ({ landmark: null, move: null, missed: null, ...changes });
    const line = (changes: Record<string, unknown>) => ({ told_by: null, about: [], engagement: null, ...changes });
    return { answer: JSON.stringify({ ...weave, happened: [...weave.happened.filter(entry => !entry.move), ...happened.map(item)], meanwhile: meanwhile.map(line) }) };
  } };
}

const quietWorld: Script = { answer: JSON.stringify({ lives: [], threads: [], happened: [], meanwhile: [], on: [] }) };
const gapOf = (path: Payload[]) => path.filter((payload): payload is WorldMoved => payload.kind === "world_moved" && payload.gap).at(-1)!;
const heard = (journal: ReturnType<typeof journalView>) => journal.days.flatMap(day => day.rows).flatMap(row => (row.meanwhile ? [row.meanwhile.text] : []));

describe("the Story's pick is the Stretch's next Scene that matters (one-truth design decision 7)", () => {
  // GIVEN it is Saturday morning, and the Stretch's next Scene that matters is Draconia cornering him after Charms on
  //   Thursday
  // THEN the Day View's first offer is Thursday's, labelled "Thursday 10:00 am · in 5 days"
  // WHEN the player chooses it
  // THEN the days between pass, the next Scene opens on Thursday, and Meanwhile says what he learned since Saturday
  it("day-view › Up to four Happenings › The next Scene that matters is days away", async () => {
    const story = fridayNight();
    const learned = "Neville says Draconia had the Charms seating plan changed on Tuesday.";
    const days = worldWith(
      [{ id: "H9", what: "Draconia had the Charms seating plan changed.", at: "Day 7 12:00", where: "Flitwick's office", known_to: ["Draconia Malfoy", "Neville Longbottom", "Roopesh Gantasala"] }],
      [{ text: learned, how: "told", happened: "H9", told_by: "Neville Longbottom", about: ["Draconia Malfoy"] }]
    );
    const { engine, storyId, head, play, view, path, state, mac, models } = playable(story, { director: [charmsWeek(story)], weaver: [{ from: fakeWeaveAnswer }, days] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);

    // Saturday morning: the first offer is Thursday's, the Story's pick, in the Director's words for the player.
    const day = view().day_view!;
    expect(day.at).toBe("Day 4 07:30");
    const planned = state().plan!.scenes[0]!;
    expect(day.happenings[0]).toMatchObject({ at: "Day 9 10:00", time: "Thursday 10:00 am", days_away: 5, scene: planned.id, place: "The corridor outside Charms", who: ["Draconia Malfoy"], what: "Draconia is waiting outside Charms.", pick: true });
    expect(JSON.stringify(day)).not.toContain(CORNERS);
    expect(models.weaver.requests[0]!.prompt).toContain(`- ${planned.id} Thursday 12 September 1991, 10:00 am, The corridor outside Charms, with Draconia Malfoy: ${CORNERS}`);

    // Chosen: the days pass as a Gap, and the Scene opens on Thursday.
    engine.choose(storyId, { after: head(), kind: "go", happening: day.happenings[0]!.id, gap: null }, "go");
    await engine.settled(storyId);
    expect(gapOf(path())).toMatchObject({ from: "Day 4 07:30", until: "Day 9 10:00" });
    expect(state().scene).toMatchObject({ number: 2, at: "Day 9 10:00" });
    expect(heard(journalView(mac, storyId, "t"))).toContain(learned);
  });
});

describe("Backstage's Stretch, a line each (blank-gaps-and-headlines design decision 2)", () => {
  // GIVEN the Director's Stretch has Charms on Monday as a Scene that matters
  // WHEN the player opens Backstage
  // THEN it lists Monday's Scene in one short line, such as "Charms: Flitwick pairs him with Draconia", and not the
  //   Director's note to the Writer
  it("outside-the-scene › Backstage shows everything else, only when visited › The Stretch, a line each", async () => {
    const story = fridayNight();
    const note = "Flitwick pairs him with Draconia for the practical, and she has to be civil in front of the whole class while Pansy watches from the next bench.";
    // Monday is Day 6, two days on from Saturday.
    const plan = charmsWeek(story, { scenes: [
      scene({ date: "1991-09-09", time: "09:00", place: "The Charms classroom", who: ["Draconia Malfoy"], for: note, headline: "Charms: Flitwick pairs him with Draconia", lead: "Draconia Malfoy" }),
      scene({ id: "S2", date: "1991-09-12", time: "15:00", place: "The library", who: ["Hermione Granger"], for: "Hermione's flying notes.", headline: "The library: Hermione's notes", lead: "Hermione Granger" })
    ] });
    const { engine, storyId, head, play, mac } = playable(story, { director: [plan] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const scenes = backstageView(mac, storyId, "t").director!.stretch!.scenes;
    expect(scenes.map(item => [item.time, item.purpose])).toEqual([["Mon 9:00 am", "Charms: Flitwick pairs him with Draconia"], ["Thu 3:00 pm", "The library: Hermione's notes"]]);
    expect(JSON.stringify(scenes)).not.toContain(note);
  });
});

describe("the pick and an Engagement are one card (play-check-fixes design decision 1)", () => {
  // GIVEN he promised Hermione to meet her in the library at seven tonight, and the Stretch's next Scene that matters
  //   is that meeting
  // THEN the Day View's first offer is the library at 7:00 pm with Hermione, the Story's pick, marked "You're
  //   expected", and it is offered once
  // WHEN the player chooses it
  // THEN the next Scene opens in the library at seven, and the meeting is kept
  it("day-view › Up to four Happenings › The Scene that matters is one he promised", async () => {
    const story = fridayNight();
    const promise = "I promise Hermione I will meet her in the library at seven tomorrow.";
    const recorded = { answer: JSON.stringify({ summary: "He promised Hermione the library at seven.", paragraph: "He promised Hermione he would meet her in the library at seven.", moments: [], told: [], known: [], bonds: [], changed: [],
      engagements: [{ what: "He is to tell Hermione what he can about the train.", at: "Day 4 19:00", place: "The library", who: ["Hermione Granger"], expected: true, every: null, quotes: [{ entry: "P2", text: promise }] }] }) };
    // The Director plans the meeting as his Engagement, wherever it first put it.
    const plan = charmsWeek(story, { scenes: [
      scene({ date: "1991-09-07", time: "18:00", place: "The library", who: ["Hermione Granger"], for: "He tells her what he can about the train.", offer: "Hermione is waiting in the library.", lead: "Hermione Granger", engagement: "E1" }),
      scene({ id: "S2", date: "1991-09-12", time: "10:00", place: "The corridor outside Charms", who: ["Draconia Malfoy"], for: CORNERS, lead: "Draconia Malfoy" })
    ], leads: [{ who: "Draconia Malfoy", move: "Corners him after Charms.", scene: "S2" }, { who: "Hermione Granger", move: "Hears him out.", scene: "S1" }] });
    const { engine, storyId, head, play, view, state, mac } = playable(story, { chronicler: [recorded], director: [plan] });
    await play(promise);
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);

    const engagement = state().calendar[0]!;
    const planned = state().plan!.scenes[0]!;
    expect(planned).toMatchObject({ at: "Day 4 19:00", place: "The library", engagement: engagement.id });
    const day = view().day_view!;
    expect(day.happenings[0]).toMatchObject({ at: "Day 4 19:00", time: "7:00 pm", place: "The library", who: ["Hermione Granger"], pick: true, expected: true, scene: planned.id });
    expect(day.happenings.filter(item => item.place === "The library")).toHaveLength(1);

    engine.choose(storyId, { after: head(), kind: "story", happening: null, gap: null }, "go");
    await engine.settled(storyId);
    expect(state().scene).toMatchObject({ number: 2, at: "Day 4 19:00", place: "The library" });
    const move = mac.tree.pathTo(head()).findLast(entry => entry.payload.kind === "move")!.payload as { choice?: Record<string, unknown> };
    expect(move.choice).toMatchObject({ scene: planned.id, engagement: engagement.id });
    expect(state().kept).toEqual([`${engagement.id}@Day 4 19:00`]);
  });
});

describe("the Director builds on what he has arranged (director-knows-engagements)", () => {
  // GIVEN he told Draconia to meet him in the library at ten on Saturday, and it was recorded
  // WHEN the Director plans a Scene that matters about the debt with her
  // THEN it is the library at ten on Saturday, and the Day View offers it once, as the Story's pick
  // AND no second meeting with her about it is planned
  it("long-run › The Director shapes the long run around Arcs and Landmarks › A Scene that matters he arranged", async () => {
    const story = fridayNight();
    const told = "I tell Draconia to meet me in the library at ten tomorrow.";
    const recorded = { answer: JSON.stringify({ summary: "He told Draconia to meet him in the library at ten.", paragraph: "He sent word to Draconia: the library, ten tomorrow.", moments: [], told: [], known: [], bonds: [], changed: [],
      engagements: [{ what: "Draconia, about the train and what she owes.", at: "Day 4 10:00", place: "The library", who: ["Draconia Malfoy"], expected: true, every: null, quotes: [{ entry: "P2", text: told }] }] }) };
    // The Director puts the talk about the debt on Sunday afternoon at the back tables, and names it as his Engagement.
    const plan = charmsWeek(story, { scenes: [
      scene({ date: "1991-09-08", time: "14:00", place: "The back tables", who: ["Draconia Malfoy"], for: "The debt, away from Pansy.", lead: "Draconia Malfoy", engagement: "E1" }),
      scene({ id: "S2", date: "1991-09-12", time: "15:00", place: "The library", who: ["Hermione Granger"], for: "Hermione's flying notes.", lead: "Hermione Granger" })
    ] });
    const { engine, storyId, head, play, view, state, models } = playable(story, { chronicler: [recorded], director: [plan] });
    await play(told);
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);

    expect(models.director.requests[0]!.prompt).toContain("What he has arranged:\n- E1 Saturday 7 September 1991, 10:00 am, The library: Draconia, about the train and what she owes. With Draconia Malfoy. He is expected.");
    const engagement = state().calendar[0]!;
    expect(state().plan!.scenes[0]).toMatchObject({ at: "Day 4 10:00", place: "The library", engagement: engagement.id });
    expect(state().plan!.scenes.filter(item => item.who.includes("Draconia Malfoy"))).toHaveLength(1);
    const day = view().day_view!;
    expect(day.happenings[0]).toMatchObject({ at: "Day 4 10:00", place: "The library", pick: true, expected: true });
    expect(day.happenings.filter(item => item.who.includes("Draconia Malfoy") && item.place.toLowerCase().includes("library"))).toHaveLength(1);
  });
});

describe("Leads act every Stretch, on screen or off (story-in-stretches design decision 4)", () => {
  const seating = "Draconia had his name taken off the Charms seating plan.";
  const told = "Neville says Draconia had your name taken off the Charms seating plan.";

  // GIVEN a Stretch in which Draconia has no Scene with him
  // WHEN its days pass
  // THEN Backstage shows what she did about him that week, and he learns of it as someone would tell it or as something
  //   he finds
  it("long-run › Leads act every Stretch › A move made off-screen reaches him", async () => {
    const story = fridayNight();
    const offScreen = charmsWeek(story, {
      scenes: [
        scene({ date: "1991-09-12", time: "10:00", place: "The library", who: ["Hermione Granger"], for: "Hermione's flying notes.", lead: "Hermione Granger" }),
        scene({ id: "S2", date: "1991-09-12", time: "16:00", place: "The Quidditch pitch", who: ["Harry Potter"], for: "Harry shows him how to hold a broom." })
      ],
      leads: [{ who: "Draconia Malfoy", move: "Has his name taken off the Charms seating plan.", scene: null }, { who: "Hermione Granger", move: "Lends him her notes.", scene: "S1" }]
    });
    // The night passes with nothing in it; over the days to Thursday, Neville sees her move made, and tells him.
    const makesIt = worldWith(
      [{ id: "H9", what: seating, at: "Day 7 12:00", where: "Flitwick's office", known_to: ["Draconia Malfoy", "Neville Longbottom", "Roopesh Gantasala"], move: "Draconia Malfoy" }],
      [{ text: told, how: "told", happened: "H9", told_by: "Neville Longbottom", about: ["Draconia Malfoy"] }]
    );
    const { engine, storyId, head, play, view, state, mac, models } = playable(story, { director: [offScreen], weaver: [quietWorld, makesIt] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(models.weaver.requests[0]!.prompt).toContain("<lead_moves_offscreen>\n- Draconia Malfoy: Has his name taken off the Charms seating plan.\n</lead_moves_offscreen>");

    engine.choose(storyId, { after: head(), kind: "go", happening: view().day_view!.happenings[0]!.id, gap: null }, "go");
    await engine.settled(storyId);
    expect(models.weaver.requests[1]!.prompt).toContain("- Draconia Malfoy: Has his name taken off the Charms seating plan.");
    expect(state().facts.find(fact => fact.move === "Draconia Malfoy")).toMatchObject({ what: seating, knownTo: expect.arrayContaining(["Neville Longbottom", "Roopesh Gantasala"]) });
    expect(heard(journalView(mac, storyId, "t"))).toContain(told);
    // Backstage shows the Stretch: its days, its Scenes that matter, and what each Lead did about him.
    const stretch = backstageView(mac, storyId, "t").director!.stretch!;
    expect(stretch).toMatchObject({ from_label: "Saturday", until_label: "Thursday" });
    expect(stretch.scenes.map(item => [item.time, item.place, item.state])).toEqual([["Thu 10:00 am", "The library", "played"], ["Thu 4:00 pm", "The Quidditch pitch", "ahead"]]);
    expect(stretch.leads).toEqual([
      { who: "Draconia Malfoy", move: "Has his name taken off the Charms seating plan.", on_screen: false, label: "Off-screen, Tuesday · he heard it from Neville Longbottom" },
      { who: "Hermione Granger", move: "Lends him her notes.", on_screen: true, label: "On screen · The library, Thursday" }
    ]);
  });

  // GIVEN Draconia has gone home for the weekend after her father's letter
  // WHEN the Day View opens on Monday
  // THEN Meanwhile can say what reached him of what she did, and nothing he could not know
  it("day-view › A Lead away still acts › Away, but not idle", async () => {
    const story = hogwartsWorldStoryFile({ title: "Sunday night", place: "The Gryffindor common room", at: "Day 5 22:40", who: ["Hermione Granger"] });
    story.people = [...story.people, { name: "Pansy Parkinson", who_they_are: "Draconia's friend, Slytherin." }] as StoryFile["people"];
    const letter = "Pansy says Draconia wrote to her from home, asking whether you had been at breakfast.";
    const cried = "Draconia cried in her room after her father's letter.";
    // What she did at home that reached him through Pansy, and what nobody could have told him.
    const away = worldWith([
      { id: "H8", what: "Draconia wrote to Pansy from the Manor, asking whether Roopesh had been at breakfast.", at: "Day 6 06:00", where: "Malfoy Manor", known_to: ["Draconia Malfoy", "Pansy Parkinson", "Roopesh Gantasala"], move: "Draconia Malfoy" },
      { id: "H9", what: cried, at: "Day 5 23:00", where: "Malfoy Manor", known_to: ["Draconia Malfoy"] }
    ], [{ text: letter, how: "told", happened: "H8", told_by: "Pansy Parkinson", about: ["Draconia Malfoy"] }]);
    // Monday is Day 6: the Stretch runs from it, with her move made off-screen.
    const week = charmsWeek(story, { scenes: [
      scene({ date: "1991-09-11", time: "10:00", place: "The Charms classroom", who: ["Draconia Malfoy"], for: "She is back, and pretends she was never gone.", lead: "Draconia Malfoy" }),
      scene({ id: "S2", date: "1991-09-13", time: "15:00", place: "The library", who: ["Hermione Granger"], for: "Hermione's flying notes.", lead: "Hermione Granger" })
    ], leads: [{ who: "Draconia Malfoy", move: "Writes to Pansy from home to ask after him.", scene: null }, { who: "Hermione Granger", move: "Lends him her notes.", scene: "S2" }] });
    const { engine, storyId, head, play, view, state, models, mac } = playable(story, { director: [week], weaver: [away] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const day = view().day_view!;
    expect(day.at).toBe("Day 6 07:30");
    expect(models.weaver.requests[0]!.prompt).toContain("- Draconia Malfoy: Writes to Pansy from home to ask after him.");
    // What she did reached him through Pansy; what nobody could have told him is Backstage only.
    expect(day.meanwhile).toEqual([{ text: letter, how: "told" }]);
    expect(state().facts.find(fact => fact.what === cried)!.knownTo).toEqual(["Draconia Malfoy"]);
    expect(backstageView(mac, storyId, "t").offscreen.flatMap(item => item.items).map(item => item.what)).toContain(cried);
  });
});

describe("spans: only what reaches him (story-in-stretches design decision 4)", () => {
  const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
  /** A Writer's answer, the Reply [minutes] on; [frame] opens a Scene when one opens. */
  const writer = (minutes: number, frame: { title: string; place: string } = { title: "kept", place: "kept" }) => ({ answer: JSON.stringify({ frame: { ...frame, purpose: "p", exit: "e" }, comes_in: [], goes: [], beats, note: "n", call: "continue", intensity: 2, minutes, in_play: [], moves_to: null }) });

  // GIVEN a Scene ends at 8:00 am, and the next is chosen for 8:20 am with nothing on before it
  // THEN the World is not moved for those twenty minutes
  it("living-world › Off-screen time is resolved only as far as it reaches the player › Twenty minutes with nothing on", async () => {
    // Saturday 7:30 am: the Stretch's first Scene that matters, and breakfast at 8:20.
    const saturday = { from: (request: ModelRequest) => {
      const weave = JSON.parse((fakeWeaveAnswer(request) as { answer: string }).answer) as Record<string, unknown>;
      return { answer: JSON.stringify({ ...weave, on: [{ at: "Day 4 08:20", place: "The Great Hall", what: "Breakfast, and the post.", who: ["Hermione Granger"] }] }) };
    } };
    const { engine, storyId, head, play, view, state, models } = playable(fridayNight(), {
      weaver: [saturday],
      writer: [writer(10), writer(10, { title: "The stairs", place: "The moving staircase" }), writer(20), writer(0, { title: "Breakfast", place: "The Great Hall" })]
    });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end-1");
    await engine.ended(storyId);
    expect(models.weaver.requests).toHaveLength(1);

    // A short Scene on the stairs, 7:40 to 8:00: half an hour since the World last stood, with nothing in it.
    await play("I take the long way down to breakfast.");
    await play("I wait for the stairs to swing back.");
    engine.endScene(storyId, head(), "end-2");
    await engine.ended(storyId);
    expect(models.weaver.requests).toHaveLength(1);
    const day = view().day_view!;
    expect(day).toMatchObject({ at: "Day 4 08:00", scene_end: { step: null, failed: null }, meanwhile: [] });
    // What is still ahead stays on, the Story's pick first.
    expect(day.happenings.map(item => [item.at, item.pick])).toEqual([[state().plan!.scenes[0]!.at, true], ["Day 4 08:20", false]]);

    // Breakfast at 8:20, with nothing on before it: the World is not moved for those twenty minutes either.
    engine.choose(storyId, { after: head(), kind: "go", happening: day.happenings[1]!.id, gap: null }, "go");
    await engine.settled(storyId);
    expect(models.weaver.requests).toHaveLength(1);
    expect(state().scene).toMatchObject({ number: 3, at: "Day 4 08:20" });
  });

  // WHEN five days pass between Scenes
  // THEN what happened lists what reached him or will, with each Lead's move among it, and no ordinary meal or lesson
  //   is listed
  // (Whether it lists a meal is the live check's; here, that the Weaver is told so, and makes each move due.)
  it("living-world › Off-screen time is resolved only as far as it reaches the player › Five days, told in a few lines", async () => {
    const story = fridayNight();
    const week = charmsWeek(story, { leads: [{ who: "Draconia Malfoy", move: "Has his name taken off the Charms seating plan.", scene: null }, { who: "Hermione Granger", move: "Lends him her notes.", scene: null }] });
    const { engine, storyId, head, play, view, path, models } = playable(story, { director: [week], weaver: [quietWorld] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    // To Thursday's Scene: five days and a bit.
    engine.choose(storyId, { after: head(), kind: "go", happening: view().day_view!.happenings[0]!.id, gap: null }, "go");
    await engine.settled(storyId);
    const request = models.weaver.requests.at(-1)!;
    expect(request.prompt).toContain('<span from="Saturday 7 September 1991, 7:30 am" until="Thursday 12 September 1991, 10:00 am">');
    expect(request.system).toContain("Skip uneventful routine.");
    expect(request.prompt).toContain("<lead_moves_offscreen>\n- Draconia Malfoy: Has his name taken off the Charms seating plan.\n- Hermione Granger: Lends him her notes.\n</lead_moves_offscreen>");
    const gap = gapOf(path());
    expect(gap.from).toBe("Day 4 07:30");
    expect(gap.happened.map(item => item.move).filter(Boolean)).toEqual(["Draconia Malfoy", "Hermione Granger"]);
  });
});

describe("the Writer frames a Scene that matters from the plan (story-in-stretches design decision 5)", () => {
  it("gives the first Writer call of a chosen pick its place, its people, what it is for and the Lead's move", async () => {
    const story = fridayNight();
    const { engine, storyId, head, play, view, state, mac, models } = playable(story, { director: [charmsWeek(story)] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const writes = models.writer.requests.length;
    engine.choose(storyId, { after: head(), kind: "story", happening: null, gap: null }, "story");
    await engine.settled(storyId);
    // The choice's Move carries the Scene that matters it is.
    const planned = state().plan!.scenes[0]!;
    const move = mac.tree.pathTo(head()).filter(entry => entry.payload.kind === "move").at(-1)!;
    expect(move.payload).toMatchObject({ choice: { scene: planned.id } });
    const prompt = models.writer.requests[writes]!.prompt;
    expect(prompt).toContain("The player chose at the Day View: go to The corridor outside Charms on Thursday 12 September 1991 at 10:00 am with Draconia Malfoy. Open the Scene it begins.");
    expect(prompt).toContain(`<scene_that_matters>\n${CORNERS} It is about Draconia Malfoy.`);
    expect(prompt).toContain("Corners him after Charms.");
    expect(view().scene).toMatchObject({ number: 2 });
  });
});

describe("skipping a week (story-in-stretches design decision 6)", () => {
  // WHEN the player skips to next week
  // THEN the next Scene opens a week on, and Meanwhile says what he learned in it
  it("day-view › The player chooses where to be › Skipping a week", async () => {
    const learned = "Hermione says the flying test went ahead without you, and Draconia came first.";
    const week = worldWith(
      [{ id: "H9", what: "Draconia came first in the flying test.", at: "Day 8 11:00", where: "The Quidditch pitch", known_to: ["Draconia Malfoy", "Hermione Granger", "Roopesh Gantasala"] }],
      [{ text: learned, how: "told", happened: "H9", told_by: "Hermione Granger", about: ["Draconia Malfoy"] }]
    );
    const { engine, storyId, head, play, view, state, mac } = playable(fridayNight(), { weaver: [{ from: fakeWeaveAnswer }, week] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    // Saturday 7:30 am: next week is the Saturday after, on waking.
    const next = view().day_view!.choices.skips.find(skip => skip.label === "Next week")!;
    expect(next).toMatchObject({ in_sentence: "next week", at: "Day 11 07:30", time: "Saturday 7:30 am", days_away: 7 });
    engine.choose(storyId, { after: head(), kind: "skip", at: next.at, gap: null }, "skip");
    await engine.settled(storyId);
    expect(state().scene).toMatchObject({ number: 2, at: "Day 11 07:30" });
    expect(heard(journalView(mac, storyId, "t"))).toContain(learned);
  });
});
