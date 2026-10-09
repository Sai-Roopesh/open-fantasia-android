import { describe, expect, it } from "vitest";
import { checkPlan, directorPrompt, DirectorFailed, writePlan, type DirectorAsk } from "../../src/agents/director.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { worldOn } from "../../src/story/world.js";
import { freshHome } from "../support/host.js";
import { malfoyProblemStoryFile, writeStoryFile } from "../support/story-files.js";

const ARC = "Draconia comes round to Roopesh, slowly, against everything she was raised to be.";
const HALLOWEEN = "The Halloween feast";
const TRIWIZARD = "The Triwizard Tournament";

/** The Malfoy Problem on its first night, Friday Day 1 at 9:40 pm, with Halloween and the Tournament ahead. */
function ask(changes: Partial<DirectorAsk> = {}): DirectorAsk {
  const mac = freshHome();
  const story = malfoyProblemStoryFile();
  story.landmarks = [{ name: HALLOWEEN, at: "Day 61 19:00", what: "The feast, and the troll." }, ...story.landmarks!];
  const imported = importStoryFile(writeStoryFile(story), mac);
  if (!imported.ok) throw new Error("import failed");
  const head = mac.tree.currentPath(imported.storyId)!.headEntryId;
  return {
    state: mac.states.at(head), world: worldOn(mac, head), previous: null, afterPeak: false,
    scenes: [{ number: 1, title: "The insult", summary: "Draconia mocks Roopesh in front of the whole pub.", peak: 3, arcMoved: true }],
    ...changes
  };
}

const charms = { id: "S1", at: "Day 4 14:00", place: "The Charms classroom", who: ["Draconia Malfoy", "hermione"], for: "Flitwick pairs him with Draconia, and Hermione watches.", lead: "Draconia Malfoy" };
const pitch = { id: "S2", at: "Day 6 10:00", place: "The Quidditch pitch", who: ["Draconia Malfoy", "Harry Potter"], for: "The flying lesson: Harry is better than her, and Roopesh is there to see it.", lead: "Harry Potter" };

/** A Stretch plan that keeps every rule, from tonight to Thursday week. */
function plan(changes: Record<string, unknown> = {}) {
  return {
    from: "Day 1", until: "Day 7",
    toward: "the first flying lesson", landmark: null, phase: "build",
    scenes: [charms, pitch],
    arcs: [{ arc: ARC, now: "open contempt", next: "she defends him in front of Slytherin without meaning to", not_yet: "any kindness she admits to" }],
    leads: [
      { who: "Draconia Malfoy", move: "Has herself paired with him in Charms, and calls it a punishment.", scene: "S1" },
      { who: "Hermione Granger", move: "Leaves her Charms notes on his bed, annotated.", scene: null },
      { who: "Harry Potter", move: "Asks him to the pitch to watch the lesson.", scene: "S2" }
    ],
    roadmap: [
      { arc: ARC, by: HALLOWEEN, stands: "She has claimed him in public once, and called it a debt." },
      { arc: ARC, by: TRIWIZARD, stands: "She would not let anyone else near him, and still says nothing." }
    ],
    premise: "Two Scenes with Draconia; the others with Hermione and classes.", ...changes
  };
}

