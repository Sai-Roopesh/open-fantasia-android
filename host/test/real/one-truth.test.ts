import { describe, expect, it } from "vitest";
import { emptyUpdate } from "../../src/story/truth.js";
import { directionDue, writePlan } from "../../src/agents/director.js";
import { writeFold } from "../../src/agents/folder.js";
import { addMinutes } from "../../src/agents/format.js";
import { Engine, type OutgoingEvent } from "../../src/engine/engine.js";
import { Catalog } from "../../src/models/catalog.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { fakeFoldAnswer, fakeWeaveAnswer, fakeWriterAnswer } from "../../src/models/fake.js";
import { DEFAULT_JOB_MODELS, jobModels, setJobModel } from "../../src/models/jobs.js";
import { Models, type ModelRunner } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { nothingBeside } from "../../src/story/beside.js";
import { isKind, type Choice, type DirectorPlan, type Payload } from "../../src/story/entries.js";
import { samePlace } from "../../src/story/places.js";
import type { NewThing, PlannedScene, State, Told } from "../../src/story/state.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { modelsView } from "../../src/views/models.js";
import { dayView } from "../../src/views/scene.js";
import { callsFor, freshHome } from "../support/host.js";
import { hogwartsWorldStoryFile, malfoyProblemStoryFile, writeStoryFile } from "../support/story-files.js";

// The one-truth rebuild on real models: a Scene's end run through as one pipeline (the Chronicler, the Director when a
// plan is due, the Weaver, the Folder when The Story So Far needs folding), and the Director's long run judged from what
// it plans. They call the player's Claude subscription on each job's default model, and a judge, and run only with
// `npm run test:real`: they spend quota and take minutes.
const token = readSecret(CLAUDE_TOKEN);
const RUNS = 3;
const WRITTEN = { provider: "claude", model: "written-by-the-test" } as const;
const LIBRARY = "The library's end table";

