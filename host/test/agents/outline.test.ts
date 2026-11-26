import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { checkPlan, directorPrompt, writePlan } from "../../src/agents/director.js";
import { checkOutline, outlineDue, outlinePrompt, outlineSet, writeOutline, type OutlineAsk } from "../../src/agents/outline.js";
import { BUDGETS } from "../../src/agents/step.js";
import { say } from "../../src/context/lens.js";
import { FakeModels } from "../../src/models/fake.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { nothingBeside, type Beside } from "../../src/story/beside.js";
import { currentAct, type Outline } from "../../src/story/outline.js";
import { ledger, SONNET, type Ledger } from "./ledger.js";

/** A Story File from examples/, as the player imports it. */
const example = (name: string) => parse(readFileSync(new URL(`../../../examples/${name}/story.yaml`, import.meta.url), "utf8")) as StoryFile;

const START: OutlineAsk = { why: "start", reason: "The Story is starting: write its Outline, from now to its end." };
const signal = () => new AbortController().signal;
const at = (story: Ledger) => ({ storyId: story.storyId, head: story.head() });
const flat = (text: string) => text.replace(/\s+/g, " ");
/** What was left out of a plan about what it brings in and the Scenes it plans, apart from its Leads and Arcs. */
const outOfPlan = (dropped: string[]) => dropped.filter(line => line.startsWith("new:") || line.startsWith("scenes"));

const DRACONIA = "Draconia Malfoy";
const HERMIONE = "Hermione Granger";
const ROOPESH = "Roopesh Gantasala";

/** The Malfoy Problem's first Outline, as the Director answers it: Year One in detail, then the years to the end. */
function yearOne(changes: Record<string, unknown> = {}) {
  return {
    current: 1,
    acts: [
      {
        number: 1, title: "Year One", question: "Can a Malfoy who owes a Muggle-born her life make him hers and keep her name?", builds_to: "the philosopher's stone",
        turns: [
          { id: "T1", when: "the last fortnight of September", what: "Draconia claims him in front of Slytherin; Hermione sees it and says nothing.", serves: [DRACONIA, HERMIONE], done: false },
          { id: "T2", when: "early October", what: "Lucius writes: the debt is to be discharged quietly, and Selwyn encouraged.", serves: [DRACONIA, "Lucius Malfoy"], done: false },
          { id: "T3", when: "Halloween", what: "The troll, and Hermione in the bathroom with Roopesh there before Harry.", serves: [HERMIONE, "Harry Potter"], done: false },
          { id: "T4", when: "November", what: "Draconia takes the Seeker's place on the Slytherin team, and wants him at the match.", serves: [DRACONIA], done: false },
          { id: "T5", when: "the week before Christmas", what: "The man who asked about the train is found in Lucius's pay.", serves: ["Lucius Malfoy"], done: false },
          { id: "T6", when: "June", what: "The Stone: through the trapdoor, Quirrell, and Voldemort on the back of his head.", serves: ["Quirinus Quirrell", "Harry Potter"], done: false }
        ],
        relationships: [
          { people: [DRACONIA, ROOPESH], by_end: "By June she has claimed him in front of the whole school, and still calls it a debt." },
          { people: [HERMIONE, ROOPESH], by_end: "By June she has kissed him first, and dares Draconia to say anything." },
          { people: ["Harry Potter", ROOPESH], by_end: "Brothers in all but blood after the trapdoor." },
          { people: [DRACONIA, HERMIONE], by_end: "Open war, with hexes in corridors." }
        ],
        movers: [
          { who: "Lucius Malfoy", doing: "Hunting the masked wizards, and arranging Draconia's marriage." },
          { who: "Quirinus Quirrell", doing: "Going after the Stone for his master." },
          { who: "Albus Dumbledore", doing: "Watching Roopesh, and saying nothing." }
        ],
        hands_on: "The Stone is saved, and someone saw what Roopesh did under the trapdoor."
      },
      {
        number: 2, title: "Year Two", question: "Who is opening the Chamber, and what will her father's diary cost Ginny?", builds_to: "Into the Chamber",
        turns: [{ id: "Y2.1", when: "the summer", what: "Sirius Black escapes, and dementors come to Hogwarts.", serves: ["Harry Potter"], done: false }],
        relationships: [], movers: [], hands_on: "Ginny is brought back up, and Lucius is off the Board."
      },
      { number: 3, title: "Year Three", question: "Who put his name in the Goblet?", builds_to: "The Third Task", turns: [{ id: "Y3.1", when: "October", what: "The Goblet.", serves: [], done: false }], relationships: [], movers: [], hands_on: "Voldemort has a body." },
      { number: 4, title: "Year Four", question: "Who stands with him when the war begins?", builds_to: "Graduation", turns: [], relationships: [], movers: [], hands_on: "They leave Hogwarts with a war started." },
      { number: 5, title: "The Year After", question: "Can Voldemort be beaten, and who is beside Roopesh when he is?", builds_to: "The Battle of Hogwarts", turns: [], relationships: [], movers: [], hands_on: "" }
    ],
    ending: "Voldemort falls at the Battle of Hogwarts with Roopesh in the middle of it; whether the girls who want him share him is settled in play.",
    intentions: [
      { who: DRACONIA, pursues: "her father's plans for her, a match with an old house, fought every step; and the Seeker's place on the Slytherin team, against the boys who say a girl cannot have it", feelings: "Pansy goes from her shadow to someone she cannot trust near him; Hermione from beneath her notice to the enemy", heading: "she has chosen him over her father once, in public, and denies it" },
      { who: HERMIONE, pursues: "top of every class, and the third-floor door", feelings: "from hiding what she feels to fighting Draconia for him", heading: "she has kissed him first" },
      { who: "Harry Potter", pursues: "the truth about his parents, and the Stone", feelings: "Roopesh becomes his brother", heading: "through the trapdoor beside him" },
      { who: "Lucius Malfoy", pursues: "the men who tried to take his daughter, and a match that binds an old house to his", feelings: "contempt for the Muggle-born his daughter owes", heading: "the debt unpaid, and his patience gone" },
      { who: "Quirinus Quirrell", pursues: "the Stone, for his master", feelings: "fear of what is on the back of his head", heading: "the trapdoor" },
      { who: "Albus Dumbledore", pursues: "what Roopesh is", feelings: "a careful hope", heading: "he has seen enough to be afraid for him" }
    ],
    setups: [
      { id: "U1", what: "The masked wizards who tried to take Draconia on the train.", planted: 0, payoff: "They were hired by a house that wanted the Malfoy match for itself.", turn: "T5", state: "waiting" },
      { id: "U2", what: "A stranger in Hogsmeade asking about the train.", planted: null, payoff: "He is the go-between who hired the masked wizards, and he leads to Selwyn's father.", turn: "T5", state: "waiting" }
    ],
    promoted: [],
    ...changes
  };
}

