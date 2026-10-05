import { describe, expect, it } from "vitest";
import { Engine, type OutgoingEvent } from "../../src/engine/engine.js";
import { FakeModels } from "../../src/models/fake.js";
import { Models, type ModelRunner } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import type { WorldMoved } from "../../src/story/entries.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { sceneView } from "../../src/views/scene.js";
import { worldOn } from "../../src/story/world.js";
import { freshHome } from "../support/host.js";
import { GatedRunner } from "../support/link.js";
import { hogwartsWorldStoryFile, writeStoryFile } from "../support/story-files.js";
import { playable } from "../support/play.js";

/** The Weaver's answer for the night after curfew: McGonagall's note, which Roopesh finds when he wakes. */
const noteUnderTheDoor = {
  lives: [{ who: "Minerva McGonagall", where: "her office", doing: "waiting for accounts of the troll", after: "The truth about the troll" }],
  threads: [],
  happened: [{ id: "H1", what: "McGonagall slid a note under Roopesh's door.", at: "Day 4 06:45", where: "the boys' dormitory", known_to: ["Minerva McGonagall", "Roopesh Gantasala"], landmark: null }],
  meanwhile: [{ text: "A note under the door: \"My office, nine o'clock.\" M. McGonagall.", how: "seen", happened: "H1", told_by: null }]
};

/** The common room after curfew, on models where the Chronicler is held until the test lets it go. */
function afterCurfew(weaver: ModelRunner = new ScriptedRunner([{ answer: JSON.stringify(noteUnderTheDoor) }])) {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] })), mac);
  if (!imported.ok) throw new Error("import failed");
  const fake = new FakeModels();
  const chronicler = new GatedRunner([JSON.stringify({ summary: "Roopesh said goodnight.", moments: [], told: [] })]);
  const runners: Record<string, ModelRunner> = { chronicler, weaver };
  const engine = new Engine(mac, new Models(mac.db, { claude: { run: (request, onText, signal) => (runners[request.agent] ?? fake).run(request, onText, signal) } }));
  const storyId = imported.storyId;
  const events: OutgoingEvent[] = [];
  engine.subscribe(storyId, event => events.push(event));
  const head = () => mac.tree.currentPath(storyId)!.headEntryId;
  const view = () => sceneView(mac, engine, storyId, "trace-view");
  const play = async (move: string) => { engine.move(storyId, move, head(), "trace-move"); await engine.settled(storyId); };
  return { mac, engine, storyId, events, head, view, play, chronicler };
}

