import { describe, expect, it } from "vitest";
import { emptyUpdate } from "../../src/story/truth.js";
import { engagementsAhead, missedBetween, nextTime, occurrencesBetween, offersOn, plannedAhead, todayOn } from "../../src/story/day.js";
import type { Chronicle, DirectorPlan, Entry, Payload, WorldMoved } from "../../src/story/entries.js";
import { apply } from "../../src/story/reducer.js";
import type { Engagement, On, PlannedScene, State } from "../../src/story/state.js";
import { dayView } from "../../src/views/scene.js";
import { hogwartsStoryFile } from "../support/story-files.js";

const SONNET = { provider: "claude", model: "claude-sonnet-5-5" } as const;
let seq = 0;
const entry = (payload: Payload): Entry => ({ seq: ++seq, id: `e${seq}`, storyId: "s", parentId: null, payload, createdAt: "2026-10-11T00:00:00Z" });
const play = (state: State | null, ...payloads: Payload[]) => payloads.reduce<State | null>((current, payload) => apply(current, entry(payload)), state) as State;

const quotes = [{ entry: "e1", text: "Seven, at the end table." }];
const library: Engagement = { id: "g-library", what: "Draconia's hour in the library.", at: "Day 5 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week", quotes };
const summons: Engagement = { id: "g-office", what: "McGonagall wants an account of the fight.", at: "Day 6 09:00", place: "McGonagall's office", who: ["Minerva McGonagall"], expected: true, every: null, quotes };

function planned(at: string, place: string, id = "s1.1"): PlannedScene {
  return { id, at, place, who: ["Draconia Malfoy"], for: "Draconia has to ask him for something.", offer: "Something is going on there that matters to him.", headline: `${place}: she asks`, lead: "Draconia Malfoy", engagement: null, quiet: false, serves: { turn: null, lives: ["Draconia Malfoy"] } };
}

const chronicle = (engagements: Engagement[]): Chronicle => ({ kind: "chronicle", truth: emptyUpdate(), scene: 1, summary: "s", paragraph: "p", moments: [], told: [], known: [], bonds: [], engagements, changed: [], dropped: [], callId: "c", model: SONNET });
const plan = (scenes: PlannedScene[]): DirectorPlan => ({
  kind: "director_plan", from: 5, until: 9, toward: "the flying test", landmark: null, phase: "build", scenes, leads: [], arcs: [], roadmap: [], premise: "",
  newThings: [{ kind: "mystery", what: "A locked door.", scene: null, person: null, setup: "u1" }], people: [], reason: "r", afterScene: 1, dropped: [], callId: "d", model: SONNET
});
const moved = (on: On[]): WorldMoved => ({ kind: "world_moved", truth: emptyUpdate(), scene: 1, gap: false, from: "Day 5 09:00", until: "Day 5 09:00", lives: [], threads: [], happened: [], meanwhile: [], on, dropped: [], callId: "w", model: SONNET });

/** Hogwarts at the Day View on Sunday at nine, after a Scene in the common room, its end done as far as [ends] says. */
function atTheDayView(ends: { engagements?: Engagement[]; scenes?: PlannedScene[]; on?: On[] } = {}): State {
  const story = hogwartsStoryFile({ at: "Day 5 09:00" });
  const opened = play(null,
    { kind: "story_set_up", storyFile: story, portraits: {} },
    { kind: "scene_opened", number: 1, title: story.opening.title, place: story.opening.place, at: "Day 5 09:00", who: ["Hermione Granger"], prose: null, startsAt: null, purpose: null, exit: null },
    { kind: "scene_closed", by: "player" });
  return play(opened, chronicle(ends.engagements ?? []), ...(ends.scenes ? [plan(ends.scenes)] : []), moved(ends.on ?? []));
}