/** A focused revision's answer: whether the Scene turned the Story, and otherwise only what it changed. */
function revision(changes: Record<string, unknown> = {}) {
  return { turned: null, turns: [], turns_done: [], relationships: [], movers: [], intentions: [], setups: [], promoted: [], ...changes };
}

/** A deep re-plan's answer: the Acts it rewrites, the ending when it changes, the current Act's intentions whole. */
function replan(changes: Record<string, unknown> = {}) {
  return yearOne(changes);
}

/** The Outline as the Story keeps it, set on the ledger as the Director's step writes it. */
function outlined(story: Ledger, answer: Record<string, unknown> = yearOne(), ask: OutlineAsk = START, beside: Beside = nothingBeside()): Outline {
  const checked = checkOutline(story.state(), beside, ask, answer);
  if (!checked.ok) throw new Error(checked.problems.join("; "));
  story.add(outlineSet({ value: checked.value, callId: "c", model: SONNET, dropped: checked.dropped ?? [] }, ask, false));
  return story.state().outline!;
}

/** Plays a Scene to its end on the ledger: opened, played, closed and recorded. */
function played(story: Ledger, title: string, at: string, who: string[] = []) {
  story.open(title, title, at, who);
  story.move("I stay.");
  story.note();
  story.reply("They stay too.");
  story.close();
  story.chronicle({ paragraph: `${title} was played.` });
}

