import { describe, expect, it } from "vitest";
import { nextLandmarks } from "../../src/agents/director.js";
import { fakeWeaveAnswer } from "../../src/models/fake.js";
import type { ModelRequest } from "../../src/models/model-call.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import type { WorldMoved } from "../../src/story/entries.js";
import { journalView } from "../../src/views/journal.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

/** Friday night after curfew, Day 3 (Day 1 was a Wednesday), with Hermione. */
function fridayNight(): StoryFile {
  return hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] });
}

/** A Stretch from Saturday to Saturday week whose next Scene that matters is Draconia cornering him after Charms on Thursday. */
function charmsWeek(story: StoryFile, changes: Record<string, unknown> = {}) {
  const coming = nextLandmarks({ clock: story.clock!.starts!, landmarks: story.landmarks ?? [] } as never).map(landmark => landmark.name);
  return {
    from: "Day 4", until: "Day 11", toward: "the flying test", landmark: null, phase: "build",
    scenes: [
      { id: "S1", at: "Day 9 10:00", place: "The corridor outside Charms", who: ["Draconia Malfoy"], for: "She corners him about the seating plan.", lead: "Draconia Malfoy" },
      { id: "S2", at: "Day 10 15:00", place: "The library", who: ["Hermione Granger"], for: "Hermione's flying notes.", lead: "Hermione Granger" }
    ],
    arcs: story.arcs!.map(arc => ({ arc, now: "where it was", next: "a step", not_yet: "anything declared" })),
    leads: [{ who: "Draconia Malfoy", move: "Corners him after Charms.", scene: "S1" }, { who: "Hermione Granger", move: "Lends him her notes.", scene: "S2" }],
    roadmap: story.arcs!.flatMap(arc => coming.map(by => ({ arc, by, stands: "a step on" }))),
    premise: "Draconia's Scenes serve it; Hermione's leave it alone.",
    ...changes
  };
}

const learned = "Neville says Draconia had the Charms seating plan changed on Tuesday.";

describe("the Story's pick is the Stretch's next Scene that matters (story-in-stretches design decision 4)", () => {
  // GIVEN it is Saturday morning, and the Stretch's next Scene that matters is Draconia cornering him after Charms on
  //   Thursday
  // THEN the Day View's first offer is Thursday's, labelled "Thursday 10:00 am · in 5 days"
  // WHEN the player chooses it
  // THEN the days between pass, the next Scene opens on Thursday, and Meanwhile says what he learned since Saturday
  // (The "· in 5 days" is the link's, with contract 18.)
  it("day-view › Up to four Happenings › The next Scene that matters is days away", async () => {
    const story = fridayNight();
    // The span to Thursday tells him one thing, from Neville.
    const days = { from: (request: ModelRequest) => {
      const weave = JSON.parse((fakeWeaveAnswer(request) as { answer: string }).answer) as Record<string, unknown[]>;
      return { answer: JSON.stringify({ ...weave,
        happened: [...weave.happened!, { id: "H9", what: "Draconia had the Charms seating plan changed.", at: "Day 7 12:00", where: "Flitwick's office", known_to: ["Draconia Malfoy", "Neville Longbottom", "Roopesh Gantasala"], landmark: null }],
        meanwhile: [{ text: learned, how: "told", happened: "H9", told_by: "Neville Longbottom", about: ["Draconia Malfoy"] }] }) };
    } };
    const { engine, storyId, head, play, view, mac, models } = playable(story, { director: [{ answer: JSON.stringify(charmsWeek(story)) }], weaver: [{ from: fakeWeaveAnswer }, days] });
    await play("I say goodnight to Hermione and go up.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);

    // Saturday morning: the first offer is Thursday's, the Story's pick, built from the plan but in the World's words.
    const day = view().day_view!;
    expect(day.at).toBe("Day 4 07:30");
    expect(day.happenings[0]).toMatchObject({ at: "Day 9 10:00", time: "Thursday 10:00 am", place: "The corridor outside Charms", who: ["Draconia Malfoy"], pick: true });
    expect(models.weaver.requests[0]!.prompt).toContain("<next_scene_that_matters");
    expect(JSON.stringify(day)).not.toContain("She corners him about the seating plan.");

    // Chosen: the days pass as a Gap, and the Scene opens on Thursday.
    engine.choose(storyId, { after: head(), kind: "go", happening: day.happenings[0]!.id, gap: null }, "go");
    await engine.settled(storyId);
    const gap = mac.tree.recordsOn(head(), "world_moved").at(-1)!.payload as WorldMoved;
    expect(gap).toMatchObject({ from: "Day 4 07:30", until: "Day 9 10:00" });
    expect(mac.states.at(head()).scene).toMatchObject({ number: 2, at: "Day 9 10:00" });
    expect(journalView(mac, storyId, "t").days.flatMap(day => day.rows).some(row => row.meanwhile?.text === learned)).toBe(true);
  });
});
