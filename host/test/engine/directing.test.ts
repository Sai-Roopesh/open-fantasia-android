import { describe, expect, it } from "vitest";
import { currentPlan, directionDue, landmarkPassed } from "../../src/engine/directing.js";
import { fakeWeaveAnswer, fakeWriterAnswer } from "../../src/models/fake.js";
import type { ModelRequest } from "../../src/models/model-call.js";
import { setJobModel } from "../../src/models/jobs.js";
import type { DirectorPlan, WorldMoved } from "../../src/story/entries.js";
import { callsFor, freshHome } from "../support/host.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile, malfoyProblemStoryFile } from "../support/story-files.js";

const model = { provider: "claude", model: "claude-opus-5-5" } as const;

/** A plan as the Director writes it: four Scenes building toward the flying test. */
function plan(scenes = 4): DirectorPlan {
  return {
    kind: "director_plan", toward: "the flying test on Wednesday", landmark: "Draconia's flying test", phase: "build", scenes,
    arcs: [{ arc: "Draconia comes round to Roopesh", now: "insults in public", next: "a slip in private", not_yet: "any kindness in front of others" }],
    premise: "Two of the four Scenes are with Draconia; the others leave her be.", callId: "c", model
  };
}

function story(landmarks?: { name: string; at: string; what: string }[]) {
  const mac = freshHome();
  mac.db.prepare("INSERT INTO stories (id, title, folder, created_at) VALUES ('s', 'T', '/x', 'now')").run();
  const { tree } = mac;
  const storyFile = malfoyProblemStoryFile();
  const setUp = tree.append("s", null, { kind: "story_set_up", storyFile: landmarks ? { ...storyFile, landmarks } : storyFile, portraits: {} });
  let at = setUp;
  /** Plays one Scene from [at] and closes it, returning the closing entry. */
  const scene = (number: number) => {
    const opened = tree.append("s", at.id, { kind: "scene_opened", number, title: `Scene ${number}`, place: "The Great Hall", at: `Day ${number} 09:00`, who: [], prose: null, startsAt: null, purpose: null, exit: null });
    const move = tree.append("s", opened.id, { kind: "move", text: "I look up." });
    const reply = tree.append("s", move.id, { kind: "reply", text: "She looks away.", callId: "c", model });
    at = tree.append("s", reply.id, { kind: "scene_closed", by: "player" });
    return { opened, closed: at };
  };
  return { mac, tree, scene, head: () => at };
}

describe("the Director's plan, beside the Path (docs/adr/0007)", () => {
  it("hangs off the end of the Scene it followed, is the Path's current plan, and is never walked", () => {
    const { mac, tree, scene, head } = story();
    const first = scene(1);
    const written = tree.append("s", first.closed.id, plan());
    expect(currentPlan(mac, head().id)).toMatchObject({ entry: { id: written.id }, scenesSince: 0, runItsCourse: false });
    expect(tree.pathTo(head().id).some(entry => entry.payload.kind === "director_plan")).toBe(false);
    expect(tree.recordsOf(first.closed.id).map(entry => entry.id)).toEqual([written.id]);
  });

  it("has run its course once as many Scenes have closed as it planned", () => {
    const { mac, tree, scene, head } = story();
    tree.append("s", scene(1).closed.id, plan(2));
    scene(2);
    expect(currentPlan(mac, head().id)).toMatchObject({ scenesSince: 1, runItsCourse: false });
    scene(3);
    expect(currentPlan(mac, head().id)).toMatchObject({ scenesSince: 2, runItsCourse: true });
  });

  it("is the newest plan on the Path, and a Path from before a plan does not have it", () => {
    const { mac, tree, scene, head } = story();
    const first = scene(1);
    const older = tree.append("s", first.closed.id, plan());
    const second = scene(2);
    const newer = tree.append("s", second.closed.id, { ...plan(), phase: "rest", toward: "a quiet week" });
    expect(currentPlan(mac, head().id)?.entry.id).toBe(newer.id);
    // Rewound to inside the second Scene, the Path keeps only the plan written before it.
    expect(currentPlan(mac, second.opened.id)?.entry.id).toBe(older.id);
    expect(currentPlan(mac, first.opened.id)).toBeNull();
  });
});

