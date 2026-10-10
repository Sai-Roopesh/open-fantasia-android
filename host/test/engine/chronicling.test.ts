import { describe, expect, it, vi } from "vitest";
import { Engine } from "../../src/engine/engine.js";
import { dueChronicle } from "../../src/engine/chronicling.js";
import { fakeChronicleAnswer, FakeModels } from "../../src/models/fake.js";
import { Models, type ModelRequest, type ModelRunner } from "../../src/models/model-call.js";
import type { Chronicle, Entry, RecordGap } from "../../src/story/entries.js";
import { bondsOn } from "../../src/story/bonds.js";
import { knownOn } from "../../src/story/known.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

const leaving = { answer: JSON.stringify({ leaves_scene: true, frame: { title: "Lights out", place: "The boys' dormitory", purpose: "p", exit: "e" }, comes_in: ["Ron Weasley"], goes: [], beats: [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }], note: "Ron is up.", call: "continue", intensity: 2, arc_moved: true, clock: "Day 3 21:45", taste: null, in_play: [] }) };

/** The Chronicles the current Path sees, as their payloads, with the entry each hangs off. */
function chronicles(mac: ReturnType<typeof playable>["mac"], head: string): (Chronicle & { parent: Entry })[] {
  return mac.tree.recordsOn(head, "chronicle").map(entry => ({ ...(entry.payload as Chronicle), parent: mac.tree.entry(entry.parentId!)! }));
}

