import { describe, expect, it } from "vitest";
import { BUDGETS } from "../../src/agents/step.js";
import { Engine, type OutgoingEvent } from "../../src/engine/engine.js";
import type { FakeModels } from "../../src/models/fake.js";
import { Models, type ModelRequest, type ModelRunner } from "../../src/models/model-call.js";
import { scriptedRunners } from "../../src/models/runners.js";
import type { Script } from "../../src/models/scripted.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { besideOf, writeNote } from "../../src/store/beside.js";
import type { OutlineSet, Payload } from "../../src/story/entries.js";
import { currentAct } from "../../src/story/outline.js";
import { tiers } from "../../src/story/relevance.js";
import { sceneView } from "../../src/views/scene.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

const DRACONIA = "Draconia Malfoy";
const HERMIONE = "Hermione Granger";
const ROOPESH = "Roopesh Gantasala";
const LUCIUS = "Lucius Malfoy";
const LUNA = "Luna Lovegood";

/** After Curfew with Lucius and Luna among its people, and the year building to the Philosopher's Stone. */
function yearStory(opening: Partial<StoryFile["opening"]> = {}): StoryFile {
  const story = hogwartsStoryFile(opening);
  story.people = [...story.people,
    { name: LUCIUS, who_they_are: "Draconia's father, on the Board of Governors, who wants her married into an old house." },
    { name: LUNA, who_they_are: "A Ravenclaw who sees what others miss, and says so." }
  ] as StoryFile["people"];
  story.landmarks = [...(story.landmarks ?? []), { name: "The Philosopher's Stone", at: "Day 278 21:00", what: "Quirrell goes through the trapdoor for the Stone." }];
  return story;
}

type Turn = { id: string; when: string; what: string; serves: string[]; done: boolean };
const SEPTEMBER: Turn = { id: "T1", when: "the last fortnight of September", what: "Draconia claims him in front of Slytherin.", serves: [DRACONIA], done: false };
const JUNE: Turn = { id: "T2", when: "June", what: "Lucius Malfoy comes to Hogwarts to take Draconia home, and she must choose.", serves: [DRACONIA, LUCIUS], done: false };

/** Year One as the Director answers it, the turns and the parts [changes] give; Year Two outlined after it. */
function yearOne(changes: Record<string, unknown> = {}, turns: Turn[] = [SEPTEMBER, JUNE], relationships = [
  { people: [DRACONIA, ROOPESH], by_end: "By June she has claimed him in front of the school, and calls it a debt." },
  { people: [HERMIONE, ROOPESH], by_end: "By June she has kissed him first." }
]): Script {
  return { answer: JSON.stringify({
    current: 1,
    acts: [
      { number: 1, title: "Year One", question: "Can a Malfoy who owes a Muggle-born her life make him hers and keep her name?", builds_to: "The Philosopher's Stone", turns, relationships,
        movers: [{ who: LUCIUS, doing: "Arranging Draconia's marriage, and watching the Muggle-born she owes." }], hands_on: "The Stone is saved, and someone saw what he did." },
      { number: 2, title: "Year Two", question: "Who is opening the Chamber?", builds_to: "Into the Chamber", turns: [{ id: "Y2.1", when: "the autumn", what: "The Chamber is opened.", serves: [], done: false }], relationships: [], movers: [], hands_on: "" }
    ],
    ending: "Voldemort falls, and who stands beside him is settled in play.",
    intentions: [
      { who: DRACONIA, pursues: "the Seeker's place, against her father's plans for her", feelings: "from owing him to wanting him", heading: "she has chosen him once, in public" },
      { who: HERMIONE, pursues: "top of every class, and the third-floor door", feelings: "from hiding what she feels to fighting for him", heading: "she has kissed him first" },
      { who: LUCIUS, pursues: "a match that binds an old house to his", feelings: "contempt for the Muggle-born his daughter owes", heading: "his patience gone" }
    ],
    setups: [], promoted: [],
    ...changes
  }) };
}

