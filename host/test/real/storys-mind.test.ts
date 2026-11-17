import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { foldDue, missingNames, writeFold } from "../../src/agents/folder.js";
import { Engine, type OutgoingEvent } from "../../src/engine/engine.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { jobModels } from "../../src/models/jobs.js";
import { Models, type ModelRequest, type ModelRunner } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { besideOf, writeNote } from "../../src/store/beside.js";
import type { Moment, Payload } from "../../src/story/entries.js";
import { currentAct, type Outline } from "../../src/story/outline.js";
import type { State, Told } from "../../src/story/state.js";
import { betweenKey, emptyUpdate, type TruthUpdate } from "../../src/story/truth.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { freshHome } from "../support/host.js";
import { malfoyProblemStoryFile, writeStoryFile } from "../support/story-files.js";

// The Story's mind on real models (openspec the-storys-mind): the Outline written when a Story starts and reconsidered
// after every Scene, focused by default and deep when the player steers; a Reply whose Writer looks up the past and
// whose slip the Editor catches before the player reads it; and an Act's account the Editor sends back for the turn it
// left out. They call the player's Claude subscription on each job's default model, and a judge, and run only with
// `npm run test:real`: they spend quota and take a long while, the Director most of all.
const token = readSecret(CLAUDE_TOKEN);
const WRITTEN = { provider: "claude", model: "written-by-the-test" } as const;
const MALFOY_PROBLEM = resolve(import.meta.dirname, "../../../examples/malfoy-problem");

/**
 * A Story on real Claude, from a Story File folder; [scripted] answers a call in place of Claude when it returns a
 * runner for it. Every call keeps the tools it was given, so the agents can look things up.
 */
function live(folder: string, scripted: (request: ModelRequest) => ModelRunner | null = () => null) {
  const mac = freshHome();
  const imported = importStoryFile(folder, mac);
  if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported.problems)}`);
  const storyId = imported.storyId;
  const claude = new ClaudeRunner(mac.home, () => token);
  const runner: ModelRunner = { canLookUp: claude.canLookUp, run: (request, onText, signal, tools) => (scripted(request) ?? claude).run(request, onText, signal, tools) };
  const models = new Models(mac.db, { claude: runner });
  const engine = new Engine(mac, models);
  const events: OutgoingEvent[] = [];
  engine.subscribe(storyId, event => events.push(event));
  const head = () => mac.tree.currentPath(storyId)!.headEntryId;
  const state = () => mac.states.at(head());
  const path = () => mac.tree.pathTo(head()).map(entry => entry.payload);
  /** Writes [payload] after the head, as play would have; returns its id. */
  const append = (payload: Payload) => {
    const current = mac.tree.currentPath(storyId)!;
    const entry = mac.tree.append(storyId, current.headEntryId, payload);
    mac.tree.moveHead(current.id, current.headEntryId, entry.id);
    return entry.id;
  };
  /** Plays [move] through the real turn and returns its Reply; throws with the reason when there is none. */
  const play = async (move: string, traceId: string) => {
    engine.move(storyId, move, head(), traceId);
    await engine.settled(storyId);
    const last = path().at(-1);
    const reply = last?.kind === "reply" ? last : path().findLast(payload => payload.kind === "reply");
    const turn = engine.turnState(storyId);
    if (turn.kind === "failed" || !reply) throw new Error(`No Reply to "${move}": ${JSON.stringify(turn)}`);
    return reply;
  };
  /** Ends the Scene on real models and waits for its end; throws with the step it stopped at. */
  const endScene = async (traceId: string) => {
    engine.endScene(storyId, head(), traceId);
    await engine.ended(storyId);
    const failed = engine.sceneEndOf(storyId).failed;
    if (failed) throw new Error(`The Scene's end stopped at the ${failed.step}: ${failed.reason}`);
  };
  /** The lines the phone was told while [traceId]'s Reply was under way, in order. */
  const steps = (traceId: string) => events.flatMap(({ event }) => (event.kind === "turn_step" && event.trace_id === traceId ? [event.turn_step] : []));
  /** The calls [agent] made for [traceId], with what they looked up. */
  const calls = (agent: string, traceId?: string) => (mac.db.prepare("SELECT request, answer, lookups FROM calls WHERE agent = ? AND (? IS NULL OR trace_id = ?) ORDER BY rowid").all(agent, traceId ?? null, traceId ?? null) as { request: string; answer: string | null; lookups: string | null }[])
    .map(row => ({ prompt: (JSON.parse(row.request) as { prompt: string }).prompt, answer: row.answer ?? "", lookups: row.lookups ? JSON.parse(row.lookups) as string[] : [] }));
  return { mac, models, engine, events, storyId, head, state, path, append, play, endScene, steps, calls, close: () => claude.close() };
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
  return { yes: /^\W*YES\b/i.test(answer.text), said: answer.text };
}