describe("the-outline › Every Story has an Outline to its end", () => {
  // GIVEN The Malfoy Problem is imported
  // WHEN the player opens Backstage before the first Scene ends
  // THEN it shows Year One in detail, building to the Philosopher's Stone, with where Draconia and Hermione should
  //   stand by June; Year Two outlined; and the years after sketched to the end of the Story
  // (What Backstage draws is the view's; here, that the Director is asked for the Outline deeply as the Story starts,
  // given the whole run, its tools and the deep budget, and that what it writes is kept so before the first Scene ends.)
  it("the-outline › Every Story has an Outline to its end › The first Outline", async () => {
    const story = ledger(example("malfoy-problem"));
    const state = story.state();
    expect(state.scene?.closed).toBeNull();
    const due = outlineDue(state, nothingBeside());
    expect(due).toEqual({ depth: "deep", ask: START });

    const runner = new ScriptedRunner([{ answer: JSON.stringify(yearOne()) }]);
    const written = await writeOutline(new Models(story.mac.db, { claude: runner }), [SONNET], state, nothingBeside(), due!.ask, at(story), "trace-o", signal());
    const request = runner.requests[0]!;
    expect(request.tools).toEqual({ story: at(story), web: true });
    expect(request.turns).toBe(BUDGETS.directorDeep.turns);
    expect(request.prompt).toContain(`- The Philosopher's Stone, ${say(state, "Day 278 21:00")}: Quirrell goes through the trapdoor for the Stone, with Voldemort on the back of his head.`);
    expect(request.prompt).toContain(`- The Battle of Hogwarts, ${say(state, "Day 1706 21:00")}: Voldemort comes for Hogwarts, and it ends one way or the other.`);
    expect(request.prompt).toContain("<task>\nThe Story is starting: write its Outline, from now to its end.\n\nGive the first Act in detail, the next outlined, and the rest sketched to how the Story ends.");
    expect(request.prompt).toContain("Deep planning: think carefully");
    expect(written.dropped).toEqual([]);

    story.add(outlineSet(written, due!.ask, false));
    const kept = story.state();
    expect(kept.scene?.closed).toBeNull();
    const outline = kept.outline!;
    expect(outline).toMatchObject({ version: 1, current: 1, revisedAfter: 0, deep: true });
    expect(outline.acts.map(act => [act.title, act.detail, act.buildsTo])).toEqual([
      ["Year One", "detailed", "The Philosopher's Stone"],
      ["Year Two", "outlined", "Into the Chamber"],
      ["Year Three", "sketched", "The Third Task"],
      ["Year Four", "sketched", "Graduation"],
      ["The Year After", "sketched", "The Battle of Hogwarts"]
    ]);
    const year = currentAct(outline)!;
    expect(year.turns.map(turn => turn.when).at(-1)).toBe("June");
    expect(year.relationships.filter(item => item.people.includes(DRACONIA) || item.people.includes(HERMIONE)).map(item => item.byEnd)).toEqual([
      "By June she has claimed him in front of the whole school, and still calls it a debt.",
      "By June she has kissed him first, and dares Draconia to say anything.",
      "Open war, with hexes in corridors."
    ]);
    expect(outline.acts[1]!.turns.map(turn => turn.what)).toEqual(["Sirius Black escapes, and dementors come to Hogwarts."]);
    // A sketched Act is a line: what it asks and what it builds to.
    expect(outline.acts[2]).toMatchObject({ question: "Who put his name in the Goblet?", turns: [], relationships: [], movers: [] });
    expect(outline.ending).toBe("Voldemort falls at the Battle of Hogwarts with Roopesh in the middle of it; whether the girls who want him share him is settled in play.");
  });

  // GIVEN The Night Train to Kalka is imported
  // THEN its Outline is one Act, the night, with where it is heading by morning
  it("the-outline › Every Story has an Outline to its end › A small Story's Outline", async () => {
    const story = ledger(example("night-train"));
    const due = outlineDue(story.state(), nothingBeside());
    expect(due).toEqual({ depth: "deep", ask: START });
    const night = {
      current: 1,
      acts: [{
        number: 1, title: "The night", question: "Do two strangers sharing a bay want the night to end?", builds_to: "arrival at kalka",
        turns: [
          { id: "T1", when: "before Ambala", what: "The berth is settled, badly, and Uncle Bhalla takes sides.", serves: ["Meera Kulkarni", "Uncle Bhalla"], done: false },
          { id: "T2", when: "the small hours", what: "Neither can sleep; the vestibule, the rain, the first real question.", serves: ["Meera Kulkarni"], done: false },
          { id: "T3", when: "first light in the hills", what: "Kalka is an hour off, and one of them has to say something.", serves: ["Meera Kulkarni"], done: false }
        ],
        relationships: [{ people: ["Meera Kulkarni", "Ishaan Mehra"], by_end: "By morning at Kalka, neither wants to say goodbye on the platform." }],
        movers: [{ who: "Uncle Bhalla", doing: "Matchmaking from behind his newspaper." }],
        hands_on: ""
      }],
      ending: "The train reaches Kalka at dawn; whether they part on the platform is the player's.",
      intentions: [
        { who: "Meera Kulkarni", pursues: "a window seat and a month alone with the birds", feelings: "from bothered by the stranger in her berth to curious about him", heading: "she gives him her number, or nearly does" },
        { who: "Uncle Bhalla", pursues: "someone to hear how the trains used to be", feelings: "fond of both, and meddling", heading: "he takes the credit at Kalka" }
      ],
      setups: [{ id: "U1", what: "Meera's month counting birds in the hills above Kalka.", planted: 0, payoff: "Shimla is on the same line.", turn: "T3", state: "waiting" }],
      promoted: []
    };
    const runner = new ScriptedRunner([{ answer: JSON.stringify(night) }]);
    const written = await writeOutline(new Models(story.mac.db, { claude: runner }), [SONNET], story.state(), nothingBeside(), due!.ask, at(story), "trace-o", signal());
    expect(flat(runner.requests[0]!.system)).toContain("A small story needs only one Act.");
    expect(written.dropped).toEqual([]);
    story.add(outlineSet(written, due!.ask, false));
    const outline = story.state().outline!;
    expect(outline.acts.map(act => [act.title, act.detail, act.buildsTo])).toEqual([["The night", "detailed", "Arrival at Kalka"]]);
    expect(currentAct(outline)!.relationships).toEqual([{ people: ["Meera Kulkarni", "Ishaan Mehra"], byEnd: "By morning at Kalka, neither wants to say goodbye on the platform." }]);
    expect(outline.ending).toBe("The train reaches Kalka at dawn; whether they part on the platform is the player's.");
  });

  it("is sent back only without a current Act, or with a current Act that has no turns", () => {
    const state = ledger(example("malfoy-problem")).state();
    const [first, ...rest] = yearOne().acts;
    expect(checkOutline(state, nothingBeside(), START, yearOne({ acts: rest }))).toEqual({ ok: false, problems: ["current: Act 1 is not among the acts; give the current Act in detail, and every Act after it to the end"] });
    expect(checkOutline(state, nothingBeside(), START, yearOne({ acts: [{ ...first!, turns: [] }, ...rest] }))).toEqual({ ok: false, problems: ["acts: Act 1, Year One, is the current Act and needs its turns, roughly week by week, to its end"] });
  });
});

describe("the-outline › The Outline is woven from Lives", () => {
  // GIVEN The Malfoy Problem's Outline for Year One
  // THEN it says what Draconia pursues this year apart from Roopesh, such as her father's plans for her and the Seeker's
  //   place, and how she comes to feel about Pansy and Hermione
  // (What she pursues is the live check's; here, that the Director is told to give every Close person and Mover their
  // own intention, is shown each of them, and that what it writes for Draconia is kept, with anyone left out noted.)
  it("the-outline › The Outline is woven from Lives › Draconia's own year", () => {
    const story = ledger(example("malfoy-problem"));
    const state = story.state();
    const { system, prompt } = outlinePrompt(state, nothingBeside(), START);
    expect(flat(system)).toContain("one per Close person and Mover (`who`, `pursues`, `feelings`, `heading`).");
    // Each of them is shown: who they were when the Story began, who they are now, and that their Life is kept in full.
    expect(flat(system)).toContain(`- ${DRACONIA}, a Lead, also Connie: ${state.people[DRACONIA]!.whoTheyAre}`);
    expect(prompt).toContain(`\n${DRACONIA}\n  Now: as when the Story began.`);
    expect(prompt).toContain(`<lives_by_tier>\nClose, each with a full Life: ${DRACONIA} (a Lead), ${HERMIONE} (a Lead)`);

    const answer = yearOne();
    const without = { ...answer, intentions: [...answer.intentions.filter(item => item.who !== "Harry Potter"), { who: ROOPESH, pursues: "her", feelings: "everything", heading: "to her" }] };
    const checked = checkOutline(state, nothingBeside(), START, without);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const intentions = checked.value.outline.intentions;
    expect(intentions.find(item => item.who === DRACONIA)).toEqual({
      who: DRACONIA,
      pursues: "her father's plans for her, a match with an old house, fought every step; and the Seeker's place on the Slytherin team, against the boys who say a girl cannot have it",
      feelings: "Pansy goes from her shadow to someone she cannot trust near him; Hermione from beneath her notice to the enemy",
      heading: "she has chosen him over her father once, in public, and denies it"
    });
    // His story is where their Lives cross his: he has no intention of his own in the Outline.
    expect(intentions.map(item => item.who)).not.toContain(ROOPESH);
    expect(checked.dropped).toEqual(["intentions: none for Harry Potter; what they pursue this Act is not in the Outline"]);

    // Once written, the Movers it named have Lives the Director is shown, with their intentions.
    outlined(story);
    const after = outlinePrompt(story.state(), nothingBeside(), START).prompt;
    expect(after).toContain("Movers, who drive the World this Act, each with a full Life: Lucius Malfoy, Quirinus Quirrell, Albus Dumbledore.");
    expect(after).toContain("\nLucius Malfoy\n  Now: as when the Story began.");
    const [hers] = answer.intentions;
    expect(after).toContain(`- ${DRACONIA} pursues ${hers!.pursues}; feels ${hers!.feelings}; heading for ${hers!.heading}.`);
  });
});

