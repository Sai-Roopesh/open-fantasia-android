import { describe, expect, it } from "vitest";
import { recallFacts } from "../../src/context/lens.js";
import { BEAT_CAP, checkWriter, STALL_AFTER, writeBeat, writerPrompt, type WriterAsk } from "../../src/agents/writer.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import type { Choice } from "../../src/story/entries.js";
import type { BeatNote } from "../../src/story/entries.js";
import { nightTrainStoryFile } from "../support/story-files.js";
import { ledger, SONNET, type Ledger } from "./ledger.js";

const BEATS = [
  { text: "Meera makes her claim on the window seat.", status: "done" as const },
  { text: "Uncle Bhalla takes a side, loudly.", status: "in_play" as const },
  { text: "Meera asks why anyone goes to Shimla in the monsoon.", status: "pending" as const }
];

/** The Night Train's first Scene, planned by the Writer and one exchange in, Thursday at 10:40 pm. */
function planned(changes: Partial<BeatNote> = {}): Ledger {
  const story = ledger(nightTrainStoryFile({ title: "The wrong berth", place: "The sleeper bay", at: "Day 1 22:40", who: ["Meera Kulkarni", "Uncle Bhalla"], prose: "\"You're in my seat,\" she says." }));
  story.move("I stay where I am.");
  story.note({ plan: { purpose: "Meera decides whether this stranger is someone to talk to or someone to endure.", exit: "She climbs to the upper berth, or sits down opposite him." }, beats: BEATS, ...changes });
  story.reply("Meera looks at the berth, then at you.");
  return story;
}

function ask(story: Ledger, move: string, choice: Choice | null = null): WriterAsk {
  return { state: story.state(), scene: story.scene(), move, choice };
}

/** An answer in the Writer's format, for the open, planned Scene. */
function answer(changes: Record<string, unknown> = {}) {
  return {
    leaves_scene: false, frame: null, comes_in: [], goes: [],
    beats: [{ ...BEATS[0] }, { ...BEATS[1], status: "done" }, { ...BEATS[2], status: "in_play" }],
    note: "Bhalla rules for Meera: the window is a lady's seat on his line. Meera sits anyway, opposite, and asks what takes anyone to Shimla in the rain.",
    call: "continue", intensity: 2, arc_moved: true, minutes: 3, taste: null, in_play: [], moves_to: null,
    ...changes
  };
}

const check = (given: WriterAsk, raw: unknown) => checkWriter(given, recallFacts(given.state, given.state.scene?.here ?? []), raw);