/** A focused revision as the Director answers it: that the Scene turned the Story, or only what it changed. */
function revise(changes: Record<string, unknown> = {}): Script {
  return { answer: JSON.stringify({ turned: null, turns: [], turns_done: [], relationships: [], movers: [], intentions: [], setups: [], promoted: [], ...changes }) };
}

/** Models that answer as [inner] does, except that the call the test holds waits until it lets it go. */
class Gate implements ModelRunner {
  private gate: { when: (request: ModelRequest) => boolean; wait: Promise<void>; open: () => void } | null = null;
  reached = false;
  readonly canLookUp: FakeModels["canLookUp"];
  constructor(private readonly inner: FakeModels) {
    this.canLookUp = inner.canLookUp;
  }

  hold(when: (request: ModelRequest) => boolean): void {
    let open = () => {};
    const wait = new Promise<void>(resolve => (open = resolve));
    this.gate = { when, wait, open };
    this.reached = false;
  }

  release(): void {
    this.gate?.open();
    this.gate = null;
  }

  async run(...[request, onText, signal, tools]: Parameters<ModelRunner["run"]>): Promise<string> {
    const gate = this.gate;
    if (gate?.when(request)) {
      this.reached = true;
      await gate.wait;
    }
    return this.inner.run(request, onText, signal, tools);
  }
}

