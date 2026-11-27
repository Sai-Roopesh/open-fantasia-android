import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backupModels, DEFAULT_JOB_MODELS, JOBS, jobModels, setBackupModel, setJobModel, setStoryActor, storyActor } from "../../src/models/jobs.js";
import { freshHome } from "../support/host.js";

describe("the Mac's model settings (docs/adr/0008)", () => {
  it("lists every job, the Rephraser, the Editor, the Director and the Folder included, each on its default until it is set", () => {
    const { home } = freshHome();
    expect(JOBS).toEqual(["rephraser", "editor", "chronicler", "director", "weaver", "folder"]);
    expect(jobModels(home)).toEqual(DEFAULT_JOB_MODELS);
    const opus = { provider: "claude", model: "claude-opus-5-5" };
    expect(DEFAULT_JOB_MODELS).toEqual({
      writer: { ...opus, effort: "medium" },
      rephraser: { provider: "opencode", model: "grok-4.7", effort: "medium" },
      editor: { provider: "claude", model: "claude-sonnet-5-5" },
      chronicler: { ...opus, effort: "medium" },
      weaver: opus,
      director: { provider: "claude", model: "claude-fable-5-1", effort: "high" },
      folder: opus
    });
  });

  it("gives every job its default second model until one is set, keeping Rephraser on OpenCode", () => {
    const { home } = freshHome();
    const sol = { provider: "codex", model: "gpt-6.1-sol" };
    const rephraserBackup = { provider: "opencode", model: "glm-5.3", effort: "high" };
    expect(backupModels(home)).toEqual({ writer: sol, rephraser: rephraserBackup, editor: sol, chronicler: sol, weaver: sol, director: sol, folder: sol, actor: sol });
    // A job moved to another model keeps GPT 6.1 Sol; one set keeps what it was set to, whatever the job's own model.
    setJobModel(home, "writer", { provider: "antigravity", model: "gemini-3.8-flash", effort: "high" });
    setBackupModel(home, "director", { provider: "codex", model: "gpt-6-luna", effort: "medium" });
    setBackupModel(home, "actor", { provider: "claude", model: "claude-opus-5-5" });
    setJobModel(home, "director", { provider: "claude", model: "claude-sonnet-5-5" });
    expect(backupModels(home)).toMatchObject({ writer: sol, director: { provider: "codex", model: "gpt-6-luna", effort: "medium" }, actor: { provider: "claude", model: "claude-opus-5-5" } });
    expect(jobModels(home).director).toEqual({ provider: "claude", model: "claude-sonnet-5-5" });
  });

  it("keeps a job's model and a Story's own Actor, each without disturbing the other", () => {
    const { home } = freshHome();
    setJobModel(home, "weaver", { provider: "codex", model: "gpt-6.1-sol", effort: "high" });
    setStoryActor(home, "malfoy", { provider: "claude", model: "claude-opus-5-5" });
    setJobModel(home, "director", { provider: "antigravity", model: "gemini-3.1-pro", effort: "high" });
    expect(jobModels(home).weaver).toEqual({ provider: "codex", model: "gpt-6.1-sol", effort: "high" });
    expect(jobModels(home).director).toEqual({ provider: "antigravity", model: "gemini-3.1-pro", effort: "high" });
    expect(jobModels(home).writer).toEqual(DEFAULT_JOB_MODELS.writer);
    expect(storyActor(home, "malfoy")).toEqual({ provider: "claude", model: "claude-opus-5-5" });
    expect(storyActor(home, "night-train")).toBeNull();
  });

  it("goes back to the Story File's Actor when a Story's own is cleared", () => {
    const { home } = freshHome();
    setStoryActor(home, "malfoy", { provider: "codex", model: "gpt-6.1-sol" });
    setStoryActor(home, "malfoy", null);
    expect(storyActor(home, "malfoy")).toBeNull();
  });

  it("takes the default for every job models.json does not name", () => {
    const { home } = freshHome();
    writeFileSync(join(home, "models.json"), JSON.stringify({ writer: { provider: "claude", model: "claude-opus-5-5", effort: "high" } }));
    expect(jobModels(home)).toEqual({ ...DEFAULT_JOB_MODELS, writer: { provider: "claude", model: "claude-opus-5-5", effort: "high" } });
    expect(storyActor(home, "malfoy")).toBeNull();
    setStoryActor(home, "malfoy", { provider: "claude", model: "claude-sonnet-5-5" });
    expect(jobModels(home).writer).toEqual({ provider: "claude", model: "claude-opus-5-5", effort: "high" });
  });

  it("writes the file whole, leaving nothing half-written beside it", () => {
    const { home } = freshHome();
    setJobModel(home, "writer", { provider: "claude", model: "claude-haiku-4-5" });
    setStoryActor(home, "malfoy", { provider: "claude", model: "claude-opus-5-5" });
    expect(readdirSync(home).filter(name => name.startsWith("models"))).toEqual(["models.json"]);
    expect(JSON.parse(readFileSync(join(home, "models.json"), "utf8"))).toMatchObject({
      writer: { model: "claude-haiku-4-5" }, actors: { malfoy: { model: "claude-opus-5-5" } }
    });
  });
});