describe("when the Director plans (openspec long-run)", () => {
  // GIVEN the Director planned a stretch of four Scenes building toward the flying test
  // WHEN the second of them ends without peaking
  // THEN the Director plans nothing new, and the next Scene is planned toward the flying test
  it("long-run › The Director shapes the long run around Arcs and Landmarks › A stretch that has not run its course", async () => {
    const { mac, engine, storyId, head, play, models } = playable(hogwartsStoryFile(), {
      director: [{ answer: JSON.stringify(flyingTest(4)) }]
    });
    const endScene = async () => {
      engine.endScene(storyId, head(), `end-${head()}`);
      await engine.directed(storyId);
    };
    // The first Scene's end: there is no plan yet, so the Director plans, after the Chronicler and the Weaver.
    await play("I say goodnight.");
    await endScene();
    expect(models.director.requests).toHaveLength(1);
    const order = models.requests.map(request => request.agent).filter(agent => ["chronicler", "weaver", "director"].includes(agent));
    expect(order.indexOf("director")).toBeGreaterThan(order.lastIndexOf("chronicler"));
    expect(order.indexOf("director")).toBeGreaterThan(order.lastIndexOf("weaver"));
    expect(callsFor(mac.db, "director")).toEqual([{ provider: "claude", model: "claude-opus-5-5", effort: null }]);
    expect(currentPlan(mac, head())?.entry.payload.toward).toBe("the flying test on Wednesday");

    // The second Scene ends, quietly: the stretch has not run its course, and nothing is planned.
    await play("I go down to breakfast.");
    await engine.settled(storyId);
    await endScene();
    expect(models.director.requests).toHaveLength(1);
    expect(currentPlan(mac, head())).toMatchObject({ scenesSince: 1, runItsCourse: false });
  });

  it("plans again when the stretch has run its course", async () => {
    const { engine, storyId, head, play, models } = playable(hogwartsStoryFile(), { director: [{ answer: JSON.stringify(flyingTest(1)) }] });
    for (const move of ["I say goodnight.", "I go down to breakfast."]) {
      await play(move);
      engine.endScene(storyId, head(), `end-${move}`);
      await engine.directed(storyId);
    }
    expect(models.director.requests).toHaveLength(2);
  });

  it("plans a rest when a Scene peaked, though the stretch had Scenes left", async () => {
    const peaked = { from: (request: ModelRequest) => ({ answer: JSON.stringify({ ...JSON.parse((fakeWriterAnswer(request) as { answer: string }).answer) as object, intensity: 5 }) }) };
    const { engine, storyId, head, play, models } = playable(hogwartsStoryFile(), {
      director: [{ answer: JSON.stringify(flyingTest(4)) }],
      // The second Scene's Writer rates it 5: a change that cannot be undone.
      writer: [{ from: fakeWriterAnswer }, peaked]
    });
    for (const move of ["I say goodnight.", "I tell her what I am."]) {
      await play(move);
      engine.endScene(storyId, head(), `end-${move}`);
      await engine.directed(storyId);
    }
    expect(models.director.requests).toHaveLength(2);
    expect(models.director.requests[1]!.prompt).toContain("The Scene that just ended peaked: this stretch is a rest.");
  });

  it("plans again when a Landmark's time has passed since the plan", () => {
    const { mac, tree, scene, head } = story([{ name: "The flying test", at: "Day 2 08:00", what: "First-years fly for the first time." }]);
    tree.append("s", scene(1).closed.id, plan(6));
    // The plan was written on Day 1; the second Scene runs on Day 2, after the test at eight.
    scene(2);
    expect(directionDue(mac, head().id, null)).toMatchObject({ reason: "a Landmark passed" });
    // A Landmark still ahead is no reason to plan.
    expect(landmarkPassed([{ name: "The Yule Ball", at: "Day 90 20:00", what: "" }], "Day 1 09:00", "Day 3 09:00")).toBe(false);
  });

  it("keeps a failed plan's call, goes on without one, and plans at the next Scene's end", async () => {
    const { mac, engine, storyId, head, play, models } = playable(hogwartsStoryFile(), {
      director: [{ fail: "Opus 5.5 is overloaded" }, { fail: "Opus 5.5 is overloaded" }, { answer: JSON.stringify(flyingTest(4)) }]
    });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-1");
    await engine.directed(storyId);
    expect(currentPlan(mac, head())).toBeNull();
    expect(callsFor(mac.db, "director")).toHaveLength(2);
    await play("I go down to breakfast.");
    engine.endScene(storyId, head(), "end-2");
    await engine.directed(storyId);
    expect(currentPlan(mac, head())?.entry.payload.toward).toBe("the flying test on Wednesday");
    expect(models.director.requests).toHaveLength(3);
  });

  it("runs on the Director's model from the Models screen", async () => {
    const { mac, engine, storyId, head, play } = playable(hogwartsStoryFile(), { director: [{ answer: JSON.stringify(flyingTest(4)) }] });
    setJobModel(mac.home, "director", { provider: "codex", model: "gpt-6.1-sol", effort: "high" });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-1");
    await engine.directed(storyId);
    expect(callsFor(mac.db, "director")).toEqual([{ provider: "codex", model: "gpt-6.1-sol", effort: "high" }]);
  });
});

