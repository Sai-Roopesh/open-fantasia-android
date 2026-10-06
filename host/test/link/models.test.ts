import { afterEach, describe, expect, it } from "vitest";
import type { ModelsView } from "../../src/protocol/generated/link.js";
import { jobModels, storyActor } from "../../src/models/jobs.js";
import { runningMac } from "../support/link.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function mac() {
  const running = await runningMac();
  closers.push(running.close);
  const models = async () => await (await running.call("/models")).json() as ModelsView;
  const put = async (path: string, body: unknown) => await running.call(path, { method: "PUT", body: JSON.stringify(body) });
  const message = async (response: Response) => (await response.json() as { error: { message: string } }).error.message;
  return { ...running, models, put, message };
}

describe("the Models screen over the link", () => {
  it("shows each Story's Actor, every job with what it does and its model, and what each provider offers", async () => {
    const { models, storyId } = await mac();
    const view = await models();
    expect(view.stories).toEqual([{ story_id: storyId, title: "The Malfoy Problem", own: false,
      actor: { choice: { provider: "claude", model: "claude-opus-5-5", effort: null }, label: "Opus 5.5" } }]);
    expect(view.jobs.map(job => [job.job, job.title, job.does, job.model.label])).toEqual([
      ["writer", "Writer", "Plans each Reply before it starts", "Sonnet 5.5"],
      ["chronicler", "Chronicler", "Records what happened", "Sonnet 5.5"],
      ["weaver", "Weaver", "Moves the World on", "Sonnet 5.5"],
      ["director", "Director", "Shapes the long run", "Opus 5.5"]
    ]);
    expect(view.providers.map(provider => [provider.label, provider.reachable, provider.models.map(model => model.name)])).toEqual([
      ["CLAUDE", true, ["Opus 5.5", "Sonnet 5.5", "Haiku 4.5"]],
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
    const model = await put("/models/jobs/writer", { model: { provider: "codex", model: "gpt-9" } });
    expect(model.status).toBe(400);
    expect(await message(model)).toBe("Codex does not offer gpt-9.");
    const effort = await put("/models/jobs/writer", { model: { provider: "claude", model: "claude-haiku-4-5-20251001", effort: "max" } });
    expect(await message(effort)).toBe("Haiku 4.5 has no effort max.");
    const job = await put("/models/jobs/actor", { model: { provider: "claude", model: "claude-opus-5-5" } });
    expect(await message(job)).toBe("There is no job \"actor\" for every Story; the Actor is set per Story.");
    const story = await put("/stories/nowhere/actor", { model: null });
    expect(story.status).toBe(404);
    const shape = await put(`/stories/${storyId}/actor`, { model: { provider: "openai", model: "x" } });
    expect(shape.status).toBe(400);
  });
});