describe("the-outline › Nothing enters without a payoff", () => {
  const charms = { id: "S1", date: "1991-09-09", time: "14:00", place: "The Charms classroom", who: [DRACONIA], serves: { turn: "T1", lives: [DRACONIA] }, for: "She claims him in front of Slytherin.", offer: "Flitwick is pairing people up.", headline: "Charms: paired with Draconia", lead: DRACONIA, engagement: null, quiet: false };
  const hogsmeade = { id: "S2", date: "1991-09-07", time: "15:00", place: "Hogsmeade high street", who: [], serves: { turn: "T5", lives: [] }, for: "A stranger asks him about the train.", offer: "Someone in Hogsmeade is asking about the train.", headline: "Hogsmeade: a stranger asks about the train", lead: null, engagement: null, quiet: false };
  const stretch = (changes: Record<string, unknown> = {}) => ({ days: 6, toward: "the first Hogsmeade weekend", landmark: null, phase: "build", scenes: [charms, hogsmeade], new: [], leads: [], arcs: [], roadmap: [], premise: "Draconia, and the train.", ...changes });
  const corvin = { name: "Corvin Ashby", who_they_are: "A go-between in a travelling cloak who asks everyone about the night the train stopped.", appearance: "Grey cloak, mud to the knee." };

  // GIVEN the Director brings a stranger into Hogsmeade asking about the train
  // THEN the Outline says what the stranger sets up and in which turn of the Act it pays off
  it("the-outline › Nothing enters without a payoff › A stranger with a purpose", async () => {
    const story = ledger(example("malfoy-problem"));
    outlined(story);
    story.close();
    story.chronicle();
    const bringsHim = stretch({ new: [
      { setup: "U2", kind: "person", scene: "S2", person: corvin },
      { setup: "a curse on the Slytherin common room", kind: "threat", scene: null, person: null }
    ] });
    const runner = new ScriptedRunner([{ answer: JSON.stringify(bringsHim) }]);
    const written = await writePlan(new Models(story.mac.db, { claude: runner }), [SONNET], story.state(), nothingBeside(), "There is no plan yet: this is the Story's first.", at(story), "trace-d", signal());
    // He comes in as the setup the Outline means to pay off; the threat it does not is left out.
    expect(written.value.newThings).toEqual([{ setup: "U2", kind: "person", what: "A stranger in Hogsmeade asking about the train.", scene: "s1.2", person: "Corvin Ashby" }]);
    expect(written.value.scenes[0]).toMatchObject({ id: "s1.2", place: "Hogsmeade high street", who: ["Corvin Ashby"], serves: { turn: "T5", lives: [] } });
    expect(outOfPlan(written.dropped)).toEqual(["new: \"a curse on the Slytherin common room\" is not a setup the Outline means to pay off; nothing enters without one"]);
    // The Outline says what he sets up, and the turn of the Act it pays off in.
    const outline = story.state().outline!;
    expect(outline.setups.find(setup => setup.id === "U2")).toMatchObject({ payoff: "He is the go-between who hired the masked wizards, and he leads to Selwyn's father.", turn: "T5", state: "waiting" });
    expect(currentAct(outline)!.turns.find(turn => turn.id === "T5")).toMatchObject({ when: "the week before Christmas", what: "The man who asked about the train is found in Lucius's pay." });
    expect(runner.requests[0]!.prompt).toContain("- [U2] A stranger in Hogsmeade asking about the train. Not planted yet. It pays off: He is the go-between who hired the masked wizards, and he leads to Selwyn's father. (waiting)");
    expect(flat(runner.requests[0]!.system)).toContain("only setups from the Outline entering this Stretch");

    // Once he is in, the setup is not brought in again.
    story.plan({ ...written.value, afterScene: 1 });
    const again = checkPlan(story.state(), stretch({ new: [{ setup: "U2", kind: "person", scene: "S2", person: { ...corvin, name: "Corvin Ashby the Second" } }] }));
    expect(again).toMatchObject({ ok: true, value: { newThings: [], people: [] } });
    expect(again.ok && outOfPlan(again.dropped ?? [])).toEqual(["new: U2 (A stranger in Hogsmeade asking about the train.) is already in the Story, or no longer waiting; it is not brought in again"]);
  });

  // GIVEN nine dementors went missing in Scene 12
  // WHEN later Stretches are planned
  // THEN the Outline keeps the missing dementors until they pay off or the Director drops them, and says which
  it("the-outline › Nothing enters without a payoff › A setup kept", () => {
    const story = ledger(example("malfoy-problem"));
    outlined(story);
    story.close();
    story.chronicle();
    for (let number = 2; number <= 12; number++) played(story, `Scene ${number}`, `Day ${6 + number} 10:00`);
    const dementors = { id: "U3", what: "Nine dementors missing from Azkaban's guard.", planted: 12, payoff: "They were taken to guard the Malfoy vaults, and come for Roopesh at Christmas.", turn: "T5", state: "waiting" };
    const focused: OutlineAsk = { why: "focused", reason: "Scene 12 has ended." };
    outlined(story, revision({ setups: [dementors] }), focused);
    played(story, "Scene 13", "Day 19 10:00");

    // A revision that leaves them out keeps them, waiting.
    const forgot = checkOutline(story.state(), nothingBeside(), focused, revision());
    expect(forgot.ok && forgot.value.outline.setups.find(setup => setup.id === "U3")).toEqual({ ...dementors, settled: null });
    expect(forgot.ok && forgot.dropped).toEqual([]);
    // Later Stretches are planned with them waiting.
    const planning = directorPrompt(story.state(), nothingBeside(), "The last Stretch has run its course.").prompt;
    expect(planning).toContain("Setups planted to pay off:\n- [U1] The masked wizards who tried to take Draconia on the train. Planted in Scene 0. It pays off: They were hired by a house that wanted the Malfoy match for itself. (waiting)");
    expect(planning).toContain(`- [U3] ${dementors.what} Planted in Scene 12. It pays off: ${dementors.payoff} (waiting)`);

    // Until the Director pays them off, or drops them, and the Outline says which.
    for (const state of ["paid", "dropped"] as const) {
      const settled = checkOutline(story.state(), nothingBeside(), focused, revision({ setups: [{ ...dementors, state }] }));
      if (!settled.ok) throw new Error(settled.problems.join("; "));
      const setup = settled.value.outline.setups.find(item => item.id === "U3")!;
      expect(setup).toMatchObject({ state, settled: 13 });
      story.add(outlineSet({ value: settled.value, callId: "c", model: SONNET, dropped: [] }, focused, false));
      expect(directorPrompt(story.state(), nothingBeside(), "The last Stretch has run its course.").prompt).toContain(`- [U3] ${dementors.what} Planted in Scene 12. It pays off: ${dementors.payoff} (${state})`);
    }
  });
});

