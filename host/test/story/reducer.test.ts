import { describe, expect, it } from "vitest";
import { emptyUpdate } from "../../src/story/truth.js";
import { composerCall } from "../../src/agents/composer.js";
import { nothingBeside } from "../../src/story/beside.js";
import type { BeatNote, Chronicle, DirectorPlan, Entry, Payload, StoryFolded, WorldMoved } from "../../src/story/entries.js";
import { apply, RECENT_PLANS } from "../../src/story/reducer.js";
import type { Beat, Engagement, PlannedScene, State } from "../../src/story/state.js";
import { minimalStoryFile } from "../support/story-files.js";
import { nightTrain } from "../support/stories.js";

let seq = 100;
function entry(payload: Payload): Entry {
  seq += 1;
  return { seq, id: `e${seq}`, storyId: "s", parentId: null, payload, createdAt: "2026-10-05T00:00:00Z" };
}

const beats = (inPlay: number): Beat[] => [0, 1, 2].map(index => ({ text: `beat ${index + 1}`, status: index < inPlay ? "done" : index === inPlay ? "in_play" : "pending" }));

function note(changes: Partial<BeatNote> = {}): Payload {
  return { kind: "beat_note", plan: null, here: ["Meera Kulkarni", "Uncle Bhalla"], goes: [], beats: beats(0), note: "Meera sits.", call: "continue", intensity: 2, clock: "Day 1 22:45", inPlay: [], callId: "c", model: { provider: "claude", model: "claude-sonnet-5-5" }, ...changes };
}

const play = (state: State, ...payloads: Payload[]) => payloads.reduce((current, payload) => apply(current, entry(payload)), state);

