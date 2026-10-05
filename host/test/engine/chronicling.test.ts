import { describe, expect, it } from "vitest";
import { Engine } from "../../src/engine/engine.js";
import { fakeChronicleAnswer, FakeModels } from "../../src/models/fake.js";
import { Models, type ModelRequest, type ModelRunner } from "../../src/models/model-call.js";
import type { Chronicle, Entry } from "../../src/story/entries.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

const leaving = { answer: JSON.stringify({ leaves_scene: true, frame: { title: "Lights out", place: "The boys' dormitory", purpose: "p", exit: "e" }, comes_in: ["Ron Weasley"], goes: [], beats: [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }], note: "Ron is up.", call: "continue", intensity: 2, arc_moved: true, clock: "Day 3 21:45", taste: null, in_play: [] }) };

/** The Chronicles the current Path sees, as their payloads, with the entry each hangs off. */
function chronicles(mac: ReturnType<typeof playable>["mac"], head: string): (Chronicle & { parent: Entry })[] {
  return mac.tree.chroniclesOn(head).map(entry => ({ ...(entry.payload as Chronicle), parent: mac.tree.entry(entry.parentId!)! }));
}

describe("when the Chronicler runs", () => {
  it("chronicles a Scene the player ends, to its end, with its summary", async () => {
    const { play, engine, storyId, head, mac } = playable();
    await play("I sit down.");
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.chronicled(storyId);
    const [chronicle] = chronicles(mac, head());
    expect(chronicle).toMatchObject({ summary: "The Scene was played to its end.", parent: { payload: { kind: "scene_closed" } } });
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

  it("chronicles an open Scene every twelve exchanges, with no summary", async () => {
    const { play, engine, storyId, head, mac } = playable();
    for (let exchange = 1; exchange <= 11; exchange++) await play(`I stay by the fire (${exchange}).`);
    await engine.chronicled(storyId);
    expect(chronicles(mac, head())).toHaveLength(0);
    await play("I stay by the fire (12).");
    await engine.chronicled(storyId);
    const [chronicle] = chronicles(mac, head());
    expect(chronicle).toMatchObject({ summary: null, parent: { id: head() } });
    await play("I stay by the fire (13).");
    await engine.chronicled(storyId);
    expect(chronicles(mac, head())).toHaveLength(1);
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
