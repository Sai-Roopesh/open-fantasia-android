import { describe, expect, it } from "vitest";
import { ACT_TOKENS, checkAccountAnswer, checkFold, folderPrompt, foldDue, KEEP_SCENES, missingNames, SEND_BACKS, writeFold } from "../../src/agents/folder.js";
import { LIMITS, storySoFarPart, tokens } from "../../src/context/lens.js";
import { FakeModels } from "../../src/models/fake.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import type { Entry, OutlineSet, Payload } from "../../src/story/entries.js";
import type { Act } from "../../src/story/outline.js";
import { apply } from "../../src/story/reducer.js";
import type { State, Told } from "../../src/story/state.js";
import { emptyUpdate, type TruthUpdate } from "../../src/story/truth.js";
import { freshHome } from "../support/host.js";
import { hogwartsStoryFile, malfoyProblemStoryFile } from "../support/story-files.js";
import { ledger, SONNET } from "./ledger.js";

const words = (count: number, word: string) => Array.from({ length: count }, () => word).join(" ");
const YEARS = ["Year One", "Year Two", "Year Three", "Year Four", "Year Five"];
const inAct = (number: number) => ({ number, title: YEARS[number - 1] ?? `Act ${number}` });
const paragraph = (number: number, day: number, act?: number, text = `Scene ${number} happened.`): Told =>
  ({ from: `Day ${day} 10:00`, until: `Day ${day} 11:00`, text, scene: { number, title: `Scene ${number}` }, who: [], ...(act ? { act: inAct(act) } : {}) });
const week = (from: number): Told => ({ from: `Day ${from} 08:00`, until: `Day ${from + 6} 22:00`, text: `The week from Day ${from}.`, scene: null, who: [] });

const act = (number: number): Act => ({
  number, title: YEARS[number - 1] ?? `Act ${number}`, question: `What does ${YEARS[number - 1]} ask of them?`, buildsTo: "the year's end",
  detail: number === 1 ? "detailed" : "sketched", turns: [], relationships: [], movers: [], handsOn: ""
});

/** The Director's Outline of a Story in five years, with [current] the Act being played. */
const outlined = (current: number): OutlineSet => ({
  kind: "outline_set", outline: { current, acts: [1, 2, 3, 4, 5].map(act), ending: "Voldemort is defeated.", intentions: [], setups: [], promoted: [], revisedAfter: 0, deep: true, lookedUp: [] },
  reason: current === 1 ? "The Story starts." : "An Act ended.", planFollows: false, dropped: [], callId: "c", model: SONNET
});

/** A State whose Story So Far holds [scenes] paragraphs and [weeks] recaps, with the Outline at Act [current] when given. */
function told(scenes: Told[], weeks: Told[] = [], current?: number): State {
  const state = apply(null, { seq: 1, id: "e1", storyId: "s", parentId: null, payload: { kind: "story_set_up", storyFile: hogwartsStoryFile(), portraits: {} }, createdAt: "" });
  return { ...state, outline: current ? { ...outlined(current).outline, version: 1 } : null, storySoFar: { acts: [], weeks, scenes } };
}

/** [count] paragraphs of about [length] words, a Scene a day from Day 1, all in Act [act]. */
const playedFor = (count: number, length: number, act?: number) => Array.from({ length: count }, (_, index) => paragraph(index + 1, index + 1, act, `Scene ${index + 1}: ${words(length, "said")}.`));

