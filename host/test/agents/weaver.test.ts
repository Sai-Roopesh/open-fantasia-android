import { describe, expect, it } from "vitest";
import { betweenKey, emptyUpdate, open, type PersonNow, type TruthUpdate } from "../../src/story/truth.js";
import { AgentFailed, BUDGETS } from "../../src/agents/step.js";
import { checkWeave, movesDue, weaverFormat, weaverPrompt, writeWeave, type WeaveAsk } from "../../src/agents/weaver.js";
import type { OutlineSet } from "../../src/story/entries.js";
import type { Intention } from "../../src/story/outline.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { nothingBeside } from "../../src/story/beside.js";
import { offersOn } from "../../src/story/day.js";
import { hogwartsWorldStoryFile, nightTrainStoryFile } from "../support/story-files.js";
import { ledger, SONNET, type Ledger } from "./ledger.js";

/** The common room after curfew, Friday Day 3, played to its end at 10:10 pm; he is next free on Saturday at 7:30 am. */
function ended(before: (story: Ledger) => void = () => {}, peak = 2): Ledger {
  const story = ledger(hogwartsWorldStoryFile());
  before(story);
  story.move("I say goodnight to Hermione and go up.");
  story.note({ clock: "Day 3 22:10", intensity: peak });
  story.reply("Hermione doesn't look up from her book.");
  story.close();
  story.chronicle();
  return story;
}

function ask(story: Ledger, changes: Partial<WeaveAsk> = {}): WeaveAsk {
  const state = story.state();
  return { state, from: state.scene!.endedAt!, until: state.clock, gap: false, scene: story.scene(), missed: [], ...changes };
}

const happening = (id: string, what: string, at: string, where: string, knownTo: string[], changes: Record<string, unknown> = {}) =>
  ({ id, what, at, where, known_to: knownTo, landmark: null, move: null, missed: null, ...changes });

function answer(changes: Record<string, unknown> = {}) {
  return {
    lives: [{ who: "Crabbe and Goyle", where: "the Slytherin common room", doing: "asleep after Draconia's errands", after: "Draconia's errands, and whatever she wants hit." }],
    threads: [{ name: "Quirrell and the third-floor door", now: "Quirrell has tried the wards twice and scorched the door" }],
    happened: [
      happening("H1", "Quirrell tested the third-floor door and scorched it.", "Day 4 02:00", "the third-floor corridor", ["Quirinus Quirrell"]),
      happening("H2", "McGonagall slid a note under Roopesh's door asking for his account of the troll.", "Day 4 06:45", "the boys' dormitory", ["Minerva McGonagall", "Roopesh Gantasala"]),
      happening("H3", "Lavender told everyone Selwyn's bones broke one after another.", "Day 4 06:55", "the Gryffindor common room", ["Lavender Brown"])
    ],
    meanwhile: [
      { text: "A note under the door: \"My office, nine o'clock. Bring only what you saw.\" M. McGonagall.", how: "seen", happened: "H2", told_by: null, about: ["mcgonagall"], engagement: null },
      { text: "Lavender says Selwyn's bones broke one after another, \"like someone snapping kindling\".", how: "rumour", happened: "H3", told_by: null, about: [], engagement: null }
    ],
    on: [{ at: "Day 4 20:00", place: "The Three Broomsticks", what: "The twins buy a round for anyone who saw the troll.", who: ["Harry Potter"] }],
    ...changes
  };
}

