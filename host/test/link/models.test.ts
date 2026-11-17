import { afterEach, describe, expect, it } from "vitest";
import type { ModelsView } from "../../src/protocol/generated/link.js";
import type { Act } from "../../src/story/outline.js";
import { backupModels, jobModels, storyActor } from "../../src/models/jobs.js";
import { callsFor } from "../support/host.js";
import { runningMac } from "../support/link.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";
import type { SceneView } from "../../src/protocol/generated/link.js";
import { served } from "./served.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function mac(home?: string) {
  const running = await runningMac(undefined, undefined, { home });
  closers.push(running.close);
  const models = async () => await (await running.call("/models")).json() as ModelsView;
  const put = async (path: string, body: unknown) => await running.call(path, { method: "PUT", body: JSON.stringify(body) });
  const view = async () => await (await running.call(`/stories/${running.storyId}/scene`)).json() as SceneView;
  const post = async (path: string, body: unknown) => await running.call(`/stories/${running.storyId}/${path}`, { method: "POST", body: JSON.stringify(body) });
  const message = async (response: Response) => (await response.json() as { error: { message: string } }).error.message;
  return { ...running, models, put, view, post, message };
}

describe("the Models screen over the link", () => {
  it("shows each Story's Actor, every job with what it does and its model, and what each provider offers", async () => {
    const { models, storyId } = await mac();
    const view = await models();
    expect(view.stories).toEqual([{ story_id: storyId, title: "The Malfoy Problem", own: false,
      actor: { choice: { provider: "claude", model: "claude-opus-5-5", effort: null }, label: "Opus 5.5" } }]);
    expect(view.jobs.map(job => [job.job, job.title, job.does])).toEqual([
      ["editor", "Editor", "Checks each Reply before you read it"],
      ["chronicler", "Chronicler", "Records what happened"],
      ["director", "Director", "Keeps the Outline and plans the days ahead"],
      ["weaver", "Weaver", "Moves the World on"],
      ["folder", "Folder", "Keeps The Story So Far short"]
    ]);
    expect(view.jobs.map(job => job.model.choice)).toEqual([
      { provider: "claude", model: "claude-sonnet-5-5", effort: null },
      { provider: "claude", model: "claude-opus-5-5", effort: "medium" },
      { provider: "claude", model: "claude-fable-5-1", effort: "high" },
      { provider: "claude", model: "claude-opus-5-5", effort: null },
      { provider: "claude", model: "claude-opus-5-5", effort: null }
    ]);
    expect(view.providers.map(provider => [provider.label, provider.reachable, provider.models.map(model => model.name)])).toEqual([
      ["CLAUDE", true, ["Opus 5.5", "Fable 5.1", "Sonnet 5.5", "Haiku 4.5"]],
      ["CODEX", true, ["GPT 6.1 Sol", "GPT 6 Luna"]],
      ["ANTIGRAVITY", true, ["Gemini 3.8 Flash"]]
    ]);
    expect(view.providers[1]!.models[0]).toEqual({ id: "gpt-6.1-sol", name: "GPT 6.1 Sol", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"], default_effort: "low" });
  });

  it("sets a job's model and a Story's Actor, answering with the screen as it now stands", async () => {
    const { put, storyId, mac: home } = await mac();
    const weaver = await put("/models/jobs/weaver", { model: { provider: "codex", model: "gpt-6.1-sol", effort: "high" } });
    expect(weaver.status).toBe(200);
    expect((await weaver.json() as ModelsView).jobs.find(job => job.job === "weaver")!.model.label).toBe("GPT 6.1 Sol · high");
    expect(jobModels(home.home).weaver).toEqual({ provider: "codex", model: "gpt-6.1-sol", effort: "high" });

    const actor = await put(`/stories/${storyId}/actor`, { model: { provider: "antigravity", model: "gemini-3.8-flash", effort: "low" } });
    expect((await actor.json() as ModelsView).stories[0]).toMatchObject({ own: true, actor: { label: "Gemini 3.8 Flash · low" } });
    expect(storyActor(home.home, storyId)).toEqual({ provider: "antigravity", model: "gemini-3.8-flash", effort: "low" });

    const back = await put(`/stories/${storyId}/actor`, { model: null });
    expect((await back.json() as ModelsView).stories[0]).toMatchObject({ own: false, actor: { label: "Opus 5.5" } });
  });

  it("refuses a model, an effort, a job or a Story it does not know, saying which", async () => {
    const { put, message, storyId } = await mac();
    const model = await put("/models/jobs/editor", { model: { provider: "codex", model: "gpt-9" } });
    expect(model.status).toBe(400);
    expect(await message(model)).toBe("Codex does not offer gpt-9.");
    const effort = await put("/models/jobs/editor", { model: { provider: "claude", model: "claude-haiku-4-5-20251001", effort: "max" } });
    expect(await message(effort)).toBe("Haiku 4.5 has no effort max.");
    const job = await put("/models/jobs/actor", { model: { provider: "claude", model: "claude-opus-5-5" } });
    expect(await message(job)).toBe("There is no job \"actor\" for every Story; the Actor is set per Story.");
    const story = await put("/stories/nowhere/actor", { model: null });
    expect(story.status).toBe(404);
    const shape = await put(`/stories/${storyId}/actor`, { model: { provider: "openai", model: "x" } });
    expect(shape.status).toBe(400);
  });

  // WHEN the player sets the Weaver to GPT 6.1 Sol
  // THEN the next Weaver work runs on GPT 6.1 Sol
  it("outside-the-scene › One Models screen › Moving the Weaver to Codex", async () => {
    const { put, post, view, engine, storyId, mac: home } = await mac();
    await put("/models/jobs/weaver", { model: { provider: "codex", model: "gpt-6.1-sol", effort: null } });
    await post("moves", { text: "I say goodnight.", after: (await view()).head_entry_id });
    await engine.settled(storyId);
    await post("end-scene", { after: (await view()).head_entry_id });
    await engine.ended(storyId);
    expect(callsFor(home.db, "weaver").at(-1)).toMatchObject({ provider: "codex", model: "gpt-6.1-sol" });
    expect((await view()).day_view?.scene_end).toEqual({ step: null, failed: null, rethinking: null });
  });

  // GIVEN the player set the Editor to Gemini 3.8 Flash at high effort
  // WHEN the Mac's host is restarted
  // THEN the Models screen still shows the Editor on Gemini 3.8 Flash, high, and the next Editor work runs on it
  it("outside-the-scene › One Models screen › A setting outlasts the Mac restarting", async () => {
    const first = await mac();
    await first.put("/models/jobs/editor", { model: { provider: "antigravity", model: "gemini-3.8-flash", effort: "high" } });
    await first.close();
    const again = await mac(first.mac.home);
    expect((await again.models()).jobs.find(job => job.job === "editor")!.model.label).toBe("Gemini 3.8 Flash · high");
    await again.post("moves", { text: "I wave.", after: (await again.view()).head_entry_id });
    await again.engine.settled(again.storyId);
    expect(callsFor(again.mac.db, "editor").at(-1)).toEqual({ provider: "antigravity", model: "gemini-3.8-flash", effort: "high" });
  });

  it("carries a model for one Reply on Redo and Retry, and checks it is offered", async () => {
    const { post, view, engine, storyId, mac: home, message } = await mac();
    await post("moves", { text: "I sit beside her.", after: (await view()).head_entry_id });
    await engine.settled(storyId);
    const refused = await post("redo", { after: (await view()).head_entry_id, direction: null, remember: false, model: { provider: "codex", model: "gpt-9", effort: null } });
    expect(await message(refused)).toBe("Codex does not offer gpt-9.");
    const redo = await post("redo", { after: (await view()).head_entry_id, direction: null, remember: false, model: { provider: "codex", model: "gpt-6.1-sol", effort: null } });
    expect(redo.status).toBe(200);
    await engine.settled(storyId);
    expect(callsFor(home.db, "actor").at(-1)).toMatchObject({ provider: "codex", model: "gpt-6.1-sol" });
    // A Retry with nothing to retry is refused whatever it carries.
    expect(await message(await post("retry", { model: null }))).toBe("There is nothing waiting to be tried again.");
    expect(await message(await post("retry", { model: { provider: "claude", model: "claude-sonnet-5-5", effort: null } }))).toBe("There is nothing waiting to be tried again.");
    expect(await message(await post("retry", { model: { provider: "codex", model: "gpt-9", effort: null } }))).toBe("Codex does not offer gpt-9.");
  });

  // GIVEN the player has never set a model
  // THEN the Models screen shows the Director on Fable 5.1, the Editor on Sonnet 5.5, and every other job on Opus
  //   5.5, each with GPT 6.1 Sol as its second model
  it("outside-the-scene › One Models screen › The defaults", async () => {
    // A Story whose Story File names no Actor takes the default one.
    const story = await served(playable(hogwartsStoryFile()));
    closers.push(story.close);
    const view = await (await story.call("/models")).json() as ModelsView;
    expect(view.jobs.map(job => [job.title, job.model.label, job.backup.label])).toEqual([
      ["Editor", "Sonnet 5.5", "GPT 6.1 Sol"],
      ["Chronicler", "Opus 5.5 · medium", "GPT 6.1 Sol"],
      ["Director", "Fable 5.1 · high", "GPT 6.1 Sol"],
      ["Weaver", "Opus 5.5", "GPT 6.1 Sol"],
      ["Folder", "Opus 5.5", "GPT 6.1 Sol"]
    ]);
    expect(view.stories).toEqual([expect.objectContaining({ own: false, actor: { choice: { provider: "claude", model: "claude-opus-5-5", effort: "high" }, label: "Opus 5.5 · high" } })]);
    expect(view.actor_backup.label).toBe("GPT 6.1 Sol");
  });

  // WHEN the player sets the Folder to Haiku 4.5
  // THEN the Models screen shows the Folder on Haiku 4.5, and the next fold runs on it
  it("outside-the-scene › One Models screen › The Folder on Haiku", async () => {
    const story = await served(playable());
    closers.push(story.close);
    const { call, mac: home, engine, storyId, play, head } = story;
    const folderOf = (view: ModelsView) => view.jobs.find(job => job.job === "folder")!;
    const moved = await call("/models/jobs/folder", { method: "PUT", body: JSON.stringify({ model: { provider: "claude", model: "claude-haiku-4-5-20251001", effort: null } }) });
    expect(moved.status).toBe(200);
    expect(folderOf(await moved.json() as ModelsView)).toMatchObject({ title: "Folder", model: { label: "Haiku 4.5", choice: { provider: "claude", model: "claude-haiku-4-5-20251001", effort: null } }, backup: { label: "GPT 6.1 Sol" } });
    expect(folderOf(await (await call("/models")).json() as ModelsView).model.label).toBe("Haiku 4.5");
    // The first Scene is played in the Outline's first Act; the Act then ends, so the next Scene's end folds it.
    const act = (number: number): Act => ({ number, title: `Year ${number}`, question: "Will she?", buildsTo: "The summer", detail: number === 1 ? "detailed" : "sketched", turns: [], relationships: [], movers: [], handsOn: "" });
    const outlined = (current: number) => {
      const path = home.tree.currentPath(storyId)!;
      const entry = home.tree.append(storyId, path.headEntryId, { kind: "outline_set", outline: { current, acts: [act(1), act(2)], ending: "Voldemort falls.", intentions: [], setups: [], promoted: [], revisedAfter: 0, deep: false, lookedUp: [] },
        reason: "The Act ends.", planFollows: false, dropped: [], callId: "c", model: { provider: "claude", model: "claude-fable-5-1" } });
      home.tree.moveHead(path.id, path.headEntryId, entry.id);
    };
    outlined(1);
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end-1");
    await engine.ended(storyId);
    expect(callsFor(home.db, "folder")).toEqual([]);
    outlined(2);
    await play("In the morning I go down to breakfast.");
    engine.endScene(storyId, head(), "end-2");
    await engine.ended(storyId);
    expect(callsFor(home.db, "folder")[0]).toEqual({ provider: "claude", model: "claude-haiku-4-5-20251001", effort: null });
  }, 30_000);

  it("sets a job's second model, the Actor's too, from its next work, and refuses one it does not know", async () => {
    const { put, models, message, mac: home } = await mac();
    const set = await put("/models/jobs/director", { model: { provider: "codex", model: "gpt-6.1-sol", effort: "high" }, backup: true });
    expect(set.status).toBe(200);
    const director = (await set.json() as ModelsView).jobs.find(job => job.job === "director")!;
    expect(director).toMatchObject({ model: { label: "Fable 5.1 · high" }, backup: { label: "GPT 6.1 Sol · high" } });
    expect(jobModels(home.home).director).toEqual({ provider: "claude", model: "claude-fable-5-1", effort: "high" });
    expect(backupModels(home.home).director).toEqual({ provider: "codex", model: "gpt-6.1-sol", effort: "high" });
    // The Actor has no model for every Story, but its second model is the Mac's.
    expect((await put("/models/jobs/actor", { model: { provider: "codex", model: "gpt-6-luna", effort: null }, backup: true })).status).toBe(200);
    expect(backupModels(home.home).actor).toEqual({ provider: "codex", model: "gpt-6-luna", effort: "medium" });
    expect((await models()).actor_backup.label).toBe("GPT 6 Luna · medium");
    expect((await models()).jobs.find(job => job.job === "editor")!.backup.label).toBe("GPT 6.1 Sol");
    expect(await message(await put("/models/jobs/weaver", { model: { provider: "codex", model: "gpt-9" }, backup: true }))).toBe("Codex does not offer gpt-9.");
  });

  it("asks Antigravity for a model with an effort when the phone sent none", async () => {
    const { post, view, engine, storyId, mac: home } = await mac();
    await post("moves", { text: "I sit beside her.", after: (await view()).head_entry_id });
    await engine.settled(storyId);
    await post("redo", { after: (await view()).head_entry_id, direction: null, remember: false, model: { provider: "antigravity", model: "gemini-3.8-flash", effort: null } });
    await engine.settled(storyId);
    expect(callsFor(home.db, "actor").at(-1)).toEqual({ provider: "antigravity", model: "gemini-3.8-flash", effort: "medium" });
  });
});