/** The Outline as a reader of it would take it in: every Act, its turns and relationships, the people's own directions. */
function told(outline: Outline): string {
  return [
    ...outline.acts.flatMap(act => [
      `Act ${act.number}, ${act.title} (${act.detail}${act.number === outline.current ? ", now" : ""}). Its question: ${act.question} It builds to: ${act.buildsTo}`,
      ...act.turns.map(turn => `- ${turn.when}: ${turn.what}`),
      ...act.relationships.map(item => `- By its end, ${item.people.join(" and ")}: ${item.byEnd}`),
      ...act.movers.map(item => `- ${item.who}: ${item.doing}`)
    ]),
    `How it ends: ${outline.ending}`,
    ...outline.intentions.map(item => `${item.who} pursues ${item.pursues}; heading for ${item.heading}.`),
    ...outline.setups.map(setup => `Setup (${setup.state}): ${setup.what} It pays off: ${setup.payoff}`)
  ].join("\n");
}

describe("the Story's mind, on real models (openspec the-storys-mind)", () => {
  // GIVEN The Malfoy Problem is imported
  // THEN its first Outline has Year One in detail building to the Philosopher's Stone, the next Act outlined and the
  //   rest sketched to the end, with what the Director looked up; a Move inside a Scene leaves it as it is; an
  //   ordinary Scene's end revises it in focus; and a steering note re-plans the current Act deeply after the next
  //   Scene, following the note, while the Scene's end says the Director is rethinking it
  it("the Outline: written at the start, kept between exchanges, reconsidered after each Scene, and steered", async () => {
    const story = live(MALFOY_PROBLEM);
    try {
      story.engine.resumeAll();
      await story.engine.ended(story.storyId);
      expect(story.engine.sceneEndOf(story.storyId).failed).toBeNull();
      const first = story.state().outline!;
      const firstSaid = told(first);
      expect(first, "no first Outline").toBeTruthy();
      expect(first).toMatchObject({ version: 1, revisedAfter: 0, deep: true });
      expect(currentAct(first)?.detail, firstSaid).toBe("detailed");
      expect(currentAct(first)!.turns.length, firstSaid).toBeGreaterThanOrEqual(4);
      expect(first.acts.find(act => act.number === first.current + 1)?.detail, firstSaid).toBe("outlined");
      expect(first.ending.trim(), firstSaid).not.toBe("");
      expect(first.lookedUp.length, `the Director looked nothing up for a Story set in the books' world\n${firstSaid}`).toBeGreaterThan(0);
      expect(first.intentions.map(item => item.who), firstSaid).toEqual(expect.arrayContaining(["Draconia Malfoy", "Hermione Granger"]));
      const stone = await judge("Is the current Act the first year at Hogwarts, building toward the Philosopher's Stone (the events at the end of the first book), and does it say where Draconia and Hermione should each stand with Roopesh by its end? Answer YES or NO.", firstSaid);
      expect(stone.yes, `${stone.said}\n---\n${firstSaid}`).toBe(true);

      // A Move inside the Scene is answered on real models, and the Outline is as it was.
      await story.play("I hold her stare, and say nothing at all.", "outline-move-1");
      expect(story.steps("outline-move-1").slice(-2)).toEqual(["writing", "checking"]);
      expect(story.calls("editor", "outline-move-1").length).toBeGreaterThan(0);
      expect(story.state().outline?.version).toBe(1);

      // An ordinary Scene ends: the Outline is revised in focus, not re-planned.
      await story.endScene("outline-end-1");
      const focused = story.state().outline!;
      const scene1 = story.state().scene!.number;
      expect(focused, told(focused)).toMatchObject({ version: 2, revisedAfter: scene1, deep: false });
      const revisions = story.path().filter(payload => payload.kind === "outline_set");
      expect(revisions.at(-1)).toMatchObject({ reason: expect.stringContaining(`Scene ${scene1}`) });

      // The player steers; the next Scene's end re-plans the current Act deeply, following the note.
      writeNote(story.mac, story.storyId, "Year One ends with Draconia breaking from her father.");
      await story.play("The next morning I go down to breakfast in the Great Hall and sit where I can see the Slytherin table.", "outline-move-2");
      expect(story.state().scene!.number).toBe(scene1 + 1);
      await story.endScene("outline-end-2");
      const steered = story.state().outline!;
      const steeredSaid = told(steered);
      expect(steered, steeredSaid).toMatchObject({ version: 3, revisedAfter: scene1 + 1, deep: true });
      expect(besideOf(story.mac, story.storyId).notes.every(note => note.answeredBy === 3)).toBe(true);
      expect(story.events.some(({ id }) => id.includes(".rethinking")), "the Scene's end did not say the Director was rethinking the Act").toBe(true);
      const breaks = await judge("Does the current Act now build toward Draconia breaking from her father, Lucius Malfoy, by its end? Answer YES or NO.", steeredSaid);
      expect(breaks.yes, `${breaks.said}\n---\n${steeredSaid}`).toBe(true);
    } finally {
      story.close();
    }
  }, 5_400_000);

  // GIVEN in Scene 1 Hermione made him promise, in her own words, to meet her in the library, and Draconia told him the
  //   ribbon in her hair was her grandmother's
  // WHEN, after a Scene in Charms, he says the promise back to her word for word the next evening
  // THEN the Writer looks up Scene 1 before it plans, the phone is told it is looking back, then that the Reply is
  //   being written, then checked, and the Reply has her words as she said them
  // WHEN a Reply has Draconia say she bought the ribbon in Paris
  // THEN the Editor catches it, and the player reads that it was her grandmother's
  it("a Reply looks up the past, and the Editor catches a slip before it is read", async () => {
    let slip: string | null = null;
    const story = live(writeStoryFile(malfoyProblemStoryFile()), request => {
      if (request.agent !== "actor" || slip === null) return null;
      const answer = slip;
      slip = null;
      return new ScriptedRunner([{ answer }]);
    });
    try {
      playTwoScenes(story);
      expect(story.engine.sceneEndOf(story.storyId).step).toBeNull();

      const promise = await story.play("That evening I go to the library to keep my promise to Hermione, and I say it back to her word for word, exactly as she made me say it.", "lookup");
      const writer = story.calls("writer", "lookup").at(-1)!;
      expect(writer.lookups.length, "the Writer looked nothing up").toBeGreaterThan(0);
      expect(story.steps("lookup")[0]).toBe("looking_back");
      expect(story.steps("lookup").slice(1, 3)).toEqual(["writing", "checking"]);
      const note = story.path().findLast(payload => payload.kind === "beat_note");
      const gathered = note?.kind === "beat_note" ? note.gathered ?? [] : [];
      expect(gathered.map(item => item.words).join("\n"), JSON.stringify(writer.lookups)).toMatch(/end table at eight/i);
      // The Reply may quote the promise or say he gave it back; what it may not do is make up another one.
      const misquotes = await judge(`In an earlier Scene Hermione made him promise, in her words: ${PROMISE} Does this passage give the promise with a different time, place or terms than those? Answer YES or NO.`, promise.text);
      expect(misquotes.yes, `${misquotes.said}\n---\n${promise.text}`).toBe(false);

      slip = "Draconia stops at the end of the table and flicks the green ribbon over her shoulder. \"Bought it in Paris last summer, Stray,\" she says. \"Not that it's any business of yours.\" Hermione does not look up from the notes.";
      const ribbon = await story.play("Draconia sweeps into the library with Crabbe and Goyle behind her. In front of Hermione, I ask her where she got the green ribbon in her hair.", "ribbon");
      expect(story.calls("editor", "ribbon").length).toBeGreaterThan(0);
      expect(ribbon.text).not.toMatch(/bought it in Paris/i);
      const grandmother = await judge("Does this passage have it that the green ribbon was Draconia's grandmother's? Answer YES or NO.", ribbon.text);
      expect(grandmother.yes, `${grandmother.said}\n---\n${ribbon.text}`).toBe(true);
    } finally {
      story.close();
    }
  }, 3_600_000);

  // GIVEN Year One ends, and its account leaves out the night Hermione learned his secret
  // THEN the Editor sends it back, and it is written again with it
  it("living-world › Every agent knows the Story So Far › An account that leaves out a turn", async () => {
    let first = true;
    const story = live(writeStoryFile(malfoyProblemStoryFile()), request => {
      if (request.agent !== "folder" || !first) return null;
      first = false;
      return new ScriptedRunner([{ answer: JSON.stringify({ text: WITHOUT_THE_NIGHT }) }]);
    });
    try {
      const state = yearOneEnded(story.state());
      const due = foldDue(state)!;
      expect(due.into).toBe("act");
      const account = await writeFold(story.models, [jobModels(story.mac.home).folder], state, due, story.storyId, "act", new AbortController().signal, [jobModels(story.mac.home).editor]);
      // The first draft is checked and sent back for the night; every draft that comes back is checked again.
      const checks = story.calls("editor", "act");
      const said = checks.map((check, index) => `check ${index + 1}: ${check.answer}`).join("\n");
      expect(checks[0]?.answer, "the Editor did not find the night missing").toMatch(/troll|secret|Halloween/i);
      expect(story.calls("folder", "act"), said).toHaveLength(checks.length);
      expect(checks.length, said).toBeGreaterThanOrEqual(2);
      expect(missingNames(state, due, account.value), `${said}\n---\n${account.value}`).toEqual([]);
      const night = await judge("Does this account tell the night Hermione learned Roopesh's secret: that she saw him stop the troll at Halloween, and promised to keep it? Answer YES or NO.", account.value);
      expect(night.yes, `${night.said}\n---\n${said}\n---\n${account.value}`).toBe(true);
    } finally {
      story.close();
    }
  }, 1_800_000);
});

