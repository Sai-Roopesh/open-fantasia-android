import { describe, expect, it } from "vitest";
import { LinkError } from "../../src/link/errors.js";
import type { MoveWritten } from "../../src/story/entries.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

/** The Director's plan: Saturday's Scene that matters is the hospital wing at 11:00, about Draconia. */
const plan = {
  days: 4, toward: "Draconia's flying test", landmark: null, phase: "build",
  scenes: [{ id: "S1", date: "1991-09-07", time: "11:00", place: "Outside the hospital wing", who: ["Draconia Malfoy", "Severus Snape"], for: "Draconia needs a witness.", offer: "Draconia is fighting Snape for her bed back.", headline: "The hospital wing: Draconia wants out", lead: "Draconia Malfoy", engagement: null, quiet: false }],
  new: [{ kind: "mystery", what: "Who hexed Draconia's broom.", scene: "S1", person: null }],
  leads: [{ who: "Draconia Malfoy", move: "She makes him her witness.", scene: "S1" }, { who: "Hermione Granger", move: "She asks where he was.", scene: "S1" }],
  arcs: [], roadmap: [], premise: "The romance turns on a debt."
};

/** The World overnight: McGonagall's note summons him to her office at 9:00. */
const overnight = {
  lives: [], threads: [],
  happened: [{ id: "H1", what: "McGonagall left a note for Roopesh: his account of the troll, in her office, at nine.", at: "Day 4 07:00", where: "The Gryffindor common room", known_to: ["Minerva McGonagall", "Roopesh Gantasala"], landmark: null, move: null, missed: null }],
  meanwhile: [{ text: "McGonagall's note: your account of the troll, my office, nine o'clock.", how: "told", happened: "H1", told_by: "Minerva McGonagall", about: ["Minerva McGonagall"],
    engagement: { what: "Your account of the troll.", at: "Day 4 09:00", place: "McGonagall's office", who: ["Minerva McGonagall", "Hermione Granger"], expected: true, every: null } }],
  on: []
};

/** Saturday's Day View after the night after curfew: the hospital wing at 11:00 is the Story's pick, McGonagall's summons at 9:00 is on. */
async function saturday() {
  const story = hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] });
  story.world = { places: [{ name: "The library" }] };
  const played = playable(story, { director: [{ answer: JSON.stringify(plan) }], weaver: [{ answer: JSON.stringify(overnight) }] });
  await played.play("I say goodnight to Hermione and go up.");
  played.engine.endScene(played.storyId, played.head(), "trace-end");
  await played.engine.ended(played.storyId);
  const day = played.view().day_view!;
  const id = (place: string) => day.happenings.find(item => item.place === place)!.id;
  /** The Move the choice wrote. */
  const moved = () => played.mac.tree.pathTo(played.head()).filter(entry => entry.payload.kind === "move").at(-1)!.payload as MoveWritten;
  return { ...played, day, id, moved };
}

