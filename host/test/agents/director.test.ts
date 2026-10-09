import { describe, expect, it } from "vitest";
import { checkPlan, directorPrompt, DirectorFailed, writePlan, type DirectorAsk } from "../../src/agents/director.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { worldOn } from "../../src/story/world.js";
import { freshHome } from "../support/host.js";
import { malfoyProblemStoryFile, writeStoryFile } from "../support/story-files.js";

const ARC = "Draconia comes round to Roopesh, slowly, against everything she was raised to be.";

function ask(changes: Partial<DirectorAsk> = {}): DirectorAsk {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(malfoyProblemStoryFile()), mac);
  if (!imported.ok) throw new Error("import failed");
  const head = mac.tree.currentPath(imported.storyId)!.headEntryId;
  return {
    state: mac.states.at(head), world: worldOn(mac, head), previous: null, afterPeak: false,
    scenes: [{ number: 1, title: "The insult", summary: "Draconia mocks Roopesh in front of the whole pub.", peak: 3, arcMoved: true }],
    ...changes
  };
}

function plan(changes: Record<string, unknown> = {}) {
  return {
    toward: "the Halloween feast", landmark: null, phase: "build", scenes: 4,
    arcs: [{ arc: ARC, now: "open contempt", next: "a moment she defends him without meaning to", not_yet: "any kindness she admits to" }],
    premise: "Two Scenes with Draconia; the others with Hermione and classes.", ...changes
  };
}

describe("the Director", () => {
  it("plans from the Story so far: the Premise, the Arcs, the Landmarks, every Scene and the last plan", () => {
    const { system, prompt } = directorPrompt(ask({
      previous: { kind: "director_plan", ...plan(), phase: "build", landmark: null, callId: "c", model: { provider: "claude", model: "claude-opus-5-5" } } as never
    }));
    expect(system).toContain("Premise: An enemies-to-lovers romance with Draconia Malfoy");
    expect(system).toContain(`- ${ARC}`);
    expect(system).toContain("The Triwizard Tournament, Day 720 18:00");
    expect(prompt).toContain("Scene 1, The insult (intensity 3, an Arc moved): Draconia mocks Roopesh in front of the whole pub.");
    expect(prompt).toContain("Phase: build, toward the Halloween feast, 4 Scenes.");
    expect(prompt).toContain("not from what the last plan hoped");
  });

  it("takes a plan that answers for every Arc, naming each as the Story does", () => {
    const checked = checkPlan(ask(), plan({ arcs: [{ arc: ARC.toUpperCase(), now: "a", next: "b", not_yet: "c" }], landmark: "the triwizard tournament" }));
    expect(checked).toEqual({ ok: true, value: expect.objectContaining({ landmark: "The Triwizard Tournament", arcs: [{ arc: ARC, now: "a", next: "b", not_yet: "c" }] }), dropped: [] });
  });

  it("keeps a plan that names a Landmark the Story lacks, toward no Landmark", () => {
    const landmark = checkPlan(ask(), plan({ landmark: "The Yule Ball" }));
    expect(landmark).toMatchObject({ ok: true, value: { landmark: null }, dropped: ["landmark: \"The Yule Ball\" is not one of the story's Landmarks (The Triwizard Tournament); name one exactly, or null"] });
  });

  // Records degrade, never vanish (lasting-records design decision 3).
  it("keeps a plan with a row for an Arc the Story lacks, leaving the row out, and holds an Arc it forgot", () => {
    const extra = checkPlan(ask(), plan({ arcs: [...plan().arcs, { arc: "Harry and Roopesh become friends", now: "a", next: "b", not_yet: "c" }] }));
    expect(extra).toMatchObject({ ok: true, value: { arcs: plan().arcs.map(row => ({ ...row, arc: ARC })) }, dropped: ["arcs: \"Harry and Roopesh become friends\" is not one of the story's Arcs"] });
    const missing = checkPlan(ask(), plan({ arcs: [] }));
    expect(missing).toMatchObject({ ok: true, value: { arcs: [{ arc: ARC, next: "nothing; let the last step settle" }] }, dropped: [`arcs: no row for the Arc "${ARC}"; it holds where it is`] });
  });

  it("refuses a stretch outside one to six Scenes", () => {
    for (const scenes of [0, 7]) expect(checkPlan(ask(), plan({ scenes })).ok).toBe(false);
  });

  it("refuses anything but a rest after a Scene that peaked", () => {
    const after = ask({ afterPeak: true });
    expect(checkPlan(after, plan({ phase: "build" }))).toEqual({ ok: false, problems: ["phase: the Scene that just ended peaked, so this stretch is a rest, not a build"] });
    expect(checkPlan(after, plan({ phase: "rest" })).ok).toBe(true);
    expect(directorPrompt(after).prompt).toContain("The Scene that just ended peaked: this stretch is a rest.");
  });

  it("asks once more with the problems named, keeps the plan with the Arc held when the second answer leaves it out too, and fails only when no answer is usable", async () => {
    const mac = freshHome();
    const runner = new ScriptedRunner([{ answer: JSON.stringify(plan({ arcs: [] })) }, { answer: JSON.stringify(plan()) }]);
    const written = await writePlan(new Models(mac.db, { claude: runner }), { provider: "claude", model: "claude-opus-5-5" }, ask(), null as never, "trace", new AbortController().signal);
    expect(written.value.toward).toBe("the Halloween feast");
    expect(runner.requests[1]!.prompt).toContain("no row for the Arc");
    const held = new ScriptedRunner([{ answer: JSON.stringify(plan({ arcs: [] })) }, { answer: JSON.stringify(plan({ arcs: [] })) }]);
    const kept = await writePlan(new Models(mac.db, { claude: held }), { provider: "claude", model: "claude-opus-5-5" }, ask(), null as never, "trace", new AbortController().signal);
    expect(kept.value.arcs).toEqual([expect.objectContaining({ arc: ARC, next: "nothing; let the last step settle" })]);
    expect(kept.dropped).toEqual([`arcs: no row for the Arc "${ARC}"; it holds where it is`]);
    const failing = new ScriptedRunner([{ answer: JSON.stringify({ toward: "x" }) }, { answer: JSON.stringify(plan({ scenes: 0 })) }]);
    await expect(writePlan(new Models(mac.db, { claude: failing }), { provider: "claude", model: "claude-opus-5-5" }, ask(), null as never, "trace", new AbortController().signal))
      .rejects.toBeInstanceOf(DirectorFailed);
  });
});