// ---------------------------------------------------------------- Scene 1, written by the test

const RIBBON = "\"It was my grandmother's,\" she says, quieter than she means to. \"Cassiopeia Black tied it on me the summer she died. Touch it, Stray, and I'll hex your fingers off.\"";
const PROMISE = "\"Say it properly,\" Hermione says. \"Say: I will be at the end table at eight tomorrow evening, I will bring the Arithmancy notes, and I will not let Malfoy talk me out of it.\" He says it. She makes him say it again, slower, and only then does she smile.";

/**
 * Plays the opening Scene by hand, as the models would have, and its end: the ribbon told and the promise made, the
 * Chronicler's record keeping the ribbon among what the two of them remember and the promise only in a line, so its
 * words are on the page and nowhere else. Then a second Scene, in Charms with Harry, so the promise is a Scene back and
 * not the Scene the next Move follows, whose words the Writer is given whole.
 */
function playTwoScenes(story: Live): void {
  const exchange = (move: string, reply: string, opens?: { title: string; place: string; at: string; who: string[] }) => {
    const moved = story.append({ kind: "move", text: move });
    if (opens) story.append({ kind: "scene_opened", number: story.state().scene!.number + 1, ...opens, prose: null, startsAt: moved, purpose: null, exit: null });
    const now = story.state();
    story.append({ kind: "beat_note", plan: null, here: now.scene!.here, goes: [], beats: [], note: "", call: "continue", intensity: 3, clock: now.clock, inPlay: [], callId: "written-by-the-test", model: WRITTEN });
    return story.append({ kind: "reply", text: reply, callId: "written-by-the-test", model: WRITTEN });
  };
  /** The Scene's end by hand: the Chronicler's record, the Outline kept, and an empty span of the World. */
  const end = (paragraph: string, truth: TruthUpdate, moments: Moment[]) => {
    story.append({ kind: "scene_closed", by: "player" });
    const scene = story.state().scene!.number;
    story.append({ kind: "chronicle", scene, summary: paragraph, paragraph, moments, told: [], known: [], bonds: [], engagements: [], changed: [], truth, dropped: [], callId: "written-by-the-test", model: WRITTEN });
    story.append({ kind: "outline_set", outline: { ...YEAR_ONE, revisedAfter: scene, deep: false }, reason: `Scene ${scene} has ended.`, planFollows: false, dropped: [], callId: "written-by-the-test", model: WRITTEN });
    const clock = story.state().clock;
    story.append({ kind: "world_moved", truth: emptyUpdate(), scene, gap: false, from: clock, until: clock, lives: [], threads: [], happened: [], meanwhile: [], on: [], dropped: [], callId: null, model: null });
  };

  const told = exchange("I ask Draconia, since she's so keen on mirrors, where she got the green ribbon in her hair.", `Draconia's hand goes to the ribbon before she can stop it. ${RIBBON} Crabbe laughs a beat too late.`);
  exchange("When the Slytherins have gone, I tell Hermione I'll come to the library tomorrow.", PROMISE);
  const scene = story.state().scene!.number;
  const ribbon = { id: "k-ribbon", what: "Draconia told him the green ribbon in her hair was her grandmother's, Cassiopeia Black's, tied on her the summer she died.", scene, words: [{ entry: told, text: "It was my grandmother's" }] };
  end(
    "At the Three Broomsticks Draconia mocked Roopesh before the Slytherin corner. He asked about the green ribbon in her hair, and she warned him off it. When the Slytherins had gone, Hermione made him promise, in words of her choosing, to meet her in the library the next evening.",
    { ...emptyUpdate(), between: [{ people: ["Draconia Malfoy", "Roopesh Gantasala"], stands: "She mocks him in public, and told him about the ribbon anyway.", turn: null, keepsakes: [ribbon] }] },
    [{ what: ribbon.what, quotes: ribbon.words, there: ["Draconia Malfoy", "Crabbe", "Goyle", "Hermione Granger"], weight: 4 }]
  );

  exchange("The next afternoon in Charms I sit at the back beside Harry.", CHARMS, { title: "Charms", place: "The Charms classroom", at: "Day 2 14:00", who: ["Harry Potter"] });
  end("In Charms the next afternoon Harry asked Roopesh whether he had really talked back to Malfoy, and said he was glad someone had. Roopesh's feather rose on his third try.", emptyUpdate(), []);
}