describe("the reducer", () => {
  it("opens a Story File's first Scene with its people, unplanned, unfocused when more than one other person is there", () => {
    const { state } = nightTrain();
    expect(state.scene).toMatchObject({ here: ["Meera Kulkarni", "Uncle Bhalla"], purpose: null, exit: null, beats: [], focus: null, linger: false, closed: null });
    expect(state.scene!.startsAt).toBe(state.scene!.openedBy);
    expect(state).toMatchObject({ pendingDirection: null });
  });

  it("starts a Scene with one other person focused on them", () => {
    const setUp = apply(null, entry({ kind: "story_set_up", storyFile: minimalStoryFile(), portraits: {} }));
    const opened = apply(setUp, entry({ kind: "scene_opened", number: 1, title: "The night train", place: "A compartment", at: "Day 1 23:10", who: ["Mira"], prose: "The train lurches.", startsAt: null, purpose: null, exit: null }));
    expect(opened.scene!.focus).toBe("Mira");
  });

  it("takes the Writer's plan, beats, people, call and clock from a Beat Note", () => {
    const { state } = nightTrain();
    const after = play(state, { kind: "move", text: "I offer her the window." }, note({ plan: { purpose: "Meera decides.", exit: "She sits, or not." }, here: ["Meera Kulkarni"], call: "land", note: "Bhalla leaves for tea.", intensity: 3 }));
    expect(after.scene).toMatchObject({ purpose: "Meera decides.", exit: "She sits, or not.", here: ["Meera Kulkarni"], beats: beats(0), note: "Bhalla leaves for tea.", call: "land", intensity: 3 });
    expect(after.clock).toBe("Day 1 22:45");
  });

  it("keeps the memories the Writer put in play until its next Beat Note", () => {
    const { state } = nightTrain();
    expect(play(state, note({ inPlay: ["moment-seat"] })).scene!.inPlay).toEqual(["moment-seat"]);
    expect(play(state, note({ inPlay: ["moment-seat"] }), note({ inPlay: [] })).scene!.inPlay).toEqual([]);
  });

  it("takes whoever goes out of the Scene once the Reply that has them go is written, and Focus on them clears", () => {
    const { state } = nightTrain();
    const model = { provider: "claude", model: "claude-opus-5-5" } as const;
    const focused = play(state, { kind: "focus_set", on: "Uncle Bhalla" });
    const planned = play(focused, { kind: "move", text: "Bhalla goes for tea." }, note({ goes: ["Uncle Bhalla"] }));
    expect(planned.scene).toMatchObject({ here: ["Meera Kulkarni", "Uncle Bhalla"], goes: ["Uncle Bhalla"], focus: "Uncle Bhalla" });
    const written = play(planned, { kind: "reply", text: "Bhalla takes his thermos and goes.", callId: "c", model });
    expect(written.scene).toMatchObject({ here: ["Meera Kulkarni"], goes: [], focus: null });
  });

  it("closes a Scene, clearing Focus and Linger", () => {
    const { state } = nightTrain();
    const after = play(state, { kind: "focus_set", on: "Meera Kulkarni" }, { kind: "linger_set", on: true }, { kind: "scene_closed", by: "player" });
    expect(after.scene).toMatchObject({ closed: "player", focus: null, linger: false });
  });

  it("sets and clears Focus and Linger", () => {
    const { state } = nightTrain();
    expect(play(state, { kind: "focus_set", on: "Meera Kulkarni" }).scene!.focus).toBe("Meera Kulkarni");
    expect(play(state, { kind: "focus_set", on: "Meera Kulkarni" }, { kind: "focus_set", on: null }).scene!.focus).toBeNull();
    expect(play(state, { kind: "linger_set", on: true }).scene!.linger).toBe(true);
  });

  it("holds a Redo's Direction until its Beat Note, and remembers every Direction given", () => {
    const { state } = nightTrain();
    const redone = play(state, { kind: "redo", direction: "less Bhalla", remember: false });
    expect(redone.pendingDirection).toEqual({ text: "less Bhalla", remember: false });
    expect(redone.pendingDirection?.text).toBe("less Bhalla");
    expect(play(redone, note()).pendingDirection).toBeNull();
    expect(play(state, { kind: "redo", direction: null, remember: false }).pendingDirection?.text).toBeNull();
  });

  it("opens a Scene a Move began, from that Move, with the Writer's frame", () => {
    const { state } = nightTrain();
    const move = entry({ kind: "move", text: "I go to the vestibule." });
    const opened = apply(apply(state, move), entry({ kind: "scene_opened", number: 2, title: "Air", place: "The vestibule", at: "Day 1 22:50", who: ["Uncle Bhalla"], prose: null, startsAt: move.id, purpose: "Bhalla gets his say.", exit: "He goes back, or Ishaan does." }));
    expect(opened.scene).toMatchObject({ number: 2, here: ["Uncle Bhalla"], startsAt: move.id, purpose: "Bhalla gets his say.", focus: "Uncle Bhalla", beats: [], closed: null });
    expect(opened.clock).toBe("Day 1 22:50");
  });
});

describe("pacing", () => {
  it("sets no reply deadline on a beat, however long it has been in play", () => {
    const { state } = nightTrain();
    const stalled = play(state, ...Array.from({ length: 5 }, () => note({ plan: { purpose: "p", exit: "e" }, beats: beats(0) })));
    const call = composerCall({ state: stalled, scene: [], move: "I say nothing.", choice: null, beside: nothingBeside() });
    expect(call.system).toContain("Only the player's End Scene closes a Scene.");
    expect(call.prompt).not.toMatch(/in play for \d+ Replies|No Arc has moved/);
  });
});

const SONNET = { provider: "claude", model: "claude-sonnet-5-5" } as const;
const PC = "Ishaan Mehra";

function chronicle(changes: Partial<Chronicle> = {}): Chronicle {
  return { kind: "chronicle", truth: emptyUpdate(), scene: 1, summary: "Meera took the window seat.", paragraph: "Ishaan gave up the window; Meera took it, and talked.", moments: [], told: [], known: [], bonds: [], engagements: [], changed: [], dropped: [], callId: "c", model: SONNET, ...changes };
}