describe("the Writer's answer", () => {
  it("is taken when it keeps to its format, with names as the Story keeps them and the clock the code's", () => {
    const checked = check(ask(planned({ here: [] }), "I offer her the window seat."), answer({ comes_in: ["Meera", "uncle bhalla"] }));
    expect(checked).toMatchObject({ ok: true, dropped: [], value: { opens: null, plans: null, here: ["Meera Kulkarni", "Uncle Bhalla"], call: "continue", arcMoved: true, intensity: 2, clock: "Day 1 22:43" } });
  });

  it("names only who comes in and who goes, so nobody leaves by being left out, and leaves out anyone not in the Story", () => {
    const story = planned({ here: ["Meera Kulkarni", "Uncle Bhalla"] });
    const move = "I offer her the window seat.";
    expect(check(ask(story, move), answer())).toMatchObject({ ok: true, value: { here: ["Meera Kulkarni", "Uncle Bhalla"], goes: [] } });
    expect(check(ask(story, move), answer({ goes: ["Bhalla"] }))).toMatchObject({ ok: true, value: { here: ["Meera Kulkarni", "Uncle Bhalla"], goes: ["Uncle Bhalla"] } });
    const alone = planned({ here: ["Meera Kulkarni"] });
    expect(check(ask(alone, move), answer({ goes: ["Uncle Bhalla"] }))).toMatchObject({ ok: true, value: { here: ["Meera Kulkarni"], goes: [] } });
    // Named with a title, or not in the Story at all: set right or left out, never asked again.
    const stranger = check(ask(alone, move), answer({ comes_in: ["The Conductor", "Ishaan Mehra"] }));
    expect(stranger).toMatchObject({ ok: true, value: { here: ["Meera Kulkarni"] }, dropped: ["people: The Conductor is not in the Story"] });
  });

  // The Line (openspec scenes: The Reply never writes the Player Character): what the Writer plans never decides for him.
  it("is sent back when it decides for the player's character", () => {
    const checked = check(ask(planned(), "I wave."), answer({ note: "Ishaan tells her the truth about the interview.", beats: [{ text: "Ishaan agrees to swap berths.", status: "in_play" }] }));
    expect(checked).toEqual({ ok: false, problems: [
      "note decides for the player's character (\"Ishaan tells her the truth about the interview\"); make it a circumstance or someone else's choice",
      "beats[0] decides for the player's character (\"Ishaan agrees to swap berths\"); make it a circumstance or someone else's choice"
    ] });
  });

  it("is sent back when it does not keep to its format", () => {
    const checked = check(ask(planned(), "I wave."), { note: "Meera waves back." });
    expect(checked.ok).toBe(false);
    expect(checked.ok ? [] : checked.problems).toContain("answer: must have required property 'beats'");
  });

  it("frames a Scene that opened without a plan, keeping its title and place", () => {
    const story = ledger(nightTrainStoryFile());
    expect(check(ask(story, "I follow her down."), answer())).toEqual({ ok: false, problems: ["frame: this Scene has no plan yet; write its frame"] });
    const frame = { title: "Water at Barog", place: "Barog station platform", purpose: "Meera decides whether he is worth talking to.", exit: "She turns away, or sits." };
    expect(check(ask(story, "I follow her down."), answer({ frame }))).toMatchObject({ ok: true, value: { opens: null, plans: { purpose: frame.purpose, exit: frame.exit } } });
  });

  it("frames the next Scene when a Move leaves this one, and whoever comes in is everyone there", () => {
    const story = planned();
    const leaving = answer({ leaves_scene: true, comes_in: ["Uncle Bhalla"], minutes: 5 });
    expect(check(ask(story, "I go to the vestibule for some air."), leaving)).toEqual({ ok: false, problems: ["frame: this Move opens a new Scene; write its frame"] });
    const frame = { title: "Air", place: "The vestibule", purpose: "Ishaan's evening goes from crowded to his own, or not.", exit: "Someone follows him out, or nobody does." };
    expect(check(ask(story, "I go to the vestibule for some air."), { ...leaving, frame })).toMatchObject({ ok: true, value: { opens: frame, here: ["Uncle Bhalla"], clock: "Day 1 22:45" } });
  });

  it("opens the Scene a choice at the Day View begins, at the choice's time", () => {
    const story = planned();
    story.close();
    // The Day View opens when he is next free: Friday at 7:30 am.
    expect(story.state().clock).toBe("Day 2 07:30");
    const choice: Choice = { kind: "go", place: "The platform at Ambala", at: "Day 2 09:00", who: ["Meera Kulkarni"], scene: null, engagement: null };
    const frame = { title: "Ambala", place: "The platform at Ambala", purpose: "She decides whether to wait for him.", exit: "The train goes on." };
    expect(check(ask(story, "In the morning I look for her at Ambala.", choice), answer({ comes_in: ["Meera Kulkarni"] }))).toEqual({ ok: false, problems: ["frame: this Move opens a new Scene; write its frame"] });
    expect(check(ask(story, "In the morning I look for her at Ambala.", choice), answer({ frame, comes_in: ["Meera Kulkarni"] }))).toMatchObject({ ok: true, value: { opens: frame, here: ["Meera Kulkarni"], clock: "Day 2 09:00" } });
    // Chosen for a time already come, it begins a few minutes after now.
    expect(check(ask(story, "I look for her.", { ...choice, at: "Day 2 06:10" }), answer({ frame, comes_in: ["Meera Kulkarni"] }))).toMatchObject({ ok: true, value: { clock: "Day 2 07:33" } });
  });

  it("opens the Scene where the choice was, with whoever it was with, whatever the frame says", () => {
    const story = planned();
    story.close();
    const follow: Choice = { kind: "follow", place: "The vestibule", at: null, who: ["Meera Kulkarni"], scene: null, engagement: null };
    const elsewhere = { title: "Tea", place: "The pantry car", purpose: "Bhalla holds forth.", exit: "The tea runs out." };
    const checked = check(ask(story, "I follow Meera out.", follow), answer({ frame: elsewhere, comes_in: ["Uncle Bhalla"] }));
    expect(checked).toMatchObject({ ok: true, value: { opens: { ...elsewhere, place: "The vestibule" }, here: ["Meera Kulkarni", "Uncle Bhalla"] } });
    const skip: Choice = { kind: "skip", place: null, at: "Day 2 09:00", who: [], scene: null, engagement: null };
    expect(check(ask(story, "I sleep in.", skip), answer({ frame: elsewhere }))).toMatchObject({ ok: true, value: { opens: elsewhere, here: [] } });
  });

  it("names up to two of the remembered Moments it was shown, as the Story keeps them", () => {
    const story = ledger(nightTrainStoryFile({ title: "The wrong berth", place: "The sleeper bay", at: "Day 1 22:40", who: ["Meera Kulkarni"], prose: "\"You're in my seat,\" she says." }));
    story.close();
    story.chronicle({ moments: [
      { what: "Ishaan gives up the window seat.", quotes: [{ entry: "e", text: "I offer her the window seat." }], there: ["Meera Kulkarni"], weight: 4 },
      { what: "Meera offers biscuits.", quotes: [{ entry: "e", text: "For the tea." }], there: ["Meera Kulkarni"], weight: 3 }
    ] });
    story.open("Ambala", "The platform at Ambala", "Day 2 06:10", ["Meera Kulkarni"]);
    const given = ask(story, "I ask about the seat.");
    const moments = recallFacts(given.state, ["Meera Kulkarni"]);
    expect(writerPrompt(given, moments).prompt).toContain("<remembered>\nM1 (Scene 1; known to Ishaan Mehra, Meera Kulkarni): Ishaan gives up the window seat.\n  \"I offer her the window seat.\"\nM2 (Scene 1; known to Ishaan Mehra, Meera Kulkarni): Meera offers biscuits.");
    const frame = { title: "Ambala", place: "The platform at Ambala", purpose: "p", exit: "e" };
    expect(checkWriter(given, moments, answer({ frame, in_play: ["M2", "M7"] }))).toMatchObject({ ok: true, value: { inPlay: ["m1.2"] } });
  });

  it("walks on with the people here when the Move goes somewhere while the same thing goes on", () => {
    expect(check(ask(planned(), "We walk to the vestibule, still arguing."), answer({ moves_to: "The vestibule" }))).toMatchObject({ ok: true, value: { movesTo: "The vestibule", opens: null } });
  });

  it("writes Taste when the player asks to remember a Direction", () => {
    const story = planned();
    story.add({ kind: "redo", direction: "less Bhalla", remember: true });
    const given = ask(story, "I offer her the window seat.");
    expect(writerPrompt(given, []).prompt).toContain("The player redid the last Reply with this Direction: less Bhalla (they asked for it to be remembered: put it in taste)");
    expect(check(given, answer({ taste: " Keep Uncle Bhalla to the edges. " }))).toMatchObject({ ok: true, value: { taste: "Keep Uncle Bhalla to the edges." } });
  });
});

