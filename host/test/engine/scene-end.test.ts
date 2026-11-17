import { describe, expect, it } from "vitest";
import { emptyUpdate } from "../../src/story/truth.js";
import { Engine } from "../../src/engine/engine.js";
import { fakeOutlineAnswer, fakeWriterAnswer, FakeModels } from "../../src/models/fake.js";
import { jobModels, setJobModel } from "../../src/models/jobs.js";
import { Models, type ModelRequest, type ModelRunner } from "../../src/models/model-call.js";
import { scriptedRunners } from "../../src/models/runners.js";
import type { Script } from "../../src/models/scripted.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import type { Chronicle, DirectorPlan, OutlineSet, Payload, WorldMoved } from "../../src/story/entries.js";
import { backstageView } from "../../src/views/backstage.js";
import { sceneView } from "../../src/views/scene.js";
import { callsFor } from "../support/host.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile, hogwartsWorldStoryFile } from "../support/story-files.js";

const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];

/** A Writer's answer, the Reply [minutes] on, changed as a scenario needs; its frame opens a Scene when one opens. */
function writer(minutes: number, changes: Record<string, unknown> = {}): Script {
  return { answer: JSON.stringify({ leaves_scene: false, frame: { title: "kept", place: "kept", purpose: "p", exit: "e" }, comes_in: [], goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, minutes, taste: null, in_play: [], moves_to: null, ...changes }) };
}

/** A Writer's answer as the fakes give it, but rating the Scene 5: it peaked. */
const peaked: Script = { from: (request: ModelRequest) => ({ answer: JSON.stringify({ ...JSON.parse((fakeWriterAnswer(request) as { answer: string }).answer) as object, intensity: 5 }) }) };

/** A Chronicler's record, changed as a scenario needs. */
function chronicle(changes: Record<string, unknown> = {}): Script {
  return { answer: JSON.stringify({ summary: "The Scene was played.", paragraph: "The Scene was played.", moments: [], told: [], known: [], bonds: [], engagements: [], changed: [], ...changes }) };
}

/** The World's move, with nothing but what [changes] say. */
const weave = (changes: Record<string, unknown> = {}): Script => ({ answer: JSON.stringify({ lives: [], threads: [], happened: [], meanwhile: [], on: [], ...changes }) });

/**
 * A Director's plan from the Day View's day, its Scenes that matter as given and the rest by default: each serves the
 * first turn of the Act the scripted Director outlines, and it brings in that Outline's locked door.
 */
function plan(scenes: Record<string, unknown>[], changes: Record<string, unknown> = {}): Script {
  return { answer: JSON.stringify({
    days: 5, toward: "the flying test", landmark: null, phase: "build",
    scenes: scenes.map((scene, index) => ({ id: `S${index + 1}`, date: "1991-09-07", time: "10:00", place: "The Great Hall", who: [], serves: { turn: "T1", lives: [] }, for: "A step for the Story.", offer: "Something is on.", headline: "A step", lead: null, engagement: null, quiet: false, ...scene })),
    new: [{ setup: "U1", kind: "mystery", scene: null, person: null }],
    leads: [], arcs: [], roadmap: [], premise: "Some Scenes serve it.", ...changes
  }) };
}

const kinds = (path: Payload[]) => path.map(payload => payload.kind);
/** What a Scene's end wrote on the Path after its `scene_closed`. */
const afterClose = (path: Payload[]) => kinds(path.slice(path.map(payload => payload.kind).lastIndexOf("scene_closed")));
const chronicles = (path: Payload[]) => path.filter((payload): payload is Chronicle => payload.kind === "chronicle");
const plans = (path: Payload[]) => path.filter((payload): payload is DirectorPlan => payload.kind === "director_plan");
const outlines = (path: Payload[]) => path.filter((payload): payload is OutlineSet => payload.kind === "outline_set");

/** A model that answers as [inner] does, except that an agent held waits until the test lets it go. */
class Held implements ModelRunner {
  private readonly gates = new Map<string, { wait: Promise<void>; open: () => void }>();
  constructor(private readonly inner: ModelRunner) {}

  hold(agent: string): void {
    let open = () => {};
    const wait = new Promise<void>(resolve => (open = resolve));
    this.gates.set(agent, { wait, open });
  }

  release(agent: string): void {
    this.gates.get(agent)?.open();
    this.gates.delete(agent);
  }

  async run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<string> {
    const gate = this.gates.get(request.agent);
    if (gate) await gate.wait;
    return this.inner.run(request, onText, signal);
  }
}

async function until(done: () => boolean): Promise<void> {
  for (let tries = 0; !done(); tries++) {
    if (tries > 500) throw new Error("It never happened");
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}

/** Friday night after curfew (Day 3, Day 1 a Wednesday): the Scene ends after ten, so the Day View opens on Saturday morning. */
const afterCurfew = () => hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] });