describe("the calendar (docs/adr/0011)", () => {
  it("rolls a weekly Engagement on to its next week, and a one-off is gone once its time is past", () => {
    expect(nextTime(library, "Day 5 10:00")).toBe("Day 5 19:30");
    expect(nextTime(library, "Day 5 20:00")).toBe("Day 12 19:30");
    expect(nextTime(library, "Day 13 08:00")).toBe("Day 19 19:30");
    expect(nextTime(summons, "Day 6 09:00")).toBe("Day 6 09:00");
    expect(nextTime(summons, "Day 6 09:01")).toBeNull();
  });

  it("lists every time an Engagement falls in a span", () => {
    expect(occurrencesBetween(library, "Day 6 00:00", "Day 20 00:00")).toEqual(["Day 12 19:30", "Day 19 19:30"]);
    expect(occurrencesBetween(summons, "Day 1 00:00", "Day 6 08:00")).toEqual([]);
    expect(occurrencesBetween(summons, "Day 1 00:00", "Day 7 00:00")).toEqual(["Day 6 09:00"]);
  });

  it("has his Engagements ahead soonest first, without a time he has kept by choosing it", () => {
    const state = atTheDayView({ engagements: [summons, library] });
    expect(engagementsAhead(state).map(item => [item.engagement.id, item.next])).toEqual([["g-library", "Day 5 19:30"], ["g-office", "Day 6 09:00"]]);
    const kept = play(state, { kind: "move", text: "I go to the library.", choice: { kind: "go", place: "The library", at: "Day 5 19:30", who: [], scene: null, engagement: "g-library" } });
    expect(engagementsAhead(kept).map(item => item.engagement.id)).toEqual(["g-office"]);
    // Kept this week, the library is on again next week.
    expect(engagementsAhead(kept, "Day 5 20:00").map(item => [item.engagement.id, item.next])).toEqual([["g-office", "Day 6 09:00"], ["g-library", "Day 12 19:30"]]);
  });

  it("counts an Engagement missed unless he chose it or a Scene was at its place over its time", () => {
    const state = atTheDayView({ engagements: [library] });
    expect(missedBetween(state, "Day 5 09:00", "Day 6 07:30").map(item => item.at)).toEqual(["Day 5 19:30"]);
    expect(missedBetween(state, "Day 5 09:00", "Day 6 07:30", [{ place: "the library", from: "Day 5 19:00", until: "Day 5 20:15" }])).toEqual([]);
    expect(missedBetween(state, "Day 5 09:00", "Day 6 07:30", [{ place: "The Great Hall", from: "Day 5 19:00", until: "Day 5 20:15" }])).toHaveLength(1);
  });

  it("has the plan's Scenes that matter still ahead and not yet played, in order", () => {
    const state = atTheDayView({ scenes: [planned("Day 6 10:00", "the Great Hall"), planned("Day 7 15:00", "the library", "s1.2")] });
    expect(plannedAhead(state).map(item => item.id)).toEqual(["s1.1", "s1.2"]);
    expect(plannedAhead(state, "Day 6 11:00").map(item => item.id)).toEqual(["s1.2"]);
    const chosen = play(state, { kind: "move", text: "I go to breakfast.", choice: { kind: "go", place: "the Great Hall", at: "Day 6 10:00", who: [], scene: "s1.1", engagement: null } });
    expect(plannedAhead(chosen).map(item => item.id)).toEqual(["s1.2"]);
  });
});