describe("the Director", () => {
  it("plans from the Story so far: the Premise, the Arcs, the Landmarks, every Scene and the last plan", () => {
    const { system, prompt } = directorPrompt(ask({
      previous: { kind: "director_plan", ...plan(), from: 1, until: 7, phase: "build", landmark: null, callId: "c", model: { provider: "claude", model: "claude-opus-5-5" } } as never
    }));
    expect(system).toContain("Premise: An enemies-to-lovers romance with Draconia Malfoy");
    expect(system).toContain(`- ${ARC}`);
    expect(system).toContain("The Triwizard Tournament, Day 720 18:00");
    expect(prompt).toContain("Scene 1, The insult (intensity 3, an Arc moved): Draconia mocks Roopesh in front of the whole pub.");
    expect(prompt).toContain("Phase: build, toward the first flying lesson, Day 1 to Day 7.");
    expect(prompt).toContain("not from what the last plan hoped");
  });

  it("takes a Stretch that keeps every rule, with names as the Story keeps them and Scenes given ids of their own", () => {
    const checked = checkPlan(ask(), plan({ arcs: [{ arc: ARC.toUpperCase(), now: "a", next: "b", not_yet: "c" }], landmark: "the triwizard tournament" }));
    expect(checked).toMatchObject({ ok: true, dropped: [] });
    if (!checked.ok) return;
    const { value } = checked;
    expect(value).toMatchObject({ from: 1, until: 7, landmark: TRIWIZARD, arcs: [{ arc: ARC, now: "a", next: "b", not_yet: "c" }] });
    expect(value.scenes.map(scene => ({ at: scene.at, who: scene.who, lead: scene.lead }))).toEqual([
      { at: "Day 4 14:00", who: ["Draconia Malfoy", "Hermione Granger"], lead: "Draconia Malfoy" },
      { at: "Day 6 10:00", who: ["Draconia Malfoy", "Harry Potter"], lead: "Harry Potter" }
    ]);
    const [first, second] = value.scenes.map(scene => scene.id);
    expect(first).not.toBe("S1");
    expect(value.leads).toEqual([
      { who: "Draconia Malfoy", move: "Has herself paired with him in Charms, and calls it a punishment.", scene: first },
      { who: "Hermione Granger", move: "Leaves her Charms notes on his bed, annotated.", scene: null },
      { who: "Harry Potter", move: "Asks him to the pitch to watch the lesson.", scene: second }
    ]);
    expect(value.roadmap).toEqual(plan().roadmap);
  });

  it("keeps a plan that names a Landmark the Story lacks, toward no Landmark", () => {
    const landmark = checkPlan(ask(), plan({ landmark: "The Yule Ball" }));
    expect(landmark).toMatchObject({ ok: true, value: { landmark: null }, dropped: [`landmark: "The Yule Ball" is not one of the story's Landmarks (${HALLOWEEN}, ${TRIWIZARD}); name one exactly, or null`] });
  });

  // Records degrade, never vanish (lasting-records design decision 3).
  it("keeps a plan with a row for an Arc the Story lacks, leaving the row out, and holds an Arc it forgot", () => {
    const extra = checkPlan(ask(), plan({ arcs: [...plan().arcs, { arc: "Harry and Roopesh become friends", now: "a", next: "b", not_yet: "c" }] }));
    expect(extra).toMatchObject({ ok: true, value: { arcs: plan().arcs.map(row => ({ ...row, arc: ARC })) }, dropped: ["arcs: \"Harry and Roopesh become friends\" is not one of the story's Arcs"] });
    const missing = checkPlan(ask(), plan({ arcs: [] }));
    expect(missing).toMatchObject({ ok: true, value: { arcs: [{ arc: ARC, next: "nothing; let the last step settle" }] }, dropped: [`arcs: no row for the Arc "${ARC}"; it holds where it is`] });
  });

  it("starts the Stretch today and keeps it five to nine days long", () => {
    const late = checkPlan(ask(), plan({ from: "Day 3", until: "Day 30" }));
    expect(late).toMatchObject({ ok: true, value: { from: 1, until: 9 }, dropped: [
      "from: the Stretch starts today, Day 1, not Day 3",
      "until: the Stretch is 30 days long; it runs five to nine days, so it ends by Day 9"
    ] });
    // Lengthened to its last Scene that matters, on Day 6; or to five days when the Scenes are sooner.
    expect(checkPlan(ask(), plan({ until: "Day 2" }))).toEqual(expect.objectContaining({ ok: true, value: expect.objectContaining({ until: 6 }), dropped: ["until: the Stretch is 2 days long; it runs five to nine days, so it now ends on Day 6"] }));
    expect(checkPlan(ask(), plan({ until: "Day 2", scenes: [charms, { ...pitch, at: "Day 3 10:00" }] }))).toMatchObject({ ok: true, value: { until: 5 } });
    expect(checkPlan(ask(), plan({ until: "next Thursday" }))).toMatchObject({ ok: true, value: { until: 7 }, dropped: ["until: \"next Thursday\" is not a day like \"Day 7\"; the Stretch ends seven days on"] });
  });

  it("leaves out a Scene that matters outside the Stretch or before now, and anyone in it not in the Story", () => {
    const checked = checkPlan(ask(), plan({ scenes: [
      { ...charms, who: ["Draconia Malfoy", "Roopesh Gantasala", "Gilderoy Lockhart"], lead: "Crabbe" },
      pitch,
      { ...pitch, id: "S3", at: "Day 12 10:00" },
      { ...pitch, id: "S4", at: "Day 1 08:00" },
      { ...pitch, id: "S5", at: "Thursday" }
    ] }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.scenes.map(scene => ({ who: scene.who, lead: scene.lead }))).toEqual([
      { who: ["Draconia Malfoy"], lead: null },
      { who: ["Draconia Malfoy", "Harry Potter"], lead: "Harry Potter" }
    ]);
    expect(checked.dropped).toEqual([
      "scenes: S1, who: Roopesh Gantasala is the player's character, who is always there; leave him out",
      "scenes: S1, who: Gilderoy Lockhart is not in the story",
      "scenes: S1, lead: Crabbe is not a Lead; name one of the Leads (Draconia Malfoy, Hermione Granger, Harry Potter), or null",
      "scenes: S3 is at Day 12 10:00, outside the Stretch (Day 1 to Day 7)",
      "scenes: S4 is at Day 1 08:00, before now (Day 1 21:40)",
      "scenes: S5 is at \"Thursday\", which is not a time like \"Day 4 14:00\""
    ]);
  });

  it("refuses a plan with no Scene that matters it can keep, or with too few or too many", () => {
    expect(checkPlan(ask(), plan({ scenes: [{ ...charms, at: "Day 30 10:00" }, { ...pitch, at: "Day 31 10:00" }] }))).toMatchObject({ ok: false, problems: expect.arrayContaining(["scenes: none of the Scenes that matter can be kept; plan two to five within the Stretch"]) });
    expect(checkPlan(ask(), plan({ scenes: [charms] })).ok).toBe(false);
    expect(checkPlan(ask(), plan({ scenes: [charms, pitch, charms, pitch, charms, pitch] })).ok).toBe(false);
  });

  it("asks for a move for every Lead, and keeps a move on screen only in a Scene of the plan", () => {
    const checked = checkPlan(ask(), plan({ leads: [
      { who: "Draconia Malfoy", move: "Pairs herself with him.", scene: "S9" },
      { who: "Crabbe", move: "Follows him.", scene: null },
      { who: "Harry Potter", move: "Asks him to the pitch.", scene: "S2" }
    ] }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.leads.map(lead => [lead.who, lead.scene === null])).toEqual([["Draconia Malfoy", true], ["Harry Potter", false]]);
    expect(checked.dropped).toEqual([
      "leads: Draconia Malfoy's move is in S9, which is not one of the Scenes that matter; it happens off-screen",
      "leads: Crabbe is not a Lead",
      "leads: no move for Hermione Granger; every Lead makes one this Stretch, on screen or off"
    ]);
  });

  it("keeps a roadmap row for each Arc by each of the next two Landmarks", () => {
    const checked = checkPlan(ask(), plan({ roadmap: [
      { arc: ARC, by: "halloween feast", stands: "She has claimed him once." },
      { arc: ARC, by: "The Yule Ball", stands: "Dancing." },
      { arc: "Harry and Roopesh become friends", by: HALLOWEEN, stands: "Mates." }
    ] }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.roadmap).toEqual([{ arc: ARC, by: HALLOWEEN, stands: "She has claimed him once." }]);
    expect(checked.dropped).toEqual([
      `roadmap: "The Yule Ball" is not one of the next two Landmarks (${HALLOWEEN}, ${TRIWIZARD})`,
      "roadmap: \"Harry and Roopesh become friends\" is not one of the story's Arcs",
      `roadmap: no row for the Arc "${ARC}" by ${TRIWIZARD}; say where it should stand by then`
    ]);
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
    expect(written.value.toward).toBe("the first flying lesson");
    expect(runner.requests[1]!.prompt).toContain("no row for the Arc");
    const held = new ScriptedRunner([{ answer: JSON.stringify(plan({ arcs: [] })) }, { answer: JSON.stringify(plan({ arcs: [] })) }]);
    const kept = await writePlan(new Models(mac.db, { claude: held }), { provider: "claude", model: "claude-opus-5-5" }, ask(), null as never, "trace", new AbortController().signal);
    expect(kept.value.arcs).toEqual([expect.objectContaining({ arc: ARC, next: "nothing; let the last step settle" })]);
    expect(kept.dropped).toEqual([`arcs: no row for the Arc "${ARC}"; it holds where it is`]);
    const failing = new ScriptedRunner([{ answer: JSON.stringify({ toward: "x" }) }, { answer: JSON.stringify(plan({ scenes: [] })) }]);
    await expect(writePlan(new Models(mac.db, { claude: failing }), { provider: "claude", model: "claude-opus-5-5" }, ask(), null as never, "trace", new AbortController().signal))
      .rejects.toBeInstanceOf(DirectorFailed);
  });
});