/** The Director's answer for the Hogwarts Story: a stretch toward the flying test. */
function flyingTest(scenes: number) {
  return {
    toward: "the flying test on Wednesday", landmark: null, phase: "build", scenes,
    arcs: hogwartsStoryFile().arcs!.map(arc => ({ arc, now: "where it was", next: "one small step", not_yet: "anything declared" })),
    premise: "Some Scenes with Draconia, some without."
  };
}

describe("the plan reaches the Story only through the Writer (docs/adr/0004)", () => {
  it("is in the Writer's prompt and in no other agent's", async () => {
    const { engine, storyId, head, play, models } = playable(hogwartsStoryFile(), { director: [{ answer: JSON.stringify(flyingTest(4)) }] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-1");
    await engine.directed(storyId);
    const before = models.requests.length;
    await play("I go down to breakfast.");
    engine.endScene(storyId, head(), "end-2");
    await engine.directed(storyId);
    const after = models.requests.slice(before);
    const mentions = (agent: string) => after.filter(request => request.agent === agent).some(request => `${request.system}\n${request.prompt}`.includes("the flying test on Wednesday"));
    expect(mentions("writer")).toBe(true);
    for (const agent of ["actor", "chronicler", "weaver"]) expect(mentions(agent), agent).toBe(false);
  });
});

describe("rest after a peak, in play", () => {
  // GIVEN the Scene where Draconia chose the Player Character in front of her House just ended
  // THEN the Story's own pick at the Day View is a quiet Happening
  it("long-run › Rest is deliberate › A quiet pick after a peak", async () => {
    const peaked = { from: (request: ModelRequest) => ({ answer: JSON.stringify({ ...JSON.parse((fakeWriterAnswer(request) as { answer: string }).answer) as object, intensity: 5 }) }) };
    // The Weaver first offers a duel as its pick; the check sends it back for a quiet one.
    const duel = { from: (request: ModelRequest) => {
      const weave = JSON.parse((fakeWeaveAnswer(request) as { answer: string }).answer) as Record<string, unknown>;
      const until = (request.facts as { until: string }).until;
      return { answer: JSON.stringify({ ...weave, happenings: [{ id: "P1", at: until, place: "the Quidditch pitch", what: "Flint calls Roopesh out for a duel.", who: [], expected: false, pick: true, quiet: false }] }) };
    } };
    const { mac, engine, storyId, head, play, models } = playable(hogwartsStoryFile(), { writer: [peaked], weaver: [duel] });
    await play("I tell her what I am, in front of her whole House.");
    engine.endScene(storyId, head(), "end-peak");
    await engine.woven(storyId);
    expect(models.weaver.requests[0]!.prompt).toContain("The Scene that ended peaked.");
    expect(models.weaver.requests[1]!.prompt).toContain("make your pick a quiet Happening");
    const moved = mac.tree.recordsOn(head(), "world_moved").at(-1)!.payload as WorldMoved;
    expect(moved.happenings.find(item => item.pick)).toMatchObject({ quiet: true });
  });
});