describe("what is on (one-truth design decision 7)", () => {
  const practice: On = { id: "o-practice", at: "Day 5 12:00", place: "The Quidditch pitch", what: "Gryffindor practice.", who: ["Harry Potter"] };

  it("puts the Story's pick first, in the Director's words, then the rest by time", () => {
    const state = atTheDayView({ engagements: [library], scenes: [planned("Day 6 10:00", "the Great Hall")], on: [practice] });
    expect(offersOn(state).map(item => [item.id, item.at, item.pick])).toEqual([
      ["p-s1.1", "Day 6 10:00", true],
      ["o-practice", "Day 5 12:00", false],
      ["e-g-library-Day51930", "Day 5 19:30", false]
    ]);
    expect(offersOn(state)[0]).toMatchObject({ what: "Something is going on there that matters to him.", place: "the Great Hall", who: ["Draconia Malfoy"], scene: "s1.1", engagement: null });
    expect(offersOn(state)[2]).toMatchObject({ engagement: "g-library", expected: true, every: "week" });
  });

  it("makes something at an Engagement's place within the hour one card, with the Engagement's mark", () => {
    const breakfast: Engagement = { ...summons, id: "g-breakfast", what: "Breakfast with Hermione.", at: "Day 6 09:30", place: "The Great Hall", who: ["Hermione Granger"], expected: false };
    const alsoThere: On = { id: "o-post", at: "Day 6 09:45", place: "the great hall", what: "The post owls come in.", who: [] };
    const state = atTheDayView({ engagements: [breakfast], scenes: [planned("Day 6 10:00", "the Great Hall")], on: [alsoThere] });
    expect(offersOn(state)).toEqual([{
      id: "p-s1.1", at: "Day 6 09:30", place: "The Great Hall", what: "Something is going on there that matters to him.", who: ["Hermione Granger", "Draconia Malfoy"],
      expected: false, pick: true, scene: "s1.1", engagement: "g-breakfast", every: null
    }]);
  });

  it("shows four at most, never crowding out what he is expected at before the pick, and nothing already past", () => {
    const later = (hour: number): On => ({ id: `o-${hour}`, at: `Day 5 ${hour}:00`, place: `Place ${hour}`, what: `Something at ${hour}.`, who: [] });
    const past: On = { id: "o-past", at: "Day 5 08:00", place: "The Owlery", what: "The morning post.", who: [] };
    const state = atTheDayView({ engagements: [library, summons], scenes: [planned("Day 7 10:00", "the Great Hall")], on: [past, later(10), later(11), later(13), later(14)] });
    expect(offersOn(state).map(item => item.id)).toEqual(["p-s1.1", "o-10", "e-g-library-Day51930", "e-g-office-Day60900"]);
  });

  it("says each time for the phone: today by its time, tomorrow as Tomorrow, a weekly one by its day", () => {
    const state = atTheDayView({ engagements: [library], scenes: [planned("Day 6 10:00", "the Great Hall")], on: [practice] });
    expect(todayOn(state).map(item => [item.time, item.every, item.days_away])).toEqual([
      ["Tomorrow 10:00 am", null, 1],
      ["12:00 pm", null, 0],
      ["7:30 pm", "Sunday", 0]
    ]);
  });
});

describe("the Day View, from the State", () => {
  const ends = { engagements: [library], scenes: [planned("Day 6 10:00", "the Great Hall")] };

  it("shows no Happenings until every step of the Scene's end is done", () => {
    const opened = play(null,
      { kind: "story_set_up", storyFile: hogwartsStoryFile({ at: "Day 5 09:00" }), portraits: {} },
      { kind: "scene_opened", number: 1, title: "Sunday morning", place: "The Gryffindor common room", at: "Day 5 09:00", who: [], prose: null, startsAt: null, purpose: null, exit: null },
      { kind: "scene_closed", by: "player" });
    expect(dayView(opened, { step: "chronicler", failed: null, rethinking: null })).toMatchObject({ scene_end: { step: "chronicler", failed: null, rethinking: null }, happenings: [] });
    const recorded = play(opened, chronicle([library]), plan(ends.scenes));
    expect(dayView(recorded, { step: "weaver", failed: null, rethinking: null }).happenings).toEqual([]);
    const failed = { step: "weaver" as const, reason: "Sonnet is overloaded", trace_id: "t" };
    expect(dayView(recorded, { step: null, failed, rethinking: null })).toMatchObject({ scene_end: { step: null, failed }, happenings: [] });
    const done = play(recorded, moved([]));
    expect(dayView(done).happenings.map(item => item.id)).toEqual(["p-s1.1", "e-g-library-Day51930"]);
    // A step still owed after the World moved on, the Folder's, holds the Day View too.
    expect(dayView(done, { step: "folder", failed: null, rethinking: null }).happenings).toEqual([]);
  });

  it("says what reached him after this Scene, not over the Gap, and the player's reaction to it", () => {
    const meanwhile = (text: string, gap: boolean): WorldMoved => ({ ...moved([]), gap, happened: [{ id: `h-${text}`, what: text, at: "Day 5 09:00", where: "The common room", knownTo: [], landmark: null, move: null }],
      meanwhile: [{ text, how: "rumour", fact: `h-${text}`, toldBy: null, about: [], engagement: null }] });
    const state = atTheDayView(ends);
    const heard = play(state, meanwhile("Lavender says Snape is in a mood.", false));
    // The player's reaction is kept beside the Story (docs/adr/0020).
    const reactions = [{ scene: 1, title: state.scene!.title, reaction: "less" as const, note: null }];
    expect(dayView(heard, undefined, reactions)).toMatchObject({ meanwhile: [{ text: "Lavender says Snape is in a mood.", how: "rumour" }], reaction: "less" });
    expect(dayView(play(state, { kind: "move", text: "I wait." }, meanwhile("Over the Gap.", true))).meanwhile).toEqual([]);
  });
});