describe("the Weaver at a Scene's end", () => {
  // WHEN the player ends a Scene
  // THEN a single line says the Scene is being recorded and the World is moving on, until the Day View is ready
  it("presence › Between Scenes is quiet, and shows progress › The World moves on", async () => {
    const { mac, engine, storyId, events, head, view, play, chronicler } = afterCurfew();
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "trace-end");
    expect(view().day_view).toMatchObject({ world: "moving_on", meanwhile: [], failure: null, at: "Day 4 07:30" });
    await engine.woven(storyId);
    // Ready while the Chronicler is still writing: only the Day View waits, and only for the Weaver.
    expect(view().day_view).toMatchObject({ world: "ready", meanwhile: [{ text: "A note under the door: \"My office, nine o'clock.\" M. McGonagall.", how: "seen" }], failure: null });
    expect(events.map(event => event.event.kind)).toContain("world_moved");
    const [record] = mac.tree.recordsOn(head(), "world_moved");
    expect(record!.payload as WorldMoved).toMatchObject({ from: "Day 3 22:40", until: "Day 4 07:30", lives: [{ who: "Minerva McGonagall" }] });
    expect(mac.tree.entry(record!.parentId!)!.payload.kind).toBe("scene_closed");
    chronicler.release();
    await engine.chronicled(storyId);
    expect(mac.tree.recordsOn(head(), "chronicle")).toHaveLength(1);
  });

  it("moves the World on when the Story closes a Scene, and when a Move leaves one, up to the next Scene's start", async () => {
    const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
    const writer = (changes: Record<string, unknown>) => ({ answer: JSON.stringify({ leaves_scene: false, frame: { title: "kept", place: "kept", purpose: "p", exit: "e" }, comes_in: [], goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, clock: "Day 3 21:50", taste: null, in_play: [], ...changes }) });
    const closing = playable(hogwartsWorldStoryFile(), { writer: [writer({ call: "end" })] });
    await closing.play("I say goodnight.");
    await closing.engine.woven(closing.storyId);
    expect(closing.view().day_view).toMatchObject({ closed_by: "story", world: "ready" });

    const leaving = playable(hogwartsWorldStoryFile(), { writer: [writer({}), writer({ leaves_scene: true, frame: { title: "The Great Hall", place: "The Great Hall", purpose: "p", exit: "e" }, comes_in: ["Draconia Malfoy"], clock: "Day 4 08:00" })] });
    await leaving.play("I sit by the fire.");
    const lastReply = leaving.head();
    await leaving.play("In the morning I go down to breakfast.");
    await leaving.engine.woven(leaving.storyId);
    const [record] = leaving.mac.tree.recordsOn(leaving.head(), "world_moved");
    expect(record!.parentId).toBe(lastReply);
    expect(record!.payload).toMatchObject({ from: "Day 3 21:40", until: "Day 4 08:00" });
  });

  it("leaves the Day View failed with its reason and trace when the Weaver fails, and Retry runs it again", async () => {
    const { play, engine, storyId, head, view, events } = playable(hogwartsWorldStoryFile(), { weaver: [{ fail: "Sonnet is overloaded" }, { fail: "Sonnet is overloaded" }] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.woven(storyId);
    const failed = view().day_view!;
    expect(failed).toMatchObject({ world: "failed", meanwhile: [], failure: { reason: expect.stringMatching(/Sonnet is overloaded/) } });
    expect(failed.failure!.trace_id).toMatch(/^weave-/);
    expect(events.map(event => event.event.kind)).toContain("world_failed");
    // Nothing runs again by itself; Retry does.
    engine.weave(storyId);
    await engine.woven(storyId);
    expect(view().day_view!.world).toBe("failed");
    expect(engine.retryWorld(storyId, "trace-retry")).toEqual({ head_entry_id: head(), trace_id: "trace-retry" });
    await engine.woven(storyId);
    expect(view().day_view).toMatchObject({ world: "ready", failure: null });
  });

  it("moves the World on when the Mac starts, for a Scene end that has none", async () => {
    const { play, engine, storyId, head, mac, view } = playable(hogwartsWorldStoryFile(), { weaver: [{ fail: "The Mac was shut down" }, { fail: "The Mac was shut down" }] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.woven(storyId);
    expect(view().day_view!.world).toBe("failed");
    const restarted = new Engine(mac, new Models(mac.db, { claude: new FakeModels() }));
    restarted.weaveAll();
    await restarted.woven(storyId);
    expect(mac.tree.recordsOn(head(), "world_moved")).toHaveLength(1);
  });
});

/** The night after curfew on scripted Weaver answers: the first is refused, the second is the repair. */
async function nightWoven(weaver: object[], landmarks: { name: string; at: string; what: string }[] = []) {
  const story = hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] });
  story.landmarks = [...(story.landmarks ?? []), ...landmarks];
  const played = playable(story, { weaver: weaver.map(answer => ({ answer: JSON.stringify(answer) })) });
  await played.play("I say goodnight to Hermione and go up.");
  played.engine.endScene(played.storyId, played.head(), "trace-end");
  await played.engine.woven(played.storyId);
  const weaverCalls = played.models.weaver.requests;
  return { ...played, world: worldOn(played.mac, played.head()), repairPrompt: weaverCalls[1]?.prompt ?? "" };
}

const quiet = { lives: [], threads: [], happened: [], meanwhile: [] };