describe("when the Folder folds (the-storys-mind design decision 8)", () => {
  it("folds nothing while the current Act is told in under ten thousand tokens, however many Scenes it has", () => {
    // Fifty Scenes of about eighty words each come to about six thousand tokens: every one keeps its paragraph.
    const scenes = playedFor(50, 78, 1);
    expect(tokens(scenes.map(part => part.text).join("\n"))).toBeLessThan(ACT_TOKENS);
    expect(foldDue(told(scenes, [], 1))).toBeNull();
    expect(foldDue(told(scenes))).toBeNull();
  });

  it("folds the current Act's oldest week past ten thousand tokens, and never its newest Scenes", () => {
    const scenes = playedFor(100, 78, 1);
    expect(tokens(scenes.map(part => part.text).join("\n"))).toBeGreaterThan(ACT_TOKENS);
    // A Scene a day: the oldest week is Days 1 to 7.
    expect(foldDue(told(scenes, [], 1))).toEqual({ into: "week", parts: scenes.slice(0, 7) });
    // A crowded week is folded only as far as the newest Scenes.
    const crowded = Array.from({ length: 30 }, (_, index) => paragraph(index + 1, 1, 1, `Scene ${index + 1}: ${words(400, "said")}.`));
    expect(foldDue(told(crowded, [], 1))).toEqual({ into: "week", parts: crowded.slice(0, 30 - KEEP_SCENES) });
  });

  it("gathers an Act the Outline has moved past, its weeks and every one of its Scenes, before anything else", () => {
    const weeks = [week(1)];
    const scenes = [...playedFor(4, 10, 1).map((part, index) => ({ ...part, from: `Day ${8 + index} 10:00`, until: `Day ${8 + index} 11:00` })), paragraph(5, 20, 2)];
    expect(foldDue(told(scenes, weeks, 1))).toBeNull();
    expect(foldDue(told(scenes, weeks, 2))).toEqual({ into: "act", parts: [...weeks, ...scenes.slice(0, 4)] });
  });
});

describe("the Folder's call", () => {
  it("asks for a week's recap from its Scenes, inventing nothing", () => {
    const state = told([]);
    const recap = folderPrompt(state, { into: "week", parts: [paragraph(4, 2), paragraph(5, 3)] });
    expect(recap.system).toContain("Fold the Scenes below into one recap of their week, about one hundred and twenty words");
    expect(recap.system).toContain("Invent nothing. Tell each thing you keep as the parts tell it");
    expect(recap.system).toContain("a near miss stays a near miss");
    expect(recap.prompt).toContain("Scene 4, Scene 4: Scene 4 happened.\n\nScene 5, Scene 5: Scene 5 happened.");
  });

  it("asks for an Act's account of one to two thousand words, with every turning point and name its Scenes recorded", () => {
    const story = yearOne();
    const due = foldDue(story.state())!;
    const { system, prompt } = folderPrompt(story.state(), due);
    expect(system).toContain("Act 1, Year One, has ended. Gather its parts below into one account of the Act, 1,000 to 2,000 words");
    expect(system).toContain("every one of them is in the account");
    // It reads the Story as every agent does, in layer 1: who each person is, by every name they go by.
    expect(system).toContain("<people>\nWho each person was when the Story began.");
    expect(system).toContain("- Draconia Malfoy, a Lead, also Connie:");
    expect(prompt).toContain("<act>\nAct 1, Year One, Scenes 1 to 7,");
    expect(prompt).toContain(`<turning_points>\n- Scene 3, Draconia Malfoy and Hermione Granger: They signed the contract over him.\n- Scene 6, Hermione Granger and Roopesh Gantasala: ${LEARNED}\n</turning_points>`);
    expect(prompt).toContain("<names>\n- Silas Penhallow\n</names>");
    expect(prompt).toContain("<who_was_there>\nDraconia Malfoy, Hermione Granger\n</who_was_there>");
  });

  it("takes a fold that is text, and sends back one that is not", () => {
    expect(checkFold({ text: "  A week in which things turned. " })).toEqual({ ok: true, value: "A week in which things turned." });
    expect(checkFold({ recap: "A week." }).ok).toBe(false);
    expect(checkFold({ text: "" }).ok).toBe(false);
    expect(checkAccountAnswer({ missing: [" The night in Scene 6. "], invented: [] })).toEqual({ ok: true, value: { missing: ["The night in Scene 6."], invented: [] } });
    expect(checkAccountAnswer({ missing: [] }).ok).toBe(false);
  });

  it("writes a week in one step: its own model, then the second", async () => {
    const mac = freshHome();
    const runner = new ScriptedRunner([{ answer: JSON.stringify({ words: "no" }) }, { answer: JSON.stringify({ text: "A week in which she owed him." }) }]);
    const folded = await writeFold(new Models(mac.db, { claude: runner }), [SONNET], told([]), { into: "week", parts: [paragraph(1, 1)] }, "story", "trace-f", new AbortController().signal);
    expect(folded.value).toBe("A week in which she owed him.");
    expect(runner.requests.map(request => request.agent)).toEqual(["folder", "folder"]);
  });
});

