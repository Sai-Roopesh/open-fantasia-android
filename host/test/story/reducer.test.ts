import { describe, expect, it } from "vitest";
import { writerPrompt } from "../../src/agents/writer.js";
import type { BeatNote, Entry, Payload } from "../../src/story/entries.js";
import { apply } from "../../src/story/reducer.js";
import type { Beat, State } from "../../src/story/state.js";
import { minimalStoryFile } from "../support/story-files.js";
import { nightTrain } from "../support/stories.js";

let seq = 100;
function entry(payload: Payload): Entry {
  seq += 1;
  return { seq, id: `e${seq}`, storyId: "s", parentId: null, payload, createdAt: "2026-10-05T00:00:00Z" };
}

const beats = (inPlay: number): Beat[] => [0, 1, 2].map(index => ({ text: `beat ${index + 1}`, status: index < inPlay ? "done" : index === inPlay ? "in_play" : "pending" }));

function note(changes: Partial<BeatNote> = {}): Payload {
  return { kind: "beat_note", plan: null, here: ["Meera Kulkarni", "Uncle Bhalla"], beats: beats(0), note: "Meera sits.", call: "continue", intensity: 2, arcMoved: true, clock: "Day 1 22:45", taste: null, callId: "c", model: { provider: "claude", model: "claude-sonnet-5-5" }, ...changes };
}

const play = (state: State, ...payloads: Payload[]) => payloads.reduce((current, payload) => apply(current, entry(payload)), state);

describe("the reducer", () => {
  it("opens a Story File's first Scene with its people, unplanned, unfocused when more than one other person is there", () => {
    const { state } = nightTrain();
    expect(state.scene).toMatchObject({ here: ["Meera Kulkarni", "Uncle Bhalla"], purpose: null, exit: null, beats: [], focus: null, linger: false, closed: null, beatInPlayFor: 0, withoutArc: 0 });
    expect(state.scene!.startsAt).toBe(state.scene!.openedBy);
    expect(state).toMatchObject({ taste: [], directions: [], pendingDirection: null });
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

  it("keeps Taste to ten lines, dropping the oldest", () => {
    const { state } = nightTrain();
    const after = play(state, ...Array.from({ length: 11 }, (_, index) => note({ taste: `lesson ${index + 1}` })));
    expect(after.taste).toHaveLength(10);
    expect(after.taste[0]).toBe("lesson 2");
    expect(after.taste.at(-1)).toBe("lesson 11");
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
    expect(redone.directions).toEqual(["less Bhalla"]);
    expect(play(redone, note()).pendingDirection).toBeNull();
    expect(play(state, { kind: "redo", direction: null, remember: false }).directions).toEqual([]);
  });

  it("opens a Scene a Move began, from that Move, with the Writer's frame", () => {
    const { state } = nightTrain();
    const move = entry({ kind: "move", text: "I go to the vestibule." });
    const opened = apply(apply(state, move), entry({ kind: "scene_opened", number: 2, title: "Air", place: "The vestibule", at: "Day 1 22:50", who: ["Uncle Bhalla"], prose: null, startsAt: move.id, purpose: "Bhalla gets his say.", exit: "He goes back, or Ishaan does." }));
    expect(opened.scene).toMatchObject({ number: 2, here: ["Uncle Bhalla"], startsAt: move.id, purpose: "Bhalla gets his say.", focus: "Uncle Bhalla", beats: [], closed: null });
    expect(opened.clock).toBe("Day 1 22:50");
    expect(opened.scenesPlayed).toBe(1);
  });
});

describe("what code counts, not the Writer", () => {
  it("counts the Beat Notes in a row that have had the same beat in play, and restarts when it changes", () => {
    const { state } = nightTrain();
    expect(play(state, note({ beats: beats(0) }), note({ beats: beats(0) }), note({ beats: beats(0) })).scene!.beatInPlayFor).toBe(3);
    expect(play(state, note({ beats: beats(0) }), note({ beats: beats(0) }), note({ beats: beats(1) })).scene!.beatInPlayFor).toBe(1);
  });

  it("counts the Beat Notes in a row with no Arc moving, and restarts when one moves", () => {
    const { state } = nightTrain();
    expect(play(state, note({ arcMoved: false }), note({ arcMoved: false }), note({ arcMoved: false })).scene!.withoutArc).toBe(3);
    expect(play(state, note({ arcMoved: false }), note({ arcMoved: true })).scene!.withoutArc).toBe(0);
  });

  it("restarts both counts in a new Scene", () => {
    const { state } = nightTrain();
    const stalled = play(state, note({ arcMoved: false }), note({ arcMoved: false }), note({ arcMoved: false }));
    const next = play(stalled, { kind: "scene_closed", by: "story" }, { kind: "scene_opened", number: 2, title: "Ambala", place: "The platform", at: "Day 2 05:00", who: [], prose: null, startsAt: "m", purpose: "p", exit: "e" });
    expect(next.scene).toMatchObject({ beatInPlayFor: 0, withoutArc: 0 });
  });

  it("leaves the counts out of the Writer's task while Linger is on", () => {
    const { state } = nightTrain();
    const stalled = play(state, ...Array.from({ length: 5 }, () => note({ plan: { purpose: "p", exit: "e" }, arcMoved: false })));
    const ask = (current: State) => writerPrompt({ state: current, scene: [], move: "I say nothing.", direction: null }).prompt;
    expect(ask(stalled)).toMatch(/in play for 5 exchanges/);
    expect(ask(stalled)).toMatch(/No Arc has moved for 5 exchanges/);
    const lingering = play(stalled, { kind: "linger_set", on: true });
    expect(ask(lingering)).not.toMatch(/exchanges/);
    expect(ask(lingering)).toMatch(/Linger is on/);
  });
});