describe("what the Weaver may write", () => {
  // GIVEN the Triwizard Tournament is a Landmark in Year 3 and Draconia still hates the Player Character
  // WHEN Year 3 arrives on the Path
  // THEN the Tournament begins
  it("living-world › Landmarks arrive on their date › The Triwizard comes anyway", async () => {
    const tournament = { name: "the Triwizard Tournament", at: "Day 4 06:00", what: "The Goblet of Fire is lit in the Great Hall." };
    const begins = { ...quiet, happened: [{ id: "H1", what: "The Goblet of Fire was lit in the Great Hall; the Tournament began.", at: "Day 4 06:00", where: "the Great Hall", known_to: [], landmark: "the Triwizard Tournament" }] };
    const { world, repairPrompt, view } = await nightWoven([quiet, begins], [tournament]);
    expect(repairPrompt).toMatch(/happened: the Landmark the Triwizard Tournament falls in the span/);
    expect(world.happened).toEqual([expect.objectContaining({ landmark: "the Triwizard Tournament", at: "Day 4 06:00" })]);
    expect(view().day_view!.world).toBe("ready");
  });

  // GIVEN Crabbe and Goyle are a Group
  // WHEN a day passes off-screen
  // THEN Backstage shows one Life for them together, such as running Draconia's errands
  // (Backstage is the World as `fantasia world` shows it, until Backstage exists.)
  it("living-world › Everyone has a Life › A Group lives as one", async () => {
    const crabbeAlone = { ...quiet, lives: [{ who: "Vincent Crabbe", where: "the kitchens", doing: "eating", after: "pudding" }] };
    const together = { ...quiet, lives: [{ who: "Crabbe and Goyle", where: "the Slytherin common room", doing: "running Draconia's errands", after: "Draconia's errands, and whatever she wants hit." }] };
    const { world, repairPrompt } = await nightWoven([crabbeAlone, together]);
    expect(repairPrompt).toMatch(/lives: Vincent Crabbe lives as one of Crabbe and Goyle/);
    expect(world.lives.filter(life => ["Crabbe and Goyle", "Vincent Crabbe", "Gregory Goyle"].includes(life.who))).toEqual([
      { who: "Crabbe and Goyle", where: "the Slytherin common room", doing: "running Draconia's errands", after: "Draconia's errands, and whatever she wants hit." }
    ]);
  });

  // GIVEN Quirrell tested the third-floor door overnight and nobody saw him
  // THEN Meanwhile says nothing about it
  // AND Backstage shows it
  it("day-view › Meanwhile shows only what the Player Character knows › Quirrell's night stays hidden", async () => {
    const night = { id: "H1", what: "Quirrell tested the third-floor door and scorched it.", at: "Day 4 02:00", where: "the third-floor corridor", known_to: ["Quirinus Quirrell"], landmark: null };
    const leaked = { ...quiet, happened: [night], meanwhile: [{ text: "Someone was at the third-floor door in the night.", how: "seen", happened: "H1", told_by: null }] };
    const hidden = { ...quiet, threads: [{ name: "Quirrell and the third-floor door", now: "He has tried the wards twice and scorched the door" }], happened: [night] };
    const { world, repairPrompt, view } = await nightWoven([leaked, hidden]);
    expect(repairPrompt).toMatch(/meanwhile: item 1 tells of H1, which the player's character does not know/);
    expect(view().day_view).toMatchObject({ world: "ready", meanwhile: [] });
    expect(world.happened).toEqual([expect.objectContaining({ what: "Quirrell tested the third-floor door and scorched it.", knownTo: ["Quirinus Quirrell"] })]);
    expect(world.threads.find(thread => thread.name === "Quirrell and the third-floor door")!.now).toMatch(/scorched the door/);
  });

  // GIVEN Quirrell has spent weeks testing the third-floor wards off-screen
  // WHEN the Player Character finds the scorched door
  // THEN the player learns of it there, in the Scene, for the first time
  it("living-world › The background reaches the player only through the Story › Discovering Quirrell", async () => {
    const night = { id: "H1", what: "Quirrell tested the wards on the third-floor door again and scorched it.", at: "Day 4 02:00", where: "the third-floor corridor", known_to: ["Quirinus Quirrell"], landmark: null };
    const hidden = { ...quiet, threads: [{ name: "Quirrell and the third-floor door", now: "Weeks of testing the wards; the door is scorched" }], happened: [night] };
    const story = hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] });
    const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
    const scorched = { answer: JSON.stringify({ leaves_scene: false, frame: { title: "The long way", place: "The third-floor corridor", purpose: "p", exit: "e" }, comes_in: [], goes: [], beats, note: "The third-floor door is scorched black around the lock, still warm.", call: "continue", intensity: 3, arc_moved: true, clock: "Day 4 07:40", taste: null, in_play: [] }) };
    const played = playable(story, { weaver: [{ answer: JSON.stringify(hidden) }], writer: [{ answer: JSON.stringify({ leaves_scene: false, frame: { title: "kept", place: "kept", purpose: "p", exit: "e" }, comes_in: [], goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, clock: "Day 3 22:50", taste: null, in_play: [] }) }, scorched] });
    await played.play("I say goodnight to Hermione and go up.");
    played.engine.endScene(played.storyId, played.head(), "trace-end");
    await played.engine.woven(played.storyId);
    expect(played.view().day_view!.meanwhile).toEqual([]);

    await played.play("Before breakfast I take the long way, past the third floor.");
    const writer = played.models.writer.requests.at(-1)!;
    expect(writer.prompt).toContain("Quirrell tested the wards on the third-floor door again and scorched it.");
    expect(writer.prompt).toMatch(/known to: Quirinus Quirrell/);
    const actor = played.models.actor.requests.at(-1)!;
    expect(`${actor.system}\n${actor.prompt}`).not.toContain("Quirrell tested the wards");
    expect(actor.prompt).toContain("The third-floor door is scorched black around the lock, still warm.");
  });
});
