import { NOTHING_RECALLED } from "../../src/agents/recall.js";
import { NO_WORLD } from "../../src/story/world.js";
import { describe, expect, it } from "vitest";
import { checkWriterAnswer, writeBeat, writerPrompt, WriterFailed, type WriterAsk } from "../../src/agents/writer.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import type { State } from "../../src/story/state.js";
import { nightTrain } from "../support/stories.js";

const SONNET = { provider: "claude", model: "claude-sonnet-5-5" } as const;

/** The opening Scene of the Night Train, planned as the Writer would have planned it. */
function planned(state: State, changes: Partial<NonNullable<State["scene"]>> = {}): State {
  return {
    ...state,
    scene: {
      ...state.scene!,
      purpose: "Meera decides whether this stranger is someone to talk to or someone to endure.",
      exit: "She climbs to the upper berth and turns away, or sits down opposite him.",
      beats: [
        { text: "Meera makes her claim on the window seat.", status: "done" },
        { text: "Uncle Bhalla takes a side, loudly.", status: "in_play" },
        { text: "Meera asks why anyone goes to Shimla in the monsoon.", status: "pending" }
      ],
      ...changes
    }
  };
}

function ask(state: State, move: string, changes: Partial<WriterAsk> = {}): WriterAsk {
  return { state, scene: [], move, direction: null, recall: NOTHING_RECALLED, world: NO_WORLD, ...changes };
}

/** An answer that keeps every rule, for the open, planned Scene. */
function answer(changes: Record<string, unknown> = {}) {
  return {
    leaves_scene: false,
    frame: null,
    comes_in: [],
    goes: [],
    beats: [
      { text: "Meera makes her claim on the window seat.", status: "done" },
      { text: "Uncle Bhalla takes a side, loudly.", status: "done" },
      { text: "Meera asks why anyone goes to Shimla in the monsoon.", status: "in_play" }
    ],
    note: "Bhalla rules for Meera: the window is a lady's seat on his line. Meera sits anyway, opposite, and asks what takes anyone to Shimla in the rain.",
    call: "continue",
    intensity: 2,
    arc_moved: true,
    clock: "Day 1 22:43",
    taste: null,
    in_play: [],
    ...changes
  };
}