/** A Story on real Claude (or on [runner], when a test scripts some jobs), with a way to write entries as play would. */
function live(storyFile: StoryFile, runner?: (claude: ModelRunner) => ModelRunner) {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(storyFile), mac);
  if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported.problems)}`);
  const storyId = imported.storyId;
  const claude = new ClaudeRunner(mac.home, () => token);
  const models = new Models(mac.db, { claude: runner ? runner(claude) : claude });
  const engine = new Engine(mac, models);
  const events: OutgoingEvent[] = [];
  engine.subscribe(storyId, event => events.push(event));
  const head = () => mac.tree.currentPath(storyId)!.headEntryId;
  const state = () => mac.states.at(head());
  /** Writes [payload] after the head, as play would have. */
  const append = (payload: Payload) => {
    const path = mac.tree.currentPath(storyId)!;
    const entry = mac.tree.append(storyId, path.headEntryId, payload);
    mac.tree.moveHead(path.id, path.headEntryId, entry.id);
    return entry;
  };
  /** The entries a Scene's end wrote, after the latest close. */
  const sceneEnd = () => {
    const path = mac.tree.pathTo(head());
    return path.slice(path.findLastIndex(entry => entry.payload.kind === "scene_closed") + 1);
  };
  return { mac, claude, models, engine, events, storyId, head, state, append, sceneEnd, close: () => claude.close() };
}
type Live = ReturnType<typeof live>;

async function judge(question: string, passage: string): Promise<{ yes: boolean; said: string }> {
  const mac = freshHome();
  const runner = new ClaudeRunner(mac.home, () => token);
  const answer = await new Models(mac.db, { claude: runner }).call({
    agent: "judge",
    model: { provider: "claude", model: "claude-sonnet-5-5" },
    system: "You judge a passage from a story, or an author's plan for one. Answer YES or NO first, then quote the exact words that decided it.",
    prompt: `<passage>\n${passage}\n</passage>\n\n${question}`,
    traceId: "judge",
    storyId: null
  });
  runner.close();
  // A judge may answer in markdown ("**YES.**"); its verdict is the first word, whatever surrounds it.
  return { yes: /^\W*YES\b/i.test(answer.text), said: answer.text };
}

// ---------------------------------------------------------------- Scenes and Stretches written by the test

/** A Scene as the test writes it: where and when, who is there, what was said, how high it ran, and how it is told. */
interface Written {
  title: string;
  place: string;
  at: string;
  who: string[];
  exchanges: [string, string][];
  /** How high the Writer rated it, 1 to 5: 5 is a peak. */
  intensity: number;
  /** Its paragraph of The Story So Far. */
  paragraph: string;
  /** The Scene that matters it plays, by its place in the current plan (1 for the first). */
  plays?: number;
}

/** A plan as the test writes it, its Scenes and moves numbered by their place in it. */
interface HandPlan {
  from: number;
  until: number;
  toward: string;
  scenes: Pick<PlannedScene, "at" | "place" | "who" | "for" | "headline" | "lead">[];
  leads: { who: string; move: string; scene: number | null }[];
  newThings: Pick<NewThing, "kind" | "what">[];
}

/** Plays [scene] as written, without models: the Story File's opening while it is open, else a Scene its first Move opens. */
function playScene(story: Live, scene: Written): void {
  const before = story.state();
  const planned = scene.plays === undefined ? undefined : before.plan?.scenes[scene.plays - 1];
  const choice: Choice | undefined = planned ? { kind: "story", place: planned.place, at: planned.at, who: planned.who, scene: planned.id, engagement: null } : undefined;
  scene.exchanges.forEach(([move, reply], index) => {
    const moved = story.append({ kind: "move", text: move, ...(index === 0 && choice ? { choice } : {}) });
    if (index === 0 && before.scene?.closed) {
      story.append({ kind: "scene_opened", number: before.scene.number + 1, title: scene.title, place: scene.place, at: scene.at, who: scene.who, prose: null, startsAt: moved.id, purpose: null, exit: null });
    }
    const now = story.state();
    story.append({ kind: "beat_note", plan: null, here: now.scene!.here, goes: [], beats: [], note: "", call: "continue", intensity: scene.intensity, arcMoved: true, clock: addMinutes(now.clock, 10), inPlay: [], callId: "written-by-the-test", model: WRITTEN });
    story.append({ kind: "reply", text: reply, callId: "written-by-the-test", model: WRITTEN });
  });
}

/** Closes the Scene and records it by hand, as the Chronicler would: its line and its paragraph. */
function recordScene(story: Live, paragraph: string): void {
  story.append({ kind: "scene_closed", by: "player" });
  story.append({ kind: "chronicle", truth: emptyUpdate(), scene: story.state().scene!.number, summary: paragraph, paragraph, moments: [], told: [], known: [], bonds: [], engagements: [], changed: [], dropped: [], callId: "written-by-the-test", model: WRITTEN });
}

/** The Director's plan for a Stretch, as the test writes it. */
function handPlan(state: State, plan: HandPlan): DirectorPlan {
  const number = (state.plan?.number ?? 0) + 1;
  // A hand-written plan serves the Lives of the people in each Scene, its Lead's first.
  const scenes: PlannedScene[] = plan.scenes.map((scene, index) => ({ ...scene, id: `s${number}.${index + 1}`, serves: { turn: null, lives: scene.lead ? [scene.lead] : scene.who }, offer: scene.headline, engagement: null, quiet: false }));
  return {
    kind: "director_plan", from: plan.from, until: plan.until, toward: plan.toward, landmark: null, phase: "build", scenes,
    leads: plan.leads.map(lead => ({ who: lead.who, move: lead.move, scene: lead.scene === null ? null : scenes[lead.scene - 1]!.id })),
    arcs: state.arcs.map(arc => ({ arc, now: "she insults him less than she did", next: "a slip she covers at once", notYet: "any declaration" })),
    roadmap: [], premise: "Most Scenes turn something between Draconia and Roopesh; the rest are his life at Hogwarts.",
    newThings: plan.newThings.map((thing, index) => ({ ...thing, setup: `u${number}.${index + 1}`, scene: null, person: null })), people: [],
    reason: state.plan ? "The last Stretch has run its course." : "There is no plan yet: this is the Story's first.",
    afterScene: state.scene!.number, dropped: [], callId: "written-by-the-test", model: WRITTEN
  };
}

/** Ends the Scene as written: recorded, then [plan] when one follows it, then the World left where it was. */
function endScene(story: Live, paragraph: string, plan?: HandPlan): void {
  recordScene(story, paragraph);
  if (plan) story.append(handPlan(story.state(), plan));
  const state = story.state();
  story.append({ kind: "world_moved", truth: emptyUpdate(), scene: state.scene!.number, gap: false, from: state.scene!.endedAt ?? state.clock, until: state.clock, lives: [], threads: [], happened: [], meanwhile: [], on: [], dropped: [], callId: null, model: null });
}

const OPENING: Written = {
  title: "The insult", place: "The Three Broomsticks", at: "Day 1 21:40", who: ["Draconia Malfoy", "Hermione Granger", "Harry Potter", "Crabbe", "Goyle"], intensity: 3,
  exchanges: [["I hold her stare, say nothing, and finish my drink.", "Draconia waits for him to rise to it, and he doesn't. The Slytherin corner laughs anyway, but thinner. Two tables over, Hermione has stopped pretending to read. Harry Potter catches his eye and lifts his glass an inch."]],
  paragraph: "On the first night, at the Three Broomsticks, Draconia Malfoy called Roopesh \"Stray\" in front of the Slytherin corner and asked whether they had mirrors at the mission. He held her stare and said nothing, and the laugh went thin. Hermione Granger watched from two tables over; Harry Potter lifted his glass to him."
};

/** Scenes 2 to 6 of The Malfoy Problem, written by the test, each the plan's Scene that matters it names. */
const FIRST_WEEK: Written[] = [
  { title: "The end table", place: LIBRARY, at: "Day 2 10:00", who: ["Hermione Granger"], intensity: 2, plays: 1,
    exchanges: [["I sit down in the chair she saved and open the reading.", "Hermione slides her notes across before he has found the page. \"You've read it already,\" she says, not quite a question. \"Everyone else is still on the first chapter.\" When he says nothing, she writes his name in her margin, and a question mark."]],
    paragraph: "On Saturday morning Hermione saved Roopesh a chair at the library's end table and went through the reading with him. She noticed he had already read it, and wrote his name in her margin with a question mark." },
  { title: "Charms", place: "The Charms classroom", at: "Day 4 09:00", who: ["Draconia Malfoy"], intensity: 3, plays: 2,
    exchanges: [["When Flitwick pairs us, I move my books to her desk without a word.", "Draconia moves hers an inch away. \"Don't breathe on the feather, Stray.\" Hers rises first, and she watches to see whether his will. It does, higher. She writes something down and does not show him."]],
    paragraph: "In Charms on Monday Flitwick paired Roopesh with Draconia. She told him not to breathe on the feather; hers rose first, his rose higher, and she wrote something down that she did not show him." },
  { title: "Notes", place: LIBRARY, at: "Day 5 19:00", who: ["Hermione Granger"], intensity: 2, plays: 1,
    exchanges: [["I bring my Transfiguration notes and sit across from her.", "\"Yours are shorter,\" Hermione says, reading them upside down, \"and better. That's annoying.\" She corrects one word in pencil, then rubs it out. \"Same time Thursday?\""]],
    paragraph: "On Tuesday evening at the library's end table Hermione compared Transfiguration notes with Roopesh, found his shorter and better, and asked him to come back the same time on Thursday." },
  { title: "The trials", place: "The Quidditch pitch", at: "Day 6 16:00", who: ["Harry Potter"], intensity: 4, plays: 2,
    exchanges: [["I sit in the stands beside Harry and watch the trials.", "Harry talks him through every dive, until a Slytherin Beater sends a Bludger at the stands, at Roopesh. A foot from his head it swerves, as if it had changed its mind. Harry looks at him for a long moment and says nothing at all."]],
    paragraph: "At the Quidditch trials on Wednesday Harry talked Roopesh through every dive, until a Slytherin Beater sent a Bludger at the stands and it swerved a foot from Roopesh's head. Harry looked at him for a long moment and said nothing." },
  { title: "The Bludger", place: LIBRARY, at: "Day 7 19:00", who: ["Hermione Granger"], intensity: 3, plays: 1,
    exchanges: [["I sit down at the end table at seven, as she asked.", "\"The Bludger,\" Hermione says, before he has his bag open. \"Harry says it turned. Bludgers don't turn.\" She has a book open at Bludger charms with her finger on a line. \"Did you do that?\""]],
    paragraph: "On Thursday at the library's end table Hermione had a book open at Bludger charms before Roopesh sat down. Harry had told her the Bludger turned, and she asked him straight out whether he had done it." }
];

/** The three Stretches before Scene 7: each had Hermione at the library's end table, and none brought anyone new. */
const STRETCHES: HandPlan[] = [
  { from: 1, until: 5, toward: "Charms on Monday, where Flitwick pairs the first-years",
    scenes: [
      { at: "Day 2 10:00", place: LIBRARY, who: ["Hermione Granger"], for: "Hermione goes through the reading with him, and wants to know where he learned what he knows.", headline: "The library's end table: Hermione helps with the reading", lead: "Hermione Granger" },
      { at: "Day 4 09:00", place: "The Charms classroom", who: ["Draconia Malfoy"], for: "Flitwick pairs him with Draconia, and she has to be civil in front of the class.", headline: "Charms: Flitwick pairs him with Draconia", lead: "Draconia Malfoy" }
    ],
    leads: [{ who: "Draconia Malfoy", move: "She is made to work beside him.", scene: 2 }, { who: "Hermione Granger", move: "She saves him a chair.", scene: 1 }, { who: "Harry Potter", move: "He tells Roopesh the trials are open to anyone with a broom.", scene: null }],
    newThings: [{ kind: "secret", what: "Someone has been writing to the mission about him." }] },
  { from: 4, until: 8, toward: "the Quidditch trials on Wednesday",
    scenes: [
      { at: "Day 5 19:00", place: LIBRARY, who: ["Hermione Granger"], for: "Hermione compares Transfiguration notes, and finds his better than hers.", headline: "The library's end table: Hermione compares notes", lead: "Hermione Granger" },
      { at: "Day 6 16:00", place: "The Quidditch pitch", who: ["Harry Potter"], for: "Harry brings him to watch the trials, and sees something he cannot explain.", headline: "The pitch: Harry at the trials", lead: "Harry Potter" }
    ],
    leads: [{ who: "Draconia Malfoy", move: "She has Crabbe and Goyle find out where he goes in the evenings.", scene: null }, { who: "Hermione Granger", move: "She asks him back on Thursday.", scene: 1 }, { who: "Harry Potter", move: "He takes him to the trials.", scene: 2 }],
    newThings: [{ kind: "mystery", what: "A first-year's owl keeps coming back with its letter unopened." }] },
  { from: 6, until: 9, toward: "Friday's dinner, in front of all of Slytherin",
    scenes: [
      { at: "Day 7 19:00", place: LIBRARY, who: ["Hermione Granger"], for: "Hermione keeps the Thursday table, and has a question about the Bludger.", headline: "The library's end table: Hermione and the Bludger", lead: "Hermione Granger" },
      { at: "Day 8 19:00", place: "The Great Hall", who: ["Draconia Malfoy", "Crabbe", "Goyle"], for: "Dinner in front of her whole House: Draconia has to choose where she stands.", headline: "The Great Hall: Draconia in front of her House", lead: "Draconia Malfoy" }
    ],
    leads: [{ who: "Draconia Malfoy", move: "She has to choose, in front of her House.", scene: 2 }, { who: "Hermione Granger", move: "She asks about the Bludger.", scene: 1 }, { who: "Harry Potter", move: "He tells Hermione what he saw at the trials.", scene: null }],
    newThings: [{ kind: "threat", what: "The Beater who sent the Bludger is asking who Roopesh is." }] }
];

/** Scene 7, Draconia at dinner in front of her House: the peak, or an ordinary evening. */
const SEVENTH: Record<"peak" | "calm", Written> = {
  peak: { title: "In front of her House", place: "The Great Hall", at: "Day 8 19:00", who: ["Draconia Malfoy", "Crabbe", "Goyle"], intensity: 5, plays: 2,
    exchanges: [["I walk past the Slytherin table on my way out, the way I always do.", "Someone at the Slytherin table says the word, loud enough for the whole Hall. Draconia stands. She crosses in front of every one of her House, takes his arm, and says, clearly, \"He's with me.\" Nobody at the Slytherin table speaks. She does not let go of his arm until they are through the doors."]],
    paragraph: "At dinner on Friday, when someone at the Slytherin table called Roopesh the word, Draconia stood, crossed in front of her whole House, took his arm and said \"He's with me.\" Nobody spoke, and she held on until they were through the doors." },
  calm: { title: "Dinner", place: "The Great Hall", at: "Day 8 19:00", who: ["Draconia Malfoy", "Crabbe", "Goyle"], intensity: 2, plays: 2,
    exchanges: [["I walk past the Slytherin table on my way out.", "Draconia does not look up from her plate. Crabbe says something to Goyle, and Goyle laughs late. By the time he reaches the doors she is talking to someone else, as if he had never been in the Hall."]],
    paragraph: "At dinner on Friday Roopesh walked past the Slytherin table. Draconia did not look up, Crabbe and Goyle laughed late at something, and she acted as if he had never been in the Hall." }
};

/**
 * The Malfoy Problem's first week as the test writes it, Scenes 1 to 6 ended and their three Stretches planned, with
 * Scene 7 played as [seventh] and still open.
 */
function firstWeek(seventh: "peak" | "calm", runner?: (claude: ModelRunner) => ModelRunner): Live {
  const story = live(malfoyProblemStoryFile(), runner);
  playScene(story, OPENING);
  endScene(story, OPENING.paragraph, STRETCHES[0]);
  FIRST_WEEK.forEach((scene, index) => {
    playScene(story, scene);
    endScene(story, scene.paragraph, index === 1 ? STRETCHES[1] : index === 3 ? STRETCHES[2] : undefined);
  });
  playScene(story, SEVENTH[seventh]);
  return story;
}

/** Ends the open Scene through the engine, on real models, and waits for every step of its end. */
async function endOnRealModels(story: Live, traceId: string): Promise<void> {
  story.engine.endScene(story.storyId, story.head(), traceId);
  await story.engine.ended(story.storyId);
  const failed = story.engine.sceneEndOf(story.storyId).failed;
  if (failed) throw new Error(`The Scene's end stopped at the ${failed.step}: ${failed.reason}`);
}