const CHARMS = "Harry leans over before Flitwick has finished the register. \"Is it true you talked back to Malfoy? In the Three Broomsticks?\" He grins when Roopesh shrugs. \"Good. Someone should.\" Roopesh's feather lies there for two tries, and on the third it rises, wobbling, to the height of Flitwick's nose.";

const YEAR_ONE: Omit<Outline, "version"> = {
  current: 1,
  acts: [
    {
      number: 1, title: "Year One", question: "Will Draconia let herself be seen with him?", buildsTo: "The end of the first year", detail: "detailed",
      turns: [{ id: "t1", when: "the first week", what: "Hermione makes him her study partner.", serves: ["Hermione Granger"], state: "ahead" }],
      relationships: [{ people: ["Draconia Malfoy", "Roopesh Gantasala"], byEnd: "She defends him once, in public, and hates that she did." }],
      movers: [{ who: "Draconia Malfoy", doing: "Keeping her father's good opinion." }],
      handsOn: "Year Two opens with her letter."
    },
    { number: 2, title: "Year Two", question: "What does she owe her father?", buildsTo: "Her choice", detail: "outlined", turns: [], relationships: [], movers: [], handsOn: "" }
  ],
  ending: "She chooses him over her name.",
  intentions: [], setups: [], promoted: [], revisedAfter: 0, deep: true, lookedUp: []
};