describe("the-outline › Each Stretch is the next step of the current Act", () => {
  // WHEN the Director plans a Stretch
  // THEN every Scene that matters in it names the turn of the Act or the Life it serves, and none brings in a threat
  //   the Outline does not mean to pay off
  it("the-outline › Each Stretch is the next step of the current Act › No villain from nowhere", async () => {
    const story = ledger(example("malfoy-problem"));
    outlined(story);
    story.close();
    story.chronicle();
    const scene = (id: string, date: string, serves: { turn: string | null; lives: string[] }, headline: string) =>
      ({ id, date, time: "15:00", place: "The Great Hall", who: [], serves, for: headline, offer: headline, headline, lead: null, engagement: null, quiet: false });
    const answer = {
      days: 6, toward: "the first Hogsmeade weekend", landmark: null, phase: "build",
      scenes: [
        scene("S1", "1991-09-07", { turn: "T1", lives: [] }, "Breakfast: Draconia claims him"),
        scene("S2", "1991-09-08", { turn: null, lives: [HERMIONE] }, "The library: Hermione's notes"),
        scene("S3", "1991-09-09", { turn: null, lives: [] }, "A masked wizard in the corridor"),
        scene("S4", "1991-09-10", { turn: "T9", lives: [] }, "A curse on the stairs")
      ],
      new: [{ setup: "the Corridor Hexer", kind: "threat", scene: "S3", person: null }],
      leads: [], arcs: [], roadmap: [], premise: "Draconia's claim."
    };
    const runner = new ScriptedRunner([{ answer: JSON.stringify(answer) }]);
    const written = await writePlan(new Models(story.mac.db, { claude: runner }), [SONNET], story.state(), nothingBeside(), "There is no plan yet: this is the Story's first.", at(story), "trace-d", signal());
    expect(written.value.scenes.map(item => [item.headline, item.serves])).toEqual([
      ["Breakfast: Draconia claims him", { turn: "T1", lives: [] }],
      ["The library: Hermione's notes", { turn: null, lives: [HERMIONE] }]
    ]);
    expect(written.value.newThings).toEqual([]);
    expect(outOfPlan(written.dropped)).toEqual([
      "new: \"the Corridor Hexer\" is not a setup the Outline means to pay off; nothing enters without one",
      "scenes: S3 serves no turn of the current Act and no one's Life; it is not planned",
      "scenes: S4 serves \"T9\", which is not a turn of the current Act still ahead",
      "scenes: S4 serves no turn of the current Act and no one's Life; it is not planned"
    ]);
    // It is told the Act it is a step of, its turns by id, and the rule.
    const request = runner.requests[0]!;
    expect(request.prompt).toContain("<outline>\nWhere the Story is going, the Outline, as last revised when the Story started.\nAct 1, Year One, now. Its question: Can a Malfoy who owes a Muggle-born her life make him hers and keep her name? It builds to The Philosopher's Stone.\n- [T1] Ahead, the last fortnight of September: Draconia claims him in front of Slytherin; Hermione sees it and says nothing. It moves Draconia Malfoy and Hermione Granger.");
    expect(request.prompt).toContain("It is the next step of Act 1, Year One: every Scene that matters serves one of its turns or someone's Life, and nothing enters but a setup the Outline means to pay off.\n</task>");
    expect(flat(request.system)).toContain("every scene serves a turn, a Life, or both");
    // A plan in which no Scene serves anything is sent back.
    expect(checkPlan(story.state(), { ...answer, scenes: [answer.scenes[2]] })).toMatchObject({ ok: false });
  });
});