function moved(changes: Partial<WorldMoved> = {}): WorldMoved {
  return { kind: "world_moved", truth: emptyUpdate(), scene: 1, gap: false, from: "Day 1 22:45", until: "Day 2 07:30", lives: [], threads: [], happened: [], meanwhile: [], on: [], dropped: [], callId: "w", model: SONNET, ...changes };
}

function planned(changes: Partial<DirectorPlan> = {}): DirectorPlan {
  return {
    kind: "director_plan", from: 2, until: 6, toward: "Kalka", landmark: null, phase: "build", scenes: [scene("s1.1", "Day 3 10:00")], leads: [], arcs: [], roadmap: [], premise: "",
    newThings: [{ kind: "mystery", what: "A locked compartment.", scene: null, person: null, setup: "u1" }], people: [], reason: "There is no plan yet.", afterScene: 1, dropped: [], callId: "d", model: SONNET, ...changes
  };
}

function scene(id: string, at: string): PlannedScene {
  return { id, at, place: "The dining car", who: ["Meera Kulkarni"], for: "A step.", offer: "Breakfast is being served.", headline: "The dining car: a step", lead: "Meera Kulkarni", engagement: null, quiet: false, serves: { turn: null, lives: ["Meera Kulkarni"] } };
}

const tea: Engagement = { id: "g-tea", what: "Tea with Meera.", at: "Day 2 08:00", place: "The dining car", who: ["Meera Kulkarni"], expected: true, every: null, quotes: [{ entry: "e1", text: "Tea at eight, then." }] };

/** The Night Train's first Scene, played and closed at 10:45 pm, its end still to come. */
function closed(): State {
  const { state } = nightTrain();
  return play(state, { kind: "move", text: "I offer her the window." }, note({ intensity: 4 }), note({ intensity: 2 }), { kind: "scene_closed", by: "player" });
}

