import { describe, expect, it } from "vitest";
import { playable } from "../support/play.js";
import { besideOf, editNote, writeNote } from "../../src/store/beside.js";
import { Engine } from "../../src/engine/engine.js";
import { Models } from "../../src/models/model-call.js";
import { FakeModels } from "../../src/models/fake.js";
import { openHome } from "../support/host.js";
import { learnLesson } from "../../src/store/beside.js";
import { scriptedRunners } from "../../src/models/runners.js";

describe("one writing generation with shared Directions", () => {
  it("plans and writes in one provider call, then independently checks the Reply", async () => {
    const s = playable();
    await s.play("I sit beside Hermione.");
    expect(s.models.requests.map(request => request.agent)).toEqual(["actor", "editor"]);
    expect(s.path().at(-1)).toMatchObject({ kind: "reply" });
    expect(s.view().turn.kind).toBe("idle");
  });

  it("delivers exact Redo notes and the rejected draft, then retains notes after later Moves and restart", async () => {
    const s = playable(undefined, { actor: [{ answer: "Hermione turns a page without speaking." }] });
    await s.play("I sit beside Hermione.");
    const direction = "Keep her familiar, and let her finish the anecdote without asking me another question.";
    s.engine.redo(s.storyId, s.head(), direction, false, "redo");
    await s.engine.settled(s.storyId);
    const revision = s.models.requests.filter(request => request.agent === "actor").at(-1)!;
    expect(revision.prompt).toContain(direction);
    expect(revision.prompt).toContain("Hermione turns a page without speaking.");
    expect(revision.prompt).toContain("<revision>");
    await s.play("I listen.");
    const later = s.models.requests.filter(request => request.agent === "actor").at(-1)!;
    expect(later.prompt).toContain(direction);
    expect(later.prompt).not.toContain("<revision>");
    expect(s.models.editor.requests.at(-1)!.prompt).toContain(direction);
    const fake = new FakeModels();
    const restarted = new Engine(s.mac, new Models(s.mac.db, scriptedRunners(fake)));
    restarted.move(s.storyId, "I wait.", s.head(), "after-restart");
    await restarted.settled(s.storyId);
    expect(fake.requests[0]!.prompt).toContain(direction);
    const note = besideOf(s.mac, s.storyId).notes.find(note => note.text === direction)!;
    editNote(s.mac, s.storyId, note.id, "Let this quiet moment continue.", false);
    restarted.move(s.storyId, "I sip my tea.", s.head(), "archived");
    await restarted.settled(s.storyId);
    expect(fake.requests.filter(request => request.agent === "actor").at(-1)!.prompt).not.toContain("Let this quiet moment continue.");
    expect(besideOf(s.mac, s.storyId).notes.find(item => item.id === note.id)).toMatchObject({ active: false });
  });

  it("resumes the saved draft after an Editor failure, including after a worker restart", async () => {
    const s = playable(undefined, { editor: [{ fail: "editor unavailable" }, { fail: "editor unavailable" }] });
    await s.play("I sit down.");
    expect(s.view().turn).toMatchObject({ kind: "failed", job: "editor" });
    const generated = s.models.requests.filter(request => request.agent === "actor").length;
    const fake = new FakeModels();
    const restarted = new Engine(s.mac, new Models(s.mac.db, scriptedRunners(fake)));
    restarted.retry(s.storyId, "retry-check");
    await restarted.settled(s.storyId);
    expect(fake.requests.map(request => request.agent)).toEqual(["editor"]);
    expect(s.models.requests.filter(request => request.agent === "actor")).toHaveLength(generated);
    expect(s.path().at(-1)).toMatchObject({ kind: "reply" });
  });

  it("keeps one instruction snapshot throughout a generation", async () => {
    const s = playable(undefined, { editor: [{ fail: "editor unavailable" }, { fail: "editor unavailable" }] });
    const note = writeNote(s.mac, s.storyId, "Keep the conversation quiet.");
    await s.play("I sit down.");
    editNote(s.mac, s.storyId, note.id, "Now make her angry.", true);
    s.engine.retry(s.storyId, "retry");
    await s.engine.settled(s.storyId);
    const check = s.models.editor.requests.at(-1)!;
    expect(check.prompt).toContain("Keep the conversation quiet.");
    expect(check.prompt).not.toContain("Now make her angry.");
    await s.play("I wait.");
    expect(s.models.requests.filter(request => request.agent === "actor").at(-1)!.prompt).toContain("Now make her angry.");
  });

  it("migrates a legacy inferred lesson to its exact Direction without changing played entries", async () => {
    const s = playable();
    await s.play("I sit down.");
    const direction = "Keep the family argument unresolved.";
    s.engine.redo(s.storyId, s.head(), direction, true, "redo");
    await s.engine.settled(s.storyId);
    const before = s.mac.tree.pathTo(s.head()).map(entry => entry.id);
    learnLesson(s.mac, s.storyId, "story", "Legacy paraphrase.");
    s.mac.db.prepare("INSERT INTO traces (id, method, path, request, started_at) VALUES (?, ?, ?, ?, ?)").run("legacy", "POST", `/stories/${s.storyId}/redo`, JSON.stringify({ direction }), new Date().toISOString());
    s.mac.db.prepare("INSERT INTO calls (id, trace_id, story_id, agent, provider, model, request, answer, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("legacy", "legacy", s.storyId, "writer", "claude", "opus", "{}", JSON.stringify({ taste: "Legacy paraphrase." }), new Date().toISOString());
    const reopened = openHome(s.mac.home);
    const beside = besideOf(reopened, s.storyId);
    expect(beside.taste).not.toContain("Legacy paraphrase.");
    expect(beside.notes).toContainEqual(expect.objectContaining({ text: direction, active: true }));
    expect(reopened.tree.pathTo(s.head()).map(entry => entry.id)).toEqual(before);
    expect(reopened.db.prepare("SELECT active FROM taste WHERE line = ?").get("Legacy paraphrase.")).toEqual({ active: 0 });
    reopened.db.close();
  });

  it("does not repeatedly attempt a provider whose subscription access is disabled", async () => {
    const s = playable(undefined, { actor: [{ fail: "Your organization has disabled Claude subscription access for Claude Code" }] });
    await s.play("I sit down.");
    await s.play("I wait.");
    const calls = s.mac.db.prepare("SELECT provider, error FROM calls").all() as { provider: string; error: string | null }[];
    expect(calls.filter(call => call.provider === "claude")).toHaveLength(1);
    expect(s.view().turn.kind).toBe("idle");
  });
});