const LEARNED = "Hermione learned he can stop time, the night every clock in the library stopped and only the two of them moved.";
const between = (people: [string, string], scene: number, turn: string): TruthUpdate => ({ ...emptyUpdate(), between: [{ people, stands: turn, turn: { text: turn, scene, sources: [] }, keepsakes: [] }] });

/** The Malfoy Problem's Year One, seven Scenes long, ended: the Outline has moved on to Year Two. */
function yearOne() {
  const file = malfoyProblemStoryFile();
  file.opening.who = ["Draconia Malfoy", "Hermione Granger"];
  const story = ledger(file);
  story.add(outlined(1));
  const scenes: [string, TruthUpdate][] = [
    ["The insult", emptyUpdate()],
    ["Charms", emptyUpdate()],
    ["The contract", between(["Draconia Malfoy", "Hermione Granger"], 3, "They signed the contract over him.")],
    ["The Auror", { ...emptyUpdate(), names: [{ name: "Silas Penhallow", kind: "person", what: "An Auror of Madam Bones's office", first: 4, sources: [] }] }],
    ["Revision", emptyUpdate()],
    ["The library at night", between(["Roopesh Gantasala", "Hermione Granger"], 6, LEARNED)],
    ["The end of the year", emptyUpdate()]
  ];
  scenes.forEach(([title, truth], index) => {
    if (index > 0) story.open(title, "The library", `Day ${7 + index * 30} 20:00`, ["Draconia Malfoy", "Hermione Granger"]);
    story.close();
    story.chronicle({ truth, paragraph: `${title}: Draconia and Hermione fought over him again.` });
  });
  story.add(outlined(2));
  return story;
}