describe("the State, one fold of the Path (docs/adr/0015)", () => {
  it("closes a Scene at its clock, frees him when he is next free, and puts its peak on the curve, its end still to do", () => {
    const state = closed();
    expect(state.scene).toMatchObject({ closed: "player", endedAt: "Day 1 22:45", ended: [] });
    expect(state.clock).toBe("Day 2 07:30");
    expect(state.curve).toEqual([{ scene: 1, title: state.scene!.title, peak: 4 }]);
  });

  it("takes the Chronicler's record: Moments known to who was there, the Scene's paragraph, what he knows, Bonds, Engagements and the record's line", () => {
    const before = closed();
    const title = before.scene!.title;
    const after = play(before, chronicle({
      moments: [{ what: "Meera takes the window.", quotes: [{ entry: "e1", text: "I offer her the window." }], there: ["Meera Kulkarni"], weight: 3 }],
      known: [{ who: "Meera Kulkarni", now: "A cellist going home for a funeral." }],
      bonds: [{ who: "Meera Kulkarni", standing: "She owes him a window.", turn: "He gave up the window." }],
      engagements: [tea],
      dropped: ["moments[1]: none of its words are on the page"]
    }));
    expect(after.facts).toEqual([{ id: "m1.1", what: "Meera takes the window.", at: before.scene!.at, where: before.scene!.place, knownTo: [PC, "Meera Kulkarni"], source: "page", scene: 1,
      quotes: [{ entry: "e1", text: "I offer her the window." }], weight: 3, landmark: null, move: null }]);
    expect(after.storySoFar.scenes).toEqual([{ from: before.scene!.at, until: "Day 1 22:45", text: "Ishaan gave up the window; Meera took it, and talked.", scene: { number: 1, title }, who: before.scene!.met }]);
    expect(after.known["Meera Kulkarni"]).toEqual({ text: "A cellist going home for a funeral.", from: { number: 1, title } });
    expect(after.bonds["Meera Kulkarni"]).toEqual({ standing: "She owes him a window.", turns: [{ text: "He gave up the window.", scene: { number: 1, title } }] });
    expect(after.calendar).toEqual([tea]);
    expect(after.recorded).toEqual([{ number: 1, title, summary: "Meera took the window seat.", dropped: ["moments[1]: none of its words are on the page"] }]);
    expect(after.scene!.ended).toEqual(["chronicler"]);
  });

  it("lets whoever is told of a Moment know it from then on", () => {
    const first = play(closed(), chronicle({ moments: [{ what: "Meera cried at the window.", quotes: [{ entry: "e1", text: "w" }], there: ["Meera Kulkarni"], weight: 4 }] }));
    const told = play(first, { kind: "scene_opened", number: 2, title: "Ambala", place: "The platform", at: "Day 2 07:30", who: ["Uncle Bhalla"], prose: null, startsAt: "m", purpose: null, exit: null },
      { kind: "scene_closed", by: "player" }, chronicle({ scene: 2, told: [{ fact: "m1.1", to: ["Uncle Bhalla"] }] }));
    expect(told.facts.find(fact => fact.id === "m1.1")!.knownTo).toEqual([PC, "Meera Kulkarni", "Uncle Bhalla"]);
  });

  it("knows someone first by the Story File's line, then by the newest record's, then by the line set by hand", () => {
    const { state } = nightTrain();
    expect(state.known["Meera Kulkarni"]).toEqual({ text: expect.stringMatching(/^A stranger in a faded field jacket/), from: null });
    expect(state.known[PC]).toBeUndefined();
    const recorded = play(closed(), chronicle({ known: [{ who: "Meera Kulkarni", now: "Plays the cello; going home for a funeral." }] }));
    expect(recorded.known["Meera Kulkarni"]).toMatchObject({ text: "Plays the cello; going home for a funeral.", from: { number: 1 } });
    const byHand = play(recorded, { kind: "known_set", person: "Meera Kulkarni", text: "Set by hand." });
    expect(byHand.known["Meera Kulkarni"]).toEqual({ text: "Set by hand.", from: null });
  });

  it("keeps every turn of a Bond, newest last, and where things stand from the newest record", () => {
    let state = closed();
    for (let number = 1; number <= 15; number++) {
      if (number > 1) state = play(state, { kind: "scene_opened", number, title: `Scene ${number}`, place: "The sleeper bay", at: `Day ${number + 1} 09:00`, who: ["Meera Kulkarni"], prose: null, startsAt: "m", purpose: null, exit: null }, { kind: "scene_closed", by: "player" });
      state = play(state, chronicle({ scene: number, bonds: [{ who: "Meera Kulkarni", standing: `After Scene ${number}.`, turn: `Turn ${number}.` }] }));
    }
    expect(state.bonds["Meera Kulkarni"]!.standing).toBe("After Scene 15.");
    expect(state.bonds["Meera Kulkarni"]!.turns.map(turn => turn.text)).toEqual(Array.from({ length: 15 }, (_, index) => `Turn ${index + 1}.`));
  });

  it("moves an Engagement, or calls it off, when a later record says so, and takes one from what reached him", () => {
    const made = play(closed(), chronicle({ engagements: [tea] }));
    const later = (changed: Chronicle["changed"]) => play(made, { kind: "scene_opened", number: 2, title: "Ambala", place: "The platform", at: "Day 2 07:30", who: [], prose: null, startsAt: "m", purpose: null, exit: null },
      { kind: "scene_closed", by: "player" }, chronicle({ scene: 2, changed }));
    expect(later([{ engagement: "g-tea", to: "Day 2 09:00" }]).calendar).toEqual([{ ...tea, at: "Day 2 09:00" }]);
    expect(later([{ engagement: "g-tea", to: "off" }]).calendar).toEqual([]);
    const lunch: Engagement = { id: "g-lunch", what: "Lunch with Uncle Bhalla.", at: "Day 2 13:00", place: "The dining car", who: ["Uncle Bhalla"], expected: false, every: null, quotes: [] };
    const heard = play(made, moved({
      happened: [{ id: "h1", what: "Bhalla asked the attendant to save two seats.", at: "Day 2 07:00", where: "The dining car", knownTo: ["Uncle Bhalla"], landmark: null, move: null }],
      meanwhile: [{ text: "Bhalla says he has saved you a seat at lunch.", how: "told", fact: "h1", toldBy: "Uncle Bhalla", about: ["Uncle Bhalla"], engagement: lunch }]
    }));
    expect(heard.calendar).toEqual([tea, lunch]);
  });

  it("moves the World on: Lives and Threads from the latest record, what happened with who knows it, what reached him, and what is on", () => {
    const recorded = play(closed(), chronicle());
    const after = play(recorded, moved({
      lives: [{ who: "Uncle Bhalla", where: "The vestibule", doing: "Smoking where he should not.", after: "A quiet word with Ishaan's father." }],
      threads: [{ name: "The locked compartment", now: "Someone is inside it." }],
      happened: [
        { id: "h1", what: "Bhalla bribed the attendant.", at: "Day 2 01:00", where: "The vestibule", knownTo: ["Uncle Bhalla"], landmark: null, move: null },
        { id: "h2", what: "Meera practised in the dark.", at: "Day 2 06:00", where: "The sleeper bay", knownTo: ["Meera Kulkarni"], landmark: null, move: "Meera Kulkarni" }
      ],
      meanwhile: [{ text: "You wake to Meera practising, bowing the air.", how: "seen", fact: "h2", toldBy: null, about: ["Meera Kulkarni"], engagement: null }],
      on: [{ id: "o1", at: "Day 2 08:30", place: "The dining car", what: "Breakfast.", who: [] }]
    }));
    expect(after.lives["Uncle Bhalla"]).toEqual({ where: "The vestibule", doing: "Smoking where he should not.", after: "A quiet word with Ishaan's father." });
    expect(after.threads).toContainEqual({ name: "The locked compartment", now: "Someone is inside it." });
    expect(after.facts.map(fact => [fact.id, fact.source, fact.knownTo])).toEqual([["h1", "world", ["Uncle Bhalla"]], ["h2", "world", ["Meera Kulkarni", PC]]]);
    expect(after.facts.find(fact => fact.id === "h2")).toMatchObject({ move: "Meera Kulkarni", weight: 3 });
    expect(after.meanwhile).toEqual([{ text: "You wake to Meera practising, bowing the air.", how: "seen", fact: "h2", toldBy: null, about: ["Meera Kulkarni"], scene: 1, gap: false }]);
    expect(after.on).toEqual([{ id: "o1", at: "Day 2 08:30", place: "The dining car", what: "Breakfast.", who: [] }]);
    expect(after.scene!.ended).toEqual(["chronicler", "weaver"]);

    // A Thread moves on by name; a Gap moves the World without touching what is on or the Scene's end.
    const gap = play(after, { kind: "move", text: "I go to breakfast." }, moved({ gap: true, threads: [{ name: "The locked compartment", now: "The door is open." }], meanwhile: [{ text: "The attendant nods at you.", how: "seen", fact: "h1", toldBy: null, about: [], engagement: null }] }));
    expect(gap.threads.filter(thread => thread.name === "The locked compartment")).toEqual([{ name: "The locked compartment", now: "The door is open." }]);
    expect(gap.on).toEqual(after.on);
    expect(gap.meanwhile.at(-1)).toMatchObject({ gap: true });
    expect(gap.facts.find(fact => fact.id === "h1")!.knownTo).toEqual(["Uncle Bhalla", PC]);
    expect(gap.scene!.ended).toEqual(["chronicler", "weaver"]);
  });

  it("numbers the Director's plans, brings his new people into the Story from that plan on, and keeps the earlier plans' Scenes", () => {
    const elspeth = { name: "Elspeth Vane", aliases: [], whoTheyAre: "A conductor's daughter who knows every carriage.", known: null, appearance: "", after: "", knows: [], voice: [], group: null };
    const first = play(closed(), chronicle(), planned({ people: [elspeth], newThings: [{ kind: "person", what: "Elspeth, who knows every carriage.", scene: "s1.1", person: "Elspeth Vane", setup: "u2" }] }));
    expect(first.plan).toMatchObject({ number: 1, from: 2, until: 6, toward: "Kalka", afterScene: 1, scenes: [scene("s1.1", "Day 3 10:00")] });
    expect(first.people["Elspeth Vane"]).toMatchObject({ name: "Elspeth Vane", broughtIn: 1, portrait: null });
    expect(first.introduced).toEqual([{ stretch: 1, kind: "person", what: "Elspeth, who knows every carriage." }]);
    expect(first.scene!.ended).toEqual(["chronicler", "director"]);

    let state = first;
    for (let number = 2; number <= RECENT_PLANS + 2; number++) state = play(state, planned({ scenes: [scene(`s${number}.1`, "Day 4 10:00")], people: [{ ...elspeth, whoTheyAre: "Someone else." }] }));
    expect(state.plan!.number).toBe(RECENT_PLANS + 2);
    expect(state.recentPlans.map(scenes => scenes[0]!.id)).toEqual(Array.from({ length: RECENT_PLANS }, (_, index) => `s${index + 2}.1`));
    // Someone already in the Story is not brought in again.
    expect(state.people["Elspeth Vane"]).toMatchObject({ whoTheyAre: "A conductor's daughter who knows every carriage.", broughtIn: 1 });
  });

  it("folds the oldest Scene paragraphs into a week, and an Act's weeks and Scenes into its account", () => {
    const fold = (into: "week" | "act", count: number, text: string): StoryFolded => ({ kind: "story_folded", into, count, from: "Day 1 22:40", until: "Day 7 22:00", text, callId: "f", model: SONNET });
    let state = closed();
    for (let number = 1; number <= 3; number++) {
      if (number > 1) state = play(state, { kind: "scene_opened", number, title: `Scene ${number}`, place: "The sleeper bay", at: `Day ${number + 1} 09:00`, who: [], prose: null, startsAt: "m", purpose: null, exit: null }, { kind: "scene_closed", by: "player" });
      state = play(state, chronicle({ scene: number, paragraph: `Paragraph ${number}.` }));
    }
    const weekly = play(state, fold("week", 2, "The first week."));
    expect(weekly.storySoFar.scenes.map(part => part.text)).toEqual(["Paragraph 3."]);
    expect(weekly.storySoFar.weeks).toEqual([{ from: "Day 1 22:40", until: "Day 7 22:00", text: "The first week.", scene: null, who: [] }]);
    expect(weekly.scene!.ended).toEqual(["chronicler", "folder"]);
    const acted = play(weekly, fold("act", 2, "Act one."));
    expect(acted.storySoFar).toMatchObject({ weeks: [], scenes: [], acts: [{ text: "Act one.", scenes: { first: 1, last: 3 } }] });
  });

  it("counts a choice for one of the plan's Scenes as played, and the Engagement time it keeps as kept", () => {
    const after = play(closed(), { kind: "move", text: "I go to the dining car.", choice: { kind: "go", place: "The dining car", at: "Day 2 08:00", who: [], scene: "s1.1", engagement: "g-tea" } });
    expect(after.played).toEqual(["s1.1"]);
    expect(after.kept).toEqual(["g-tea@Day 2 08:00"]);
    expect(play(closed(), { kind: "move", text: "I sleep in." })).toMatchObject({ played: [], kept: [] });
  });

  it("takes the routine; the brief and reactions are kept beside the Story, not on the Path (docs/adr/0020)", () => {
    const steered = play(closed(), { kind: "routine_set", routine: ["Breakfast is served at eight."] });
    expect(steered.routine).toEqual(["Breakfast is served at eight."]);
  });
});
