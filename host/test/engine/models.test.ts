import { describe, expect, it } from "vitest";
import { Engine } from "../../src/engine/engine.js";
import { FakeModels } from "../../src/models/fake.js";
import { backupModels, jobModels, setBackupModel, setJobModel, setStoryActor } from "../../src/models/jobs.js";
import { Models } from "../../src/models/model-call.js";
import { scriptedRunners } from "../../src/models/runners.js";
import type { ReplyWritten as Reply } from "../../src/story/entries.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { sceneView } from "../../src/views/scene.js";
import { callsFor, freshHome } from "../support/host.js";
import { GatedRunner } from "../support/link.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile, malfoyProblemStoryFile, nightTrainStoryFile, writeStoryFile } from "../support/story-files.js";

const OPUS = { provider: "claude", model: "claude-opus-5-5" } as const;
const SOL = { provider: "codex", model: "gpt-6.1-sol" } as const;
const SONNET = { provider: "claude", model: "claude-sonnet-5-5" } as const;
const FLASH = { provider: "antigravity", model: "gemini-3.8-flash", effort: "high" } as const;
const latest = <T>(list: T[]) => list.at(-1);

describe("the models each job runs on", () => {
  // WHEN the player sets the Actor for "The Malfoy Problem" to Opus 5.5
  // THEN that Story's Replies are written by Opus 5.5, whatever the other Stories use
  it("outside-the-scene › One Models screen › A Story's own Actor", async () => {
    const mac = freshHome();
    // The Malfoy Problem's Story File names Sonnet 5.5; the player's choice outranks it (docs/adr/0008).
    const malfoy = importStoryFile(writeStoryFile({ ...malfoyProblemStoryFile(), actor: SONNET }), mac);
    const train = importStoryFile(writeStoryFile(nightTrainStoryFile()), mac);
    if (!malfoy.ok || !train.ok) throw new Error("import failed");
    const engine = new Engine(mac, new Models(mac.db, scriptedRunners(new FakeModels())));
    setStoryActor(mac.home, malfoy.storyId, OPUS);
    setStoryActor(mac.home, train.storyId, { provider: "codex", model: "gpt-6-luna" });

    for (const storyId of [malfoy.storyId, train.storyId]) {
      engine.move(storyId, "I look up.", mac.tree.currentPath(storyId)!.headEntryId, `trace-${storyId}`);
      await engine.settled(storyId);
    }
    const actorCalls = callsFor(mac.db, "actor");
    expect(actorCalls.map(call => [call.provider, call.model])).toEqual([["claude", "claude-opus-5-5"], ["codex", "gpt-6-luna"]]);
    const reply = mac.tree.entry(mac.tree.currentPath(malfoy.storyId)!.headEntryId)!.payload as Reply;
    expect(reply.kind).toBe("reply");
    expect(reply.model).toEqual(OPUS);
  });

  // GIVEN the Story's Actor is Opus 5.5
  // WHEN the player Redoes the latest Reply on GPT 6.1 Sol
  // THEN that Reply is written by GPT 6.1 Sol, and the next Reply is written by Opus 5.5 again
  it("scenes › Redo, with a Direction and another model if wanted › Redo on another model", async () => {
    const { mac, engine, storyId, head, play } = playable(hogwartsStoryFile());
    await play("I sit beside her.");
    engine.redo(storyId, head(), null, false, "trace-redo", SOL);
    await engine.settled(storyId);
    expect(latest(callsFor(mac.db, "actor"))).toMatchObject(SOL);
    expect((mac.tree.entry(head())!.payload as Reply).model).toEqual(SOL);
    // The Writer is not the Redo's to move.
    expect(latest(callsFor(mac.db, "writer"))).toMatchObject(SONNET);
    await play("I ask what she is reading.");
    expect(latest(callsFor(mac.db, "actor"))).toMatchObject(OPUS);
  });

  it("writes a Redo's Reply on its model even when the Mac restarted while it was being written", async () => {
    const { mac, storyId, head, play } = playable(hogwartsStoryFile());
    await play("I sit beside her.");
    // The first Mac is held mid-Reply and never finishes it.
    const held = new GatedRunner(["Never written."]);
    const stopped = new Engine(mac, new Models(mac.db, { ...scriptedRunners(new FakeModels()), codex: { run: (request, onText, signal) => request.agent === "actor" ? held.run(request, onText) : new FakeModels().run(request, onText, signal) } }));
    stopped.redo(storyId, head(), null, false, "trace-redo", SOL);
    await expect.poll(() => callsFor(mac.db, "actor").length).toBe(2);
    const restarted = new Engine(mac, new Models(mac.db, scriptedRunners(new FakeModels())));
    expect(sceneView(mac, restarted, storyId, "trace-view").turn.kind).toBe("failed");
    restarted.retry(storyId, "trace-retry");
    await restarted.settled(storyId);
    expect(latest(callsFor(mac.db, "actor"))).toMatchObject(SOL);
  });

  // GIVEN Opus 5.5 is overloaded and the Reply failed
  // WHEN the player chooses another model, GPT 6.1 Sol
  // THEN the Reply is written by GPT 6.1 Sol
  // AND the next Reply is written by Opus 5.5 again
  it("presence › Nothing fails silently › Another model for a failed Reply", async () => {
    // Opus 5.5 is overloaded, and so is the Actor's second model: the Reply failed.
    const { mac, engine, storyId, view, play } = playable(hogwartsStoryFile(), { actor: [{ fail: "Opus 5.5 is overloaded right now." }, { fail: "Sonnet 5.5 is overloaded right now." }] });
    await play("I kiss her, quickly.");
    expect(view().turn).toMatchObject({ kind: "failed", job: "actor" });
    engine.retry(storyId, "trace-retry", SOL);
    await engine.settled(storyId);
    expect(view().turn.kind).toBe("idle");
    expect(callsFor(mac.db, "actor").map(call => [call.provider, call.model])).toEqual([["claude", "claude-opus-5-5"], ["claude", "claude-sonnet-5-5"], ["codex", "gpt-6.1-sol"]]);
    expect((mac.tree.entry(mac.tree.currentPath(storyId)!.headEntryId)!.payload as Reply).model).toEqual(SOL);
    await play("I wait for her answer.");
    expect(latest(callsFor(mac.db, "actor"))).toMatchObject(OPUS);
    // Nothing was set: the try on another model was for that one Reply.
    expect(jobModels(mac.home)).toEqual(jobModels(freshHome().home));
  });

  it("runs a Writer that failed on the model chosen for it, for that one try", async () => {
    const { mac, engine, storyId, view, play } = playable(hogwartsStoryFile(), { writer: [{ fail: "Sonnet 5.5 is overloaded right now." }, { fail: "Sonnet 5.5 is overloaded right now." }] });
    await play("I kiss her, quickly.");
    expect(view().turn).toMatchObject({ kind: "failed", job: "writer" });
    engine.retry(storyId, "trace-retry", FLASH);
    await engine.settled(storyId);
    expect(view().turn.kind).toBe("idle");
    // Asked on its model and its second model before it gives up, then once on the model chosen.
    expect(callsFor(mac.db, "writer").map(call => [call.provider, call.model, call.effort])).toEqual([
      ["claude", "claude-sonnet-5-5", null], ["codex", "gpt-6.1-sol", null], ["antigravity", "gemini-3.8-flash", "high"]
    ]);
    // The Actor was not the one that failed, so it stays the Story's.
    expect(latest(callsFor(mac.db, "actor"))).toMatchObject(OPUS);
  });

  // GIVEN the Weaver's model failed and the World could not move on
  // WHEN the player chooses another model, Sonnet 5.5
  // THEN the World moves on with Sonnet 5.5, and the Day View is ready
  it("presence › Nothing fails silently › Another model for the World", async () => {
    // The Weaver is on GPT 6.1 Sol with Gemini as its second model, and both fail.
    const { mac, engine, storyId, head, view, play } = playable(hogwartsStoryFile(), { weaver: [{ fail: "GPT 6.1 Sol is at capacity." }, { fail: "Gemini is at capacity." }] });
    setJobModel(mac.home, "weaver", SOL);
    setBackupModel(mac.home, "weaver", FLASH);
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "trace-end");
    await engine.ended(storyId);
    expect(view().day_view?.scene_end).toMatchObject({ step: null, failed: { step: "weaver", reason: expect.stringContaining("Gemini is at capacity.") } });
    expect(view().day_view?.happenings).toEqual([]);
    engine.retry(storyId, "trace-world", SONNET);
    await engine.ended(storyId);
    expect(view().day_view?.scene_end).toEqual({ step: null, failed: null });
    expect(view().day_view?.happenings.length).toBeGreaterThan(0);
    expect(callsFor(mac.db, "weaver").map(call => [call.provider, call.model])).toEqual([["codex", "gpt-6.1-sol"], ["antigravity", "gemini-3.8-flash"], ["claude", "claude-sonnet-5-5"]]);
    const moved = mac.tree.pathTo(head()).filter(entry => entry.payload.kind === "world_moved");
    expect(moved.map(entry => entry.payload.kind === "world_moved" && entry.payload.model)).toEqual([SONNET]);
    // Nothing was set: the try on another model was for that one step.
    expect(jobModels(mac.home).weaver).toEqual(SOL);
    expect(backupModels(mac.home).weaver).toEqual(FLASH);
  });

  it("refuses a model for a Retry with nothing to retry", async () => {
    const { engine, storyId } = playable(hogwartsStoryFile());
    expect(() => engine.retry(storyId, "trace", SOL)).toThrow(/nothing waiting to be tried again/);
  });
});
