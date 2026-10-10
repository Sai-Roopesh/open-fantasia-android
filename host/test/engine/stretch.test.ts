import { describe, expect, it } from "vitest";
import { nextLandmarks } from "../../src/agents/director.js";
import { fakeWeaveAnswer } from "../../src/models/fake.js";
import type { ModelRequest } from "../../src/models/model-call.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import type { WorldMoved } from "../../src/story/entries.js";
import { backstageView } from "../../src/views/backstage.js";
import { journalView } from "../../src/views/journal.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

/** Friday night after curfew, Day 3 (Day 1 was a Wednesday), with Hermione. */
function fridayNight(): StoryFile {
  return hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] });
}

/** A Stretch from Saturday to Saturday week whose next Scene that matters is Draconia cornering him after Charms on Thursday. */
function charmsWeek(story: StoryFile, changes: Record<string, unknown> = {}) {
  const coming = nextLandmarks({ clock: story.clock!.starts!, landmarks: story.landmarks ?? [] } as never).map(landmark => landmark.name);
  return {
    from: "Day 4", until: "Day 11", toward: "the flying test", landmark: null, phase: "build",
    scenes: [
      { id: "S1", at: "Day 9 10:00", place: "The corridor outside Charms", who: ["Draconia Malfoy"], for: "She corners him about the seating plan.", lead: "Draconia Malfoy" },
      { id: "S2", at: "Day 10 15:00", place: "The library", who: ["Hermione Granger"], for: "Hermione's flying notes.", lead: "Hermione Granger" }
    ],
    arcs: story.arcs!.map(arc => ({ arc, now: "where it was", next: "a step", not_yet: "anything declared" })),
    leads: [{ who: "Draconia Malfoy", move: "Corners him after Charms.", scene: "S1" }, { who: "Hermione Granger", move: "Lends him her notes.", scene: "S2" }],
    roadmap: story.arcs!.flatMap(arc => coming.map(by => ({ arc, by, stands: "a step on" }))),
    premise: "Draconia's Scenes serve it; Hermione's leave it alone.",
    ...changes
  };
}

const learned = "Neville says Draconia had the Charms seating plan changed on Tuesday.";