describe("when the Chronicler runs", () => {
  it("chronicles a Scene the player ends, to its end, with its summary", async () => {
    const { play, engine, storyId, head, mac } = playable();
    await play("I sit down.");
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.chronicled(storyId);
    const [chronicle] = chronicles(mac, head());
    expect(chronicle).toMatchObject({ summary: "The Scene was played to its end.", sceneEnded: true, parent: { payload: { kind: "scene_closed" } } });
    expect(chronicle!.moments[0]!.quotes[0]!.text).toBe("I say goodnight.");
    expect(mac.tree.pathTo(head()).some(entry => entry.payload.kind === "chronicle")).toBe(false);
  });

  it("chronicles a Scene a Move left, up to the Reply before that Move", async () => {
    const { play, engine, storyId, head, mac } = playable(hogwartsStoryFile(), { writer: [{ answer: JSON.stringify({ leaves_scene: false, frame: { title: "After curfew", place: "The Gryffindor common room", purpose: "p", exit: "e" }, comes_in: ["Hermione Granger"], goes: [], beats: [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }], note: "n", call: "continue", intensity: 2, arc_moved: true, clock: "Day 3 21:42", taste: null, in_play: [] }) }, leaving] });
    await play("I sit down.");
    await play("I go to my room.");
    await engine.chronicled(storyId);
    const [chronicle] = chronicles(mac, head());
    expect(chronicle).toMatchObject({ summary: expect.any(String), parent: { payload: { kind: "reply" } } });
    const moveThatLeft = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "move" && entry.payload.text === "I go to my room.")!;
    expect(chronicle!.parent.seq).toBeLessThan(moveThatLeft.seq);
  });

  it("chronicles in the background: the next Move is taken while the Chronicler is still at work", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>(resolve => (release = resolve));
    const fake = new FakeModels();
    const runner: ModelRunner = {
      run: async (request: ModelRequest, onText, signal) => {
        if (request.agent !== "chronicler") return fake.run(request, onText, signal);
        await held;
        return (fakeChronicleAnswer(request) as { answer: string }).answer;
      }
    };
    const { mac, storyId, head } = playable();
    const engine = new Engine(mac, new Models(mac.db, { claude: runner }));
    engine.move(storyId, "I say goodnight.", head(), "t1");
    await engine.settled(storyId);
    engine.endScene(storyId, head(), "t2");
    engine.move(storyId, "In the morning I go down to breakfast.", head(), "t3");
    await engine.settled(storyId);
    expect(mac.tree.entry(head())!.payload.kind).toBe("reply");
    release();
    await engine.chronicled(storyId);
    expect(chronicles(mac, head())).toHaveLength(1);
  });

  it("chronicles an open Scene every twelve exchanges, with where it stands so far, and again at its end", async () => {
    const { play, engine, storyId, head, mac, view } = playable();
    for (let exchange = 1; exchange <= 11; exchange++) await play(`I stay by the fire (${exchange}).`);
    await engine.chronicled(storyId);
    expect(chronicles(mac, head())).toHaveLength(0);
    await play("I stay by the fire (12).");
    await engine.chronicled(storyId);
    const [chronicle] = chronicles(mac, head());
    expect(chronicle).toMatchObject({ summary: "The Scene so far.", sceneEnded: false, parent: { id: head() } });
    await play("I stay by the fire (13).");
    await engine.chronicled(storyId);
    expect(chronicles(mac, head())).toHaveLength(1);
    // A summary of the Scene so far is not its summary: the Scene is chronicled again when it ends.
    engine.endScene(storyId, head(), "trace-end");
    await engine.chronicled(storyId);
    expect(chronicles(mac, head()).at(-1)).toMatchObject({ summary: "The Scene was played to its end.", sceneEnded: true });
    // Where the Scene is shown as an earlier one, its ended summary is the one shown.
    await play("In the morning I go down to breakfast.");
    expect(view().earlier_scenes).toEqual([expect.objectContaining({ number: 1, summary: "The Scene was played to its end." })]);
  });

  it("keeps a failed run with its reason, and runs it again the next time it is due", async () => {
    const { play, engine, storyId, head, mac } = playable(hogwartsStoryFile(), { chronicler: [{ fail: "Sonnet is overloaded" }, { fail: "Sonnet is overloaded" }] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    expect(chronicles(mac, head())).toHaveLength(0);
    const failed = mac.db.prepare("SELECT error FROM calls WHERE agent = 'chronicler'").all() as { error: string }[];
    expect(failed.map(row => row.error)).toEqual(["Sonnet is overloaded", "Sonnet is overloaded"]);

    // The host starts again: what is due is queued.
    const restarted = new Engine(mac, new Models(mac.db, { claude: new FakeModels() }));
    restarted.chronicleAll();
    await restarted.chronicled(storyId);
    expect(chronicles(mac, head())).toHaveLength(1);
  });

  it("chronicles an open Scene once the player has stepped away for an hour, and not before", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    try {
      const { play, engine, storyId, head, mac } = playable();
      await play("I sit down.");
      await play("I ask what she is reading.");
      await vi.advanceTimersByTimeAsync(59 * 60_000);
      await engine.chronicled(storyId);
      expect(chronicles(mac, head())).toHaveLength(0);
      // Anything the player does starts the hour again.
      engine.setLinger(storyId, head(), true, "t-linger");
      await vi.advanceTimersByTimeAsync(30 * 60_000);
      await engine.chronicled(storyId);
      expect(chronicles(mac, head())).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(35 * 60_000);
      await engine.chronicled(storyId);
      expect(chronicles(mac, head())).toEqual([expect.objectContaining({ summary: "The Scene so far.", sceneEnded: false })]);
      // What is recorded is not recorded again.
      await vi.advanceTimersByTimeAsync(3 * 3600_000);
      engine.chronicle(storyId);
      await engine.chronicled(storyId);
      expect(chronicles(mac, head())).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("catches up when the Mac starts on a Scene the player stepped away from while it was stopped", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    try {
      const { play, storyId, head, mac } = playable();
      await play("I sit down.");
      vi.setSystemTime(Date.now() + 2 * 3600_000);
      const restarted = new Engine(mac, new Models(mac.db, { claude: new FakeModels() }));
      restarted.chronicleAll();
      await restarted.chronicled(storyId);
      expect(chronicles(mac, head())).toEqual([expect.objectContaining({ sceneEnded: false })]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("chronicles again what a Redo took off the Path, from the last Chronicle still on it", async () => {
    const { play, engine, storyId, head, mac } = playable();
    for (let exchange = 1; exchange <= 12; exchange++) await play(`I stay by the fire (${exchange}).`);
    await engine.chronicled(storyId);
    const first = chronicles(mac, head());
    expect(first).toHaveLength(1);
    engine.redo(storyId, head(), null, false, "t-redo");
    await engine.settled(storyId);
    await engine.chronicled(storyId);
    const again = chronicles(mac, head());
    expect(again).toHaveLength(1);
    expect(again[0]!.parent.id).toBe(head());
    expect(again[0]!.parent.id).not.toBe(first[0]!.parent.id);
  });
});

describe("records that degrade, never vanish (lasting-records)", () => {
  /** A chronicle that is right in every part but one: what he knows of Draconia, far too long. */
  const tooLong = (move: string) => ({ answer: JSON.stringify({
    summary: "In the classroom Draconia floated in his arms and ordered him to put her down.",
    moments: [{ what: "He catches her as everything floats.", quotes: [{ entry: "E2", text: move }], there: ["Draconia Malfoy"], weight: 4 }],
    told: [],
    known: [{ who: "Draconia Malfoy", now: "word ".repeat(70).trim() }]
  }) });

  // GIVEN a Scene in which Draconia floated in his arms, and the record's line for what he knows of her comes back
  //   too long twice
  // THEN that Scene's Moments and summary are kept, and what he knew of her before stays as it was
  it("living-world › Moments are remembered from one record › One bad part does not lose the Scene", async () => {
    const move = "I catch you as everything floats.";
    const classroom = hogwartsStoryFile({ title: "Twenty-nine minutes", place: "An empty classroom", who: ["Draconia Malfoy"], prose: "Draconia sets out her notes." });
    const { play, engine, storyId, head, mac } = playable(classroom, { chronicler: [tooLong(move), tooLong(move)] });
    const before = knownOn(mac, head()).get("Draconia Malfoy")?.text ?? null;
    await play(move);
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    const [chronicle] = chronicles(mac, head());
    expect(chronicle).toMatchObject({ summary: "In the classroom Draconia floated in his arms and ordered him to put her down.", sceneEnded: true });
    expect(chronicle!.moments.map(moment => moment.what)).toEqual(["He catches her as everything floats."]);
    expect(chronicle!.dropped).toEqual(["known: the line for Draconia Malfoy is 70 words; say it in sixty or fewer"]);
    expect(knownOn(mac, head()).get("Draconia Malfoy")?.text ?? null).toBe(before);
  });

  // GIVEN Draconia's Bond says she bills him for the slap and keeps him on her terms
  // WHEN a Scene ends in which she floated in his arms and ordered him to put her down, and did not thank him
  // THEN her Bond has a turn for that Scene, and where things stand says she let him hold her before she remembered to
  //   refuse it
  it("living-world › Where things stand between him and each person is kept › A turn in the classroom", async () => {
    const move = "I catch you as everything floats.";
    const before = "She bills him for the slap and keeps him on her terms.";
    const standing = "She bills him for the slap and keeps him on her terms, but she let him hold her before she remembered to refuse it.";
    const turn = "She floated in his arms, ordered him to put her down, and did not thank him.";
    const classroom = hogwartsStoryFile({ title: "Twenty-nine minutes", place: "An empty classroom", who: ["Draconia Malfoy"], prose: "Draconia sets out her notes." });
    classroom.people = classroom.people.map(person => person.name === "Draconia Malfoy" ? { ...person, bond: before } : person) as typeof classroom.people;
    const { play, engine, storyId, head, mac, models } = playable(classroom, { chronicler: [{ answer: JSON.stringify({
      summary: "In the classroom Draconia floated in his arms and ordered him to put her down.",
      moments: [{ what: "He catches her as everything floats.", quotes: [{ entry: "E2", text: move }], there: ["Draconia Malfoy"], weight: 4 }],
      told: [],
      bonds: [{ who: "Draconia Malfoy", standing, turn }]
    }) }] });
    await play(move);
    const beforeTheEnd = head();
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    // The Chronicler was shown where things stood, to rewrite it.
    expect(models.chronicler.requests[0]!.prompt).toContain(`- Draconia Malfoy: ${before}`);
    expect(bondsOn(mac, head()).get("Draconia Malfoy")).toEqual({ standing, turns: [{ text: turn, scene: { number: 1, title: "Twenty-nine minutes" } }] });
    // Another Path, from before the Scene ended, is as it was.
    const other = mac.tree.createPath(storyId, "Elsewhere", beforeTheEnd, false);
    expect(bondsOn(mac, other.headEntryId).get("Draconia Malfoy")).toEqual({ standing: before, turns: [] });
  });

  it("leaves out a Bond row past its limits, or for someone not in the Scene, and keeps the rest of the record", async () => {
    const move = "I catch you as everything floats.";
    const classroom = hogwartsStoryFile({ title: "Twenty-nine minutes", place: "An empty classroom", who: ["Draconia Malfoy"], prose: "Draconia sets out her notes." });
    const { play, engine, storyId, head, mac } = playable(classroom, { chronicler: Array.from({ length: 2 }, () => ({ answer: JSON.stringify({
      summary: "In the classroom Draconia floated in his arms.",
      moments: [{ what: "He catches her as everything floats.", quotes: [{ entry: "E2", text: move }], there: ["Draconia Malfoy"], weight: 4 }],
      told: [],
      bonds: [
        { who: "Draconia Malfoy", standing: "word ".repeat(61).trim(), turn: "She let him." },
        { who: "Draconia Malfoy", standing: "She lets him close.", turn: "word ".repeat(38).trim() },
        { who: "Harry Potter", standing: "Friends.", turn: "They talked." }
      ]
    }) })) });
    await play(move);
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    const [chronicle] = chronicles(mac, head());
    expect(chronicle!.moments).toHaveLength(1);
    expect(chronicle!.dropped).toEqual([
      "bonds: where things stand with Draconia Malfoy is 61 words; say it in forty or fewer",
      "bonds: the turn with Draconia Malfoy is 38 words; say it in twenty-five or fewer",
      "bonds: Harry Potter was not in this Scene"
    ]);
    expect(bondsOn(mac, head()).has("Draconia Malfoy")).toBe(false);
  });

  // WHEN the record's turn with Draconia comes back 29 words long, where 25 were asked
  // THEN it is kept as written
  it("living-world › Moments are remembered from one record › A line a little long is kept", async () => {
    const move = "I catch you as everything floats.";
    const turn = "She floated in his arms, ordered him to put her down, and did not even thank him; she straightened his collar instead, as if that settled what was owed.";
    expect(turn.split(/\s+/)).toHaveLength(29);
    const classroom = hogwartsStoryFile({ title: "Twenty-nine minutes", place: "An empty classroom", who: ["Draconia Malfoy"], prose: "Draconia sets out her notes." });
    const { play, engine, storyId, head, mac, models } = playable(classroom, { chronicler: [{ answer: JSON.stringify({
      summary: "In the classroom Draconia floated in his arms.",
      moments: [{ what: "He catches her as everything floats.", quotes: [{ entry: "E2", text: move }], there: ["Draconia Malfoy"], weight: 4 }],
      told: [],
      bonds: [{ who: "Draconia Malfoy", standing: "She lets him close, and calls it business.", turn }]
    }) }] });
    await play(move);
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    expect(chronicles(mac, head())[0]!.dropped).toEqual([]);
    expect(bondsOn(mac, head()).get("Draconia Malfoy")!.turns.at(-1)!.text).toBe(turn);
    expect(models.chronicler.requests).toHaveLength(1);
  });

  // GIVEN the record of the library Scene could not be made
  // WHEN the next Scene ends
  // THEN it is recorded, and the library Scene is tried again after it, and recorded
  it("living-world › Moments are remembered from one record › A Scene that could not be recorded does not block the rest", async () => {
    const library = hogwartsStoryFile({ title: "The library", place: "The library", who: ["Hermione Granger"], prose: "Hermione is at the end table." });
    const { play, engine, storyId, head, mac } = playable(library, {
      writer: [{ answer: JSON.stringify({ leaves_scene: false, frame: { title: "The library", place: "The library", purpose: "p", exit: "e" }, comes_in: ["Hermione Granger"], goes: [], beats: [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }], note: "n", call: "continue", intensity: 2, arc_moved: true, clock: "Day 3 21:42", taste: null, in_play: [] }) }, leaving],
      chronicler: [{ fail: "Sonnet is overloaded" }, { fail: "Sonnet is overloaded" }]
    });
    await play("I ask Hermione about the essay.");
    await play("I go to my room.");
    await engine.chronicled(storyId);
    // The library Scene could not be recorded: a gap says so, and nothing else is held up.
    expect(chronicles(mac, head())).toHaveLength(0);
    const gaps = mac.tree.recordsOn(head(), "record_gap");
    expect(gaps.map(gap => gap.payload)).toMatchObject([{ kind: "record_gap", attempts: 1, givenUp: false, reason: expect.stringContaining("Sonnet is overloaded") }]);

    await play("I sit on my bed.");
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    // In the order they were written: the Scene that ended first, then the one that had failed.
    const written = mac.tree.recordsOn(head(), "chronicle").sort((left, right) => left.seq - right.seq);
    const title = (record: Entry) => (mac.tree.entry((record.payload as Chronicle).scene)!.payload as { title: string }).title;
    expect(written.map(title)).toEqual(["Lights out", "The library"]);
  });

  it("gives a Scene up after three tries, and then tries it no more", async () => {
    const { play, engine, storyId, head, mac } = playable(hogwartsStoryFile(), { chronicler: Array.from({ length: 6 }, () => ({ fail: "Sonnet is overloaded" })) });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    for (let start = 0; start < 2; start++) { engine.chronicleAll(); await engine.chronicled(storyId); }
    const gaps = () => mac.tree.recordsOn(head(), "record_gap").map(gap => gap.payload as RecordGap);
    expect(gaps().map(gap => [gap.attempts, gap.givenUp])).toEqual([[1, false], [2, false], [3, true]]);
    // Given up: starting again tries nothing more.
    engine.chronicleAll();
    await engine.chronicled(storyId);
    expect(gaps()).toHaveLength(3);
    expect(dueChronicle(mac, head(), new Date(), true)).toBeNull();
  });
});