describe("a Scene's end, step by step (docs/adr/0016)", () => {
  const note = "A note under the door: \"My office, nine o'clock.\" M. McGonagall.";
  const noteUnderTheDoor = weave({
    lives: [{ who: "Minerva McGonagall", where: "her office", doing: "waiting for accounts of the troll", after: "The truth about the troll" }],
    happened: [{ id: "H1", what: "McGonagall slid a note under Roopesh's door.", at: "Day 4 06:45", where: "the boys' dormitory", known_to: ["Minerva McGonagall", "Roopesh Gantasala"], landmark: null, move: null, missed: null }],
    meanwhile: [{ text: note, how: "seen", happened: "H1", told_by: null, about: ["Minerva McGonagall"], engagement: null }]
  });

  // WHEN the player ends a Scene
  // THEN a single line says each step in turn, until the Day View is ready with its choices
  it("presence › Between Scenes is quiet, and shows progress › The World moves on", async () => {
    const { mac, storyId, head, models, play } = playable(afterCurfew(), { weaver: [noteUnderTheDoor] });
    await play("I say goodnight to Hermione and go up.");
    // The same Story on models where the Director is held until the test lets it go.
    const held = new Held(models);
    held.hold("director");
    const engine = new Engine(mac, new Models(mac.db, scriptedRunners(held)));
    const steps: (string | null)[] = [];
    engine.subscribe(storyId, event => { if (event.event.kind === "scene_end_step") steps.push(event.event.step ?? null); });
    const dayView = () => sceneView(mac, engine, storyId, "t").day_view!;

    engine.endScene(storyId, head(), "end");
    expect(dayView()).toMatchObject({ at: "Day 4 07:30", scene_end: { step: "chronicler", failed: null }, meanwhile: [], happenings: [] });
    await until(() => engine.sceneEndOf(storyId).step === "director");
    expect(dayView()).toMatchObject({ scene_end: { step: "director", failed: null }, meanwhile: [], happenings: [] });
    held.release("director");
    await engine.ended(storyId);

    expect(steps).toEqual(["chronicler", "director", "weaver", null]);
    expect(dayView()).toMatchObject({ scene_end: { step: null, failed: null }, meanwhile: [{ text: note, how: "seen" }] });
    expect(dayView().happenings.length).toBeGreaterThan(0);
    const moved = mac.tree.pathTo(head()).at(-1)!.payload as WorldMoved;
    expect(moved).toMatchObject({ kind: "world_moved", truth: emptyUpdate(), gap: false, from: "Day 3 22:42", until: "Day 4 07:30", lives: [{ who: "Minerva McGonagall" }] });
  });

  it("records the Scene, then writes the Outline and plans, then moves the World on, which reads the plan", async () => {
    const { engine, storyId, head, play, path, models } = playable(hogwartsStoryFile());
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    // The Story had no Outline yet: the Director writes it in its step, deeply, and then the Stretch as its next step.
    expect(models.requests.map(request => request.agent).filter(agent => !["writer", "actor", "editor"].includes(agent))).toEqual(["chronicler", "director", "director", "weaver"]);
    expect(models.outline.requests[0]!.facts).toMatchObject({ job: "outline", why: "start" });
    expect(afterClose(path())).toEqual(["scene_closed", "chronicle", "outline_set", "director_plan", "world_moved"]);
    expect(outlines(path())[0]).toMatchObject({ planFollows: true, outline: { deep: true, revisedAfter: 1 } });
    // The Weaver moves the World on toward the plan's Scenes that matter.
    expect(models.weaver.requests[0]!.prompt).toContain("The plan's Scenes that matter ahead:\n- s1.1 Saturday 7 September 1991, 10:00 am, the Great Hall, with Draconia Malfoy: A step for the Story.");
  });

  // GIVEN the Director's model and its second model both fail while planning the next Stretch
  // THEN the Scene's end stops there: the World does not move on without the plan, and the line says the Director
  //   failed and why, with Retry and another model
  // WHEN the player taps Retry
  // THEN the Scene's end goes on from the Director, and the steps before it are not run again
  it("presence › Nothing fails silently › A step at a Scene's end fails", async () => {
    const { engine, storyId, head, play, path, view, events, models, mac } = playable(hogwartsStoryFile(), { director: [{ fail: "Fable 5.1 is overloaded" }, { fail: "GPT 6.1 Sol is at capacity" }] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);

    const failed = { step: "director", reason: expect.stringMatching(/Fable 5\.1 is overloaded.*GPT 6\.1 Sol is at capacity/), trace_id: expect.stringMatching(/^director-/) };
    expect(engine.sceneEndOf(storyId)).toEqual({ step: null, failed, rethinking: null });
    expect(view().day_view).toMatchObject({ scene_end: { step: null, failed }, happenings: [] });
    expect(events.at(-1)!.event).toMatchObject({ kind: "scene_end_failed", step: "director" });
    // The Outline was written; the plan after it failed on both models.
    expect(callsFor(mac.db, "director").map(call => call.model)).toEqual(["claude-fable-5-1", "claude-fable-5-1", "gpt-6.1-sol"]);
    // The World does not move on without the plan, and nothing the player does goes on without it.
    expect(afterClose(path())).toEqual(["scene_closed", "chronicle", "outline_set"]);
    expect(models.weaver.requests).toHaveLength(0);
    expect(() => engine.move(storyId, "I go up to bed.", head(), "t-move")).toThrow(expect.objectContaining({ code: "busy", message: expect.stringMatching(/Retry/) }));

    engine.retry(storyId, "trace-retry");
    await engine.ended(storyId);
    expect(engine.sceneEndOf(storyId)).toEqual({ step: null, failed: null, rethinking: null });
    expect(afterClose(path())).toEqual(["scene_closed", "chronicle", "outline_set", "director_plan", "world_moved"]);
    expect(models.chronicler.requests).toHaveLength(1);
    expect(models.outline.requests).toHaveLength(1);
    expect(models.director.requests).toHaveLength(3);
    expect(view().day_view!.happenings.length).toBeGreaterThan(0);
  });

  it("stops a manual Scene end at a failed step, and Retry lets the player open the next Scene", async () => {
    const next = writer(5, { frame: { title: "Lights out", place: "The boys' dormitory", purpose: "Ron asks.", exit: "He asks, or not." } });
    const { engine, storyId, head, play, path, view, models } = playable(hogwartsStoryFile(), {
      writer: [writer(0), next],
      chronicler: [{ fail: "Opus 5.5 is overloaded" }, { fail: "GPT 6.1 Sol is at capacity" }]
    });
    await play("I sit by the fire.");
    engine.endScene(storyId, head(), "manual-end");
    await engine.ended(storyId);
    expect(path().slice(-2).map(payload => payload.kind)).toEqual(["reply", "scene_closed"]);
    expect(view().day_view!.scene_end.failed).toMatchObject({ reason: expect.stringMatching(/overloaded/) });
    expect(() => engine.move(storyId, "I wait.", head(), "t-wait")).toThrow(expect.objectContaining({ code: "busy" }));

    engine.retry(storyId, "trace-retry");
    await engine.ended(storyId);
    await play("I go to my room.");
    const kinds = path().map(payload => payload.kind);
    expect(kinds.slice(kinds.lastIndexOf("move"))).toEqual(["move", "scene_opened", "beat_note", "reply"]);
    expect(view().scene).toMatchObject({ number: 2 });
    expect(view().turn).toEqual({ kind: "idle" });
    // The Writer is asked once per Move, with the manual Scene end completed between them.
    expect(models.writer.requests).toHaveLength(2);
  });

  it("runs a failed step on another model for one try when Retry names one, and changes no setting", async () => {
    const { engine, storyId, head, play, path, mac } = playable(hogwartsStoryFile(), { director: [{ fail: "Fable 5.1 is overloaded" }, { fail: "GPT 6.1 Sol is at capacity" }] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    engine.retry(storyId, "trace-retry", { provider: "codex", model: "gpt-6.1-sol" });
    await engine.ended(storyId);
    expect(callsFor(mac.db, "director").map(call => call.model)).toEqual(["claude-fable-5-1", "claude-fable-5-1", "gpt-6.1-sol", "gpt-6.1-sol"]);
    expect(plans(path()).at(-1)!.model).toEqual({ provider: "codex", model: "gpt-6.1-sol" });
    expect(jobModels(mac.home).director).toEqual({ provider: "claude", model: "claude-fable-5-1", effort: "high" });
  });

  // GIVEN the Weaver's model is down
  // WHEN a Scene ends
  // THEN the World moves on, written by the Weaver's second model, and nothing asks the player
  it("presence › Nothing fails silently › The second model steps in", async () => {
    const { engine, storyId, head, play, path, view, events, mac } = playable(hogwartsStoryFile(), { weaver: [{ fail: "Opus 5.5 is down" }] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(callsFor(mac.db, "weaver")).toEqual([{ provider: "claude", model: "claude-opus-5-5", effort: null }, { provider: "codex", model: "gpt-6.1-sol", effort: null }]);
    expect(path().at(-1)).toMatchObject({ kind: "world_moved", truth: emptyUpdate(), gap: false, model: { provider: "codex", model: "gpt-6.1-sol" } });
    expect(engine.sceneEndOf(storyId)).toEqual({ step: null, failed: null, rethinking: null });
    expect(view().day_view!.scene_end).toEqual({ step: null, failed: null, rethinking: null });
    expect(events.some(event => event.event.kind === "scene_end_failed")).toBe(false);
  });

  it("goes on with a Scene's end that had not finished when the Mac starts", async () => {
    const { play, engine, storyId, head, mac, path } = playable(hogwartsStoryFile(), { weaver: [{ fail: "The Mac was shut down" }, { fail: "The Mac was shut down" }] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(afterClose(path())).toEqual(["scene_closed", "chronicle", "outline_set", "director_plan"]);
    const restarted = new Engine(mac, new Models(mac.db, scriptedRunners(new FakeModels())));
    restarted.resumeAll();
    await restarted.ended(storyId);
    expect(afterClose(path())).toEqual(["scene_closed", "chronicle", "outline_set", "director_plan", "world_moved"]);
  });

  it("runs the Director on its model from the Models screen", async () => {
    const { mac, engine, storyId, head, play } = playable(hogwartsStoryFile());
    setJobModel(mac.home, "director", { provider: "codex", model: "gpt-6.1-sol", effort: "high" });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    // The Outline, then the Stretch.
    expect(callsFor(mac.db, "director")).toEqual([{ provider: "codex", model: "gpt-6.1-sol", effort: "high" }, { provider: "codex", model: "gpt-6.1-sol", effort: "high" }]);
  });
});

describe("the record of a Scene (openspec living-world: Moments are remembered from one record)", () => {
  const move = "I catch you as everything floats.";
  const classroom = (bond?: string) => {
    const story = hogwartsStoryFile({ title: "Twenty-nine minutes", place: "An empty classroom", who: ["Draconia Malfoy"], prose: "Draconia sets out her notes." });
    if (bond) story.people = story.people.map(person => person.name === "Draconia Malfoy" ? { ...person, bond } : person) as StoryFile["people"];
    return story;
  };
  const caught = { what: "He catches her as everything floats.", quotes: [{ entry: "P2", text: move }], there: ["Draconia Malfoy"], weight: 4 };

  // GIVEN a Scene in which Draconia floated in his arms, and the record's line for what he knows of her comes back
  //   too long twice
  // THEN that Scene's Moments and summary are kept, and what he knew of her before stays as it was
  it("living-world › Moments are remembered from one record › One bad part does not lose the Scene", async () => {
    const summary = "In the classroom Draconia floated in his arms and ordered him to put her down.";
    const tooLong = chronicle({ summary, moments: [caught], known: [{ who: "Draconia Malfoy", now: "word ".repeat(70).trim() }] });
    const { play, engine, storyId, head, path, state, models } = playable(classroom(), { chronicler: [tooLong, tooLong] });
    const before = state().known["Draconia Malfoy"];
    await play(move);
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const [record] = chronicles(path());
    expect(record).toMatchObject({ summary });
    expect(record!.moments.map(moment => moment.what)).toEqual(["He catches her as everything floats."]);
    expect(record!.dropped).toEqual(["known: the line for Draconia Malfoy is 70 words; say it in forty-five or fewer"]);
    expect(state().known["Draconia Malfoy"]).toEqual(before);
    expect(state().recorded).toEqual([{ number: 1, title: "Twenty-nine minutes", summary, dropped: record!.dropped }]);
    // Left out, not asked again.
    expect(models.chronicler.requests).toHaveLength(1);
  });

  // GIVEN the record of the library Scene could not be made, on its model or on the second one
  // THEN the Scene's end stops at the record, says why, and offers Retry; the World does not move on without it
  // WHEN the player taps Retry and the record is made
  // THEN the Scene's end goes on from there, and the next Scene is recorded in its turn
  it("living-world › Moments are remembered from one record › A Scene that could not be recorded does not block the rest", async () => {
    const library = hogwartsStoryFile({ title: "The library", place: "The library", who: ["Hermione Granger"], prose: "Hermione is at the end table." });
    const { play, engine, storyId, head, path, state, view, models } = playable(library, { chronicler: [{ fail: "Sonnet is overloaded" }, { fail: "Sonnet is overloaded" }] });
    await play("I ask Hermione about the essay.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(view().day_view!.scene_end).toEqual({ step: null, failed: { step: "chronicler", reason: expect.stringMatching(/Sonnet is overloaded/), trace_id: expect.stringMatching(/^chronicler-/) }, rethinking: null });
    expect(afterClose(path())).toEqual(["scene_closed"]);
    expect(models.director.requests).toHaveLength(0);
    expect(models.weaver.requests).toHaveLength(0);

    engine.retry(storyId, "trace-retry");
    await engine.ended(storyId);
    expect(afterClose(path())).toEqual(["scene_closed", "chronicle", "outline_set", "director_plan", "world_moved"]);
    expect(state().recorded.map(row => row.title)).toEqual(["The library"]);

    await play("In the morning I go down to breakfast.");
    engine.endScene(storyId, head(), "end-2");
    await engine.ended(storyId);
    expect(state().recorded.map(row => [row.number, row.title])).toEqual([[1, "The library"], [2, "The next Scene"]]);
  });

  // GIVEN Draconia's Bond says she bills him for the slap and keeps him on her terms
  // WHEN a Scene ends in which she floated in his arms and ordered him to put her down, and did not thank him
  // THEN her Bond has a turn for that Scene, and where things stand says she let him hold her before she remembered to
  //   refuse it
  it("living-world › Where things stand between him and each person is kept › A turn in the classroom", async () => {
    const before = "She bills him for the slap and keeps him on her terms.";
    const standing = "She bills him for the slap and keeps him on her terms, but she let him hold her before she remembered to refuse it.";
    const turn = "She floated in his arms, ordered him to put her down, and did not thank him.";
    const { play, engine, storyId, head, mac, state, models } = playable(classroom(before), { chronicler: [chronicle({ moments: [caught], bonds: [{ who: "Draconia Malfoy", standing, turn }] })] });
    await play(move);
    const beforeTheEnd = head();
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    // The Chronicler was shown where things stood, to rewrite it.
    expect(models.chronicler.requests[0]!.prompt).toContain(`Draconia Malfoy\n  What Roopesh Gantasala knows of them: nothing yet\n  Where things stand: ${before}`);
    expect(state().bonds["Draconia Malfoy"]).toEqual({ standing, turns: [{ text: turn, scene: { number: 1, title: "Twenty-nine minutes" } }] });
    // Another Path, from before the Scene ended, is as it was.
    const other = mac.tree.createPath(storyId, "Elsewhere", beforeTheEnd, false);
    expect(mac.states.at(other.headEntryId).bonds["Draconia Malfoy"]).toEqual({ standing: before, turns: [] });
  });

  // WHEN the record's turn with Draconia comes back 29 words long, where 25 were asked
  // THEN it is kept as written
  it("living-world › Moments are remembered from one record › A line a little long is kept", async () => {
    const turn = "She floated in his arms, ordered him to put her down, and did not even thank him; she straightened his collar instead, as if that settled what was owed.";
    expect(turn.split(/\s+/)).toHaveLength(29);
    const { play, engine, storyId, head, path, state, models } = playable(classroom(), { chronicler: [chronicle({ moments: [caught], bonds: [{ who: "Draconia Malfoy", standing: "She lets him close, and calls it business.", turn }] })] });
    await play(move);
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(chronicles(path())[0]!.dropped).toEqual([]);
    expect(state().bonds["Draconia Malfoy"]!.turns.at(-1)!.text).toBe(turn);
    expect(models.chronicler.requests).toHaveLength(1);
  });
});

describe("what the World may write (openspec living-world)", () => {
  /** The night after curfew, the World moving on with [answers] in turn. */
  async function night(answers: Script[], landmarks: { name: string; at: string; what: string }[] = []) {
    const story = afterCurfew();
    story.landmarks = [...(story.landmarks ?? []), ...landmarks];
    const played = playable(story, { weaver: answers });
    await played.play("I say goodnight to Hermione and go up.");
    played.engine.endScene(played.storyId, played.head(), "end");
    await played.engine.ended(played.storyId);
    return played;
  }

  // GIVEN the Triwizard Tournament is a Landmark in Year 3 and Draconia still hates the Player Character
  // WHEN Year 3 arrives on the Path
  // THEN the Tournament begins
  it("living-world › Landmarks arrive on their date › The Triwizard comes anyway", async () => {
    const tournament = { name: "the Triwizard Tournament", at: "Day 4 06:00", what: "The Goblet of Fire is lit in the Great Hall." };
    const begins = weave({ happened: [{ id: "H1", what: "The Goblet of Fire was lit in the Great Hall; the Tournament began.", at: "Day 4 06:00", where: "the Great Hall", known_to: [], landmark: "the Triwizard Tournament", move: null, missed: null }] });
    const { models, state, view } = await night([weave(), begins], [tournament]);
    expect(models.weaver.requests[1]!.prompt).toContain("happened: the Triwizard Tournament falls in the span (Saturday 7 September 1991, 6:00 am) and has not happened; write it, with landmark set to its name");
    expect(state().facts.filter(fact => fact.landmark)).toEqual([expect.objectContaining({ landmark: "the Triwizard Tournament", at: "Day 4 06:00" })]);
    expect(view().day_view!.scene_end).toEqual({ step: null, failed: null, rethinking: null });
  });

  // GIVEN Crabbe and Goyle are a Group
  // WHEN a day passes off-screen
  // THEN Backstage shows one Life for them together, such as running Draconia's errands
  it("living-world › Everyone has a Life › A Group lives as one", async () => {
    const crabbeAlone = weave({ lives: [{ who: "Vincent Crabbe", where: "the kitchens", doing: "eating", after: "pudding" }] });
    const together = weave({ lives: [{ who: "Crabbe and Goyle", where: "the Slytherin common room", doing: "running Draconia's errands", after: "Draconia's errands, and whatever she wants hit." }] });
    const { models, mac, storyId, state } = await night([crabbeAlone, together]);
    // The Group is the one the World is given to live; its members, away from the Scene, are not.
    const who = (models.weaver.requests[0]!.schema as { properties: { lives: { items: { properties: { who: { enum: string[] } } } } } }).properties.lives.items.properties.who.enum;
    expect(who).toContain("Crabbe and Goyle");
    expect(who).not.toContain("Vincent Crabbe");
    // A Life written for one of them is theirs together.
    const lives = Object.keys(state().lives).filter(name => ["Crabbe and Goyle", "Vincent Crabbe", "Gregory Goyle"].includes(name));
    expect(lives).toEqual(["Crabbe and Goyle"]);
    expect(backstageView(mac, storyId, "t").lives.filter(life => life.who.includes("Crabbe"))).toEqual([expect.objectContaining({ who: "Crabbe and Goyle" })]);
  });

  // GIVEN Quirrell tested the third-floor door overnight and nobody saw him
  // THEN Meanwhile says nothing about it
  // AND Backstage shows it
  it("day-view › Meanwhile shows only what the Player Character knows › Quirrell's night stays hidden", async () => {
    const hidden = weave({
      threads: [{ name: "Quirrell and the third-floor door", now: "He has tried the wards twice and scorched the door" }],
      happened: [{ id: "H1", what: "Quirrell tested the third-floor door and scorched it.", at: "Day 4 02:00", where: "the third-floor corridor", known_to: ["Quirinus Quirrell"], landmark: null, move: null, missed: null }]
    });
    const { view, mac, storyId, state } = await night([hidden]);
    expect(view().day_view).toMatchObject({ scene_end: { step: null, failed: null }, meanwhile: [] });
    expect(state().facts.find(fact => fact.what.startsWith("Quirrell tested"))!.knownTo).toEqual(["Quirinus Quirrell"]);
    expect(state().threads.find(thread => thread.name === "Quirrell and the third-floor door")!.now).toMatch(/scorched the door/);
    const backstage = backstageView(mac, storyId, "t");
    expect(backstage.offscreen.flatMap(day => day.items)).toEqual([{ time: "2:00 am", what: "Quirrell tested the third-floor door and scorched it.", known_to: ["Quirinus Quirrell"] }]);
  });

  // GIVEN Quirrell has spent weeks testing the third-floor wards off-screen
  // WHEN the Player Character finds the scorched door
  // THEN the player learns of it there, in the Scene, for the first time
  it("living-world › The background reaches the player only through the Story › Discovering Quirrell", async () => {
    const hidden = weave({
      threads: [{ name: "Quirrell and the third-floor door", now: "Weeks of testing the wards; the door is scorched" }],
      happened: [{ id: "H1", what: "Quirrell tested the wards on the third-floor door again and scorched it.", at: "Day 4 02:00", where: "the third-floor corridor", known_to: ["Quirinus Quirrell"], landmark: null, move: null, missed: null }]
    });
    const scorched = writer(10, { frame: { title: "The long way", place: "The third-floor corridor", purpose: "p", exit: "e" }, note: "The third-floor door is scorched black around the lock, still warm.", intensity: 3 });
    const played = playable(afterCurfew(), { weaver: [hidden], writer: [writer(10), scorched] });
    await played.play("I say goodnight to Hermione and go up.");
    played.engine.endScene(played.storyId, played.head(), "end");
    await played.engine.ended(played.storyId);
    expect(played.view().day_view!.meanwhile).toEqual([]);

    await played.play("Before breakfast I take the long way, past the third floor.");
    const writerPrompt = played.models.writer.requests.at(-1)!.prompt;
    expect(writerPrompt).toContain("Quirrell tested the wards on the third-floor door again and scorched it. Known to Quirinus Quirrell.");
    const actor = played.models.actor.requests.at(-1)!;
    expect(`${actor.system}\n${actor.prompt}`).toContain("Quirrell tested the wards"); // The author receives the fact with who knows it.
    expect(actor.prompt).toContain("The third-floor door is scorched black around the lock, still warm.");
  });
});

describe("the Director at a Scene's end (openspec long-run)", () => {
  // GIVEN the Director planned a Stretch from Monday to Sunday, building toward the flying test on Saturday, with
  //   three Scenes that matter
  // WHEN the first of them, on Tuesday, ends without peaking
  // THEN the Director plans nothing new, and the Day View leads with the Stretch's next Scene
  it("long-run › The Director shapes the long run around Arcs and Landmarks › A stretch that has not run its course", async () => {
    // Monday night, Day 6: Day 1 was a Wednesday.
    const story = hogwartsStoryFile({ title: "Monday night", place: "The Gryffindor common room", at: "Day 6 21:40" });
    const week = plan([
      { date: "1991-09-10", time: "16:00", place: "The Charms classroom", who: ["Draconia Malfoy"], lead: "Draconia Malfoy", headline: "Charms: she is paired with him and hates it" },
      { date: "1991-09-12", time: "14:00", place: "The library", who: ["Hermione Granger"], lead: "Hermione Granger", headline: "The library: Hermione's flying notes" },
      { date: "1991-09-14", time: "10:00", place: "The Quidditch pitch", who: ["Draconia Malfoy"], lead: "Draconia Malfoy", headline: "The flying test" }
    ], { days: 6, toward: "the flying test on Saturday" });
    const { engine, storyId, head, play, view, state, models } = playable(story, { director: [week] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-monday");
    await engine.ended(storyId);
    expect(models.director.requests).toHaveLength(1);
    expect(state().plan).toMatchObject({ from: 6, until: 11, toward: "the flying test on Saturday" });
    const [tuesday, thursday] = state().plan!.scenes;

    // Tuesday's Scene that matters, chosen and played, ends quietly: two are still ahead, and nothing is planned.
    engine.choose(storyId, { after: head(), kind: "story", happening: null, gap: null }, "go");
    await engine.settled(storyId);
    expect(state().scene).toMatchObject({ number: 2, at: "Day 7 16:00", place: "The Charms classroom" });
    engine.endScene(storyId, head(), "end-tuesday");
    await engine.ended(storyId);
    expect(state().played).toEqual([tuesday!.id]);
    expect(models.director.requests).toHaveLength(1);
    expect(view().day_view!.happenings[0]).toMatchObject({ scene: thursday!.id, at: "Day 9 14:00", place: "The library", pick: true });
  });

  // GIVEN the Stretch's next Scene that matters is Draconia at breakfast on Monday
  // WHEN the player skips to Tuesday instead
  // THEN the Director plans again from where the Story now stands
  it("long-run › The Director shapes the long run around Arcs and Landmarks › Off the plan", async () => {
    // Friday night; Monday is Day 6, three days on.
    const week = plan([
      { date: "1991-09-09", time: "08:00", place: "The Great Hall", who: ["Draconia Malfoy"], lead: "Draconia Malfoy", headline: "Breakfast: Draconia sits down opposite him" },
      { date: "1991-09-10", time: "15:00", place: "The library", who: ["Hermione Granger"], lead: "Hermione Granger" }
    ]);
    // From the Day View at 9:42 pm on Friday, his Move takes him to Tuesday morning by the lake.
    const tuesday = writer(5058, { frame: { title: "The lake", place: "The Black Lake", purpose: "p", exit: "e" } });
    const { engine, storyId, head, play, state, models } = playable(hogwartsStoryFile(), { director: [week], writer: [writer(2), tuesday] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-friday");
    await engine.ended(storyId);
    const monday = state().plan!.scenes[0]!;
    expect(monday).toMatchObject({ at: "Day 6 08:00", place: "The Great Hall" });

    await play("On Tuesday morning I walk down to the lake alone.");
    expect(state().scene).toMatchObject({ number: 2, at: "Day 7 10:00" });
    engine.endScene(storyId, head(), "end-tuesday");
    await engine.ended(storyId);
    expect(models.director.requests).toHaveLength(2);
    expect(models.director.requests[1]!.prompt).toContain("The player went off the plan: Breakfast: Draconia sits down opposite him (Monday 9 September 1991, 8:00 am) passed without him. Plan from where the story now is. Plan the next Stretch, from today, Tuesday 10 September 1991.");
    expect(state().plan).toMatchObject({ number: 2, from: 7, afterScene: 2 });
  });

  it("gives the plan to the Writer and the Weaver, and to no other agent", async () => {
    const week = plan([{ date: "1991-09-07", time: "10:00", place: "The Quidditch pitch", who: ["Draconia Malfoy"], lead: "Draconia Malfoy", for: "A step toward the test." }], { toward: "the flying test on Wednesday" });
    const { engine, storyId, head, play, models } = playable(hogwartsStoryFile(), { director: [week] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-1");
    await engine.ended(storyId);
    await play("I go down to breakfast.");
    engine.endScene(storyId, head(), "end-2");
    await engine.ended(storyId);
    const given = (agent: string, words: string) => models.requests.filter(request => request.agent === agent).some(request => `${request.system}\n${request.prompt}`.includes(words));
    expect(given("actor", "the flying test on Wednesday")).toBe(true);
    expect(given("actor", "A step toward the test.")).toBe(true);
    expect(given("weaver", "A step toward the test.")).toBe(true);
    for (const agent of ["chronicler"]) {
      expect(given(agent, "the flying test on Wednesday"), agent).toBe(false);
      expect(given(agent, "A step toward the test."), agent).toBe(false);
    }
  });

  // GIVEN the Scene where Draconia chose the Player Character in front of her House just ended
  // THEN the Story's own pick at the Day View is a quiet Happening
  it("long-run › Rest is deliberate › A quiet pick after a peak", async () => {
    const { engine, storyId, head, play, view, state, models } = playable(hogwartsStoryFile(), { writer: [peaked] });
    await play("I tell her what I am, in front of her whole House.");
    engine.endScene(storyId, head(), "end-peak");
    await engine.ended(storyId);
    // The Director is told the Scene peaked, and plans before the World moves on.
    expect(state().curve).toEqual([{ scene: 1, title: "After curfew", peak: 5 }]);
    expect(models.director.requests[0]!.facts).toMatchObject({ afterPeak: true });
    expect(models.director.requests[0]!.prompt).toContain("There is no plan yet: this is the Story's first.");
    const first = state().plan!.scenes[0]!;
    expect(first.quiet).toBe(true);
    expect(view().day_view!.happenings[0]).toMatchObject({ scene: first.id, pick: true, what: first.offer });
  });

  // GIVEN a Scene just peaked, and the Director's new Stretch is a rest whose next Scene that matters is a quiet
  //   breakfast on Monday
  // THEN the Story's own pick at the Day View is Monday's breakfast, and the World moves on at the first answer that
  //   offers it
  it("long-run › Rest is deliberate › The rest the Director planned", async () => {
    // A plan already stands; the second Scene peaks, and the Director plans a rest.
    const rest = plan([
      { date: "1991-09-09", time: "08:00", place: "The Great Hall", who: ["Hermione Granger"], for: "Breakfast, and nothing at stake.", offer: "Breakfast in the Great Hall.", headline: "Monday breakfast", quiet: true },
      { date: "1991-09-10", time: "15:00", place: "The Quidditch pitch", who: ["Draconia Malfoy"], lead: "Draconia Malfoy" }
    ], { phase: "rest", toward: "the flying test" });
    const { engine, storyId, head, play, view, state, models } = playable(hogwartsStoryFile(), { writer: [{ from: fakeWriterAnswer }, peaked], director: [plan([{}]), rest] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-1");
    await engine.ended(storyId);
    await play("I tell Draconia, in front of her whole House, what I am.");
    engine.endScene(storyId, head(), "end-peak");
    await engine.ended(storyId);
    expect(models.director.requests).toHaveLength(2);
    expect(models.director.requests[1]!.prompt).toContain("peaked: give the characters a breath, then build again.");
    expect(state().plan).toMatchObject({ phase: "rest" });
    // Monday is Day 6 (Day 1 was a Wednesday).
    expect(view().day_view!.happenings[0]).toMatchObject({ at: "Day 6 08:00", time: "Monday 8:00 am", place: "The Great Hall", what: "Breakfast in the Great Hall.", pick: true });
    // The World moved on at its first answer, once at each Scene's end.
    expect(models.weaver.requests).toHaveLength(2);
    expect(models.weaver.requests[1]!.prompt).toContain("Breakfast, and nothing at stake.");
  });

  // GIVEN Draconia saw him hold Hermione in the Great Hall
  // WHEN the next Stretch is planned
  // THEN Draconia's move in it acts on that, on screen or off: she claims him, or moves against Hermione
  // (What her move is, is the live check's; here, that the Director is given what she saw, and gives her a move.)
  it("long-run › Leads act every Stretch › Jealousy acted on", async () => {
    const story = hogwartsStoryFile({ title: "Breakfast", place: "The Great Hall", at: "Day 4 08:00", who: ["Hermione Granger", "Draconia Malfoy"], prose: "The Great Hall is loud with Saturday." });
    const hug = "She saw him hold Hermione in the Great Hall, and left her breakfast where it was.";
    const move = "I hold Hermione when she starts to cry.";
    const record = chronicle({
      summary: "He held Hermione in the Great Hall, and Draconia saw.",
      paragraph: "At breakfast he held Hermione when she cried, and Draconia, watching from the Slytherin table, left her breakfast where it was.",
      moments: [{ what: "He holds Hermione.", quotes: [{ entry: "P2", text: move }], there: ["Hermione Granger", "Draconia Malfoy"], weight: 4 }],
      bonds: [{ who: "Draconia Malfoy", standing: "She calls him Stray and watches who he holds.", turn: hug }]
    });
    const { engine, storyId, head, play, state, models } = playable(story, { chronicler: [record] });
    await play(move);
    engine.endScene(storyId, head(), "end-hug");
    await engine.ended(storyId);
    const prompt = models.director.requests[0]!.prompt;
    expect(prompt).toContain(`Draconia Malfoy and Roopesh Gantasala, as he has seen it: She calls him Stray and watches who he holds.\n  Scene 1: ${hug}`);
    expect(prompt).toContain("Draconia, watching from the Slytherin table, left her breakfast where it was.");
    expect(state().plan!.leads.map(lead => lead.who)).toEqual(["Draconia Malfoy", "Hermione Granger"]);
  });

  // GIVEN the Story has three Leads
  // WHEN four Stretches are planned
  // THEN in at least one of them a Lead's move is made off-screen, and a Scene that matters is about none of the
  //   Leads
  // (That the Director plans so is the live check's; here, that such a plan is taken as it is, and its moves off-screen
  // are handed to the World to make.)
  it("long-run › Leads act every Stretch › Not one Scene per Lead", async () => {
    const story = hogwartsStoryFile();
    story.leads = ["Draconia Malfoy", "Hermione Granger", "Harry Potter"];
    const stretch = plan([
      { date: "1991-09-07", time: "10:00", place: "The Charms classroom", who: ["Draconia Malfoy"], lead: "Draconia Malfoy" },
      { date: "1991-09-08", time: "15:00", place: "The greenhouses", who: ["Neville Longbottom"], lead: null, for: "Neville's Mimbulus finally flowers." }
    ], { arcs: story.arcs!.map(arc => ({ arc, now: "where it was", next: "a step", not_yet: "anything declared" })), leads: [
      { who: "Draconia Malfoy", move: "Corners him after Charms.", scene: "S1" },
      { who: "Hermione Granger", move: "Asks Ron, not him, to the study group.", scene: null },
      { who: "Harry Potter", move: "Tells Wood he saw him fly.", scene: null }
    ] });
    const { engine, storyId, head, play, path, state, models, mac } = playable(story, { director: [stretch] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(models.director.requests).toHaveLength(1);
    expect(plans(path())[0]!.dropped).toEqual([]);
    expect(state().plan!.scenes.map(scene => scene.lead)).toEqual(["Draconia Malfoy", null]);
    expect(models.weaver.requests[0]!.prompt).toContain("<lead_moves_offscreen>\n- Hermione Granger: Asks Ron, not him, to the study group.\n- Harry Potter: Tells Wood he saw him fly.\n</lead_moves_offscreen>");
    expect(state().facts.filter(fact => fact.move).map(fact => fact.move)).toEqual(["Hermione Granger", "Harry Potter"]);
    expect(backstageView(mac, storyId, "t").director!.stretch!.leads.map(lead => [lead.who, lead.on_screen])).toEqual([["Draconia Malfoy", true], ["Hermione Granger", false], ["Harry Potter", false]]);
  });
});

describe("someone new in the Story (openspec stories: The Director can bring someone new into the Story)", () => {
  const elspeth = { name: "Elspeth Vane", who_they_are: "A seventh-year who runs the Hogsmeade duelling club.", appearance: "Tall, with a duelling scar through one eyebrow." };
  // Nothing enters without a payoff (openspec the-outline): the Outline means to pay off whoever runs the duelling club.
  const theClub = { id: "U2", what: "Whoever runs the Hogsmeade duelling club.", planted: null, payoff: "The club is where he learns who hired the masked wizards.", turn: "T2", state: "waiting" };
  const secret = { id: "U3", what: "The duelling club meets where it should not.", planted: null, payoff: "The room it meets in is the Room of Requirement.", turn: "T2", state: "waiting" };
  /** The scripted Director's Outline, with the club and its secret among the setups to bring in. */
  const withTheClub: Script = { from: request => {
    const outline = JSON.parse((fakeOutlineAnswer(request) as { answer: string }).answer) as { setups: object[] };
    return { answer: JSON.stringify({ ...outline, setups: [...outline.setups.filter(setup => !["U2", "U3"].includes((setup as { id: string }).id)), theClub, secret] }) };
  } };
  const bringsHer = plan([{ date: "1991-09-07", time: "14:00", place: "The Hogsmeade duelling club", who: [], offer: "The duelling club is taking names.", headline: "Hogsmeade: Elspeth Vane's duelling club" }],
    { new: [{ setup: "U2", kind: "person", scene: "S1", person: elspeth }] });
  const club = { title: "The duelling club", place: "The Hogsmeade duelling club", purpose: "p", exit: "e" };

  // GIVEN the Director brings in Elspeth Vane, a seventh-year who runs the Hogsmeade duelling club
  // WHEN the player meets her, and she comes up again three Stretches later
  // THEN she is the same person, with what passed between them remembered
  it("stories › The Director can bring someone new into the Story › A new person stays", async () => {
    const list = "Elspeth Vane writes his name at the top of the list. \"Thursday. Don't be late.\"";
    // The second plan brings her in again, with something else new: she is already in the Story, and is not.
    const again = plan([{ date: "1991-09-09", time: "10:00", place: "The Great Hall", who: ["Elspeth Vane"] }], { new: [
      { setup: "U2", kind: "person", scene: null, person: elspeth },
      { setup: "U3", kind: "secret", scene: null, person: null }
    ] });
    const { engine, storyId, head, play, state, models } = playable(hogwartsStoryFile(), {
      director: [bringsHer, again],
      writer: [writer(2), writer(0, { frame: club, comes_in: ["Elspeth Vane"], intensity: 5 }), writer(60, { frame: { ...club, title: "Thursday" }, comes_in: ["Elspeth Vane"] })],
      actor: [{ answer: "She looks at you, and waits." }, { answer: list }],
      chronicler: [chronicle(), chronicle({
        summary: "He put his name down for Elspeth Vane's duelling club.",
        moments: [{ what: "Elspeth Vane puts him at the top of her list.", quotes: [{ entry: "P2", text: list }], there: ["Elspeth Vane"], weight: 3 }],
        bonds: [{ who: "Elspeth Vane", standing: "She has put him at the top of her list, and expects him Thursday.", turn: "She wrote his name first." }]
      })]
    });
    models.outline.then(withTheClub);
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-1");
    await engine.ended(storyId);
    expect(state().people["Elspeth Vane"]).toMatchObject({ whoTheyAre: elspeth.who_they_are, broughtIn: 1 });

    // He meets her: the Story's pick is her club.
    engine.choose(storyId, { after: head(), kind: "story", happening: null, gap: null }, "go");
    await engine.settled(storyId);
    expect(state().scene).toMatchObject({ number: 2, here: ["Elspeth Vane"] });
    const met = models.actor.requests.at(-1)!;
    expect(`${met.system}\n${met.prompt}`).toContain(`Elspeth Vane (new to the Story: ${elspeth.who_they_are.replace(/\.$/, "")})`);
    engine.endScene(storyId, head(), "end-2");
    await engine.ended(storyId);
    // The next Stretch does not bring her in again.
    expect(models.director.requests).toHaveLength(2);
    expect(Object.keys(state().people).filter(name => name === "Elspeth Vane")).toHaveLength(1);
    expect(state().people["Elspeth Vane"]!.broughtIn).toBe(1);
    expect(state().introduced.map(item => [item.stretch, item.kind])).toEqual([[1, "person"], [2, "secret"]]);

    // She comes up again later: the same person, and what passed between them is remembered.
    await play("On Thursday I go to the duelling club.");
    const actor = models.actor.requests.at(-1)!;
    expect(`${actor.system}\n${actor.prompt}`).toContain(`Elspeth Vane (new to the Story: ${elspeth.who_they_are.replace(/\.$/, "")})`);
    expect(actor.prompt).toContain("Elspeth Vane and Roopesh Gantasala, as he has seen it: She has put him at the top of her list, and expects him Thursday.");
    expect(actor.prompt).toContain(`(Scene 2; known to Roopesh Gantasala, Elspeth Vane): Elspeth Vane puts him at the top of her list.\n  "${list}"`);
  });

  // GIVEN Elspeth Vane was brought in by the plan after Scene 12
  // WHEN the player goes back to Scene 10 and plays another way
  // THEN she is not among the Story's people on that Path, until a plan there brings her in
  it("stories › The Director can bring someone new into the Story › Not on another Path", async () => {
    const { engine, storyId, head, play, state, mac, models } = playable(hogwartsStoryFile(), { director: [bringsHer, bringsHer] });
    // The Outline is written at the first Scene's end, on each Path.
    models.outline.then(withTheClub, withTheClub);
    await play("I say goodnight.");
    const reply = head();
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(state().people["Elspeth Vane"]).toBeDefined();

    // Back to the Reply before the Scene ended: the plan, and she, are off the Path.
    engine.rewind(storyId, reply, head(), "rewind");
    expect(head()).toBe(reply);
    expect(state().people["Elspeth Vane"]).toBeUndefined();
    expect(state().plan).toBeNull();
    expect(state().outline).toBeNull();
    // The Path set aside still has her.
    const aside = mac.tree.paths(storyId).find(path => !path.isCurrent)!;
    expect(mac.states.at(aside.headEntryId).people["Elspeth Vane"]).toBeDefined();

    // A plan on this Path brings her in.
    await play("I stay a moment longer.");
    engine.endScene(storyId, head(), "end-again");
    await engine.ended(storyId);
    expect(state().people["Elspeth Vane"]).toMatchObject({ broughtIn: 1 });
  });
});

describe("The Story So Far follows the Path (openspec living-world: Every agent knows the Story So Far)", () => {
  // GIVEN the player goes back to Scene 6 and plays another way
  // THEN every agent on that Path is given The Story So Far as it stood after Scene 5, and nothing from the Scenes
  //   left behind
  it("living-world › Every agent knows the Story So Far › Back to an earlier Scene", async () => {
    const told = { one: "Hermione closed her book without a word.", two: "Breakfast went badly, and everyone saw.", three: "The library was shut for the night.", again: "Breakfast went another way." };
    const opens = (title: string, place: string, minutes: number) => writer(minutes, { frame: { title, place, purpose: "p", exit: "e" }, comes_in: ["Hermione Granger"] });
    const { engine, storyId, head, play, mac, models } = playable(hogwartsStoryFile(), {
      writer: [writer(2), opens("Breakfast", "The Great Hall", 600), writer(2), opens("The library", "The library", 300), writer(2, { intensity: 5 })],
      chronicler: [chronicle({ paragraph: told.one }), chronicle({ paragraph: told.two }), chronicle({ paragraph: told.three }), chronicle({ paragraph: told.again })]
    });
    const endScene = async () => {
      engine.endScene(storyId, head(), `end-${head()}`);
      await engine.ended(storyId);
    };
    await play("I sit down by the fire.");
    await endScene();
    await play("In the morning I go down to breakfast.");
    const firstReplyOfScene2 = head();
    await play("I sit beside Hermione.");
    await endScene();
    await play("At noon I go to the library.");
    await endScene();
    expect(mac.states.at(head()).storySoFar.scenes.map(part => part.text)).toEqual([told.one, told.two, told.three]);

    // Back to the second Scene, and another way.
    engine.rewind(storyId, firstReplyOfScene2, head(), "rewind");
    const before = models.requests.length;
    await play("I sit as far from Hermione as I can.");
    await endScene();
    const asked = models.requests.slice(before);
    // Every agent that worked on this Path was given the Story as it stood: the Director too, reconsidering the Outline
    // and, since the Scene peaked, planning the next Stretch.
    expect(asked.map(request => request.agent)).toEqual(["actor", "editor", "chronicler", "director", "director", "weaver"]);
    for (const request of asked) {
      const given = `${request.system}\n${request.prompt}`;
      expect(given, request.agent).toContain(told.one);
      expect(given, request.agent).not.toContain(told.two);
      expect(given, request.agent).not.toContain(told.three);
    }
    expect(mac.states.at(head()).storySoFar.scenes.map(part => part.text)).toEqual([told.one, told.again]);
  });
});