/** A quiet Scene, in the spec's words (openspec long-run: Rest is deliberate). */
const QUIET = "In a story, a quiet Scene is one where nothing is at stake, though the people in it still want what they want. A Scene is not quiet when it holds a confrontation, a contest, a secret coming out, or a change that cannot be undone. Is this Scene quiet? Answer YES or NO.";

const tellPlan = (scenes: PlannedScene[]) => scenes.map(scene => `- ${scene.at}, ${scene.place}, with ${scene.who.join(", ") || "nobody else"}${scene.quiet ? " (quiet)" : ""}: ${scene.headline}. ${scene.for}`).join("\n");

describe.skipIf(!token)("one truth, live", () => {
  // WHEN the player ends a Scene
  // THEN a single line says each step in turn, until the Day View is ready with its choices
  it("presence › Between Scenes is quiet, and shows progress › The World moves on", async () => {
    const file = hogwartsWorldStoryFile({ at: "Day 3 21:40" });
    const story = live(file);
    const exchanges: [string, string][] = [
      ["I sit at the other end of the sofa and ask Hermione what she's reading.", "\"Hogwarts: A History,\" she says, without looking up. \"Again.\" The fire pops. She turns a page she has not read, then closes the book on her finger. \"Draconia Malfoy asked Lavender about you today. Where you're from. I thought you'd want to know.\""],
      ["I say goodnight and go up to bed.", "\"Goodnight, Roopesh,\" she says, and does not look up until you are on the stairs."]
    ];
    try {
      playScene(story, { title: "After curfew", place: "The Gryffindor common room", at: "Day 3 21:40", who: ["Hermione Granger"], exchanges, intensity: 2, paragraph: "" });
      await endOnRealModels(story, "real-end");

      // Each step in turn, each starting when the one before it has finished, and then done.
      const steps = story.events.flatMap(item => (item.event.kind === "scene_end_step" ? [item.event.step ?? null] : []));
      expect(steps).toEqual(["chronicler", "director", "weaver", null]);
      expect(story.sceneEnd().map(entry => entry.payload.kind)).toEqual(["chronicle", "director_plan", "world_moved"]);

      // The Day View is ready, with the Story's pick first.
      const state = story.state();
      const view = dayView(state, story.engine.sceneEndOf(story.storyId));
      expect(view.scene_end).toEqual({ step: null, failed: null });
      expect(view.happenings.length, JSON.stringify(view.happenings)).toBeGreaterThan(0);
      expect(view.happenings[0]!.pick, JSON.stringify(view.happenings)).toBe(true);

      // The Story So Far tells the Scene, and the Director and the Weaver were given it before they worked.
      const told = state.storySoFar.scenes.at(-1);
      expect(told?.scene?.number).toBe(1);
      expect(told!.text.trim()).not.toBe("");
      for (const agent of ["director", "weaver"]) {
        const prompts = (story.mac.db.prepare("SELECT request FROM calls WHERE agent = ?").all(agent) as { request: string }[]).map(row => (JSON.parse(row.request) as { prompt: string }).prompt);
        expect(prompts.some(prompt => prompt.includes(told!.text)), `${agent} was not given The Story So Far`).toBe(true);
      }
      // It says only what was on the page.
      const page = [file.opening.prose ?? "", ...exchanges.map(([move, reply]) => `Roopesh: ${move}\n${reply}`)].join("\n\n");
      const invents = await judge(`The Scene was played exactly as follows:\n\n${page}\n\nThe passage tells that Scene for a summary of the story so far. Does it say anything happened that the Scene did not show, or say what Roopesh thought or felt? Answer YES or NO.`, told!.text);
      expect(invents.yes, `${invents.said}\n---\n${told!.text}`).toBe(false);
    } finally {
      story.close();
    }
  }, 1_200_000);

  // GIVEN the last three Stretches each had Hermione at the library's end table
  // WHEN the Director plans the next Stretch
  // THEN no Scene that matters in it puts Hermione at the library's end table
  it("long-run › The Director shapes the long run around Arcs and Landmarks › Not the same week twice", async () => {
    for (let run = 0; run < RUNS; run++) {
      const story = firstWeek("calm");
      try {
        recordScene(story, SEVENTH.calm.paragraph);
        const state = story.state();
        const lastThree = [...state.recentPlans, state.plan!.scenes];
        expect(lastThree.length).toBe(3);
        for (const scenes of lastThree) expect(scenes.some(scene => scene.place === LIBRARY && scene.who.includes("Hermione Granger"))).toBe(true);
        const due = directionDue(state);
        expect(due).not.toBeNull();
        const { value, dropped } = await writePlan(story.models, [DEFAULT_JOB_MODELS.director], state, nothingBeside(), due!, { storyId: story.storyId, head: story.head() }, `real-week-${run}`, new AbortController().signal);
        const again = value.scenes.filter(scene => scene.who.includes("Hermione Granger") && samePlace(scene.place, LIBRARY));
        expect(again, `run ${run + 1}: ${JSON.stringify({ scenes: value.scenes, dropped })}`).toEqual([]);
      } finally {
        story.close();
      }
    }
  }, 1_800_000);

  // GIVEN the Scene where Draconia chose the Player Character in front of her House just ended
  // THEN the Story's own pick at the Day View is a quiet Happening
  it("long-run › Rest is deliberate › A quiet pick after a peak", async () => {
    for (let run = 0; run < RUNS; run++) {
      const story = firstWeek("peak");
      try {
        await endOnRealModels(story, `real-peak-${run}`);
        const state = story.state();
        const happenings = dayView(state, story.engine.sceneEndOf(story.storyId)).happenings;
        const pick = happenings.find(item => item.pick);
        expect(pick, `run ${run + 1}: ${JSON.stringify(happenings)}`).toBeDefined();
        const planned = state.plan!.scenes.find(scene => scene.id === pick!.scene);
        const said = `run ${run + 1}: ${JSON.stringify({ pick, planned, plan: state.plan!.scenes })}`;
        expect(planned?.quiet, said).toBe(true);
        const verdict = await judge(QUIET, `${pick!.what} (${pick!.place}, ${pick!.time})\nWhat it is for: ${planned!.for}`);
        expect(verdict.yes, `${said}\n${verdict.said}`).toBe(true);
      } finally {
        story.close();
      }
    }
  }, 3_600_000);

  // GIVEN Scene 7 peaked
  // WHEN the Director plans the Stretch after it
  // THEN its first Scene that matters is quiet, and its others build again
  it("long-run › Rest is deliberate › A breath, not a week", async () => {
    for (let run = 0; run < RUNS; run++) {
      const story = firstWeek("peak");
      try {
        recordScene(story, SEVENTH.peak.paragraph);
        const state = story.state();
        expect(state.curve.at(-1)).toMatchObject({ scene: 7, peak: 5 });
        const due = directionDue(state);
        expect(due).toMatch(/Scene 7.*peaked/);
        const { value } = await writePlan(story.models, [DEFAULT_JOB_MODELS.director], state, nothingBeside(), due!, { storyId: story.storyId, head: story.head() }, `real-breath-${run}`, new AbortController().signal);
        const said = `run ${run + 1} (${value.phase}):\n${tellPlan(value.scenes)}`;
        expect(value.scenes.length, said).toBeGreaterThanOrEqual(2);
        const [first, ...others] = value.scenes;
        expect(first!.quiet, said).toBe(true);
        expect(others.some(scene => !scene.quiet), said).toBe(true);
        const verdict = await judge(QUIET, `${first!.headline}. What it is for: ${first!.for}`);
        expect(verdict.yes, `${said}\n${verdict.said}`).toBe(true);
      } finally {
        story.close();
      }
    }
  }, 1_800_000);

  // GIVEN the Story has three Leads
  // WHEN four Stretches are planned
  // THEN in at least one of them a Lead's move is made off-screen, and a Scene that matters is about none of the
  //   Leads
  it("long-run › Leads act every Stretch › Not one Scene per Lead", async () => {
    // The real Director plans; the rest is scripted, so the quota goes on the plans. The Story So Far tells each Scene
    // as what the plan made it for, and the player takes the Story's pick each time.
    let story: Live | null = null;
    const head = () => story!.mac.states.at(story!.head());
    const scripted: Record<string, ModelRunner> = {
      writer: new ScriptedRunner([], fakeWriterAnswer),
      actor: new ScriptedRunner([], () => ({ answer: "The room goes on around him; nobody says what they mean." })),
      chronicler: new ScriptedRunner([], () => {
        const state = head();
        const played = [...state.recentPlans.flat(), ...(state.plan?.scenes ?? [])].find(scene => scene.id === state.played.at(-1) && state.scene?.place === scene.place);
        const said = played ? `${played.headline}. ${played.for}` : `${state.scene?.title ?? "A Scene"}: an ordinary day passed.`;
        return { answer: JSON.stringify({ summary: said, paragraph: said, moments: [], told: [], known: [], bonds: [], engagements: [], changed: [] }) };
      }),
      weaver: new ScriptedRunner([], fakeWeaveAnswer),
      folder: new ScriptedRunner([], fakeFoldAnswer)
    };
    story = live(malfoyProblemStoryFile(), claude => ({ run: (request, onText, signal) => (scripted[request.agent] ?? claude).run(request, onText, signal) }));
    const { engine, storyId } = story;
    const plans = () => head().plan?.number ?? 0;
    try {
      engine.move(storyId, "I hold her stare and say nothing.", story.head(), "leads-0");
      await engine.settled(storyId);
      for (let scene = 1; plans() < 4; scene++) {
        if (scene > 24) throw new Error(`Only ${plans()} Stretches were planned in ${scene - 1} Scenes`);
        await endOnRealModels(story, `leads-end-${scene}`);
        if (plans() >= 4) break;
        const view = dayView(head(), engine.sceneEndOf(storyId));
        if (view.happenings.some(item => item.pick)) engine.choose(storyId, { after: story.head(), kind: "story", gap: null }, `leads-pick-${scene}`);
        else engine.choose(storyId, { after: story.head(), kind: "skip", at: view.choices.skips[0]!.at, gap: null }, `leads-skip-${scene}`);
        await engine.settled(storyId);
      }
    } finally {
      story.close();
    }
    const leads = head().leads;
    expect(leads.length).toBe(3);
    const stretches = story.mac.tree.pathTo(story.head()).flatMap(entry => (isKind(entry, "director_plan") ? [entry.payload] : []));
    const said = stretches.map((plan, index) => `Stretch ${index + 1}:\n${tellPlan(plan.scenes)}\n${plan.leads.map(lead => `  ${lead.who}: ${lead.move} (${lead.scene ?? "off-screen"})`).join("\n")}`).join("\n");
    expect(stretches.length, said).toBe(4);
    // A move the Director gave (not one the check filled in for a Lead it left out) made off-screen.
    expect(stretches.some(plan => plan.leads.some(lead => leads.includes(lead.who) && lead.scene === null && !plan.dropped.includes(`leads: no move for ${lead.who}`))), said).toBe(true);
    expect(stretches.some(plan => plan.scenes.some(scene => scene.lead === null)), said).toBe(true);
  }, 3_600_000);

  // GIVEN the player has never set the Folder's model
  // THEN the Models screen shows the Folder on Haiku 4.5, and the player can move it like any job
  it("outside-the-scene › One Models screen › The Folder on Haiku", async () => {
    const story = live(malfoyProblemStoryFile());
    try {
      const catalog = new Catalog(story.mac.home, { claude: () => story.claude.listModels(), codex: async () => [], antigravity: async () => [] });
      await catalog.refresh();
      const folder = () => modelsView(story.mac, catalog, "real-models").jobs.find(job => job.job === "folder")!;
      expect(folder().model.choice).toMatchObject({ provider: "claude", model: "claude-haiku-4-5-20251001" });
      expect(folder().model.label).toBe("Haiku 4.5");
      expect(catalog.refusal(jobModels(story.mac.home).folder), "the Folder's default is not a model Claude offers").toBeNull();

      // The Folder on it folds the first week's Scenes of The Story So Far into a recap of that week, inventing
      // nothing, once all of them are older than the newest six.
      const scenes: Told[] = [OPENING, ...FIRST_WEEK, SEVENTH.peak].map((scene, index) => ({ from: scene.at, until: scene.at, text: scene.paragraph, scene: { number: index + 1, title: scene.title }, who: scene.who }));
      const later: Told[] = [
        { from: "Day 9 10:00", until: "Day 9 11:00", text: "On Saturday morning Draconia walked past him in the Entrance Hall and said nothing at all, which everyone noticed.", scene: { number: 8, title: "The Entrance Hall" }, who: ["Draconia Malfoy"] },
        { from: "Day 9 15:00", until: "Day 9 16:00", text: "Harry asked Roopesh, at the lake, whether the Bludger and the dinner were the same kind of thing. Roopesh did not answer.", scene: { number: 9, title: "The lake" }, who: ["Harry Potter"] },
        { from: "Day 10 19:00", until: "Day 10 20:00", text: "On Sunday evening Hermione kept the end table and did not mention Draconia once, until she did.", scene: { number: 10, title: "Sunday" }, who: ["Hermione Granger"] },
        { from: "Day 11 09:00", until: "Day 11 10:00", text: "In Charms on Monday Draconia sat beside Roopesh without being told to, and Flitwick pretended not to notice.", scene: { number: 11, title: "Charms again" }, who: ["Draconia Malfoy"] },
        { from: "Day 12 13:00", until: "Day 12 14:00", text: "On Tuesday the Beater who sent the Bludger stopped Roopesh in a corridor and asked where he was from. Crabbe and Goyle watched from the stairs.", scene: { number: 12, title: "The corridor" }, who: ["Crabbe", "Goyle"] }
      ];
      const state: State = { ...story.state(), storySoFar: { acts: [], weeks: [], scenes: [...scenes, ...later] } };
      // Twelve short Scenes no longer fold on their own: the week is asked for directly.
      const due = { into: "week" as const, parts: scenes.slice(0, 6) };
      const fold = await writeFold(story.models, [jobModels(story.mac.home).folder], state, due!, story.storyId, "real-fold", new AbortController().signal);
      expect(callsFor(story.mac.db, "folder").at(-1)).toMatchObject({ provider: "claude", model: "claude-haiku-4-5-20251001" });
      const parts = due!.parts.map(part => part.text).join("\n\n");
      const words = (text: string) => text.trim().split(/\s+/).length;
      expect(fold.value.trim(), parts).not.toBe("");
      expect(words(fold.value), `${fold.value}\n---\n${parts}`).toBeLessThan(words(parts));
      const invents = await judge(`These are the Scenes it gathers:\n\n${parts}\n\nThe passage is a recap of them. Does it say anything the Scenes do not say? Answer YES or NO.`, fold.value);
      expect(invents.yes, `${invents.said}\n---\n${fold.value}`).toBe(false);

      // The player moves it like any job.
      setJobModel(story.mac.home, "folder", { provider: "claude", model: "claude-sonnet-5-5" });
      expect(folder().model.choice).toMatchObject({ provider: "claude", model: "claude-sonnet-5-5" });
    } finally {
      story.close();
    }
  }, 600_000);
});