describe("the Writer's answer", () => {
  it("is taken when it keeps every rule, with names as the Story keeps them", () => {
    const { state } = nightTrain();
    const checked = checkWriterAnswer(ask(planned(state), "I offer her the window seat."), answer({ comes_in: ["Meera", "uncle bhalla"] }));
    expect(checked).toMatchObject({ ok: true, plan: { opens: null, plans: null, here: ["Meera Kulkarni", "Uncle Bhalla"], call: "continue", clock: "Day 1 22:43", arcMoved: true } });
  });

  it("names every rule an answer breaks, so one repair can fix them all", () => {
    const { state } = nightTrain();
    const checked = checkWriterAnswer(ask(planned(state), "I offer her the window seat."), answer({
      comes_in: ["Meera Kulkarni", "Ishaan Mehra", "The Conductor"],
      beats: [{ text: "Ishaan tells her the truth about the interview.", status: "in_play" }, { text: "Bhalla sleeps.", status: "in_play" }],
      note: Array.from({ length: 65 }, () => "word").join(" "),
      clock: "Day 1 22:00"
    }));
    expect(checked.ok).toBe(false);
    const problems = checked.ok ? [] : checked.problems;
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/^comes_in: The Conductor is not in the story/),
      expect.stringMatching(/^comes_in: Ishaan Mehra is the player's character/),
      expect.stringMatching(/^beats: there are 2; a Scene has three to five/),
      expect.stringMatching(/^beats: 2 are in play/),
      expect.stringMatching(/^beats: beat 1 decides for the player's character \("Ishaan tells her/),
      expect.stringMatching(/^note: it is 65 words/),
      expect.stringMatching(/^clock: Day 1 22:00 is before now \(Day 1 22:40\)/)
    ]));
  });

  it("takes a note a little over forty words, since no model counts words exactly", () => {
    const { state } = nightTrain();
    const note = Array.from({ length: 45 }, () => "word").join(" ");
    expect(checkWriterAnswer(ask(planned(state), "I offer her the window seat."), answer({ note }))).toMatchObject({ ok: true });
  });

  it("is refused when it does not match the schema", () => {
    const { state } = nightTrain();
    const checked = checkWriterAnswer(ask(planned(state), "I wave."), { note: "Meera waves back." });
    expect(checked.ok).toBe(false);
    expect(checked.ok ? [] : checked.problems).toEqual(expect.arrayContaining([expect.stringMatching(/must have required property 'beats'/)]));
  });

  it("frames a Scene that opened without a plan, keeping its title and place", () => {
    const { state } = nightTrain();
    const move = "I offer her the window seat.";
    expect(checkWriterAnswer(ask(state, move), answer())).toMatchObject({ ok: false, problems: [expect.stringMatching(/^frame: this Scene opened without a plan/)] });
    const framed = checkWriterAnswer(ask(state, move), answer({ frame: { title: "Something else", place: "Elsewhere", purpose: "Meera decides whether he is worth talking to.", exit: "She turns away, or sits." } }));
    expect(framed).toMatchObject({ ok: true, plan: { opens: null, plans: { purpose: "Meera decides whether he is worth talking to.", exit: "She turns away, or sits." } } });
  });

  it("frames the next Scene when a Move leaves this one", () => {
    const { state } = nightTrain();
    const move = "I go to the vestibule for some air.";
    const leaving = answer({ leaves_scene: true, comes_in: [], clock: "Day 1 22:45", beats: answer().beats.map(beat => ({ ...beat, status: "pending" })).map((beat, index) => (index === 0 ? { ...beat, status: "in_play" } : beat)) });
    expect(checkWriterAnswer(ask(planned(state), move), leaving)).toMatchObject({ ok: false, problems: [expect.stringMatching(/^frame: this Move opens a new Scene/)] });
    const frame = { title: "Air", place: "The vestibule", purpose: "Ishaan's evening goes from crowded to his own, or not.", exit: "Someone follows him out, or nobody does." };
    expect(checkWriterAnswer(ask(planned(state), move), { ...leaving, frame })).toMatchObject({ ok: true, plan: { opens: frame, here: [] } });
  });

  it("frames the Scene a Move opens from the Day View", () => {
    const { state } = nightTrain();
    const closed = planned(state, { closed: "player" });
    expect(checkWriterAnswer(ask(closed, "In the morning I look for her at Ambala."), answer({ clock: "Day 2 06:10" }))).toMatchObject({ ok: false, problems: [expect.stringMatching(/^frame: the last Scene has closed/)] });
  });

  it("keeps Focus: nobody new comes in unless the Move brings them", () => {
    const { state } = nightTrain();
    const focused = planned(state, { here: ["Meera Kulkarni"], focus: "Meera Kulkarni" });
    const withBhalla = answer({ comes_in: ["Uncle Bhalla"] });
    expect(checkWriterAnswer(ask(focused, "I ask her about the birds."), withBhalla)).toMatchObject({ ok: false, problems: [expect.stringMatching(/^comes_in: Focus is on Meera Kulkarni, and the Move does not bring in Uncle Bhalla/)] });
    expect(checkWriterAnswer(ask(focused, "Uncle Bhalla comes back from the vestibule with tea."), withBhalla)).toMatchObject({ ok: true });
    // The person in Focus may always be here.
    const missing = planned(state, { here: [], focus: "Meera Kulkarni" });
    expect(checkWriterAnswer(ask(missing, "I ask about the birds."), answer({ comes_in: ["Meera Kulkarni"] }))).toMatchObject({ ok: true, plan: { here: ["Meera Kulkarni"] } });
  });

  it("names only who comes in and who goes, so nobody leaves a Scene by being left out", () => {
    const { state } = nightTrain();
    const move = "I offer her the window seat.";
    // Nobody named: everyone stays.
    expect(checkWriterAnswer(ask(planned(state), move), answer())).toMatchObject({ ok: true, plan: { here: ["Meera Kulkarni", "Uncle Bhalla"], goes: [] } });
    // Someone already here coming in, or someone not here going, changes nothing.
    const alone = planned(state, { here: ["Meera Kulkarni"] });
    expect(checkWriterAnswer(ask(alone, move), answer({ comes_in: ["Meera Kulkarni"], goes: ["Uncle Bhalla"] }))).toMatchObject({ ok: true, plan: { here: ["Meera Kulkarni"], goes: [] } });
    // Whoever goes is in the Reply that has them go.
    expect(checkWriterAnswer(ask(planned(state), move), answer({ goes: ["Bhalla"] }))).toMatchObject({ ok: true, plan: { here: ["Meera Kulkarni", "Uncle Bhalla"], goes: ["Uncle Bhalla"] } });
    // A new Scene starts with nobody: whoever comes in is everyone there.
    const leaving = answer({ leaves_scene: true, frame: { title: "Air", place: "The vestibule", purpose: "p", exit: "e" }, comes_in: ["Uncle Bhalla"], clock: "Day 1 22:45" });
    expect(checkWriterAnswer(ask(planned(state), "I go to the vestibule for some air."), leaving)).toMatchObject({ ok: true, plan: { here: ["Uncle Bhalla"] } });
  });

  it("keeps Linger: the Scene is not pushed to its turn or closed", () => {
    const { state } = nightTrain();
    const lingering = planned(state, { linger: true, beatInPlayFor: 6, withoutArc: 6 });
    for (const call of ["land", "end"]) {
      expect(checkWriterAnswer(ask(lingering, "I say nothing."), answer({ call })), call).toMatchObject({ ok: false, problems: [expect.stringMatching(/^call: Linger is on/)] });
    }
    expect(checkWriterAnswer(ask(lingering, "I say nothing."), answer({ arc_moved: false, beats: planned(state).scene!.beats }))).toMatchObject({ ok: true });
  });

  it("moves a stalled Scene on: after three exchanges with no Arc moving, the next beat or the Scene's turn", () => {
    const { state } = nightTrain();
    const stalled = planned(state, { withoutArc: 3 });
    const still = answer({ arc_moved: false, beats: planned(state).scene!.beats });
    expect(checkWriterAnswer(ask(stalled, "I look out of the window."), still)).toMatchObject({ ok: false, problems: [expect.stringMatching(/^beats: no Arc has moved for 3 exchanges/)] });
    expect(checkWriterAnswer(ask(stalled, "I look out of the window."), { ...still, call: "land" })).toMatchObject({ ok: true });
    expect(checkWriterAnswer(ask(stalled, "I look out of the window."), answer({ arc_moved: false }))).toMatchObject({ ok: true });
  });

  it("writes Taste when the player asks to remember a Direction", () => {
    const { state } = nightTrain();
    const remembered = ask(planned(state), "I offer her the window seat.", { direction: { text: "less Bhalla", remember: true } });
    expect(checkWriterAnswer(remembered, answer())).toMatchObject({ ok: false, problems: [expect.stringMatching(/^taste: the player asked to remember/)] });
    expect(checkWriterAnswer(remembered, answer({ taste: "Keep Uncle Bhalla to the edges." }))).toMatchObject({ ok: true, plan: { taste: "Keep Uncle Bhalla to the edges." } });
  });
});