describe("choosing at the Day View", () => {
  it("writes the choice as one Move in the player's words, what he did in the Gap first", async () => {
    const { engine, storyId, head, id, moved } = await saturday();
    const accepted = engine.choose(storyId, { after: head(), kind: "go", happening: id("Outside the hospital wing"), gap: "I spent the morning in the library reading about life debts." }, "trace-go");
    expect(accepted.trace_id).toBe("trace-go");
    expect(moved()).toEqual({
      kind: "move",
      text: "I spent the morning in the library reading about life debts. I go along at 11:00 am: Outside the hospital wing.",
      choice: { kind: "go", place: "Outside the hospital wing", at: "Day 4 11:00", who: ["Draconia Malfoy", "Severus Snape"], scene: "s1.1", engagement: null }
    });
    await engine.settled(storyId);
  });

  it("spends a blank Gap quietly where he was, and writes each kind of choice", async () => {
    const story = await saturday();
    story.engine.choose(story.storyId, { after: story.head(), kind: "story", gap: null }, "trace-story");
    expect(story.moved()).toMatchObject({ text: "I spend the time until then quietly in the Gryffindor common room. I go along at 11:00 am: Outside the hospital wing.", choice: { kind: "story", at: "Day 4 11:00", scene: "s1.1" } });

    // Going to what he has arranged keeps it.
    const summoned = await saturday();
    summoned.engine.choose(summoned.storyId, { after: summoned.head(), kind: "go", happening: summoned.id("McGonagall's office"), gap: null }, "trace-summons");
    const engagement = summoned.moved().choice!.engagement!;
    expect(summoned.moved()).toMatchObject({ text: "I spend the time until then quietly in the Gryffindor common room. I go along at 9:00 am: McGonagall's office.", choice: { kind: "go", at: "Day 4 09:00", scene: null } });
    expect(summoned.state().kept).toEqual([`${engagement}@Day 4 09:00`]);

    const following = await saturday();
    following.engine.choose(following.storyId, { after: following.head(), kind: "follow", who: "Hermione Granger", gap: null }, "trace-follow");
    expect(following.moved()).toMatchObject({ text: "I follow Hermione.", choice: { kind: "follow", who: ["Hermione Granger"], place: null, at: null } });

    const going = await saturday();
    going.engine.choose(going.storyId, { after: going.head(), kind: "somewhere", place: "The library", gap: null }, "trace-somewhere");
    expect(going.moved()).toMatchObject({ text: "I go to the library.", choice: { kind: "somewhere", place: "The library" } });

    const skipping = await saturday();
    skipping.engine.choose(skipping.storyId, { after: skipping.head(), kind: "skip", at: "Day 4 18:00", gap: "I sleep most of the day." }, "trace-skip");
    expect(skipping.moved()).toMatchObject({ text: "I sleep most of the day. I let the time pass until this evening: Saturday 6:00 pm.", choice: { kind: "skip", at: "Day 4 18:00" } });
    for (const played of [story, summoned, following, going, skipping]) await played.engine.settled(played.storyId);
  });

  it("says when something on another day is, in words: tomorrow, or its day", async () => {
    // The Director's own plan puts its first Scene that matters at 10:00 tomorrow; the World has the owlery on Monday.
    const owlery = { lives: [], threads: [], happened: [], meanwhile: [], on: [{ at: "Day 6 15:00", place: "The owlery", what: "Draconia sends a letter home.", who: ["Draconia Malfoy"] }] };
    const sunday = async (kind: "story" | "go") => {
      const played = playable(hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] }), { weaver: [{ answer: JSON.stringify(owlery) }] });
      await played.play("I say goodnight to Hermione and go up.");
      played.engine.endScene(played.storyId, played.head(), "trace-end");
      await played.engine.ended(played.storyId);
      const day = played.view().day_view!;
      expect(day.happenings.map(item => [item.time, item.place, item.pick])).toEqual([["Tomorrow 10:00 am", "the Great Hall", true], ["Monday 3:00 pm", "The owlery", false]]);
      played.engine.choose(played.storyId, { after: played.head(), kind, happening: day.happenings[1]!.id, gap: null }, "trace-choose");
      const move = played.mac.tree.pathTo(played.head()).filter(entry => entry.payload.kind === "move").at(-1)!.payload as MoveWritten;
      await played.engine.settled(played.storyId);
      return move.text;
    };
    expect(await sunday("story")).toBe("I go about my days quietly until then. I go along tomorrow at 10:00 am: the Great Hall.");
    expect(await sunday("go")).toBe("I go about my days quietly until then. I go along on Monday at 3:00 pm: The owlery.");
  });

  it("ends the player's Gap as a sentence before the choice, when they left it open, and keeps it as written otherwise", async () => {
    const open = await saturday();
    open.engine.choose(open.storyId, { after: open.head(), kind: "skip", at: "Day 4 18:00", gap: "i slept the morning and my stomach is hurting" }, "trace-open");
    expect(open.moved().text).toBe("i slept the morning and my stomach is hurting. I let the time pass until this evening: Saturday 6:00 pm.");

    const asked = await saturday();
    asked.engine.choose(asked.storyId, { after: asked.head(), kind: "skip", at: "Day 4 18:00", gap: "Did I sleep? I must have!" }, "trace-asked");
    expect(asked.moved().text).toBe("Did I sleep? I must have! I let the time pass until this evening: Saturday 6:00 pm.");

    const quoted = await saturday();
    quoted.engine.choose(quoted.storyId, { after: quoted.head(), kind: "skip", at: "Day 4 18:00", gap: "I tell Hermione, \"Later.\"" }, "trace-quoted");
    expect(quoted.moved().text).toBe("I tell Hermione, \"Later.\" I let the time pass until this evening: Saturday 6:00 pm.");
    for (const played of [open, asked, quoted]) await played.engine.settled(played.storyId);
  });

  it("refuses a choice the Day View does not offer, with the reason", async () => {
    const { engine, storyId, head } = await saturday();
    const refused = (request: Parameters<typeof engine.choose>[1]) => {
      try { engine.choose(storyId, request, "trace"); } catch (error) { return error instanceof LinkError ? error.message : String(error); }
      return "accepted";
    };
    expect(refused({ after: head(), kind: "go", happening: "p-unknown", gap: null })).toMatch(/not on today/);
    expect(refused({ after: head(), kind: "follow", who: "Severus Snape", gap: null })).toMatch(/cannot follow Severus Snape/);
    expect(refused({ after: head(), kind: "somewhere", place: "Azkaban", gap: null })).toMatch(/not one of the Story's places/);
    expect(refused({ after: head(), kind: "skip", at: "Day 3 08:00", gap: null })).toMatch(/not one of the times/);
  });

  it("refuses a choice while the Scene's end is still being worked out, and while it is stopped", async () => {
    const played = playable(hogwartsWorldStoryFile({ at: "Day 3 22:40" }));
    await played.play("I say goodnight.");
    played.engine.endScene(played.storyId, played.head(), "trace-end");
    expect(() => played.engine.choose(played.storyId, { after: played.head(), kind: "story", gap: null }, "trace")).toThrow(/still being worked out/);
    await played.engine.ended(played.storyId);

    const stopped = playable(hogwartsWorldStoryFile({ at: "Day 3 22:40" }), { director: [{ fail: "Opus is overloaded" }, { fail: "Sonnet is overloaded" }] });
    await stopped.play("I say goodnight.");
    stopped.engine.endScene(stopped.storyId, stopped.head(), "trace-end");
    await stopped.engine.ended(stopped.storyId);
    expect(() => stopped.engine.choose(stopped.storyId, { after: stopped.head(), kind: "story", gap: null }, "trace")).toThrow(/stopped\. Retry it first/);
  });
});