describe("the-outline › The Director plans by working the plan through", () => {
  /** The Malfoy Problem a few days past the Philosopher's Stone, with Year One's Outline, its last Scene just ended. */
  function yearOneOver() {
    const story = ledger(example("malfoy-problem"));
    outlined(story);
    story.close();
    story.chronicle();
    story.add({ kind: "clock_set", clock: "Day 281 10:00", dayOne: "1991-09-01" });
    played(story, "The end of term", "Day 281 10:00", [DRACONIA]);
    return story;
  }

  /** Year Two in detail, from the second book, bent to this Story: the Stone saved, Draconia owing more. */
  const yearTwo = (changes: Record<string, unknown> = {}) => {
    const [, second, ...rest] = yearOne().acts;
    return yearOne({
      current: 2,
      acts: [
        { ...second!, turns: [
          { id: "Y2.1", when: "the last week of August", what: "At Flourish and Blotts, Lucius slips Tom Riddle's diary into Ginny's cauldron; Draconia sees him do it and says nothing.", serves: ["Lucius Malfoy", DRACONIA], done: false },
          { id: "Y2.2", when: "September", what: "Lockhart arrives, and wants Roopesh for his duelling club.", serves: [], done: false },
          { id: "Y2.3", when: "Halloween", what: "The message in blood: the Chamber is opened.", serves: ["Harry Potter"], done: false },
          { id: "Y2.4", when: "May", what: "Ginny is taken into the Chamber; Draconia tells Roopesh what she saw in August.", serves: [DRACONIA], done: false }
        ], relationships: [{ people: [DRACONIA, ROOPESH], by_end: "She has betrayed her father for him, once." }], movers: [{ who: "Lucius Malfoy", doing: "Using the diary to break Arthur Weasley." }] },
        ...rest
      ],
      intentions: yearOne().intentions,
      ...changes
    });
  };

  // WHEN Year One ends and the Director plans Year Two in detail
  // THEN its plan draws on what the second book holds, bent to where this Story stands, and Backstage can show what it
  //   looked up
  // (Whether the plan draws on the book well is the live check's; here, that the Director is asked deeply when the
  // Act's Landmark has passed, told to research the source and bend it to the Story, given the web and the Story's
  // tools in the deep budget, and that its lookups are kept with the Outline it wrote, for Backstage.)
  it("the-outline › The Director plans by working the plan through › Year Two from the books", async () => {
    const story = yearOneOver();
    const state = story.state();
    const due = outlineDue(state, nothingBeside());
    expect(due).toEqual({ depth: "deep", ask: { why: "act-ended", reason: "Year One has ended with The Philosopher's Stone: plan Year Two in detail." } });

    const runner = new ScriptedRunner([{
      lookUp: [
        { tool: "web_search", args: { query: "Harry Potter and the Chamber of Secrets plot" } },
        { tool: "web_fetch", args: { url: "https://harrypotter.fandom.com/wiki/Tom_Riddle%27s_diary" } },
        { tool: "read_person", args: { name: DRACONIA } }
      ],
      then: { answer: JSON.stringify(yearTwo()) }
    }]);
    const written = await writeOutline(new Models(story.mac.db, { claude: runner }), [SONNET], state, nothingBeside(), due!.ask, at(story), "trace-o", signal());
    const request = runner.requests[0]!;
    expect(request.tools).toEqual({ story: at(story), web: true });
    expect(request.turns).toBe(BUDGETS.directorDeep.turns);
    expect(request.prompt).toContain("Make Year Two the current Act and plan it in detail; outline the one after it, and sketch the rest to the end.");
    expect(flat(request.prompt)).toContain("Deep planning: think carefully, use lookups only when needed");

    const lookups = ["searched the web for “Harry Potter and the Chamber of Secrets plot”", "read https://harrypotter.fandom.com/wiki/Tom_Riddle%27s_diary"];
    expect(written.lookups.slice(0, 2)).toEqual(lookups);
    expect(written.lookups[2]).toMatch(/^read Draconia Malfoy/);
    story.add(outlineSet(written, due!.ask, false));
    const outline = story.state().outline!;
    expect(outline).toMatchObject({ version: 2, current: 2, revisedAfter: 2, deep: true });
    expect(outline.lookedUp).toEqual(written.lookups);
    expect(outline.acts.map(act => [act.title, act.detail])).toEqual([["Year Two", "detailed"], ["Year Three", "outlined"], ["Year Four", "sketched"], ["The Year After", "sketched"]]);
    expect(currentAct(outline)!.turns[0]!.what).toBe("At Flourish and Blotts, Lucius slips Tom Riddle's diary into Ginny's cauldron; Draconia sees him do it and says nothing.");
    // The next pass after it is focused again, and keeps what the plan drew on.
    played(story, "The summer", "Day 300 10:00");
    expect(outlineDue(story.state(), nothingBeside())?.depth).toBe("focused");
  });

  it("makes the next Act the current one when the Director kept the one that ended", () => {
    const story = yearOneOver();
    const checked = checkOutline(story.state(), nothingBeside(), { why: "act-ended", reason: "Year One has ended." }, yearOne());
    expect(checked.ok && checked.value.outline.current).toBe(2);
    expect(checked.ok && checked.value.outline.acts.map(act => [act.title, act.detail])).toEqual([["Year Two", "detailed"], ["Year Three", "outlined"], ["Year Four", "sketched"], ["The Year After", "sketched"]]);
    const last = yearOne().acts[0]!;
    expect(checkOutline(story.state(), nothingBeside(), { why: "act-ended", reason: "Year One has ended." }, yearOne({ acts: [last] }))).toEqual({ ok: false, problems: ["acts: Year One has ended with The Philosopher's Stone; write Act 2 in detail, as the current Act"] });
  });
});