describe("the Weaver's move of the World (one-truth design decision 6)", () => {
  it("is taken with names as the Story keeps them, what happened given ids of the code's, and what is on after the span", () => {
    const story = ended();
    const checked = checkWeave(ask(story), answer({ lives: [{ who: "crabbe and goyle", where: "the dungeons", doing: "asleep", after: "Draconia's errands" }] }));
    expect(checked).toMatchObject({ ok: true, dropped: [] });
    if (!checked.ok) return;
    const { value } = checked;
    expect(value.lives).toEqual([{ who: "Crabbe and Goyle", where: "the dungeons", doing: "asleep", after: "Draconia's errands" }]);
    expect(value.happened.map(item => [item.at, item.knownTo])).toEqual([["Day 4 02:00", ["Quirinus Quirrell"]], ["Day 4 06:45", ["Minerva McGonagall", "Roopesh Gantasala"]], ["Day 4 06:55", ["Lavender Brown"]]]);
    const ids = value.happened.map(item => item.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every(id => /^h[0-9a-f]{8}$/.test(id))).toBe(true);
    expect(value.meanwhile.map(line => [line.fact, line.how, line.about])).toEqual([[ids[1], "seen", ["Minerva McGonagall"]], [ids[2], "rumour", []]]);
    expect(value.on).toEqual([{ id: expect.stringMatching(/^o/), at: "Day 4 20:00", place: "The Three Broomsticks", what: "The twins buy a round for anyone who saw the troll.", who: ["Harry Potter"] }]);
  });

  // Records degrade, never vanish (openspec living-world: Moments are remembered from one record).
  it("leaves out only the parts it cannot use, keeps happenings in the span, and asks nothing again", () => {
    const story = ended();
    const checked = checkWeave(ask(story), answer({
      lives: [{ who: "Roopesh Gantasala", where: "bed", doing: "sleeping", after: "x" }, { who: "Professor Dumbledore", where: "his office", doing: "thinking", after: "x" }],
      happened: [
        happening("H1", "Quirrell tested the door.", "Day 6 10:00", "the third floor", ["Quirinus Quirrell", "Lord Voldemort"]),
        happening("H2", "A note under the door.", "the small hours", "the dormitory", ["Minerva McGonagall"])
      ],
      meanwhile: [
        { text: "Someone was on the third floor.", how: "rumour", happened: "H1", told_by: "Lavender", about: ["Gilderoy Lockhart"], engagement: null },
        { text: "A note.", how: "seen", happened: "H2", told_by: null, about: [], engagement: null },
        ...Array.from({ length: 6 }, () => ({ text: "More talk.", how: "rumour", happened: "H1", told_by: null, about: [], engagement: null }))
      ],
      on: [{ at: "Day 4 06:00", place: "The Great Hall", what: "Breakfast.", who: [] }]
    }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.lives).toEqual([]);
    expect(checked.value.happened).toMatchObject([{ at: "Day 4 07:30", knownTo: ["Quirinus Quirrell"] }]);
    expect(checked.value.meanwhile).toHaveLength(5);
    expect(checked.value.meanwhile[0]).toMatchObject({ toldBy: "Lavender Brown", about: [] });
    expect(checked.value.on).toEqual([]);
    expect(checked.dropped).toEqual([
      "people: Lord Voldemort is not in the Story",
      "happened[1]: \"the small hours\" is not a story time",
      "people: Gilderoy Lockhart is not in the Story",
      "meanwhile[1]: H2 is not one of the happenings",
      "on[0]: \"Day 4 06:00\" is not after the span",
      "people: Professor Dumbledore is not in the Story"
    ]);
  });

  it("is sent back while a Landmark in the span has not happened, and takes it named as the Story names it", () => {
    const story = ended(before => before.add({ kind: "landmark_set", landmark: { name: "The Halloween feast", at: "Day 3 23:00", what: "The Great Hall feast, and the troll." } }));
    expect(checkWeave(ask(story), answer())).toEqual({ ok: false, problems: ["happened: The Halloween feast falls in the span (Friday 6 September 1991, 11:00 pm) and has not happened; write it, with landmark set to its name"] });
    const feast = happening("H4", "The troll came into the dungeons during the feast.", "Day 3 23:00", "the Great Hall", ["Minerva McGonagall"], { landmark: "the halloween feast" });
    const checked = checkWeave(ask(story), answer({ happened: [...answer().happened, feast] }));
    expect(checked.ok && checked.value.happened.at(-1)).toMatchObject({ landmark: "The Halloween feast", at: "Day 3 23:00" });
  });

  it("is sent back when it does not keep to its format", () => {
    expect(checkWeave(ask(ended()), { lives: [] }).ok).toBe(false);
  });

  it("is one step: an unusable move is sent back once, and the step fails only when neither model gives one", async () => {
    const story = ended();
    const runner = new ScriptedRunner([{ answer: JSON.stringify({ lives: [] }) }, { answer: JSON.stringify(answer()) }]);
    const record = await writeWeave(new Models(story.mac.db, { claude: runner }), [SONNET], ask(story), story.storyId, "trace-w", new AbortController().signal);
    expect(record.value.happened).toHaveLength(3);
    expect(runner.requests[1]!.prompt).toContain("- answer: must have required property 'threads'");
    // It may look the Story up as it stood when the span began, within its budget (docs/adr/0018).
    expect(runner.requests[0]).toMatchObject({ tools: { story: { storyId: story.storyId, head: story.scene().at(-1)!.id }, web: false }, turns: BUDGETS.weaver.turns });
    const unusable = { answer: JSON.stringify({ lives: [] }) };
    await expect(writeWeave(new Models(story.mac.db, { claude: new ScriptedRunner([unusable, unusable]) }), [SONNET], ask(story), story.storyId, "trace-w", new AbortController().signal)).rejects.toBeInstanceOf(AgentFailed);
  });
});

/** The truth part of an answer, empty but for [parts]. */
function truth(parts: Record<string, unknown> = {}) {
  return { people: [], beliefs: { open: [], close: [] }, between: [], truths: { open: [], close: [] }, rules: { open: [], close: [] }, names: [], ...parts };
}

/** Year One of the Outline, with Quirrell driving the World and [intentions] for the Act. */
function yearOne(story: Ledger, intentions: Intention[] = []) {
  const entry: OutlineSet = {
    kind: "outline_set", reason: "The Story starts.", planFollows: false, dropped: [], callId: "c", model: SONNET,
    outline: {
      current: 1, ending: "e", intentions, setups: [], promoted: [], revisedAfter: 0, deep: true, lookedUp: [],
      acts: [{
        number: 1, title: "Year One", question: "Will Draconia choose him over her father?", buildsTo: "the Philosopher's Stone", detail: "detailed",
        turns: [{ id: "a1", when: "the week before Halloween", what: "Quirrell lets the troll in.", serves: ["Quirinus Quirrell"], state: "ahead" }, { id: "a0", when: "the first week", what: "The Sorting.", serves: [], state: "done" }],
        relationships: [{ people: ["Draconia Malfoy", "Roopesh Gantasala"], byEnd: "She defends him in public." }],
        movers: [{ who: "Quirinus Quirrell", doing: "Testing the wards on the third floor for his master." }], handsOn: "h"
      }]
    }
  };
  story.add(entry);
}

describe("the truth off the page (openspec the-truth; the-storys-mind design decision 1)", () => {
  it("is asked for with the Lives, by tier: everyone has a Life, a Group as one, and nothing is quoted off the page", () => {
    const story = ended(before => yearOne(before));
    const format = weaverFormat(story.state(), ask(story)) as unknown as { required: string[]; properties: { lives: { items: { properties: { who: { enum: string[] } } } }; truth: { properties: { between: { items: { required: string[]; properties: object } }; people: { items: { required: string[] } } } } } };
    expect(format.required).toContain("truth");
    const who = format.properties.lives.items.properties.who.enum;
    expect(who.slice(0, 3)).toEqual(["Draconia Malfoy", "Hermione Granger", "Quirinus Quirrell"]);
    expect(who).toEqual(expect.arrayContaining(["Crabbe and Goyle", "Neville Longbottom", "The Hufflepuff Quidditch team"]));
    expect(who.filter(name => ["Vincent Crabbe", "Roopesh Gantasala"].includes(name))).toEqual([]);
    expect(format.properties.truth.properties.between.items.required).toEqual(["people", "stands", "turn"]);
    expect(format.properties.truth.properties.people.items.required).not.toContain("quotes");
  });

  it("keeps what the span changed with ids of the code's, never who he is, a Group as one, and closes what it ended", () => {
    const story = ended();
    const egg = { id: "T1", kind: "secret" as const, what: "Hagrid is hatching a dragon egg.", terms: [], who: ["Rubeus Hagrid"], knownTo: ["Rubeus Hagrid", "Hermione Granger"], due: null, replaces: null, sources: [] };
    story.world({ truth: { ...emptyUpdate(), truths: { open: [egg], close: [] } } });
    const given = ask(story);
    expect(weaverPrompt(given).prompt).toContain("- [T1] A secret, since Scene 1: Hagrid is hatching a dragon egg. It concerns Rubeus Hagrid. Known to Rubeus Hagrid and Hermione Granger.");
    const checked = checkWeave(given, answer({ truth: truth({
      people: [
        { who: "vincent crabbe", now: "Running Draconia's errands, and bored of them.", feelings: [], wants: "Pudding.", hides: "" },
        { who: "Roopesh Gantasala", now: "Asleep.", feelings: [], wants: "x", hides: "" },
        { who: "Quirrell", now: "Closer to the Stone, and more afraid.", feelings: [{ about: "Professor Snape", feels: "Afraid of him." }], wants: "The Stone, for his master.", hides: "Who rides the back of his head." }
      ],
      beliefs: { open: [{ holder: "Severus Snape", what: "Quirrell is after the Stone.", true: true }], close: [] },
      between: [{ people: ["Quirinus Quirrell", "Severus Snape"], stands: "Snape watches him.", turn: "Snape cornered him on the stairs." }],
      truths: { open: [{ kind: "threat", what: "Snape will go to Dumbledore if Quirrell tries the door again.", terms: [], who: ["Quirinus Quirrell"], known_to: ["Severus Snape", "Quirinus Quirrell"], due: null, replaces: null }], close: [{ id: "T1", why: "Hagrid told the whole Three Broomsticks." }] },
      names: [{ name: "Fluffy", kind: "thing", what: "The three-headed dog on the third floor." }]
    }) }));
    expect(checked).toMatchObject({ ok: true, dropped: [] });
    if (!checked.ok) return;
    const expected: TruthUpdate = {
      now: [
        { who: "Crabbe and Goyle", now: "Running Draconia's errands, and bored of them.", feelings: [], wants: "Pudding.", hides: "", scene: 1, sources: [] },
        { who: "Quirinus Quirrell", now: "Closer to the Stone, and more afraid.", feelings: [{ about: "Severus Snape", feels: "Afraid of him." }], wants: "The Stone, for his master.", hides: "Who rides the back of his head.", scene: 1, sources: [] }
      ],
      beliefs: { open: [{ id: "B1", holder: "Severus Snape", what: "Quirrell is after the Stone.", true: true, sources: [] }], close: [] },
      between: [{ people: ["Quirinus Quirrell", "Severus Snape"], stands: "Snape watches him.", turn: { text: "Snape cornered him on the stairs.", scene: 1, sources: [] }, keepsakes: [] }],
      truths: { open: [{ id: "T2", kind: "threat", what: "Snape will go to Dumbledore if Quirrell tries the door again.", terms: [], who: ["Quirinus Quirrell"], knownTo: ["Severus Snape", "Quirinus Quirrell"], due: null, replaces: null, sources: [] }], close: [{ id: "T1", why: "Hagrid told the whole Three Broomsticks." }] },
      rules: { open: [], close: [] },
      names: [{ name: "Fluffy", kind: "thing", what: "The three-headed dog on the third floor.", first: 1, sources: [] }]
    };
    expect(checked.value.truth).toEqual(expected);
    story.world({ truth: checked.value.truth });
    expect(open(story.state().truth.truths).map(item => item.id)).toEqual(["T2"]);
    expect(story.state().truth.now["Crabbe and Goyle"]?.wants).toBe("Pudding.");
  });
});

describe("Lives lived out off the page (openspec living-world: Everyone has a Life)", () => {
  it("is given the Lives by tier and the current Act: what each pursues, the turns ahead, and who drives the World", () => {
    const story = ended(before => yearOne(before, [{ who: "Draconia Malfoy", pursues: "the Seeker's place, and her father's approval", feelings: "toward Pansy, a cooling", heading: "a break with her father by June" }]));
    const { system, prompt } = weaverPrompt(ask(story));
    expect(prompt).toContain([
      "<outline>\nWhere the Story is going, the Outline.",
      "Act 1, Year One, now. Its question: Will Draconia choose him over her father? It builds to the Philosopher's Stone.",
      "- Ahead, the week before Halloween: Quirrell lets the troll in. It moves Quirinus Quirrell.",
      "- Done, the first week: The Sorting.",
      "- By its end, Draconia Malfoy and Roopesh Gantasala: She defends him in public.",
      "- Quirinus Quirrell this Act: Testing the wards on the third floor for his master.",
      "It hands on: h.",
      "Where each is heading this Act, for their own sake:",
      "- Draconia Malfoy pursues the Seeker's place, and her father's approval; feels toward Pansy, a cooling; heading for a break with her father by June."
    ].join("\n"));
    // Whose Life is kept how; the Lives of the Close and the Movers in full, where things stand.
    expect(prompt).toContain("<lives_by_tier>\nClose, each with a full Life: Draconia Malfoy (a Lead), Hermione Granger (a Lead).\nMovers, who drive the World this Act, each with a full Life: Quirinus Quirrell.");
    const lives = prompt.slice(prompt.indexOf("<people_now>"), prompt.indexOf("</people_now>"));
    expect(lives).toContain("\nDraconia Malfoy\n  Now: as when the Story began.\n  Heading this Act: a break with her father by June.");
    expect(lives).toContain("\nHermione Granger\n");
    expect(lives).toContain("\nQuirinus Quirrell\n");
    expect(system.replace(/\s+/g, " ")).toContain("Live each one out over the span, always, and whole: what they do about what they want, apart from him as much as with him");
  });

  // GIVEN Hermione's Life says she is worried about her parents and about the exams
  // WHEN a week passes off-screen
  // THEN her Life has moved on those too, not only on what she feels about him
  it("living-world › Everyone has a Life › A life apart from him", () => {
    const worried: PersonNow = {
      who: "Hermione Granger", now: "Worried about her parents, whose letters have stopped, and about the November exams; she reads so as not to think.",
      feelings: [{ about: "Roopesh Gantasala", feels: "Curious, and cross with herself for it." }, { about: "Ron Weasley", feels: "Exasperated, fond underneath." }],
      wants: "To come top in the exams, and a letter from home.", hides: "That she has written home four times.", scene: 1, sources: []
    };
    const story = ended(before => yearOne(before, [{ who: "Hermione Granger", pursues: "top marks in November, and why her parents stopped writing", feelings: "toward Ron, softening", heading: "a friend she did not expect by Christmas" }]));
    story.world({ truth: { ...emptyUpdate(), now: [worried] } });
    const week = ask(story, { until: "Day 10 07:30" });

    // The World is given her Life apart from him, and asked to live it for its own sake.
    const { system, prompt } = weaverPrompt(week);
    const lives = prompt.slice(prompt.indexOf("<people_now>"), prompt.indexOf("</people_now>"));
    const hers = lives.slice(lives.indexOf("\nHermione Granger\n"), lives.indexOf("\nQuirinus Quirrell\n"));
    expect(hers).toContain(worried.now);
    expect(hers).toContain("About Ron Weasley: Exasperated, fond underneath.");
    expect(hers).toContain("Wants: To come top in the exams, and a letter from home.");
    expect(prompt).toContain("- Hermione Granger pursues top marks in November, and why her parents stopped writing;");
    expect(prompt).toContain("the Lives of the people who matter, lived for their own sake");
    expect(system.replace(/\s+/g, " ")).toContain("an exam to revise for, a letter from home, a rival, a friend in trouble");

    // A week lived: her parents wrote, she revised; what she feels about him moved too.
    const lived = checkWeave(week, answer({
      happened: [
        happening("H1", "A letter came for Hermione from her mother: her father's operation went well, and they had been at the hospital.", "Day 6 08:00", "the Great Hall", ["Hermione Granger"]),
        happening("H2", "Hermione revised in the library every evening of the week.", "Day 8 20:00", "the library", ["Hermione Granger"]),
        happening("H3", "Madam Hooch tested the first-years on brooms.", "Day 8 10:00", "the Quidditch pitch", ["Draconia Malfoy"], { landmark: "Draconia's flying test" })
      ],
      meanwhile: [],
      truth: truth({ people: [{
        who: "Hermione Granger", now: "Her parents wrote at last: her father's operation went well. She is ahead of every subject for November and has stopped reading to hide.",
        feelings: [{ about: "Roopesh Gantasala", feels: "She has started saving him a seat." }], wants: "To come top in the exams.", hides: "How frightened she was for her father."
      }] })
    }));
    expect(lived.ok).toBe(true);
    if (!lived.ok) return;
    story.world({ ...lived.value, from: week.from, until: week.until });
    const now = story.state().truth.now["Hermione Granger"]!;
    expect(now.now).toMatch(/parents wrote at last.*November/);
    // Her Life is kept whole: what she feels about Ron is not lost because the week moved what she feels about him.
    expect(now.feelings).toEqual([{ about: "Roopesh Gantasala", feels: "She has started saving him a seat." }, { about: "Ron Weasley", feels: "Exasperated, fond underneath." }]);
    expect(story.state().truth.past.at(-1)).toEqual(worried);
  });
});

describe("a span skipped as asked (openspec living-world: Off-screen time is resolved only as far as it reaches the player)", () => {
  // GIVEN the player skips a month and writes that the girls' feelings for him grow
  // WHEN the World moves on over the month
  // THEN it is lived with him there, as the Move said, and their feelings have grown at its end
  it("living-world › Off-screen time is resolved only as far as it reaches the player › A month skipped as asked", () => {
    const story = ended();
    const skip = "A month passes. I go to my classes, and spend my evenings in the library with Draconia and Hermione. Their feelings for me grow.";
    const wednesdays = { at: "Day 8 19:30", place: "The library", what: "Draconia's Wednesday session at the end table.", who: ["Draconia Malfoy"], expected: true };
    const month = ask(story, { gap: true, from: "Day 4 07:30", until: "Day 34 07:30", scene: [story.move(skip)], missed: [wednesdays] });

    // The month is lived as the Move says, with him there: not as a month in which he never came.
    const { system, prompt } = weaverPrompt(month);
    expect(prompt).toContain(`<the_gap>\n<move by="Roopesh Gantasala">\n${skip}\n</move>\n</the_gap>`);
    expect(prompt).toContain("Live the span as it says, with him there where it puts him");
    expect(prompt).toContain("<on_in_the_span>\n- G1 Wednesday 11 September 1991, 7:30 pm, The library: Draconia's Wednesday session at the end table. With Draconia Malfoy. He was expected.\n</on_in_the_span>");
    expect(prompt).not.toContain("<missed>");
    // The Move is this moment, not a passage of the Scene that ended before it.
    expect(prompt).not.toContain("<scene_so_far>");
    const rules = system.replace(/\s+/g, " ");
    expect(rules).toContain("Live the span as it says, with him there wherever it puts him.");
    expect(rules).toContain("if it says their feelings for him grew, they have grown by the span's end, in who they are now and between them");
    expect(rules).toContain("Where his Move puts him there (his classes, the evenings it names), he was there: put him in `known_to`.");
    expect(rules).not.toContain("Everything else in the span goes on without him.");

    const grown = (who: string, feels: string) => ({ who, now: `${who.split(" ")[0]} spends her evenings in the library with him.`, feelings: [{ about: "Roopesh Gantasala", feels }], wants: "Him, though she would not say so.", hides: "How much she looks forward to the evenings." });
    const lived = checkWeave(month, answer({
      lives: [], threads: [], meanwhile: [], on: [],
      happened: [
        happening("H1", "Every evening that month, Draconia and Hermione sat with Roopesh at the library's end table.", "Day 20 20:00", "the library", ["Draconia Malfoy", "Hermione Granger", "Roopesh Gantasala"]),
        happening("H2", "Draconia kept her Wednesday session, and Roopesh came to every one.", "Day 8 19:30", "The library", ["Draconia Malfoy", "Roopesh Gantasala"], { missed: "G1" }),
        happening("H3", "Madam Hooch tested the first-years on brooms; Roopesh watched from the stands.", "Day 8 10:00", "the Quidditch pitch", ["Draconia Malfoy", "Roopesh Gantasala"], { landmark: "Draconia's flying test" })
      ],
      truth: truth({
        people: [grown("Draconia Malfoy", "She waits for him at the end table, and has stopped pretending she comes for the books."), grown("Hermione Granger", "Fonder of him than she will admit.")],
        between: [
          { people: ["Roopesh Gantasala", "Draconia Malfoy"], stands: "A month of evenings together; she waits for him now.", turn: "She stopped pretending she came for the books." },
          { people: ["Roopesh Gantasala", "Hermione Granger"], stands: "She saves him the seat beside hers.", turn: "A month of evenings in the library." }
        ]
      })
    }));
    expect(lived).toMatchObject({ ok: true, dropped: [] });
    if (!lived.ok) return;
    expect(lived.value.happened.map(item => [item.at, item.knownTo.includes("Roopesh Gantasala")])).toEqual([["Day 20 20:00", true], ["Day 8 19:30", true], ["Day 8 10:00", true]]);

    story.world({ ...lived.value, gap: true, from: month.from, until: month.until });
    const held = story.state().truth;
    expect(held.now["Draconia Malfoy"]?.feelings).toEqual([{ about: "Roopesh Gantasala", feels: "She waits for him at the end table, and has stopped pretending she comes for the books." }]);
    expect(held.now["Hermione Granger"]?.feelings[0]).toEqual({ about: "Roopesh Gantasala", feels: "Fonder of him than she will admit." });
    expect(held.between[betweenKey("Draconia Malfoy", "Roopesh Gantasala")]).toMatchObject({ stands: "A month of evenings together; she waits for him now.", turns: [{ text: "She stopped pretending she came for the books." }] });
    expect(story.state().facts.filter(fact => fact.source === "world" && fact.knownTo.includes("Roopesh Gantasala"))).toHaveLength(3);
  });
});

describe("the Leads' moves off-screen (openspec long-run: Leads act every Stretch)", () => {
  const seating = "Draconia had his name taken off the Charms seating plan.";

  /** A Stretch in which Draconia's move is made off-screen. */
  const stretch = () => ended(before => {
    before.plan({ afterScene: 1, leads: [{ who: "Draconia Malfoy", move: "Has his name taken off the Charms seating plan.", scene: null }, { who: "Hermione Granger", move: "Asks him to revise.", scene: "s1.1" }] });
  });

  it("is given each Lead's move still to make off-screen, and keeps one made with its Lead's mark", () => {
    const story = stretch();
    expect(movesDue(story.state()).map(move => move.who)).toEqual(["Draconia Malfoy"]);
    expect(weaverPrompt(ask(story)).prompt).toContain("<lead_moves_offscreen>\n- Draconia Malfoy: Has his name taken off the Charms seating plan.\n</lead_moves_offscreen>");
    const made = happening("H4", seating, "Day 4 06:00", "Flitwick's office", ["Draconia Malfoy", "Neville Longbottom"], { move: "draconia" });
    const checked = checkWeave(ask(story), answer({ happened: [made] , meanwhile: [] }));
    expect(checked).toMatchObject({ ok: true, dropped: [] });
    if (!checked.ok) return;
    expect(checked.value.happened[0]).toMatchObject({ move: "Draconia Malfoy", knownTo: ["Draconia Malfoy", "Neville Longbottom"] });
    story.world({ happened: checked.value.happened });
    expect(movesDue(story.state())).toEqual([]);
  });

  // GIVEN no Lead has a move to make off-screen
  // WHEN the World's record marks Harry's evening in the common room as his move
  // THEN it is kept as an ordinary happening, and the World is not asked again
  it("living-world › Moments are remembered from one record › Set right, not asked again", async () => {
    const story = ended();
    expect(movesDue(story.state())).toEqual([]);
    const evening = happening("H4", "Harry spent the evening in the common room with Ron.", "Day 3 22:30", "the Gryffindor common room", ["Harry Potter"], { move: "Harry Potter" });
    const runner = new ScriptedRunner([{ answer: JSON.stringify(answer({ happened: [...answer().happened, evening] })) }]);
    const record = await writeWeave(new Models(story.mac.db, { claude: runner }), [SONNET], ask(story), story.storyId, "trace-w", new AbortController().signal);
    expect(record.value.happened.find(item => item.what === evening.what)).toMatchObject({ move: null });
    expect(record.dropped).toEqual([]);
    expect(runner.requests).toHaveLength(1);
  });
});

describe("what he missed (openspec day-view: Missing something has consequences)", () => {
  const library = { at: "Day 5 14:00", place: "The library", what: "Draconia's library session.", who: ["Draconia Malfoy"], expected: true };

  /** He skips from Saturday morning to next week, Monday. */
  const skipped = () => {
    const story = ended();
    return ask(story, { gap: true, from: "Day 4 07:30", until: "Day 6 07:30", scene: [story.move("I keep to myself until next week.")], missed: [library] });
  };

  // GIVEN Draconia's library Scene was on Sunday at 2:00 pm
  // WHEN the player skips to next week, and the World writes it going on without him on Saturday
  // THEN it went on on Sunday at 2:00 pm, in the library
  it("day-view › Missing something has consequences › What he missed keeps its time", () => {
    const without = happening("H9", "Draconia waited at the back table; he did not come.", "Day 4 10:00", "the Slytherin common room", ["Draconia Malfoy"], { missed: "G1" });
    const checked = checkWeave(skipped(), answer({ happened: [without], meanwhile: [], on: [] }));
    expect(checked).toMatchObject({ ok: true, dropped: [] });
    expect(checked.ok && checked.value.happened[0]).toMatchObject({ at: "Day 5 14:00", where: "The library" });
  });

  it("says the day of what was on in the Gap, and is sent back when what he was expected at is not written", () => {
    const gap = skipped();
    expect(weaverPrompt(gap).prompt).toContain("<on_in_the_span>\n- G1 Sunday 8 September 1991, 2:00 pm, The library: Draconia's library session. With Draconia Malfoy. He was expected.\n</on_in_the_span>");
    expect(checkWeave(gap, answer({ meanwhile: [] }))).toEqual({ ok: false, problems: ["happened: G1, The library, was on in the span and he was expected; write it as his Move has it: with him there, or going on without him and the people there noticing (missed: \"G1\")"] });
  });

  it("says what he missed while he was in the Scene, and is sent back when what he was expected at did not go on", () => {
    const story = ended();
    const missed = ask(story, { missed: [{ ...library, at: "Day 3 22:00" }] });
    expect(weaverPrompt(missed).prompt).toContain("<missed>\n- G1 Friday 6 September 1991, 10:00 pm, The library: Draconia's library session. With Draconia Malfoy. He was expected.\n</missed>");
    expect(checkWeave(missed, answer({ meanwhile: [] }))).toEqual({ ok: false, problems: ["happened: G1, The library, went on without him and he was expected; write it, with the people there noticing he did not come (missed: \"G1\")"] });
  });

  it("offers nothing on over a Gap", () => {
    const checked = checkWeave(skipped(), answer({ happened: [happening("H9", "It went on.", "Day 5 14:00", "The library", ["Draconia Malfoy"], { missed: "G1" })], meanwhile: [] }));
    expect(checked.ok && checked.value.on).toEqual([]);
  });
});

describe("an Engagement carried by Meanwhile (docs/adr/0011)", () => {
  const note = { text: "A note under the door: \"My office, nine o'clock.\" M. McGonagall.", how: "seen", happened: "H2", told_by: null, about: [] };
  const summons = { what: "McGonagall wants his account of the troll.", at: "Day 4 09:00", place: "McGonagall's office", who: ["mcgonagall"], expected: true, every: null };

  it("keeps the Engagement a line of Meanwhile carries, after the span, and leaves out one before its end, keeping the line", () => {
    const story = ended();
    const kept = checkWeave(ask(story), answer({ meanwhile: [{ ...note, engagement: summons }] }));
    expect(kept.ok && kept.value.meanwhile[0]!.engagement).toEqual({ id: expect.stringMatching(/^g-/), what: summons.what, at: "Day 4 09:00", place: "McGonagall's office", who: ["Minerva McGonagall"], expected: true, every: null, quotes: [] });
    const early = checkWeave(ask(story), answer({ meanwhile: [{ ...note, engagement: { ...summons, at: "Day 4 07:00" } }] }));
    expect(early).toMatchObject({ ok: true, dropped: ["meanwhile[0]: the engagement at \"Day 4 07:00\" is not after the span"] });
    expect(early.ok && early.value.meanwhile[0]).toMatchObject({ text: note.text, engagement: null });
  });
});

describe("the Weaver's call", () => {
  it("gives the span, The Story So Far, the World as it stands, what is on ahead, the Scene that ended and the Landmarks in the span", () => {
    const story = ended(before => before.add({ kind: "landmark_set", landmark: { name: "The Halloween feast", at: "Day 3 23:00", what: "The Great Hall feast." } }));
    story.add({ kind: "chronicle", truth: emptyUpdate(), scene: 1, summary: "", paragraph: "Hermione would not say what she was reading.", moments: [], told: [], known: [], bonds: [], engagements: [], changed: [], dropped: [], callId: "c", model: SONNET });
    story.world({ on: [{ id: "o-1", at: "Day 4 20:00", place: "The Three Broomsticks", what: "The twins buy a round.", who: ["Harry Potter"] }] });
    const { system, prompt } = weaverPrompt(ask(story));
    expect(system).toContain("# The Weaver");
    expect(system.replace(/\s+/g, " ")).toContain("give again each item still ahead that is still going on, as it was, or it is gone.");
    expect(system).toContain("- Crabbe and Goyle: Draconia's errands, and whatever she wants hit.");
    expect(prompt).toContain('<span from="Friday 6 September 1991, 10:10 pm" until="Saturday 7 September 1991, 7:30 am">');
    expect(prompt).toContain("Hermione would not say what she was reading.");
    expect(prompt).toContain("- Quirrell and the third-floor door: Quirrell is testing the wards on the third-floor door, at night, alone");
    expect(prompt).toContain("What is on ahead:\n- Saturday 7 September 1991, 8:00 pm, The Three Broomsticks: The twins buy a round. With Harry Potter.");
    // The Scene that ended, as layer 3, after where things stand.
    expect(prompt).toContain("<scene>\nAfter curfew. The Gryffindor common room, from Friday 6 September 1991, 9:40 pm until Friday 6 September 1991, 10:10 pm, when it ended.");
    expect(prompt).toContain('<scene_so_far>\nThe fire has burned down to red.');
    expect(prompt).toContain('<move by="Roopesh Gantasala">\nI say goodnight to Hermione and go up.\n</move>\n\nHermione doesn\'t look up from her book.\n</scene_so_far>');
    expect(prompt.indexOf("<scene>")).toBeGreaterThan(prompt.indexOf("<story_so_far>"));
    expect(prompt.indexOf("<now>")).toBeGreaterThan(prompt.indexOf("</scene_so_far>"));
    expect(prompt).toContain("<landmarks_in_span>\n- The Halloween feast, Friday 6 September 1991, 11:00 pm: The Great Hall feast.\n</landmarks_in_span>");
  });

  it("reads the player's wishes beside the Story when it is given them, and none when not", () => {
    const story = ended();
    const beside = { ...nothingBeside(), taste: ["Never write her as a first-timer."], brief: { more: ["the rivalry"], less: [] } };
    const { prompt } = weaverPrompt({ ...ask(story), beside });
    expect(prompt).toContain("Taste, the lessons the player has taught:\n- Never write her as a first-timer.");
    expect(prompt).toContain("More of:\n- the rivalry");
    expect(weaverPrompt(ask(story)).prompt).not.toContain("<the_players_wishes>");
  });

  // GIVEN the World last stood at 7:40 am at Kalka, and a Scene at Barog opens at 9:05 am and ends with Ishaan still on
  //   the platform, listening for a bird with Meera
  // WHEN the World moves on
  // THEN what happened at Barog happened at 9:05 am, as the Scene says
  // AND nothing that happened before 9:05 am is known to Ishaan, and nothing has him back on the train
  it("living-world › Only the player makes facts about the Player Character › The World moves on around him", () => {
    const story = ledger(nightTrainStoryFile());
    story.world({ from: "Day 2 07:00", until: "Day 2 07:40", lives: [{ who: "Meera Kulkarni", where: "Kalka", doing: "waiting for the toy train", after: "The hills" }] });
    story.move("I stay on the platform with Meera, listening for the bird.");
    story.note({ clock: "Day 2 09:40" });
    story.reply("Meera holds up a hand. Somewhere in the mist, the bird calls again.");
    story.close();
    story.chronicle({ moments: [{ what: "Ishaan and Meera listen for the bird at Barog.", quotes: [{ entry: "e", text: "I stay on the platform with Meera, listening for the bird." }], there: ["Meera Kulkarni"], weight: 3 }] });
    // What happened at Barog happened when the Scene says.
    expect(story.state().facts.at(-1)).toMatchObject({ at: "Day 2 09:05", where: "Barog station platform, hill mist, the toy train's engine taking water" });
    const weave = ask(story, { until: "Day 2 13:00" });
    const { system, prompt } = weaverPrompt(weave);
    expect(prompt).toContain("<scene>\nWater at Barog. Barog station platform, hill mist, the toy train's engine taking water, from Friday 17 July 2026, 9:05 am until Friday 17 July 2026, 9:40 am, when it ended.");
    expect(system.replace(/\s+/g, " ")).toContain("Before the Scene opened he was off-screen; the World moves on around him, not with him.");
    // Nothing the World writes is before the Scene ended, and nothing has him anywhere.
    const checked = checkWeave(weave, answer({
      lives: [{ who: "Ishaan Mehra", where: "back on the train", doing: "asleep", after: "Shimla" }, { who: "Meera", where: "Barog station platform", doing: "listening for the bird", after: "The hills" }],
      threads: [],
      happened: [happening("H1", "The guard blew his whistle twice.", "Day 2 07:50", "Kalka", ["Uncle Bhalla"])],
      meanwhile: [], on: []
    }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.lives.map(life => life.who)).toEqual(["Meera Kulkarni"]);
    expect(checked.value.happened[0]!.at).toBe("Day 2 09:40");
  });
});

describe("rest after a peak (openspec long-run: Rest is deliberate)", () => {
  // GIVEN a Scene just peaked, and the Director's new Stretch is a rest whose next Scene that matters is a quiet
  //   breakfast on Monday
  // THEN the Story's own pick at the Day View is Monday's breakfast, and the World moves on at the first answer that
  //   offers it
  it("long-run › Rest is deliberate › The rest the Director planned", async () => {
    const story = ended(() => {}, 5);
    expect(story.state().curve.at(-1)).toMatchObject({ scene: 1, peak: 5 });
    story.plan({ phase: "rest", scenes: [{ id: "s1.1", at: "Day 6 08:00", place: "The Great Hall", who: ["Hermione Granger"], serves: { turn: null, lives: ["Hermione Granger"] }, for: "A slow breakfast after the night before.", offer: "Breakfast, late, with nothing to do after.", headline: "Breakfast: a slow one", lead: null, engagement: null, quiet: true }] });
    // The Weaver moves the World only: the pick is the Director's, and it is not asked for one.
    const weave = ask(story);
    expect(weaverPrompt(weave).prompt).not.toMatch(/peaked|quiet Happening|your pick/);
    const runner = new ScriptedRunner([{ answer: JSON.stringify(answer()) }]);
    const record = await writeWeave(new Models(story.mac.db, { claude: runner }), [SONNET], weave, story.storyId, "trace-w", new AbortController().signal);
    expect(runner.requests).toHaveLength(1);
    story.world({ ...record.value, from: weave.from, until: weave.until });
    const [pick, ...rest] = offersOn(story.state());
    expect(pick).toMatchObject({ pick: true, scene: "s1.1", at: "Day 6 08:00", place: "The Great Hall", what: "Breakfast, late, with nothing to do after." });
    expect(rest.map(item => item.place)).toEqual(["The Three Broomsticks"]);
  });
});