describe("a Scene that stalls, and Linger (openspec scenes)", () => {
  /** [exchanges] in a row in which no beat happened and no Arc moved. */
  function still(exchanges: number, linger: boolean) {
    const story = planned({ arcMoved: false });
    if (linger) story.add({ kind: "linger_set", on: true });
    for (let exchange = 1; exchange < exchanges; exchange++) {
      story.move(`I stay where I am, by the window (${exchange}).`);
      story.note({ beats: BEATS, arcMoved: false });
      story.reply("Nobody moves.");
    }
    return story;
  }

  it("tells the Writer to make a beat happen, and to move a stalled Scene on, while Linger is off", () => {
    const story = still(8, false);
    expect(story.state().scene).toMatchObject({ beatInPlayFor: 8, withoutArc: 8 });
    const { prompt } = writerPrompt(ask(story, "I look out of the window."), []);
    expect(prompt).toContain(`The beat in play has been in play for 8 Replies: make it happen now, or skip it.`);
    expect(prompt).toContain(`No Arc has moved for 8 Replies: move the Scene on toward its turn, or call land.`);
    expect(BEAT_CAP).toBe(4);
    expect(STALL_AFTER).toBe(3);
  });

  // GIVEN Linger is on in the common room with Hermione
  // WHEN eight exchanges pass with no beat happening
  // THEN no beat is forced and the Scene stays open
  it("scenes › Linger holds the moment › Lingering with Hermione", async () => {
    const story = still(8, true);
    expect(story.state().scene).toMatchObject({ beatInPlayFor: 8, withoutArc: 8, linger: true });
    const given = ask(story, "I stay where I am, by the window.");
    const { prompt } = writerPrompt(given, []);
    expect(prompt).toContain("<task>\nLinger is on: hold the beat in play, force nothing, and call continue.\n</task>");
    expect(prompt).not.toMatch(/make it happen now|No Arc has moved|call land/);
    // An answer that would close the Scene, or turn it, is set right: the Scene stays open, and nothing is asked again.
    for (const call of ["end", "land"]) {
      expect(check(given, answer({ call, beats: BEATS, arc_moved: false }))).toMatchObject({ ok: true, value: { call: "continue", beats: BEATS }, dropped: [`call: Linger is on, so the Scene goes on rather than "${call}"`] });
    }
    const runner = new ScriptedRunner([{ answer: JSON.stringify(answer({ call: "end", beats: BEATS, arc_moved: false })) }]);
    const { plan } = await writeBeat(new Models(story.mac.db, { claude: runner }), [SONNET], given, story.storyId, "trace-w", new AbortController().signal);
    expect(plan.call).toBe("continue");
    expect(runner.requests).toHaveLength(1);
  });
});