describe("when the Outline is reconsidered (openspec the-outline: The Outline is reconsidered after every Scene)", () => {
  function begun() {
    const story = ledger(example("malfoy-problem"));
    outlined(story);
    return story;
  }

  it("is not due between the exchanges of a Scene", () => {
    const story = begun();
    story.move("I count my Knuts again.");
    story.note();
    story.reply("Draconia waits.");
    expect(outlineDue(story.state(), nothingBeside())).toBeNull();
  });

  it("is due focused once at an ordinary Scene's end, and not again once revised after it", () => {
    const story = begun();
    story.close();
    expect(outlineDue(story.state(), nothingBeside())).toEqual({ depth: "focused", ask: { why: "focused", reason: "Scene 1, Freshers' Friday, has ended: reconsider the Outline in the light of how it went." } });
    story.chronicle();
    outlined(story, revision(), { why: "focused", reason: "Scene 1 has ended." });
    expect(outlineDue(story.state(), nothingBeside())).toBeNull();
    // The Director's step is done: the Outline ended it, with no Stretch to follow.
    expect(story.state().scene!.ended).toEqual(["chronicler", "director"]);
  });

  it("is due deep when the player wrote a steering note, which the Outline answers as an order", () => {
    const story = begun();
    story.close();
    story.chronicle();
    const beside: Beside = { ...nothingBeside(), notes: [{ id: "n1", text: "Year One ends with Draconia breaking from her father", writtenAt: "2026-10-15T10:00:00Z", answeredBy: null }, { id: "n0", text: "keep Hermione a rival this year", writtenAt: "2026-10-14T10:00:00Z", answeredBy: 1 }] };
    const due = outlineDue(story.state(), beside);
    expect(due).toEqual({ depth: "deep", ask: { why: "steered", reason: "The player steered the Story: “Year One ends with Draconia breaking from her father”. Re-plan Year One deeply so it follows the note, over your own reading of play." } });
    const { system, prompt } = outlinePrompt(story.state(), beside, due!.ask);
    // The new note is under the player's wishes, where things stand; the one answered before still holds.
    expect(prompt).toContain("<active_directions>");
    expect(prompt).toContain("Year One ends with Draconia breaking from her father");
    expect(prompt).toContain("keep Hermione a rival this year");
    expect(prompt).not.toContain("<steering_notes>");
    expect(flat(system)).toContain("Steering notes override your own reading of play.");
    expect(prompt).toContain("Follow every new steering note: Year One builds toward what the player asked from now on.");
    // The Outline it writes answers every note that waited: they stand from now on, and are not asked again.
    const answered = checkOutline(story.state(), beside, due!.ask, replan());
    expect(answered.ok && answered.value.answered).toEqual(["n1"]);
  });

  it("goes deep after a focused pass that says the Scene turned the Story, which then writes nothing else", () => {
    const story = begun();
    story.close();
    story.chronicle();
    const focused: OutlineAsk = { why: "focused", reason: "Scene 1 has ended." };
    const before = story.state().outline!;
    const turned = checkOutline(story.state(), nothingBeside(), focused, revision({ turned: "Roopesh killed Lucius Malfoy; Year One needs him in June.", turns_done: ["T1"], promoted: ["Luna Lovegood"] }));
    expect(turned.ok && turned.value.turned).toBe("Roopesh killed Lucius Malfoy; Year One needs him in June.");
    // What it listed with it is not applied: the deep pass that follows re-plans the Act.
    expect(turned.ok && turned.value.outline.acts).toEqual(before.acts);
    expect(turned.ok && turned.value.outline.promoted).toEqual([]);
    // A deep pass has no word to say of it: it is already deep, and its answer has no `turned`.
    const deep = checkOutline(story.state(), nothingBeside(), { why: "deep", reason: "The Scene turned the Story." }, replan());
    expect(deep.ok && deep.value).toMatchObject({ turned: null, outline: { deep: true } });
  });

  it("applies a focused revision as changes: what it lists, and nothing else moves", () => {
    const story = begun();
    story.close();
    story.chronicle();
    const before = story.state().outline!;
    const checked = checkOutline(story.state(), nothingBeside(), { why: "focused", reason: "Scene 1 has ended." }, revision({
      turns_done: ["T1"],
      turns: [
        { id: "T2", when: "the first week of October", what: "Lucius writes sooner than he meant to: the debt is to be discharged by Halloween.", serves: [DRACONIA, "Lucius Malfoy"], done: false },
        { id: "T2b", when: "early October", what: "Hermione asks him, in the library, what Draconia thinks he owes her.", serves: [HERMIONE], done: false }
      ],
      relationships: [{ people: [HERMIONE, ROOPESH], by_end: "By June she has stopped pretending it is about the library." }],
      intentions: [{ who: DRACONIA, pursues: "the debt paid on her terms before her father's deadline", feelings: "Hermione is the enemy now", heading: "she has lied to her father for him" }],
      setups: [{ id: "U3", what: "A letter Draconia burns unread.", planted: 1, payoff: "It was from her mother, warning her about Selwyn.", turn: "T5", state: "waiting" }]
    }));
    if (!checked.ok) throw new Error(checked.problems.join("; "));
    const outline = checked.value.outline;
    const act = outline.acts[0]!;
    expect(act.turns.map(turn => [turn.id, turn.state])).toEqual([["T1", "done"], ["T2", "ahead"], ["T3", "ahead"], ["T4", "ahead"], ["T5", "ahead"], ["T6", "ahead"], ["T2b", "ahead"]]);
    expect(act.turns[1]!.what).toBe("Lucius writes sooner than he meant to: the debt is to be discharged by Halloween.");
    expect(act.turns.slice(2, 6)).toEqual(before.acts[0]!.turns.slice(2, 6));
    expect(act.relationships.find(item => item.people.includes(HERMIONE) && item.people.includes(ROOPESH))!.byEnd).toBe("By June she has stopped pretending it is about the library.");
    expect(act.relationships.filter(item => !(item.people.includes(HERMIONE) && item.people.includes(ROOPESH)))).toEqual(before.acts[0]!.relationships.filter(item => !(item.people.includes(HERMIONE) && item.people.includes(ROOPESH))));
    expect(act.movers).toEqual(before.acts[0]!.movers);
    expect(outline.acts.slice(1)).toEqual(before.acts.slice(1));
    expect(outline.ending).toBe(before.ending);
    expect(outline.intentions.find(item => item.who === DRACONIA)!.heading).toBe("she has lied to her father for him");
    expect(outline.intentions.filter(item => item.who !== DRACONIA)).toEqual(before.intentions.filter(item => item.who !== DRACONIA));
    expect(outline.setups.map(setup => setup.id)).toEqual(["U1", "U2", "U3"]);
    expect(outline).toMatchObject({ current: 1, deep: false, revisedAfter: 1 });
    expect(checked.dropped).toEqual([]);
    // A turn it says happened that the Act does not have is noted, and nothing else is marked.
    const unknown = checkOutline(story.state(), nothingBeside(), { why: "focused", reason: "Scene 1 has ended." }, revision({ turns_done: ["T99"] }));
    expect(unknown.ok && unknown.dropped).toEqual(["turns_done: T99 is not a turn of Year One"]);
  });

  it("re-plans deeply only the Acts it writes: the rest, the ending and the setups it leaves out stay", () => {
    const story = begun();
    story.close();
    story.chronicle();
    const before = story.state().outline!;
    const [first] = replan().acts;
    const checked = checkOutline(story.state(), nothingBeside(), { why: "deep", reason: "Scene 1 turned the Story." }, replan({
      acts: [{ ...first!, question: "Can she keep him once her father knows?", turns: [{ id: "R1", when: "October", what: "Lucius hears of it.", serves: [DRACONIA], done: false }] }],
      ending: null, setups: []
    }));
    if (!checked.ok) throw new Error(checked.problems.join("; "));
    const outline = checked.value.outline;
    expect(outline.acts[0]).toMatchObject({ question: "Can she keep him once her father knows?", detail: "detailed" });
    expect(outline.acts[0]!.turns.map(turn => turn.id)).toEqual(["R1"]);
    expect(outline.acts.slice(1).map(act => act.title)).toEqual(before.acts.slice(1).map(act => act.title));
    expect(outline.acts[1]).toMatchObject({ detail: "outlined", turns: before.acts[1]!.turns });
    expect(outline.ending).toBe(before.ending);
    expect(outline.setups.map(setup => setup.id)).toEqual(["U1", "U2"]);
    expect(outline.deep).toBe(true);
  });

  it("keeps the turns and setups as written, sets right what it can, and notes what it left out", () => {
    const story = begun();
    story.close();
    story.chronicle();
    const answer = replan();
    const [first, ...rest] = answer.acts;
    const checked = checkOutline(story.state(), nothingBeside(), { why: "deep", reason: "Scene 1 turned the Story." }, {
      ...answer,
      acts: [{ ...first!, relationships: first!.relationships.filter(item => !item.people.includes("Harry Potter")), movers: [...first!.movers, { who: "Madam Pince", doing: "Shushing." }] }, ...rest],
      setups: [{ ...answer.setups[0]!, turn: "T99", planted: 40 }],
      promoted: ["Luna Lovegood"]
    });
    if (!checked.ok) throw new Error(checked.problems.join("; "));
    expect(checked.value.outline.setups.find(setup => setup.id === "U1")).toMatchObject({ turn: null, planted: 0 });
    expect(checked.value.outline.promoted).toEqual(["Luna Lovegood"]);
    expect(checked.value.outline.acts[0]!.turns.map(turn => turn.state)).toEqual(["ahead", "ahead", "ahead", "ahead", "ahead", "ahead"]);
    expect(checked.dropped).toEqual([
      "acts.movers: Madam Pince is not in the Story",
      "acts: Year One does not say where things should stand with Harry Potter by its end",
      "intentions: none for Luna Lovegood; what they pursue this Act is not in the Outline",
      "setups: U1 pays off in \"T99\", which is not a turn of the Outline; it pays off in a later Act",
      "setups: U1 cannot have been planted in Scene 40; there is no such Scene yet"
    ]);
    expect(checked.value.outline.setups.map(setup => setup.id)).toEqual(["U1", "U2"]);
  });

  it("runs focused in the Director's few steps, with the Story's tools and not the web", async () => {
    const story = begun();
    story.close();
    story.chronicle();
    const fake = new FakeModels();
    const ask: OutlineAsk = { why: "focused", reason: "Scene 1 has ended." };
    const written = await writeOutline(new Models(story.mac.db, { claude: fake }), [SONNET], story.state(), nothingBeside(), ask, at(story), "trace-o", signal());
    const request = fake.outline.requests[0]!;
    expect(request.tools).toEqual({ story: at(story), web: false });
    expect(request.turns).toBe(BUDGETS.directorFocused.turns);
    expect(request.prompt).toContain("This is a focused revision, in a few steps at most");
    expect(request.prompt).not.toContain("This is deep planning");
    expect(written.value.turned).toBeNull();
    // What the deep pass looked up stays with the Outline after a focused one.
    expect(written.value.outline.lookedUp).toEqual(story.state().outline!.lookedUp);
  });
});
