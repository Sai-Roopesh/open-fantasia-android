import { describe, expect, it } from "vitest";
import { checkChronicle, chroniclerPrompt, passages, writeChronicle, type ChronicleAsk } from "../../src/agents/chronicler.js";
import { AgentFailed } from "../../src/agents/step.js";
import { recallFacts } from "../../src/context/lens.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import type { Engagement } from "../../src/story/state.js";
import { nightTrainStoryFile } from "../support/story-files.js";
import { ledger, SONNET } from "./ledger.js";

const TOLD = "I tell her I'm going to Shimla for an interview I don't want, and that I haven't told anyone that part.";

/**
 * The Night Train's first Scene, played and closed: P1 is the opening, P2 and P4 his Moves, P3 and P5 Replies.
 * [before] writes to the Story before the Scene is played.
 */
function scene(before: (story: ReturnType<typeof ledger>) => void = () => {}) {
  const story = ledger(nightTrainStoryFile({ title: "The wrong berth", place: "The sleeper bay", at: "Day 1 22:40", who: ["Meera Kulkarni", "Uncle Bhalla"], prose: "\"You're in my seat,\" she says." }));
  before(story);
  story.move(TOLD);
  story.reply("Meera takes out a packet of Parle-G gone soft at the corners and holds it out. “For the tea,” she says. That's all.");
  story.move("I take one.");
  story.reply("\"You told me at Panipat you hate trains,\" Bhalla says. Ishaan tells him it was a joke. Meera laughs into her collar.");
  story.close();
  return story;
}

function ask(story = scene()): ChronicleAsk {
  return { state: story.state(), scene: story.scene() };
}

function answer(changes: Record<string, unknown> = {}) {
  return {
    summary: "On the night train, Ishaan told Meera the truth about the interview; she gave him biscuits for the tea.",
    paragraph: "Ishaan took the window berth Meera wanted. He told her he was going to Shimla for an interview he did not want, and that nobody else knew; she answered with biscuits, and Bhalla teased him.",
    moments: [{
      what: "Ishaan tells Meera the interview is one he doesn't want; she answers with biscuits.",
      quotes: [{ entry: "P2", text: "I tell her I'm going to Shimla for an interview I don't want" }, { entry: "P3", text: "\"For the tea,\" she says. That's all." }],
      there: ["Meera"],
      weight: 3
    }],
    told: [], known: [], bonds: [], engagements: [], changed: [],
    ...changes
  };
}