async function until(done: () => boolean): Promise<void> {
  for (let tries = 0; !done(); tries++) {
    if (tries > 500) throw new Error("It never happened");
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}

const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
/** A Writer's answer from the Day View that opens a Scene at [place] with [who], [minutes] on. */
const opens = (title: string, place: string, who: string[], minutes = 600): Script => ({ answer: JSON.stringify({
  leaves_scene: false, frame: { title, place, purpose: "p", exit: "e" }, comes_in: who, goes: [], beats, note: "n", call: "continue",
  intensity: 2, arc_moved: true, minutes, taste: null, in_play: [], moves_to: null
}) });

const outlines = (path: Payload[]) => path.filter((payload): payload is OutlineSet => payload.kind === "outline_set");
const isOutline = (request: ModelRequest) => (request.facts as { job?: string }).job === "outline";
const why = (request: ModelRequest) => (request.facts as { why?: string }).why;

/**
 * A Story whose first Outline, Year One, was written as it was opened, through its queue (openspec the-outline: Every
 * Story has an Outline to its end), on models a test can hold.
 */
async function prepared(file: StoryFile = yearStory(), scripts: Parameters<typeof playable>[1] = {}) {
  const base = playable(file, scripts);
  const gate = new Gate(base.models);
  const engine = new Engine(base.mac, new Models(base.mac.db, scriptedRunners(gate)));
  const events: OutgoingEvent[] = [];
  engine.subscribe(base.storyId, event => events.push(event));
  base.models.outline.then(yearOne());
  engine.resumeAll();
  await engine.ended(base.storyId);
  expect(base.state().outline).toMatchObject({ version: 1, deep: true, revisedAfter: 0 });
  let turns = 0;
  const play = async (move: string) => {
    engine.move(base.storyId, move, base.head(), `trace-${++turns}`);
    await engine.settled(base.storyId);
  };
  const end = async () => {
    engine.endScene(base.storyId, base.head(), `end-${++turns}`);
    await engine.ended(base.storyId);
  };
  const view = () => sceneView(base.mac, engine, base.storyId, "trace-view");
  /** What the Scene's end wrote after its `scene_closed`, by kind. */
  const afterClose = () => {
    const kinds = base.path().map(payload => payload.kind);
    return kinds.slice(kinds.lastIndexOf("scene_closed"));
  };
  return { ...base, engine, gate, events, play, end, view, afterClose };
}

describe("a Story's first Outline (openspec the-outline: Every Story has an Outline to its end)", () => {
  it("is written deeply when the Story is opened, through its queue, before anything is played, and holds a Move until it is ready", async () => {
    const base = playable(yearStory());
    const gate = new Gate(base.models);
    const engine = new Engine(base.mac, new Models(base.mac.db, scriptedRunners(gate)));
    gate.hold(isOutline);
    engine.resumeAll();
    await until(() => gate.reached);
    // The Director is preparing the Story; the player waits for it, told why.
    expect(engine.isIdle(base.storyId)).toBe(false);
    expect(() => engine.move(base.storyId, "I say goodnight.", base.head(), "t")).toThrow(expect.objectContaining({ code: "busy", message: "The Story is being prepared: the Director is writing its Outline. Wait until it is ready." }));
    gate.release();
    await engine.ended(base.storyId);
    expect(base.path().map(payload => payload.kind)).toEqual(["story_set_up", "scene_opened", "outline_set"]);
    expect(outlines(base.path())[0]).toMatchObject({ planFollows: false, outline: { deep: true, revisedAfter: 0 } });
    const asked = base.models.outline.requests[0]!;
    expect(asked.facts).toMatchObject({ job: "outline", why: "start" });
    expect(asked.tools).toMatchObject({ web: true });
    expect(asked.turns).toBe(BUDGETS.directorDeep.turns);
    // Nothing else was owed: the Scene is played as before.
    engine.move(base.storyId, "I say goodnight.", base.head(), "t-move");
    await engine.settled(base.storyId);
    expect(base.models.outline.requests).toHaveLength(1);
  });

  it("stops nothing when it cannot be written while the Scene is open: the Director writes it at the Scene's end", async () => {
    const base = playable(yearStory());
    base.models.outline.then({ fail: "Fable 5.1 is overloaded" }, { fail: "GPT 6.1 Sol is overloaded" });
    base.engine.resumeAll();
    await base.engine.ended(base.storyId);
    expect(base.state().outline).toBeNull();
    expect(base.engine.sceneEndOf(base.storyId).failed).toBeNull();
    await base.play("I say goodnight.");
    base.engine.endScene(base.storyId, base.head(), "end");
    await base.engine.ended(base.storyId);
    expect(base.models.outline.requests.map(why)).toEqual(["start", "start", "start"]);
    expect(base.state().outline).toMatchObject({ version: 1, deep: true, revisedAfter: 1 });
  });
});

describe("the-outline › The Outline is reconsidered after every Scene", () => {
  // GIVEN a breakfast Scene in which nothing turned
  // WHEN it ends
  // THEN the Director adjusts the current Act where the Scene touched it, and does not re-plan it deeply
  it("the-outline › The Outline is reconsidered after every Scene › An ordinary Scene", async () => {
    const { play, end, state, path, models, events, afterClose } = await prepared(yearStory({ title: "Breakfast", place: "The Great Hall", at: "Day 4 08:00", who: [DRACONIA] }));
    const touched = { ...SEPTEMBER, what: "Draconia claims him in front of Slytherin, now that he has eaten at her table." };
    models.outline.then(revise({ turns: [touched] }));
    await play("I sit down at the Slytherin table and butter my toast.");
    await end();

    // One focused pass, in a few steps and without the web; no deep one.
    const asked = models.outline.requests.slice(1);
    expect(asked.map(why)).toEqual(["focused"]);
    expect(asked[0]!.turns).toBe(BUDGETS.directorFocused.turns);
    expect(asked[0]!.tools).toMatchObject({ web: false });
    expect(asked[0]!.prompt).toContain("Scene 1, Breakfast, has ended: reconsider the Outline in the light of how it went.");
    expect(asked[0]!.prompt).toContain("This is a focused revision, in a few steps at most");
    // The current Act is adjusted where the Scene touched it, and kept otherwise.
    expect(afterClose()).toEqual(["scene_closed", "chronicle", "outline_set", "director_plan", "world_moved"]);
    expect(outlines(path()).at(-1)).toMatchObject({ planFollows: true, outline: { deep: false, revisedAfter: 1 } });
    expect(state().outline).toMatchObject({ version: 2, deep: false });
    expect(currentAct(state().outline)!.turns.map(turn => turn.what)).toEqual([touched.what, JUNE.what]);
    // Nobody is told the Director is rethinking the year.
    expect(events.some(event => event.id.endsWith(".rethinking"))).toBe(false);
  });

  // GIVEN Year One's Outline needs Lucius Malfoy in June
  // WHEN a Scene ends in which the player kills Lucius
  // THEN the Director re-plans Year One deeply before the Day View opens, and the Scene's end says it is
  //   rethinking Year One
  it("the-outline › The Outline is reconsidered after every Scene › A Scene that turns the Story", async () => {
    const { play, end, state, path, models, gate, engine, storyId, view, afterClose } = await prepared(yearStory({ title: "The gates", place: "The Hogwarts gates", at: "Day 4 18:00", who: [LUCIUS, DRACONIA] }));
    expect(currentAct(state().outline)!.turns.find(turn => turn.when === "June")!.serves).toContain(LUCIUS);
    const dead = "Lucius Malfoy is dead, and Year One's June turns on him";
    const narcissa = { id: "T2", when: "June", what: "Narcissa comes to Hogwarts for the Muggle-born who killed her husband, and Draconia must choose.", serves: [DRACONIA], done: false };
    models.outline.then(revise({ turned: dead }), yearOne({}, [SEPTEMBER, narcissa]));
    await play("I stop time, and kill Lucius Malfoy where he stands.");
    gate.hold(request => isOutline(request) && why(request) === "deep");
    const ending = end();
    await until(() => gate.reached);

    // While the year is re-planned, the line says so, and the Day View has not opened.
    expect(engine.sceneEndOf(storyId)).toEqual({ step: "director", failed: null, rethinking: "Year One" });
    expect(view().day_view).toMatchObject({ scene_end: { step: "director", rethinking: "Year One" }, happenings: [] });
    gate.release();
    await ending;

    const asked = models.outline.requests.slice(1);
    expect(asked.map(why)).toEqual(["focused", "deep"]);
    expect(asked[1]!.turns).toBe(BUDGETS.directorDeep.turns);
    expect(asked[1]!.tools).toMatchObject({ web: true });
    expect(asked[1]!.prompt).toContain(`Scene 1, The gates, turned the Story: ${dead}.`);
    expect(asked[1]!.prompt).toContain("This Scene turned the Story. Re-plan Year One in detail");
    // Only the deep Outline is kept, before the World moves on.
    expect(afterClose()).toEqual(["scene_closed", "chronicle", "outline_set", "director_plan", "world_moved"]);
    expect(outlines(path()).at(-1)).toMatchObject({ reason: `Scene 1, The gates, turned the Story: ${dead}.`, outline: { deep: true, revisedAfter: 1 } });
    expect(currentAct(state().outline)!.turns.find(turn => turn.when === "June")).toMatchObject({ what: narcissa.what, serves: [DRACONIA] });
    expect(engine.sceneEndOf(storyId)).toEqual({ step: null, failed: null, rethinking: null });
  });

  it("goes straight to the deep pass on Retry when it failed after the focused pass found the Story turned", async () => {
    const { play, end, models, engine, storyId, afterClose } = await prepared(yearStory({ title: "The gates", place: "The Hogwarts gates", at: "Day 4 18:00", who: [LUCIUS] }));
    models.outline.then(revise({ turned: "Lucius Malfoy is dead" }), { fail: "Fable 5.1 is overloaded" }, { fail: "GPT 6.1 Sol is overloaded" });
    await play("I kill Lucius Malfoy.");
    await end();
    expect(engine.sceneEndOf(storyId).failed).toMatchObject({ step: "director" });
    expect(afterClose()).toEqual(["scene_closed", "chronicle"]);
    engine.retry(storyId, "retry");
    await engine.ended(storyId);
    expect(models.outline.requests.slice(1).map(why)).toEqual(["focused", "deep", "deep", "deep"]);
    expect(afterClose()).toEqual(["scene_closed", "chronicle", "outline_set", "director_plan", "world_moved"]);
  });

  // WHEN a Move inside a Scene is answered
  // THEN the Outline is unchanged until the Scene ends
  it("the-outline › The Outline is reconsidered after every Scene › Not between exchanges", async () => {
    const { play, end, state, path, models } = await prepared();
    const before = state().outline;
    await play("I sit down by the fire.");
    await play("I ask Hermione what she is reading.");
    await play("I tell her about the door on the third floor.");
    expect(models.outline.requests).toHaveLength(1);
    expect(state().outline).toEqual(before);
    expect(outlines(path())).toHaveLength(1);
    await end();
    expect(models.outline.requests.map(why)).toEqual(["start", "focused"]);
    expect(state().outline!.version).toBe(2);
  });

  // GIVEN the player has spent three Scenes with Luna Lovegood
  // WHEN the third ends
  // THEN Luna has a full Life and a place in the current Act's turns
  it("the-outline › The Outline is reconsidered after every Scene › Someone grows close", async () => {
    const lunasYear = { id: "T3", when: "October", what: "Luna shows him what she has seen in the Forbidden Forest, and asks him not to tell.", serves: [LUNA], done: false };
    const withLuna = revise({ turns: [lunasYear], intentions: [
      { who: LUNA, pursues: "the creatures in the Forest nobody else believes in", feelings: "from curiosity about him to trusting him with what she sees", heading: "he is the one she tells" }
    ] });
    const { play, end, state, models } = await prepared(yearStory({ title: "The owlery", place: "The owlery", at: "Day 3 21:40", who: [LUNA] }), {
      writer: [opens("kept", "kept", [], 2), opens("The lake", "The Black Lake", [LUNA]), opens("The greenhouses", "Greenhouse Three", [LUNA])]
    });
    await play("I ask Luna what she is looking for.");
    await end();
    await play("In the morning I find Luna by the lake.");
    await end();
    expect(tiers(state()).close).not.toContain(LUNA);
    models.outline.then(withLuna);
    await play("After lunch I help Luna in the greenhouses.");
    await end();

    // The third Scene's end: she is Close, and the Director gives her a Life of her own and a turn of the year.
    const third = models.outline.requests.at(-1)!;
    expect(why(third)).toBe("focused");
    expect((third.facts as { lives: string[] }).lives).toContain(LUNA);
    expect(third.prompt).toContain(LUNA);
    expect(tiers(state()).close).toContain(LUNA);
    expect(state().outline!.intentions.find(item => item.who === LUNA)).toMatchObject({ pursues: "the creatures in the Forest nobody else believes in" });
    expect(currentAct(state().outline)!.turns.filter(turn => turn.serves.includes(LUNA)).map(turn => turn.id)).toEqual(["T3"]);
    // The World lives her Life in full from now on.
    expect(models.weaver.requests.at(-1)!.prompt).toMatch(new RegExp(`Close, each with a full Life: [^\n]*${LUNA}`));
  });
});

describe("the-outline › The player sees and steers the Outline", () => {
  // WHEN the player writes the note "Year One ends with Draconia breaking from her father"
  // THEN after the next Scene's end, Year One in the Outline builds toward that break
  it("the-outline › The player sees and steers the Outline › Steering a year's end", async () => {
    const { play, end, state, path, models, mac, storyId, events } = await prepared();
    const text = "Year One ends with Draconia breaking from her father";
    const note = writeNote(mac, storyId, text);
    const breaking = { id: "T2", when: "June", what: "Draconia breaks from Lucius in front of the whole school, and walks out of the Manor's carriage.", serves: [DRACONIA, LUCIUS], done: false };
    models.outline.then(yearOne({}, [SEPTEMBER, breaking], [{ people: [DRACONIA, LUCIUS], by_end: "She has broken from him, in public." }, { people: [DRACONIA, ROOPESH], by_end: "She has chosen him over her father." }]));
    await play("I say goodnight.");
    await end();

    // The note is an order: one deep pass, steered, follows it; no focused pass first.
    const asked = models.outline.requests.slice(1);
    expect(asked.map(why)).toEqual(["steered"]);
    expect(asked[0]!.tools).toMatchObject({ web: true });
    expect(asked[0]!.prompt).toContain(`The player steered the Story: “${text}”. Re-plan Year One deeply so it follows the note, over your own reading of play.`);
    expect(asked[0]!.prompt.match(new RegExp(text, "g"))?.length).toBeGreaterThan(1);
    expect(events.some(event => event.id.endsWith(".rethinking"))).toBe(true);
    // Year One builds toward the break, and the note is answered by that Outline.
    const year = currentAct(state().outline)!;
    expect(year.turns.at(-1)).toMatchObject({ when: "June", what: breaking.what });
    expect(year.relationships.find(item => item.people.includes(LUCIUS))).toMatchObject({ byEnd: "She has broken from him, in public." });
    expect(outlines(path()).at(-1)!.outline.deep).toBe(true);
    expect(besideOf(mac, storyId).notes).toEqual([{ ...note, answeredBy: 2 }]);
  });

  // GIVEN play has drawn Hermione to the centre of the Act
  // WHEN the player writes "keep Hermione a rival this year"
  // THEN the next Outline keeps her a rival for the rest of Year One
  it("the-outline › The player sees and steers the Outline › A note over play", async () => {
    const { play, end, state, models, mac, storyId } = await prepared(yearStory({ title: "The library", place: "The library", at: "Day 4 15:00", who: [HERMIONE] }));
    // Play has drawn her to the centre: the Act's turns are hers, and she is heading for his arms.
    const hers = [
      { id: "T1", when: "September", what: "Hermione stays up with him over the third-floor door.", serves: [HERMIONE], done: false },
      { id: "T2", when: "June", what: "Hermione goes through the trapdoor with him, and kisses him first.", serves: [HERMIONE], done: false }
    ];
    models.outline.then(revise({ turns: hers, relationships: [{ people: [HERMIONE, ROOPESH], by_end: "Together by June." }, { people: [DRACONIA, ROOPESH], by_end: "Further off than now." }] }));
    await play("I stay late in the library with Hermione.");
    await end();
    expect(currentAct(state().outline)!.relationships.find(item => item.people.includes(HERMIONE))!.byEnd).toBe("Together by June.");

    const text = "keep Hermione a rival this year";
    writeNote(mac, storyId, text);
    const rival = [
      { id: "T1", when: "October", what: "Hermione beats him in every Charms test, and lets him know it.", serves: [HERMIONE], done: false },
      { id: "T2", when: "June", what: "Hermione goes through the trapdoor to beat him to the Stone.", serves: [HERMIONE], done: false }
    ];
    const rivals = [{ people: [HERMIONE, ROOPESH], by_end: "Still his rival in June, and the better for it." }, { people: [DRACONIA, ROOPESH], by_end: "Further off than now." }];
    models.outline.then(yearOne({}, rival, rivals), revise());
    await play("In the morning I find Hermione at breakfast.");
    await end();
    // The note wins over the Director's own reading of play.
    const steered = models.outline.requests.at(-1)!;
    expect(why(steered)).toBe("steered");
    expect(steered.prompt).toContain(`The player steered the Story: “${text}”. Re-plan Year One deeply so it follows the note, over your own reading of play.`);
    expect(currentAct(state().outline)!.relationships.find(item => item.people.includes(HERMIONE))!.byEnd).toBe("Still his rival in June, and the better for it.");

    // For the rest of the year the note still stands, at every Scene's end.
    await play("At noon I sit with Hermione in the courtyard.");
    await end();
    const after = models.outline.requests.at(-1)!;
    expect(why(after)).toBe("focused");
    expect(after.prompt).toContain("<active_directions>");
    expect(after.prompt).toContain(text);
    expect(currentAct(state().outline)!.relationships.find(item => item.people.includes(HERMIONE))!.byEnd).toBe("Still his rival in June, and the better for it.");
  });
});

describe("presence › Between Scenes is quiet, and shows progress", () => {
  // GIVEN a Scene has ended and been recorded
  // WHEN the Director reconsiders the Outline
  // THEN the World moves on at the same time, from the Outline as it stood, and the Day View is ready once both are done
  it("presence › Between Scenes is quiet, and shows progress › The Outline and the World side by side", async () => {
    // A long day inside the Stretch: no new Stretch is due at its end, and the World has the night to live out.
    const longDay = { answer: JSON.stringify({ leaves_scene: false, frame: null, comes_in: [], goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, minutes: 800, taste: null, in_play: [], moves_to: null }) };
    const { play, end, models, gate, engine, storyId, head, view, afterClose } = await prepared(yearStory({ at: "Day 3 23:50" }), {
      writer: [opens("kept", "kept", [], 2), opens("The Great Hall", "The Great Hall", [], 2), longDay]
    });
    await play("I say goodnight.");
    await end();
    engine.choose(storyId, { after: head(), kind: "story", gap: null }, "pick");
    await engine.settled(storyId);
    await play("We talk until long after dark.");
    const woven = models.weaver.requests.length;
    gate.hold(request => isOutline(request));
    const ending = end();
    await until(() => gate.reached);
    // While the Director is still reconsidering the Outline, the Weaver has already been asked.
    await until(() => models.weaver.requests.length > woven);
    expect(view().day_view).toMatchObject({ scene_end: { step: "director" }, happenings: [] });
    expect(afterClose()).toEqual(["scene_closed", "chronicle"]);
    gate.release();
    await ending;
    // The Director's revision is written first, then the World; then the Day View is ready.
    expect(afterClose()).toEqual(["scene_closed", "chronicle", "outline_set", "world_moved"]);
    expect(engine.sceneEndOf(storyId)).toEqual({ step: null, failed: null, rethinking: null });
  });

  // GIVEN a Scene ended that turned the Story
  // WHEN the Director re-plans the current Act deeply
  // THEN the line says it is rethinking Year One, until the World moves on
  it("presence › Between Scenes is quiet, and shows progress › Rethinking a year", async () => {
    const { play, end, models, gate, engine, storyId, view, events } = await prepared(yearStory({ title: "The gates", place: "The Hogwarts gates", at: "Day 4 18:00", who: [LUCIUS] }));
    models.outline.then(revise({ turned: "Lucius Malfoy is dead" }), yearOne());
    await play("I kill Lucius Malfoy.");
    const line = () => view().day_view!.scene_end;
    const seen = events.length;

    gate.hold(request => isOutline(request) && why(request) === "deep");
    const ending = end();
    await until(() => gate.reached);
    expect(line()).toEqual({ step: "director", failed: null, rethinking: "Year One" });
    // The phone is told to read the Scene's end again as the rethinking begins.
    expect(events.slice(seen).filter(event => event.event.kind === "scene_end_step").map(event => [event.event.kind === "scene_end_step" ? event.event.step : null, event.id.endsWith(".rethinking")]))
      .toEqual([["chronicler", false], ["director", false], ["director", true]]);

    // The Stretch planned after it is still the year being rethought.
    gate.release();
    gate.hold(request => request.agent === "director" && !isOutline(request));
    await until(() => gate.reached);
    expect(line()).toEqual({ step: "director", failed: null, rethinking: "Year One" });

    // Until the World, moving on alongside the Director, is written: then the line clears.
    gate.release();
    await ending;
    expect(line()).toEqual({ step: null, failed: null, rethinking: null });
    expect(engine.sceneEndOf(storyId).rethinking).toBeNull();
  });
});