describe("the memories in play", () => {
  const remembered = {
    earlier: [],
    lastSceneEnd: [],
    lately: [],
    moments: [
      { id: "moment-station", scene: "Scene 1 · The wrong berth", what: "Ishaan gives up the window seat.", words: [{ by: "Ishaan Mehra", text: "I offer her the window seat." }], knownTo: ["Meera Kulkarni"] },
      { id: "moment-biscuits", scene: "Scene 1 · The wrong berth", what: "Meera offers biscuits.", words: [{ by: null, text: "For the tea." }], knownTo: ["Meera Kulkarni"] }
    ]
  };

  it("names up to two of the remembered Moments the Writer was shown, as the Story keeps them", () => {
    const { state } = nightTrain();
    const checked = checkWriterAnswer(ask(planned(state), "I ask about the seat.", { recall: remembered }), answer({ in_play: ["M2"] }));
    expect(checked).toMatchObject({ ok: true, plan: { inPlay: ["moment-biscuits"] } });
  });

  it("refuses a memory it was not shown, and more than two", () => {
    const { state } = nightTrain();
    const unknown = checkWriterAnswer(ask(planned(state), "I ask about the seat.", { recall: remembered }), answer({ in_play: ["M3"] }));
    expect(unknown).toMatchObject({ ok: false, problems: [expect.stringMatching(/^in_play: M3 is not a remembered Moment you were shown/)] });
    const many = checkWriterAnswer(ask(planned(state), "I ask about the seat.", { recall: { ...remembered, moments: [...remembered.moments, { ...remembered.moments[0]!, id: "third" }] } }), answer({ in_play: ["M1", "M2", "M3"] }));
    expect(many).toMatchObject({ ok: false, problems: [expect.stringMatching(/^in_play: there are 3/)] });
  });

  it("labels the remembered Moments in its task so it can name them", () => {
    const { state } = nightTrain();
    const { prompt } = writerPrompt(ask(planned(state), "I ask about the seat.", { recall: remembered }));
    expect(prompt).toMatch(/<moment id="M1" scene="Scene 1 · The wrong berth" known_to="Meera Kulkarni">/);
  });
});