describe("the Scene a choice opens", () => {
  // WHEN the player taps Let the Story choose
  // THEN the next Scene opens on the Story's own pick
  it("day-view › The player chooses where to be › Letting the Story choose", async () => {
    const { engine, storyId, head, view, state, models } = await saturday();
    engine.choose(storyId, { after: head(), kind: "story", gap: null }, "trace-story");
    await engine.settled(storyId);
    const asked = models.writer.requests.at(-1)!.prompt;
    expect(asked).toContain("The player chose at the Day View: go to Outside the hospital wing on Saturday 7 September 1991 at 11:00 am with Draconia Malfoy, Severus Snape. Open the Scene it begins.");
    expect(asked).toMatch(/<scene_that_matters>\nDraconia needs a witness\. It is about Draconia Malfoy\.\nDraconia Malfoy's move in it: She makes him her witness\./);
    expect(view().scene).toMatchObject({ place: "Outside the hospital wing", at: "Day 4 11:00" });
    expect(view().scene.people.map(person => person.name)).toEqual(["Draconia Malfoy", "Severus Snape"]);
    // The Scene that matters has been played.
    expect(state().played).toEqual(["s1.1"]);
  });

  // WHEN the player chooses Follow and picks Hermione
  // THEN the next Scene opens wherever Hermione is going next, with her in it
  it("day-view › The player chooses where to be › Following someone", async () => {
    const { engine, storyId, head, view, models } = await saturday();
    engine.choose(storyId, { after: head(), kind: "follow", who: "Hermione Granger", gap: null }, "trace-follow");
    await engine.settled(storyId);
    const asked = models.writer.requests.at(-1)!;
    expect(asked.prompt).toContain("The player chose at the Day View: follow Hermione Granger. Open the Scene it begins.");
    expect(asked.prompt).toMatch(/<cast_now>\nHermione Granger/);
    expect(view().scene.people.map(person => person.name)).toContain("Hermione Granger");
  });

  it("opens at the place chosen, and at the time skipped to", async () => {
    const going = await saturday();
    going.engine.choose(going.storyId, { after: going.head(), kind: "somewhere", place: "The library", gap: null }, "trace-somewhere");
    await going.engine.settled(going.storyId);
    expect(going.view().scene).toMatchObject({ place: "The library" });
    const skipping = await saturday();
    skipping.engine.choose(skipping.storyId, { after: skipping.head(), kind: "skip", at: "Day 4 18:00", gap: null }, "trace-skip");
    await skipping.engine.settled(skipping.storyId);
    expect(skipping.view().scene).toMatchObject({ at: "Day 4 18:00" });
  });
});