// ---------------------------------------------------------------- Year One, ended

const YEAR: [string, string, string[]][] = [
  ["The insult", "At the Three Broomsticks on his first night Draconia called Roopesh Stray in front of the Slytherin corner, and Hermione Granger told her to stop.", ["Draconia Malfoy", "Hermione Granger"]],
  ["The end table", "Hermione made Roopesh her study partner at the library's end table and gave him her Arithmancy notes. Draconia watched them from the next row.", ["Hermione Granger", "Draconia Malfoy"]],
  ["The ribbon", "In Charms Draconia told Roopesh the green ribbon in her hair had been her grandmother's, Cassiopeia Black's, and warned him never to touch it.", ["Draconia Malfoy"]],
  ["Halloween", "On Halloween night Hermione followed Roopesh to the dungeons and saw him stop the troll with one raised hand. He told her what he was; she promised to tell no one.", ["Hermione Granger"]],
  ["The Quidditch final", "At the Quidditch final Draconia sat beside Roopesh in the Slytherin stand and did not move when her friends stared.", ["Draconia Malfoy", "Crabbe", "Goyle"]],
  ["The last night", "On the last night of the year Draconia found Roopesh by the lake and told him her father had written about him. She did not say what.", ["Draconia Malfoy"]]
];

/** The Malfoy Problem at the end of Year One: six Scenes of it told, and the Outline moved on to Year Two. */
function yearOneEnded(state: State): State {
  const act = { number: 1, title: "Year One" };
  const scenes: Told[] = YEAR.map(([title, text, who], index) => ({ from: `Day ${index * 40 + 1} 20:00`, until: `Day ${index * 40 + 1} 21:00`, text, scene: { number: index + 1, title }, who, act }));
  const night = { text: "Hermione saw him stop the troll and learned what he is; she promised to keep his secret.", scene: 4, sources: [] };
  return {
    ...state,
    storySoFar: { acts: [], weeks: [], scenes },
    outline: { ...YEAR_ONE, version: 2, current: 2, acts: YEAR_ONE.acts.map(item => ({ ...item, detail: item.number === 2 ? "detailed" : "sketched" })), revisedAfter: 6 },
    truth: {
      ...state.truth,
      between: {
        ...state.truth.between,
        [betweenKey("Hermione Granger", "Roopesh Gantasala")]: { people: ["Hermione Granger", "Roopesh Gantasala"], stands: "She keeps his secret.", turns: [night], keepsakes: [] }
      }
    }
  };
}

/** Year One's account as a Folder might first write it: every Scene but the night Hermione learned his secret. */
const WITHOUT_THE_NIGHT = [
  "On his first night, at the Three Broomsticks, Draconia Malfoy called Roopesh Stray in front of the Slytherin corner, and Hermione Granger told her to stop.",
  "Hermione made him her study partner at the library's end table and gave him her Arithmancy notes, while Draconia watched from the next row.",
  "In Charms Draconia told him the green ribbon in her hair had been her grandmother's, Cassiopeia Black's, and warned him never to touch it.",
  "At the Quidditch final she sat beside him in the Slytherin stand, Crabbe and Goyle staring, and did not move.",
  "On the last night of the year she found him by the lake and told him her father had written about him, and would not say what."
].join(" ");