describe("the Writer's call", () => {
  it("sends the Story once in its system prompt and the moment in its task, and never the Direction to anyone else", () => {
    const { state } = nightTrain();
    const { system, prompt } = writerPrompt(ask(planned(state), "I offer her the window seat.", { direction: { text: "less Bhalla", remember: false } }));
    expect(system).toContain("# The Writer");
    expect(system).toContain(state.premise);
    expect(system).toContain(state.arcs[0]);
    expect(prompt).toContain("I offer her the window seat.");
    expect(prompt).toContain("less Bhalla");
    expect(prompt).toContain("[in_play] Uncle Bhalla takes a side, loudly.");
    expect(system).not.toContain("less Bhalla");
  });

  it("repairs a refused answer once, naming what was wrong", async () => {
    const { state, mac } = nightTrain();
    const runner = new ScriptedRunner([{ answer: JSON.stringify(answer({ clock: "Day 1 22:00" })) }, { answer: JSON.stringify(answer()) }]);
    const result = await writeBeat(new Models(mac.db, { claude: runner }), SONNET, ask(planned(state), "I offer her the window seat."), "story", "trace-w", new AbortController().signal);
    expect(result.plan.clock).toBe("Day 1 22:43");
    expect(runner.requests).toHaveLength(2);
    expect(runner.requests[1]!.prompt).toMatch(/clock: Day 1 22:00 is before now/);
    expect(runner.requests[1]!.prompt).toContain("\"clock\":\"Day 1 22:00\"");
    expect(runner.requests.every(request => request.agent === "writer" && request.schema !== undefined)).toBe(true);
  });

  it("fails with its reasons when the repair is refused too", async () => {
    const { state, mac } = nightTrain();
    const bad = { answer: JSON.stringify(answer({ clock: "Day 1 22:00" })) };
    const runner = new ScriptedRunner([bad, bad]);
    const failure = await writeBeat(new Models(mac.db, { claude: runner }), SONNET, ask(planned(state), "I wave."), "story", "trace-w", new AbortController().signal).then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(WriterFailed);
    expect((failure as WriterFailed).message).toMatch(/clock: Day 1 22:00 is before now/);
  });
});