describe("the Story's pick is the Stretch's next Scene that matters (story-in-stretches design decision 4)", () => {
  // GIVEN it is Saturday morning, and the Stretch's next Scene that matters is Draconia cornering him after Charms on
  //   Thursday
  // THEN the Day View's first offer is Thursday's, labelled "Thursday 10:00 am · in 5 days"
  // WHEN the player chooses it
  // THEN the days between pass, the next Scene opens on Thursday, and Meanwhile says what he learned since Saturday
  it("day-view › Up to four Happenings › The next Scene that matters is days away", async () => {
    const story = fridayNight();
    // The span to Thursday tells him one thing, from Neville.
    const days = { from: (request: ModelRequest) => {
      const weave = JSON.parse((fakeWeaveAnswer(request) as { answer: string }).answer) as Record<string, unknown[]>;
      return { answer: JSON.stringify({ ...weave,
        happened: [...weave.happened!, { id: "H9", what: "Draconia had the Charms seating plan changed.", at: "Day 7 12:00", where: "Flitwick's office", known_to: ["Draconia Malfoy", "Neville Longbottom", "Roopesh Gantasala"], landmark: null }],
        meanwhile: [{ text: learned, how: "told", happened: "H9", told_by: "Neville Longbottom", about: ["Draconia Malfoy"] }] }) };
    } };
    const { engine, storyId, head, play, view, mac, models } = playable(story, { director: [{ answer: JSON.stringify(charmsWeek(story)) }], weaver: [{ from: fakeWeaveAnswer }, days] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);

    // Saturday morning: the first offer is Thursday's, the Story's pick, built from the plan but in the World's words.
    const day = view().day_view!;
    expect(day.at).toBe("Day 4 07:30");
    const planned = (mac.tree.recordsOn(head(), "director_plan").at(-1)!.payload as { scenes: { id: string }[] }).scenes[0]!.id;
    expect(day.happenings[0]).toMatchObject({ at: "Day 9 10:00", time: "Thursday 10:00 am", days_away: 5, scene: planned, place: "The corridor outside Charms", who: ["Draconia Malfoy"], pick: true });
    expect(models.weaver.requests[0]!.prompt).toContain("<next_scene_that_matters");
    expect(JSON.stringify(day)).not.toContain("She corners him about the seating plan.");

    // Chosen: the days pass as a Gap, and the Scene opens on Thursday.
    engine.choose(storyId, { after: head(), kind: "go", happening: day.happenings[0]!.id, gap: null }, "go");
    await engine.settled(storyId);
    const gap = mac.tree.recordsOn(head(), "world_moved").at(-1)!.payload as WorldMoved;
    expect(gap).toMatchObject({ from: "Day 4 07:30", until: "Day 9 10:00" });
    expect(mac.states.at(head()).scene).toMatchObject({ number: 2, at: "Day 9 10:00" });
    expect(journalView(mac, storyId, "t").days.flatMap(day => day.rows).some(row => row.meanwhile?.text === learned)).toBe(true);
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
    const meeting = { id: "S1", at: "Day 4 19:00", place: "The library", who: ["Hermione Granger"], for: "He tells her what he can about the train.", lead: "Hermione Granger" };
    const plan = charmsWeek(story, { scenes: [meeting, charmsWeek(story).scenes[0]], leads: [{ who: "Draconia Malfoy", move: "Corners him after Charms.", scene: "S2" }, { who: "Hermione Granger", move: "Hears him out.", scene: "S1" }] });
    plan.scenes[1] = { ...plan.scenes[1]!, id: "S2" };
    const { engine, storyId, head, play, view, mac } = playable(story, { director: [{ answer: JSON.stringify(plan) }], weaver: [{ from: fakeWeaveAnswer }, { from: fakeWeaveAnswer }] });
    const opening = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "scene_opened")!;
    const promise = { id: "g-promise", what: "He is to tell Hermione what he can about the train.", at: "Day 4 19:00", place: "The library", who: ["Hermione Granger"], expected: true, every: null, quotes: [{ entry: "E1", text: "x" }] };
    mac.tree.append(storyId, opening.id, { kind: "chronicle", scene: opening.id, summary: null, sceneEnded: false, moments: [], told: [], engagements: [promise], callId: "c", model: { provider: "claude", model: "claude-sonnet-5-5" } });
    await play("I promise Hermione I will meet her in the library at seven tomorrow.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);

    const day = view().day_view!;
    const planned = (mac.tree.recordsOn(head(), "director_plan").at(-1)!.payload as { scenes: { id: string }[] }).scenes[0]!.id;
    expect(day.happenings[0]).toMatchObject({ at: "Day 4 19:00", place: "The library", who: ["Hermione Granger"], pick: true, expected: true, scene: planned });
    expect(day.happenings.filter(item => item.place === "The library")).toHaveLength(1);

    engine.choose(storyId, { after: head(), kind: "story", happening: null, gap: null }, "go");
    await engine.settled(storyId);
    expect(mac.states.at(head()).scene).toMatchObject({ number: 2, at: "Day 4 19:00", place: "The library" });
    const move = mac.tree.pathTo(head()).findLast(entry => entry.payload.kind === "move")!.payload as { choice?: Record<string, unknown> };
    expect(move.choice).toMatchObject({ scene: planned, engagement: "g-promise" });
  });
});

describe("Leads act every Stretch, on screen or off (story-in-stretches design decision 4)", () => {
  const seating = "Draconia had his name taken off the Charms seating plan.";
  const told = "Neville says Draconia had your name taken off the Charms seating plan.";
  /** The span that makes Draconia's move: in the Gap to Thursday, Neville sees it done and tells him. */
  const makesIt = { from: (request: ModelRequest) => {
    const weave = JSON.parse((fakeWeaveAnswer(request) as { answer: string }).answer) as Record<string, unknown[]>;
    return { answer: JSON.stringify({ ...weave,
      happened: [...weave.happened!.filter(item => (item as { move?: string }).move !== "Draconia Malfoy"), { id: "H9", what: seating, at: "Day 7 12:00", where: "Flitwick's office", known_to: ["Draconia Malfoy", "Neville Longbottom", "Roopesh Gantasala"], landmark: null, move: "Draconia Malfoy" }],
      meanwhile: [{ text: told, how: "told", happened: "H9", told_by: "Neville Longbottom", about: ["Draconia Malfoy"] }] }) };
  } };

  // GIVEN a Stretch in which Draconia has no Scene with him
  // WHEN its days pass
  // THEN Backstage shows what she did about him that week, and he learns of it as someone would tell it or as something
  //   he finds
  // (Backstage's half is proved with the Stretch's view, with contract 18; here, that it is made and recorded as hers.)
  it("long-run › Leads act every Stretch › A move made off-screen reaches him", async () => {
    const story = fridayNight();
    const offScreen = charmsWeek(story, {
      scenes: [
        { id: "S1", at: "Day 9 10:00", place: "The library", who: ["Hermione Granger"], for: "Hermione's flying notes.", lead: "Hermione Granger" },
        { id: "S2", at: "Day 9 16:00", place: "The Quidditch pitch", who: ["Harry Potter"], for: "Harry shows him how to hold a broom.", lead: null }
      ],
      leads: [{ who: "Draconia Malfoy", move: "Has his name taken off the Charms seating plan.", scene: null }, { who: "Hermione Granger", move: "Lends him her notes.", scene: "S1" }]
    });
    const { engine, storyId, head, play, view, mac, models } = playable(story, { director: [{ answer: JSON.stringify(offScreen) }], weaver: [{ from: fakeWeaveAnswer }, makesIt] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    expect(models.weaver.requests[0]!.prompt).toContain("- Draconia Malfoy: Has his name taken off the Charms seating plan.");

    engine.choose(storyId, { after: head(), kind: "go", happening: view().day_view!.happenings[0]!.id, gap: null }, "go");
    await engine.settled(storyId);
    const gap = mac.tree.recordsOn(head(), "world_moved").at(-1)!.payload as WorldMoved;
    expect(gap.happened.find(item => item.move === "Draconia Malfoy")).toMatchObject({ what: seating, knownTo: expect.arrayContaining(["Neville Longbottom", "Roopesh Gantasala"]) });
    expect(journalView(mac, storyId, "t").days.flatMap(day => day.rows).some(row => row.meanwhile?.text === told)).toBe(true);
    // Backstage shows the Stretch: its days, its Scenes that matter, and what each Lead did about him.
    const stretch = backstageView(mac, storyId, "t").director!.stretch!;
    expect(stretch).toMatchObject({ from_label: "Saturday", until_label: "Saturday" });
    expect(stretch.scenes.map(scene => [scene.time, scene.place, scene.state])).toEqual([["Thu 10:00 am", "The library", "played"], ["Thu 4:00 pm", "The Quidditch pitch", "ahead"]]);
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
    const letter = "Pansy says Draconia wrote to her from home, asking whether you had been at breakfast.";
    /** The span to Monday: what she did at home, and, the first time, a line he could not know. */
    const away = (withHidden: boolean) => ({ from: (request: ModelRequest) => {
      const weave = JSON.parse((fakeWeaveAnswer(request) as { answer: string }).answer) as Record<string, unknown[]>;
      return { answer: JSON.stringify({ ...weave,
        happened: [
          ...weave.happened!.filter(item => (item as { move?: string }).move !== "Draconia Malfoy"),
          { id: "H8", what: "Draconia wrote to Pansy from the Manor, asking whether Roopesh had been at breakfast.", at: "Day 6 06:00", where: "Malfoy Manor", known_to: ["Draconia Malfoy", "Pansy Parkinson", "Roopesh Gantasala"], landmark: null, move: "Draconia Malfoy" },
          { id: "H9", what: "Draconia cried in her room after her father's letter.", at: "Day 5 23:00", where: "Malfoy Manor", known_to: ["Draconia Malfoy"], landmark: null }
        ],
        meanwhile: [
          { text: letter, how: "told", happened: "H8", told_by: "Pansy Parkinson", about: ["Draconia Malfoy"] },
          ...(withHidden ? [{ text: "Draconia cried in her room at the Manor.", how: "rumour", happened: "H9", told_by: null, about: ["Draconia Malfoy"] }] : [])
        ] }) };
    } });
    story.people = [...story.people, { name: "Pansy Parkinson", who_they_are: "Draconia's friend, Slytherin." }] as StoryFile["people"];
    const week = charmsWeek(story, { from: "Day 6", until: "Day 12", scenes: [
      { id: "S1", at: "Day 8 10:00", place: "The Charms classroom", who: ["Draconia Malfoy"], for: "She is back, and pretends she was never gone.", lead: "Draconia Malfoy" },
      { id: "S2", at: "Day 10 15:00", place: "The library", who: ["Hermione Granger"], for: "Hermione's flying notes.", lead: "Hermione Granger" }
    ], leads: [{ who: "Draconia Malfoy", move: "Writes to Pansy from home to ask after him.", scene: null }, { who: "Hermione Granger", move: "Lends him her notes.", scene: "S2" }] });
    const { engine, storyId, head, play, view, models } = playable(story, { director: [{ answer: JSON.stringify(week) }], weaver: [away(true), away(false)] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    const day = view().day_view!;
    expect(day.at).toMatch(/^Day 6 /);
    // What she did reached him through Pansy; what nobody could have told him was sent back, and is not there.
    expect(models.weaver.requests[0]!.prompt).toContain("- Draconia Malfoy: Writes to Pansy from home to ask after him.");
    expect(models.weaver.requests[1]!.prompt).toContain("meanwhile: item 2 tells of H9, which the player's character does not know");
    expect(day.meanwhile).toEqual([{ text: letter, how: "told" }]);
  });
});

describe("spans: only what reaches him (story-in-stretches design decision 4)", () => {
  const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
  const writerAt = (clock: string, frame: { title: string; place: string } | null = null) => ({ answer: JSON.stringify({ leaves_scene: frame !== null, frame: frame ? { ...frame, purpose: "p", exit: "e" } : { title: "kept", place: "kept", purpose: "p", exit: "e" }, comes_in: [], goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, clock, taste: null, in_play: [] }) });

  // GIVEN a Scene ends at 8:00 am, and the next is chosen for 8:20 am with nothing on before it
  // THEN the World is not moved for those twenty minutes
  it("living-world › Off-screen time is resolved only as far as it reaches the player › Twenty minutes with nothing on", async () => {
    const story = fridayNight();
    // Saturday 7:30 am: Thursday's Scene that matters, and breakfast at 8:20.
    const saturday = { from: (request: ModelRequest) => {
      const weave = JSON.parse((fakeWeaveAnswer(request) as { answer: string }).answer) as Record<string, unknown[]>;
      return { answer: JSON.stringify({ ...weave, happenings: [...weave.happenings!, { id: "P2", at: "Day 4 08:20", place: "The Great Hall", what: "Breakfast, and the post.", who: ["Hermione Granger"], expected: false, pick: false, scene: null }] }) };
    } };
    const { engine, storyId, head, play, view, mac, models } = playable(story, {
      director: [{ answer: JSON.stringify(charmsWeek(story)) }],
      weaver: [saturday],
      writer: [writerAt("Day 3 22:50"), writerAt("Day 4 07:40", { title: "The stairs", place: "The moving staircase" }), writerAt("Day 4 08:00"), writerAt("Day 4 08:20", { title: "Breakfast", place: "The Great Hall" })]
    });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end-1");
    await engine.woven(storyId);
    expect(models.weaver.requests).toHaveLength(1);

    // A short Scene on the stairs, 7:40 to 8:00: half an hour since the World last stood, with nothing in it.
    await play("I take the long way down to breakfast.");
    await play("I wait for the stairs to swing back.");
    engine.endScene(storyId, head(), "end-2");
    await engine.woven(storyId);
    expect(models.weaver.requests).toHaveLength(1);
    const day = view().day_view!;
    expect(day).toMatchObject({ at: "Day 4 08:00", world: "ready", meanwhile: [] });
    // What is still ahead stays on, the Story's pick first.
    expect(day.happenings.map(item => [item.at, item.pick])).toEqual([["Day 9 10:00", true], ["Day 4 08:20", false]]);

    // Breakfast at 8:20, with nothing on before it: the World is not moved for those twenty minutes either.
    engine.choose(storyId, { after: head(), kind: "go", happening: day.happenings[1]!.id, gap: null }, "go");
    await engine.settled(storyId);
    expect(models.weaver.requests).toHaveLength(1);
    expect(mac.states.at(head()).scene).toMatchObject({ number: 3, at: "Day 4 08:20" });
  });

  // WHEN five days pass between Scenes
  // THEN what happened lists what reached him or will, with each Lead's move among it, and no ordinary meal or lesson
  //   is listed
  // (Whether it lists a meal is the live check's; here, that the Weaver is told so, and makes each move due.)
  it("living-world › Off-screen time is resolved only as far as it reaches the player › Five days, told in a few lines", async () => {
    const story = fridayNight();
    const week = charmsWeek(story, { leads: [{ who: "Draconia Malfoy", move: "Has his name taken off the Charms seating plan.", scene: null }, { who: "Hermione Granger", move: "Lends him her notes.", scene: null }] });
    const { engine, storyId, head, play, view, mac, models } = playable(story, { director: [{ answer: JSON.stringify(week) }] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    // To Thursday's Scene: five days and a bit, the Stretch's last Scene that matters not yet reached.
    engine.choose(storyId, { after: head(), kind: "go", happening: view().day_view!.happenings[0]!.id, gap: null }, "go");
    await engine.settled(storyId);
    const prompt = models.weaver.requests.at(-1)!.prompt;
    expect(prompt).toContain("Five days pass.");
    expect(prompt).toContain("Let ordinary days pass without listing them: no meal, lesson or night's sleep that changed nothing.");
    expect(prompt).toContain("- Draconia Malfoy: Has his name taken off the Charms seating plan.");
    expect((mac.tree.recordsOn(head(), "world_moved").at(-1)!.payload as WorldMoved).from).toBe("Day 4 07:30");
  });
});

describe("the Writer frames a Scene that matters from the plan (story-in-stretches design decision 5)", () => {
  it("gives the first Writer call of a chosen pick its place, its people, what it is for and the Lead's move", async () => {
    const story = fridayNight();
    const { engine, storyId, head, play, view, mac, models } = playable(story, { director: [{ answer: JSON.stringify(charmsWeek(story)) }] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    const writes = models.writer.requests.length;
    engine.choose(storyId, { after: head(), kind: "story", gap: null }, "story");
    await engine.settled(storyId);
    // The choice's Move carries the Scene that matters it is.
    const move = mac.tree.pathTo(head()).filter(entry => entry.payload.kind === "move").at(-1)!;
    const planned = (mac.tree.recordsOn(head(), "director_plan").at(-1)!.payload as { scenes: { id: string }[] }).scenes[0]!.id;
    expect(move.payload).toMatchObject({ choice: { scene: planned } });
    const prompt = models.writer.requests[writes]!.prompt;
    expect(prompt).toContain('<scene_that_matters at="Day 9 10:00 (Thursday 10:00 am)" place="The corridor outside Charms" with="Draconia Malfoy">');
    expect(prompt).toContain("For: She corners him about the seating plan.");
    expect(prompt).toContain("Draconia Malfoy's move: Corners him after Charms.");
    expect(view().scene).toMatchObject({ number: 2 });
  });
});

describe("skipping a week (story-in-stretches design decision 6)", () => {
  // WHEN the player skips to next week
  // THEN the next Scene opens a week on, and Meanwhile says what he learned in it
  it("day-view › The player chooses where to be › Skipping a week", async () => {
    const learned = "Hermione says the flying test went ahead without you, and Draconia came first.";
    const week = { from: (request: ModelRequest) => {
      const weave = JSON.parse((fakeWeaveAnswer(request) as { answer: string }).answer) as Record<string, unknown[]>;
      return { answer: JSON.stringify({ ...weave,
        happened: [...weave.happened!, { id: "H9", what: "Draconia came first in the flying test.", at: "Day 8 11:00", where: "The Quidditch pitch", known_to: ["Draconia Malfoy", "Hermione Granger", "Roopesh Gantasala"], landmark: null }],
        meanwhile: [{ text: learned, how: "told", happened: "H9", told_by: "Hermione Granger", about: ["Draconia Malfoy"] }] }) };
    } };
    const { engine, storyId, head, play, view, mac } = playable(fridayNight(), { weaver: [{ from: fakeWeaveAnswer }, week] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    // Saturday 7:30 am: next week is the Saturday after, on waking.
    const next = view().day_view!.choices.skips.find(skip => skip.label === "Next week")!;
    expect(next).toMatchObject({ in_sentence: "next week", at: "Day 11 07:30", time: "Saturday 7:30 am", days_away: 7 });
    engine.choose(storyId, { after: head(), kind: "skip", at: next.at, gap: null }, "skip");
    await engine.settled(storyId);
    expect(mac.states.at(head()).scene).toMatchObject({ number: 2, at: "Day 11 07:30" });
    expect(journalView(mac, storyId, "t").days.flatMap(day => day.rows).some(row => row.meanwhile?.text === learned)).toBe(true);
  });
});