describe("the Chronicler's record (docs/adr/0006)", () => {
  it("labels the Scene's opening, Moves and Replies P1 … for quoting", () => {
    expect(passages(ask().scene).map(item => [item.label, item.move, item.text.slice(0, 20)])).toEqual([
      ["P1", false, "\"You're in my seat,\""], ["P2", true, "I tell her I'm going"], ["P3", false, "Meera takes out a pa"], ["P4", true, "I take one."], ["P5", false, "\"You told me at Pani"]
    ]);
  });

  it("is taken whole when it keeps to the page: quotes as the page has them, names as the Story keeps them", () => {
    const given = ask();
    const checked = checkChronicle(given, recallFacts(given.state, given.state.scene!.met), answer());
    expect(checked).toMatchObject({ ok: true, dropped: [] });
    if (!checked.ok) return;
    const [told, biscuits] = passages(given.scene).filter(item => item.label === "P2" || item.label === "P3");
    expect(checked.value.moments).toEqual([{
      what: "Ishaan tells Meera the interview is one he doesn't want; she answers with biscuits.",
      quotes: [{ entry: told!.entry.id, text: "I tell her I'm going to Shimla for an interview I don't want" }, { entry: biscuits!.entry.id, text: "“For the tea,” she says. That's all." }],
      there: ["Meera Kulkarni"],
      weight: 3
    }]);
    expect(checked.value.paragraph).toMatch(/^Ishaan took the window berth/);
  });

  // Records degrade, never vanish (openspec living-world: Moments are remembered from one record).
  it("leaves out only the parts the Story cannot use, and says why, without asking again", () => {
    const given = ask();
    const checked = checkChronicle(given, [], answer({
      moments: [
        { what: "Meera offers biscuits.", quotes: [{ entry: "P3", text: "She offers him every biscuit she has." }], there: ["Meera Kulkarni"], weight: 2 },
        { what: "Ishaan told Bhalla it was a joke.", quotes: [{ entry: "P5", text: "Ishaan tells him it was a joke." }], there: ["Uncle Bhalla"], weight: 2 },
        { what: "Meera laughs.", quotes: [{ entry: "P5", text: "Meera laughs into her collar." }], there: ["Meera Kulkarni", "Ishaan Mehra", "The Conductor"], weight: 1 },
        { what: "He takes a biscuit.", quotes: [{ entry: "P9", text: "I take one." }], there: [], weight: 1 }
      ]
    }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.moments.map(moment => [moment.what, moment.there])).toEqual([["Meera laughs.", ["Meera Kulkarni"]]]);
    expect(checked.value.summary).toMatch(/^On the night train/);
    expect(checked.dropped).toEqual([
      "moments[0]: \"She offers him every biscuit she has.\" is not in P3",
      "moments[0]: none of its words are on the page",
      "moments[1]: says what Ishaan Mehra did without quoting his Move",
      "people: The Conductor is not in the Story",
      "moments[3]: \"I take one.\" is not in P9",
      "moments[3]: none of its words are on the page"
    ]);
  });

  it("records who was told an earlier Moment, by the label it was shown", () => {
    const story = scene(before => {
      before.close();
      before.chronicle({ moments: [{ what: "Ishaan pulled Meera back from the platform's edge.", quotes: [{ entry: "e", text: "He pulls her back." }], there: ["Meera Kulkarni"], weight: 4 }] });
      before.open("The wrong berth", "The sleeper bay", "Day 1 22:40", ["Meera Kulkarni", "Uncle Bhalla"]);
    });
    const given = ask(story);
    const moments = recallFacts(given.state, given.state.scene!.met);
    expect(chroniclerPrompt(given, moments).prompt).toContain("<known_moments>\nM1 (Scene 1; known to Ishaan Mehra, Meera Kulkarni): Ishaan pulled Meera back from the platform's edge.\n</known_moments>");
    const checked = checkChronicle(given, moments, answer({ told: [{ moment: "M1", to: ["Uncle Bhalla"] }, { moment: "M4", to: ["Uncle Bhalla"] }] }));
    expect(checked.ok && checked.value.told).toEqual([{ fact: "m1.1", to: ["Uncle Bhalla"] }]);
  });

  it("is sent back only when it is not a record at all", () => {
    const given = ask();
    const noParagraph = Object.fromEntries(Object.entries(answer()).filter(([key]) => key !== "paragraph"));
    expect(checkChronicle(given, [], noParagraph)).toMatchObject({ ok: false, problems: ["answer: must have required property 'paragraph'"] });
    expect(checkChronicle(given, [], answer({ moments: [{ what: "x", quotes: [], there: [], weight: 9 }] })).ok).toBe(false);
  });
});

describe("what he knows of them, and where things stand (openspec outside-the-scene, living-world)", () => {
  it("keeps a line for someone in the Story, named as the Story names them, and never one for him", () => {
    const given = ask();
    const checked = checkChronicle(given, [], answer({
      known: [{ who: "meera", now: "A biologist counting birds near Kalka. She gave up the window seat and pretended not to mind." }, { who: "Ishaan Mehra", now: "Himself." }],
      bonds: [{ who: "Uncle Bhalla", standing: "He teases Ishaan like a nephew.", turn: "He told the bay Ishaan hates trains." }]
    }));
    expect(checked.ok && checked.value.known).toEqual([{ who: "Meera Kulkarni", now: "A biologist counting birds near Kalka. She gave up the window seat and pretended not to mind." }]);
    expect(checked.ok && checked.value.bonds).toEqual([{ who: "Uncle Bhalla", standing: "He teases Ishaan like a nephew.", turn: "He told the bay Ishaan hates trains." }]);
  });

  // A line is left out as too long only when it runs well past the length asked (docs/adr/0012).
  it("leaves out a line far longer than asked, so what he knew before stays, and keeps one a little long", () => {
    const words = (count: number) => Array.from({ length: count }, () => "word").join(" ");
    const given = ask();
    const checked = checkChronicle(given, [], answer({
      known: [{ who: "Meera Kulkarni", now: words(70) }, { who: "Uncle Bhalla", now: words(52) }],
      bonds: [{ who: "Meera Kulkarni", standing: "She lets him keep the berth.", turn: words(29) }, { who: "Uncle Bhalla", standing: "Fond.", turn: words(45) }]
    }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.moments).toHaveLength(1);
    expect(checked.value.known.map(line => line.who)).toEqual(["Uncle Bhalla"]);
    expect(checked.value.bonds.map(line => [line.who, line.turn.split(" ").length])).toEqual([["Meera Kulkarni", 29]]);
    expect(checked.dropped).toEqual([
      "known: the line for Meera Kulkarni is 70 words; say it in forty-five or fewer",
      "bonds: the turn with Uncle Bhalla is 45 words; say it in twenty-five or fewer"
    ]);
  });

  it("is asked of each person in the Scene, with what he knew of them and where things stand", () => {
    const { prompt } = chroniclerPrompt(ask(), []);
    expect(prompt).toContain("<people_in_the_scene>\nMeera Kulkarni\n  What Ishaan Mehra knows of them: A stranger in a faded field jacket, binoculars round her neck, who wanted the window berth he is sitting on.\n  Where things stand: no history yet");
  });
});

describe("Engagements in the record (docs/adr/0011)", () => {
  const tea = { what: "Tea with Meera at the Shimla station canteen.", at: "Day 2 18:00", place: "The Shimla station canteen", who: ["meera"], expected: true, every: null, quotes: [{ entry: "P3", text: "\"For the tea,\" she says." }] };

  it("keeps an Engagement made on the page, with its words as the page has them, and leaves out one that was not, or is before the Scene", () => {
    const given = ask();
    const checked = checkChronicle(given, [], answer({ engagements: [
      tea,
      { ...tea, quotes: [{ entry: "P3", text: "Meet me at the canteen at six." }] },
      { ...tea, at: "Day 1 20:00" },
      { ...tea, at: "tomorrow evening" }
    ] }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.engagements).toEqual([{ id: expect.stringMatching(/^g-/), what: tea.what, at: "Day 2 18:00", place: tea.place, who: ["Meera Kulkarni"], expected: true, every: null, quotes: [{ entry: passages(given.scene)[2]!.entry.id, text: "“For the tea,” she says." }] }]);
    expect(checked.dropped).toEqual([
      "engagements[1]: \"Meet me at the canteen at six.\" is not in P3",
      "engagements[1]: it was not arranged on the page",
      "engagements[2]: \"Day 1 20:00\" is not a time after the Scene began",
      "engagements[3]: \"tomorrow evening\" is not a time after the Scene began"
    ]);
  });

  it("moves or calls off an Engagement on, by the label it was shown", () => {
    const canteen: Engagement = { id: "g-canteen", what: "Tea at the canteen.", at: "Day 2 18:00", place: "The Shimla station canteen", who: ["Meera Kulkarni"], expected: true, every: null, quotes: [] };
    const walk: Engagement = { id: "g-walk", what: "A walk on the Ridge.", at: "Day 3 07:00", place: "The Ridge", who: ["Meera Kulkarni"], expected: false, every: "week", quotes: [] };
    const story = scene(before => before.add({ kind: "chronicle", scene: 1, summary: "", paragraph: "", moments: [], told: [], known: [], bonds: [], engagements: [canteen, walk], changed: [], dropped: [], callId: "c", model: SONNET }));
    const given = ask(story);
    expect(chroniclerPrompt(given, []).prompt).toContain("<engagements_on>\nE1: Tea at the canteen. Friday 17 July 2026, 6:00 pm, The Shimla station canteen\nE2: A walk on the Ridge. Saturday 18 July 2026, 7:00 am, every week, The Ridge\n</engagements_on>");
    const words = [{ entry: "P5", text: "Meera laughs into her collar." }];
    const checked = checkChronicle(given, [], answer({ changed: [{ engagement: "E1", to: "off", quotes: words }, { engagement: "E2", to: "Day 3 08:00", quotes: words }, { engagement: "E7", to: "off", quotes: words }] }));
    expect(checked.ok && checked.value.changed).toEqual([{ engagement: "g-canteen", to: "off" }, { engagement: "g-walk", to: "Day 3 08:00" }]);
    expect(checked.ok && checked.dropped).toEqual(["changed: E7 to \"off\" is not a change of one shown"]);
  });
});

describe("the Chronicler's call", () => {
  it("reads The Story So Far, and the Scene labelled with its time and place", () => {
    const story = scene(before => {
      before.close();
      before.chronicle({ paragraph: "Ishaan boarded late, in the rain." });
      before.open("The wrong berth", "The sleeper bay", "Day 1 22:40", ["Meera Kulkarni", "Uncle Bhalla"]);
    });
    const { system, prompt } = chroniclerPrompt(ask(story), []);
    expect(system).toContain("# The Chronicler");
    expect(system).toContain("Title: The Night Train to Kalka");
    expect(prompt).toContain("<story_so_far>\nScenes:\nScene 1, The wrong berth");
    expect(prompt).toContain("Ishaan boarded late, in the rain.");
    expect(prompt).toContain(`<scene title="The wrong berth" place="The sleeper bay" from="Thursday 16 July 2026, 10:40 pm" until="Thursday 16 July 2026, 10:40 pm">\n[P1 move by Ishaan Mehra]\n${TOLD}\n\n[P2]\nMeera takes out`);
    expect(prompt).toMatch(/<\/scene>\n\n<task>\nThe Scene has ended\. Record it\.\n<\/task>$/);
  });

  it("is one step: an unusable record is sent back once, and the step fails only when neither model gives one", async () => {
    const given = ask();
    const runner = new ScriptedRunner([{ answer: JSON.stringify({ summary: "x" }) }, { answer: JSON.stringify(answer()) }]);
    const record = await writeChronicle(new Models(ledger().mac.db, { claude: runner }), [SONNET], given, "story", "trace-c", new AbortController().signal);
    expect(record.value.summary).toMatch(/^On the night train/);
    expect(runner.requests).toHaveLength(2);
    expect(runner.requests[1]!.prompt).toContain("- answer: must have required property 'paragraph'");
    expect(runner.requests[0]!.facts).toMatchObject({ passages: [{ label: "P1", move: false }, { label: "P2", move: true, text: TOLD }, { label: "P3" }, { label: "P4" }, { label: "P5" }] });

    const bad = { answer: JSON.stringify({ summary: "x" }) };
    await expect(writeChronicle(new Models(ledger().mac.db, { claude: new ScriptedRunner([bad, bad]) }), [SONNET], given, "story", "trace-c", new AbortController().signal)).rejects.toBeInstanceOf(AgentFailed);
  });
});