describe("the Writer's call", () => {
  it("sends the Story in its cached part, and in its task the plan, The Story So Far, who knows what, the Scene and the Move", () => {
    const story = planned();
    story.close();
    story.chronicle({ paragraph: "Ishaan gave Meera the window berth, and she gave him biscuits for the tea." });
    story.world({ happened: [{ id: "h-call", what: "Meera's mother rang the station master at Kalka.", at: "Day 2 06:00", where: "Pune", knownTo: ["Meera Kulkarni"], landmark: null, move: null }] });
    story.plan({ toward: "the night she finds out what he is", phase: "rest", premise: "Two of these Scenes are with Meera.", arcs: [{ arc: "Meera trusts Ishaan", now: "she lets him carry her bag", next: "she tells him why she is going", notYet: "anything about her mother" }],
      scenes: [{ id: "s1.1", at: "Day 2 07:30", place: "The platform at Kalka", who: ["Meera Kulkarni"], for: "She decides whether to give him her number.", offer: "Meera is waiting for the toy train.", headline: "Kalka: Meera waits", lead: "Meera Kulkarni", engagement: null, quiet: true }] });
    story.add({ kind: "brief_set", more: ["more danger"], less: [] });
    const choice: Choice = { kind: "story", place: "The platform at Kalka", at: "Day 2 07:30", who: ["Meera Kulkarni"], scene: "s1.1", engagement: null };
    const { system, prompt } = writerPrompt(ask(story, "I look for her on the platform.", choice), []);
    expect(system).toContain("# The Writer");
    expect(system).toContain(story.state().premise);
    expect(system).toContain(story.state().arcs[0]);
    expect(prompt).toContain("<the_players_wishes>\nMore of:\n- more danger");
    expect(prompt).toContain("<long_run>\nToward the night she finds out what he is, a rest Stretch.\n- Meera trusts Ishaan: now she lets him carry her bag; may move to she tells him why she is going; not yet anything about her mother\nPremise: Two of these Scenes are with Meera.\n</long_run>");
    expect(prompt).toContain("<scene_that_matters>\nShe decides whether to give him her number. It is about Meera Kulkarni.\n</scene_that_matters>");
    expect(prompt).toContain("<story_so_far>\nScenes:\nScene 1, The wrong berth");
    expect(prompt).toContain("Meera's mother rang the station master at Kalka. Known to: Meera Kulkarni.");
    expect(prompt).toContain("<move by=\"Ishaan Mehra\">\nI look for her on the platform.\n</move>");
    expect(prompt).toContain("The player chose at the Day View: go to The platform at Kalka on Friday 17 July 2026 at 7:30 am with Meera Kulkarni. Open the Scene it begins.");
  });

  it("is one step: an answer that decides for him is sent back once, with what was wrong", async () => {
    const story = planned();
    const runner = new ScriptedRunner([{ answer: JSON.stringify(answer({ note: "Ishaan tells her everything." })) }, { answer: JSON.stringify(answer()) }]);
    const result = await writeBeat(new Models(story.mac.db, { claude: runner }), [SONNET], ask(story, "I offer her the window seat."), story.storyId, "trace-w", new AbortController().signal);
    expect(result.plan.clock).toBe("Day 1 22:43");
    expect(runner.requests).toHaveLength(2);
    expect(runner.requests[1]!.prompt).toContain("- note decides for the player's character (\"Ishaan tells her everything\")");
    expect(runner.requests.every(request => request.agent === "writer" && request.schema !== undefined)).toBe(true);
  });
});
