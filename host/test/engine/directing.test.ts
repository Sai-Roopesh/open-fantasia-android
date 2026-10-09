import { describe, expect, it } from "vitest";
import { currentPlan, directionDue, landmarkPassed } from "../../src/engine/directing.js";
import { fakeChronicleAnswer, fakeWeaveAnswer, fakeWriterAnswer } from "../../src/models/fake.js";
import type { ModelRequest } from "../../src/models/model-call.js";
import { setJobModel } from "../../src/models/jobs.js";
import type { DirectorPlan, WorldMoved } from "../../src/story/entries.js";
import { callsFor, freshHome } from "../support/host.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile, malfoyProblemStoryFile } from "../support/story-files.js";

const model = { provider: "claude", model: "claude-opus-5-5" } as const;

/** A plan as the Director writes it: four Scenes that matter, building toward the flying test. */
function plan(scenes = 4): DirectorPlan {
  return {
    kind: "director_plan", from: 3, until: 9, toward: "the flying test on Wednesday", landmark: "Draconia's flying test", phase: "build",
    scenes: Array.from({ length: scenes }, (_, index) => ({ id: `s-${index + 1}`, at: `Day ${4 + index} 10:00`, place: "The Quidditch pitch", who: ["Draconia Malfoy"], for: "A step toward the test.", lead: "Draconia Malfoy" })),
    leads: [{ who: "Draconia Malfoy", move: "Practises where he can see her.", scene: "s-1" }, { who: "Hermione Granger", move: "Lends him her notes.", scene: null }],
    roadmap: [],
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
    expect(currentPlan(mac, head().id)).toMatchObject({ entry: { id: written.id }, runItsCourse: false });
    expect(tree.pathTo(head().id).some(entry => entry.payload.kind === "director_plan")).toBe(false);
    expect(tree.recordsOf(first.closed.id).map(entry => entry.id)).toEqual([written.id]);
  });

  it("has run its course once every Scene that matters has passed, or its days have", () => {
    const { mac, tree, scene, head } = story();
    // Two Scenes that matter, Day 4 and Day 5 at ten.
    tree.append("s", scene(1).closed.id, plan(2));
    scene(4);
    expect(currentPlan(mac, head().id)).toMatchObject({ runItsCourse: false });
    scene(5);
    expect(currentPlan(mac, head().id)).toMatchObject({ runItsCourse: false });
    scene(6);
    expect(currentPlan(mac, head().id)).toMatchObject({ runItsCourse: true });

    // Days: a Stretch to Day 9 whose last Scene that matters is still to come has not run its course on Day 9.
    const later = story();
    later.tree.append("s", later.scene(1).closed.id, { ...plan(2), scenes: plan(2).scenes.map(item => ({ ...item, at: "Day 9 22:00" })) });
    later.scene(9);
    expect(currentPlan(later.mac, later.head().id)).toMatchObject({ runItsCourse: false });
    later.scene(10);
    expect(currentPlan(later.mac, later.head().id)).toMatchObject({ runItsCourse: true });
  });

  it("treats a plan from before Stretches as no plan, so the Director plans afresh", () => {
    const { mac, tree, scene, head } = story();
    tree.append("s", scene(1).closed.id, { ...plan(), scenes: 4 } as never);
    expect(currentPlan(mac, head().id)).toBeNull();
    expect(directionDue(mac, head().id, null)).toMatchObject({ reason: "no plan yet" });
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
  // GIVEN the Director planned a Stretch from Monday to Sunday, building toward the flying test on Saturday, with
  //   three Scenes that matter
  // WHEN the first of them, on Tuesday, ends without peaking
  // THEN the Director plans nothing new, and the Day View leads with the Stretch's next Scene
  // (The Day View's half is proved with the Weaver following the plan.)
  it("long-run › The Director shapes the long run around Arcs and Landmarks › A stretch that has not run its course", async () => {
    // Monday night, Day 6: Day 1 was a Wednesday.
    const story = hogwartsStoryFile({ title: "Monday night", place: "The Gryffindor common room", at: "Day 6 21:40" });
    const week = { ...flyingTest(3), from: "Day 6", until: "Day 12", toward: "the flying test on Saturday", scenes: [
      { id: "S1", at: "Day 7 16:00", place: "The Charms classroom", who: ["Draconia Malfoy"], for: "She is paired with him and hates it.", lead: "Draconia Malfoy" },
      { id: "S2", at: "Day 9 14:00", place: "The library", who: ["Hermione Granger"], for: "Hermione's flying notes.", lead: "Hermione Granger" },
      { id: "S3", at: "Day 11 10:00", place: "The Quidditch pitch", who: ["Draconia Malfoy"], for: "The flying test.", lead: "Draconia Malfoy" }
    ] };
    const tuesday = { answer: JSON.stringify({ leaves_scene: true, frame: { title: "Charms", place: "The Charms classroom", purpose: "p", exit: "e" }, comes_in: ["Draconia Malfoy"], goes: [], beats: [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }], note: "n", call: "continue", intensity: 2, arc_moved: true, clock: "Day 7 16:00", taste: null, in_play: [] }) };
    const { mac, engine, storyId, head, play, models } = playable(story, { director: [{ answer: JSON.stringify(week) }], writer: [{ from: fakeWriterAnswer }, tuesday] });
    const endScene = async () => {
      engine.endScene(storyId, head(), `end-${head()}`);
      await engine.directed(storyId);
    };
    // Monday night ends: there is no plan yet, so the Director plans the week.
    await play("I say goodnight.");
    await endScene();
    expect(models.director.requests).toHaveLength(1);
    expect(callsFor(mac.db, "director")).toEqual([{ provider: "claude", model: "claude-opus-5-5", effort: null }]);
    expect(currentPlan(mac, head())?.entry.payload).toMatchObject({ from: 6, until: 12, toward: "the flying test on Saturday" });

    // Tuesday's Scene that matters ends, quietly: two are still ahead, and nothing is planned.
    await play("On Tuesday I go to Charms.");
    await engine.settled(storyId);
    await endScene();
    expect(mac.states.at(head()).clock).toBe("Day 7 16:00");
    expect(models.director.requests).toHaveLength(1);
    expect(currentPlan(mac, head())).toMatchObject({ runItsCourse: false });
  });

  it("plans again when the Stretch has run its course: its Scenes that matter have passed", async () => {
    // The Stretch's two Scenes that matter are on Day 4 and Day 5 at ten; the second Scene opens on Day 6.
    const dayAfter = { answer: JSON.stringify({ leaves_scene: true, frame: { title: "Saturday", place: "The Great Hall", purpose: "p", exit: "e" }, comes_in: [], goes: [], beats: [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }], note: "n", call: "continue", intensity: 2, arc_moved: true, clock: "Day 6 09:00", taste: null, in_play: [] }) };
    const { engine, storyId, head, play, models } = playable(hogwartsStoryFile(), { director: [{ answer: JSON.stringify(flyingTest(2)) }], writer: [{ from: fakeWriterAnswer }, dayAfter] });
    for (const move of ["I say goodnight.", "On Saturday I go down to breakfast."]) {
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

/** The Director's answer for the Hogwarts Story: a Stretch from Friday Day 3 toward the flying test, with [scenes] that matter. */
function flyingTest(scenes: number) {
  const story = hogwartsStoryFile();
  return {
    from: "Day 3", until: "Day 9", toward: "the flying test on Wednesday", landmark: null, phase: "build",
    scenes: Array.from({ length: scenes }, (_, index) => ({ id: `S${index + 1}`, at: `Day ${4 + index} 10:00`, place: "The Quidditch pitch", who: ["Draconia Malfoy"], for: "A step toward the test.", lead: "Draconia Malfoy" })),
    arcs: story.arcs!.map(arc => ({ arc, now: "where it was", next: "one small step", not_yet: "anything declared" })),
    leads: story.leads!.map((who, index) => ({ who, move: `${who} makes a move.`, scene: index === 0 ? "S1" : null })),
    roadmap: story.arcs!.map(arc => ({ arc, by: "Draconia's flying test", stands: "She has let him see her nervous." })),
    premise: "Some Scenes with Draconia, some without."
  };
}

describe("the order at a Scene's end (docs/adr/0010)", () => {
  const order = (models: ReturnType<typeof playable>["models"]) => models.requests.map(request => request.agent).filter(agent => ["chronicler", "weaver", "director"].includes(agent));

  it("records the Scene, then plans when a plan is due, then moves the World on, which reads the plan", async () => {
    const { engine, storyId, head, play, models } = playable(hogwartsStoryFile(), { director: [{ answer: JSON.stringify(flyingTest(2)) }] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-1");
    await engine.woven(storyId);
    expect(order(models)).toEqual(["chronicler", "director", "weaver"]);
  });

  it("leaves the last plan in force when the Director fails, and moves the World on all the same", async () => {
    const peaked = { from: (request: ModelRequest) => ({ answer: JSON.stringify({ ...JSON.parse((fakeWriterAnswer(request) as { answer: string }).answer) as object, intensity: 5 }) }) };
    const { mac, engine, storyId, head, play } = playable(hogwartsStoryFile(), {
      director: [{ answer: JSON.stringify(flyingTest(2)) }, { fail: "Opus 5.5 is overloaded" }, { fail: "Opus 5.5 is overloaded" }],
      writer: [{ from: fakeWriterAnswer }, peaked]
    });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-1");
    await engine.woven(storyId);
    const first = currentPlan(mac, head())!.entry.id;
    await play("I tell her what I am.");
    engine.endScene(storyId, head(), "end-2");
    await engine.woven(storyId);
    expect(currentPlan(mac, head())!.entry.id).toBe(first);
    expect(mac.tree.recordsOn(head(), "world_moved")).toHaveLength(2);
  });

  it("does not hold the World up for the record when no plan is due", async () => {
    // A long record, slow to come; the World's answer is short.
    const slow = { answer: JSON.stringify({ summary: "word ".repeat(4000).trim(), moments: [], told: [] }) };
    const { mac, engine, storyId, head, play } = playable(hogwartsStoryFile(), { director: [{ answer: JSON.stringify(flyingTest(3)) }], chronicler: [{ from: fakeChronicleAnswer }, slow] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-1");
    await engine.woven(storyId);
    await play("I go down to breakfast.");
    engine.endScene(storyId, head(), "end-2");
    await engine.woven(storyId);
    await engine.chronicled(storyId);
    const seq = (kind: "world_moved" | "chronicle") => mac.tree.recordsOn(head(), kind).at(-1)!.seq;
    expect(seq("world_moved")).toBeLessThan(seq("chronicle"));
  });
});

describe("Leads act every Stretch (openspec long-run)", () => {
  // GIVEN Draconia saw him hold Hermione in the Great Hall
  // WHEN the next Stretch is planned
  // THEN Draconia's move in it acts on that, on screen or off: she claims him, or moves against Hermione
  // (What her move is, is the live check's; here, that the Director is told, and must give her one.)
  it("long-run › Leads act every Stretch › Jealousy acted on", async () => {
    const story = hogwartsStoryFile({ title: "Breakfast", place: "The Great Hall", at: "Day 4 08:00", who: ["Hermione Granger", "Draconia Malfoy"], prose: "The Great Hall is loud with Saturday." });
    const hug = "She saw him hold Hermione in the Great Hall, and left her breakfast where it was.";
    const move = "I hold Hermione when she starts to cry.";
    const chronicle = { answer: JSON.stringify({
      summary: "He held Hermione in the Great Hall, and Draconia saw.",
      moments: [{ what: "He holds Hermione.", quotes: [{ entry: "E2", text: move }], there: ["Hermione Granger", "Draconia Malfoy"], weight: 4 }],
      told: [],
      bonds: [{ who: "Draconia Malfoy", standing: "She calls him Stray and watches who he holds.", turn: hug }]
    }) };
    const week = flyingTest(2);
    const noDraconia = { ...week, leads: week.leads.filter(lead => lead.who !== "Draconia Malfoy") };
    const { mac, engine, storyId, head, play, models } = playable(story, { chronicler: [chronicle], director: [{ answer: JSON.stringify(noDraconia) }, { answer: JSON.stringify(week) }] });
    await play(move);
    engine.endScene(storyId, head(), "end-hug");
    await engine.directed(storyId);
    expect(models.director.requests[0]!.prompt).toContain(`- Draconia Malfoy: She calls him Stray and watches who he holds.\n  - Scene 1 · Breakfast: ${hug}`);
    expect(models.director.requests[1]!.prompt).toContain("leads: no move for Draconia Malfoy; every Lead makes one this Stretch, on screen or off");
    expect(currentPlan(mac, head())?.entry.payload.leads.map(lead => lead.who)).toEqual(["Draconia Malfoy", "Hermione Granger"]);
  });
});

describe("the plan reaches the Story only through the Writer and the Weaver (docs/adr/0010)", () => {
  it("is in the Writer's prompt, its next Scene that matters in the Weaver's, and in no other agent's", async () => {
    const { engine, storyId, head, play, models } = playable(hogwartsStoryFile(), { director: [{ answer: JSON.stringify(flyingTest(4)) }] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-1");
    await engine.woven(storyId);
    const before = models.requests.length;
    await play("I go down to breakfast.");
    engine.endScene(storyId, head(), "end-2");
    await engine.woven(storyId);
    // The Writer reads the plan from the first Scene after it on; the Weaver met its next Scene that matters at the
    // first Scene's end, and does not offer it again while it is on.
    const after = models.requests.slice(before);
    const mentions = (agent: string, words: string) => models.requests.filter(request => request.agent === agent).some(request => `${request.system}\n${request.prompt}`.includes(words));
    expect(after.some(request => request.agent === "writer" && request.prompt.includes("the flying test on Wednesday"))).toBe(true);
    expect(mentions("weaver", "A step toward the test.")).toBe(true);
    for (const agent of ["actor", "chronicler"]) {
      expect(mentions(agent, "the flying test on Wednesday"), agent).toBe(false);
      expect(mentions(agent, "A step toward the test."), agent).toBe(false);
    }
  });
});

describe("rest after a peak, in play", () => {
  // GIVEN the Scene where Draconia chose the Player Character in front of her House just ended
  // THEN the Story's own pick at the Day View is a quiet Happening
  it("long-run › Rest is deliberate › A quiet pick after a peak", async () => {
    const peaked = { from: (request: ModelRequest) => ({ answer: JSON.stringify({ ...JSON.parse((fakeWriterAnswer(request) as { answer: string }).answer) as object, intensity: 5 }) }) };
    // The Weaver first offers the rest's first Scene with something at stake in it; the check sends it back.
    const duel = { from: (request: ModelRequest) => {
      const weave = JSON.parse((fakeWeaveAnswer(request) as { answer: string }).answer) as { happenings: Record<string, unknown>[] };
      return { answer: JSON.stringify({ ...weave, happenings: weave.happenings.map(item => ({ ...item, what: "Flint calls Roopesh out for a duel.", quiet: false })) }) };
    } };
    const { mac, engine, storyId, head, play, models } = playable(hogwartsStoryFile(), { writer: [peaked], weaver: [duel] });
    await play("I tell her what I am, in front of her whole House.");
    engine.endScene(storyId, head(), "end-peak");
    await engine.woven(storyId);
    // A rest is planned before the World moves on, and the Story's pick is its first Scene, quiet.
    expect(models.director.requests[0]!.prompt).toContain("The Scene that just ended peaked: this stretch is a rest.");
    const plan = currentPlan(mac, head())!.entry.payload;
    expect(plan.phase).toBe("rest");
    expect(models.weaver.requests[0]!.prompt).toContain("The Scene that ended peaked.");
    expect(models.weaver.requests[1]!.prompt).toContain("make your pick a quiet Happening");
    const moved = mac.tree.recordsOn(head(), "world_moved").at(-1)!.payload as WorldMoved;
    expect(moved.happenings.find(item => item.pick)).toMatchObject({ quiet: true, scene: plan.scenes[0]!.id });
  });
});