describe("Every agent knows the Story So Far (openspec living-world)", () => {
  /** Plays [count] Scenes on the reducer, an Act every [perAct], each ended as the Scene end ends it: its paragraph, the Outline when an Act ends, then each fold due. */
  function play(count: number, perAct: number): State {
    let seq = 0;
    let state: State | null = null;
    const add = (payload: Payload) => {
      seq += 1;
      const entry: Entry = { seq, id: `e${seq}`, storyId: "s", parentId: seq > 1 ? `e${seq - 1}` : null, payload, createdAt: "" };
      state = apply(state, entry);
      return state;
    };
    add({ kind: "story_set_up", storyFile: hogwartsStoryFile(), portraits: {} });
    add(outlined(1));
    for (let number = 1; number <= count; number++) {
      add({ kind: "scene_opened", number, title: `Scene ${number}`, place: "The library", at: `Day ${2 + number * 3} 10:00`, who: ["Hermione Granger"], prose: null, startsAt: null, purpose: null, exit: null });
      add({ kind: "scene_closed", by: "player" });
      // The Chronicler's paragraph is about eighty words.
      add({ kind: "chronicle", truth: emptyUpdate(), scene: number, summary: "s", paragraph: `Scene ${number}: ${words(78, "said")}.`, moments: [], told: [], known: [], bonds: [], engagements: [], changed: [], dropped: [], callId: "c", model: SONNET });
      if (number % perAct === 0 && number < count) add(outlined(number / perAct + 1));
      for (let folds = 0; folds < 4; folds++) {
        const due = foldDue(state!);
        if (!due) break;
        // An Act's account in about fifteen hundred words; a week in about one hundred and twenty.
        add({ kind: "story_folded", into: due.into, count: due.parts.length, from: due.parts[0]!.from, until: due.parts.at(-1)!.until, text: words(due.into === "act" ? 1500 : 120, "then"), callId: "c", model: SONNET });
      }
    }
    return state!;
  }

  // GIVEN two hundred Scenes have been played, across four Acts
  // THEN The Story So Far tells each finished Act as one account, and every Scene of the current Act a paragraph each
  it("living-world › Every agent knows the Story So Far › Short after two hundred Scenes", () => {
    const state = play(200, 50);
    const { acts, weeks, scenes } = state.storySoFar;
    expect(state.outline?.current).toBe(4);
    // Each finished Act as one account, in order, with the Scenes it gathers.
    expect(acts.map(account => [account.act?.title, account.scenes])).toEqual([
      ["Year One", { first: 1, last: 50 }], ["Year Two", { first: 51, last: 100 }], ["Year Three", { first: 101, last: 150 }]
    ]);
    expect(acts.every(account => account.text.split(" ").length === 1500 && account.who.includes("Hermione Granger"))).toBe(true);
    // Every Scene of the current Act, a paragraph each, and no weeks.
    expect(weeks).toEqual([]);
    expect(scenes.map(part => part.scene?.number)).toEqual(Array.from({ length: 50 }, (_, index) => 151 + index));
    expect(scenes.every(part => part.act?.title === "Year Four")).toBe(true);
    // As agents read it: the accounts, then the Scenes, whole, within its limit.
    const read = storySoFarPart(state)!;
    expect(read).toContain("Acts:\nAct 1, Year One (Sunday 8 September 1991, 10:00 am to ");
    expect(read).toContain(", Scenes 1 to 50): then then");
    expect(read).toContain("Scene 151, Scene 151 (");
    expect(read).not.toContain("left out");
    expect(tokens(read)).toBeLessThanOrEqual(LIMITS.parts.storySoFar);
  });

  it("keeps a long Act's newest Scenes a paragraph each and folds its oldest weeks, so the Act stays within its limit", () => {
    const state = play(150, 1000);
    const { acts, weeks, scenes } = state.storySoFar;
    expect(acts).toEqual([]);
    expect(weeks.length).toBeGreaterThan(0);
    expect(scenes.at(-1)?.scene?.number).toBe(150);
    expect(tokens([...weeks, ...scenes].map(part => part.text).join("\n"))).toBeLessThanOrEqual(ACT_TOKENS);
  });

  // GIVEN Year One ends, and its account leaves out the night Hermione learned his secret
  // THEN the account is sent back and written again with it
  it("living-world › Every agent knows the Story So Far › An account that leaves out a turn", async () => {
    const story = yearOne();
    const due = foldDue(story.state());
    expect(due?.into).toBe("act");
    const without = `Year One. ${words(1000, "then")} Draconia Malfoy and Hermione Granger signed a contract over him, and Silas Penhallow came from Madam Bones's office.`;
    const withIt = `${without} ${LEARNED}`;
    const missing = "Scene 6: the night Hermione learned he can stop time.";
    const runner = new ScriptedRunner([
      { answer: JSON.stringify({ text: without }) },
      { answer: JSON.stringify({ missing: [missing], invented: [] }) },
      { answer: JSON.stringify({ text: withIt }) },
      { answer: JSON.stringify({ missing: [], invented: [] }) }
    ]);
    const folded = await writeFold(new Models(story.mac.db, { claude: runner }), [SONNET], story.state(), due!, story.storyId, "trace-f", new AbortController().signal);
    // Written, checked by the Editor against the Scenes it gathers, sent back, written again with it, and checked again.
    expect(runner.requests.map(request => request.agent)).toEqual(["folder", "editor", "folder", "editor"]);
    const [, check, again, checkedAgain] = runner.requests;
    expect(check!.prompt).toContain(`- Scene 6, Hermione Granger and Roopesh Gantasala: ${LEARNED}`);
    expect(check!.prompt).toContain(`<account>\n${without}\n</account>`);
    expect(check!.system).toContain("- Draconia Malfoy, a Lead, also Connie:");
    expect(again!.prompt).toContain(`<sent_back>\nYour account of the Act was sent back. Write it again, whole, keeping everything it had right (every turning point, every name, everyone who was there), with this set right:\n- ${missing}`);
    expect(checkedAgain!.prompt).toContain(`<account>\n${withIt}\n</account>`);
    expect(again!.prompt).toContain(`<previous_account>\n${without}\n</previous_account>`);
    expect(folded.value).toBe(withIt);

    // Once its account is in, Year One is one account, and Year Two starts with nothing told.
    story.fold({ into: "act", count: due!.parts.length, from: due!.parts[0]!.from, until: due!.parts.at(-1)!.until, text: folded.value });
    expect(story.state().storySoFar).toMatchObject({ acts: [{ text: withIt, act: { number: 1, title: "Year One" }, scenes: { first: 1, last: 7 } }], weeks: [], scenes: [] });
  });

  it("sends back an account that leaves out a name, whatever the Editor's model says, and keeps one that holds", async () => {
    const story = yearOne();
    const due = foldDue(story.state())!;
    expect(missingNames(story.state(), due, "Draconia and Hermione fought.")).toEqual(["Silas Penhallow is not named in it"]);
    expect(missingNames(story.state(), due, "Connie and Hermione fought, and the Auror Silas Penhallow watched.")).toEqual([]);
    const holds = "Draconia Malfoy and Hermione Granger fought over him all year, and Silas Penhallow watched.";
    const runner = new ScriptedRunner([
      { answer: JSON.stringify({ text: "Draconia and Hermione fought over him all year." }) },
      { answer: JSON.stringify({ missing: [], invented: [] }) },
      { answer: JSON.stringify({ text: holds }) },
      { answer: JSON.stringify({ missing: [], invented: [] }) }
    ]);
    const models = new Models(story.mac.db, { claude: runner });
    const folded = await writeFold(models, [SONNET], story.state(), due, story.storyId, "trace-f", new AbortController().signal);
    expect(runner.requests.map(request => request.agent)).toEqual(["folder", "editor", "folder", "editor"]);
    expect(runner.requests[2]!.prompt).toContain("- Silas Penhallow is not named in it");
    expect(folded.value).toBe(holds);
    // An account that holds is kept as written: one call, one check.
    const second = new ScriptedRunner([{ answer: JSON.stringify({ text: holds }) }, { answer: JSON.stringify({ missing: [], invented: [] }) }]);
    expect((await writeFold(new Models(story.mac.db, { claude: second }), [SONNET], story.state(), due, story.storyId, "trace-g", new AbortController().signal)).value).toBe(holds);
    expect(second.requests.map(request => request.agent)).toEqual(["folder", "editor"]);
  });

  it("checks every draft that comes back, sends back one that set a thing right and lost another, and keeps the best", async () => {
    const story = yearOne();
    const due = foldDue(story.state())!;
    const missing = "Scene 6: the night Hermione learned he can stop time.";
    const first = "Draconia Malfoy and Hermione Granger fought over him all year, and Silas Penhallow watched.";
    // The night set right, and Silas lost: the draft is checked again, and sent back for him.
    const lost = `Draconia Malfoy and Hermione Granger fought over him all year. ${LEARNED}`;
    const holds = `${first} ${LEARNED}`;
    const runner = new ScriptedRunner([
      { answer: JSON.stringify({ text: first }) },
      { answer: JSON.stringify({ missing: [missing], invented: [] }) },
      { answer: JSON.stringify({ text: lost }) },
      { answer: JSON.stringify({ missing: [], invented: [] }) },
      { answer: JSON.stringify({ text: holds }) },
      { answer: JSON.stringify({ missing: [], invented: [] }) }
    ]);
    const folded = await writeFold(new Models(story.mac.db, { claude: runner }), [SONNET], story.state(), due, story.storyId, "trace-f", new AbortController().signal);
    expect(runner.requests.map(request => request.agent)).toEqual(["folder", "editor", "folder", "editor", "folder", "editor"]);
    expect(runner.requests[4]!.prompt).toContain("- Silas Penhallow is not named in it");
    expect(folded.value).toBe(holds);

    // Sent back as often as it may be, and none holds: the draft with the fewest problems is kept.
    const never = new ScriptedRunner([
      { answer: JSON.stringify({ text: lost }) },
      { answer: JSON.stringify({ missing: [], invented: [] }) },
      { answer: JSON.stringify({ text: "Draconia and Hermione fought." }) },
      { answer: JSON.stringify({ missing: [missing], invented: [] }) },
      { answer: JSON.stringify({ text: "They fought." }) },
      { answer: JSON.stringify({ missing: [missing], invented: [] }) }
    ]);
    const best = await writeFold(new Models(story.mac.db, { claude: never }), [SONNET], story.state(), due, story.storyId, "trace-g", new AbortController().signal);
    expect(never.requests).toHaveLength(2 + 2 * SEND_BACKS);
    expect(best.value).toBe(lost);
  });

  it("writes and checks an Act's account on the fake models too, as `fantasia serve --fake-models` runs it", async () => {
    const story = yearOne();
    const fake = new FakeModels();
    const folded = await writeFold(new Models(story.mac.db, { claude: fake }), [SONNET], story.state(), foldDue(story.state())!, story.storyId, "trace-f", new AbortController().signal);
    expect(folded.value).toBe("A week in which things turned.");
    // Its fake account names no one, so it is sent back as often as it may be, each draft checked.
    expect(fake.requests.map(request => request.agent)).toEqual(["folder", "editor", ...Array.from({ length: SEND_BACKS }, () => ["folder", "editor"]).flat()]);
  });
});
