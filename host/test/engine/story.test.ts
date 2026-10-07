import { describe, expect, it } from "vitest";
import type { State } from "../../src/story/state.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

/** The Hogwarts Story with a place, an institution, two Arcs and a second Landmark, at Day 3 21:40. */
const storyFile = () => ({
  ...hogwartsStoryFile(),
  world: {
    summary: "Hogwarts as a university.", history: "The war ended ten years ago.",
    places: [{ name: "The owlery", description: "Cold stone and straw." }],
    institutions: [{ name: "The Ministry of Magic", description: "Slow and proud." }]
  },
  arcs: ["Draconia comes round to Roopesh, slowly.", "Harry and Roopesh become friends."],
  landmarks: [
    { name: "Draconia's flying test", at: "Day 8 10:00", what: "Madam Hooch tests the first-years on brooms." },
    { name: "The betrothal", at: "Day 760 12:00", what: "Lucius announces Draconia's engagement." }
  ]
});

const refused = (attempt: () => unknown) => { try { attempt(); return null; } catch (error) { return (error as Error).message; } };

describe("editing the Story on the Path (editing-the-story design decisions 1 and 2)", () => {
  it("changes only its own part of the State with each edit", () => {
    const { engine, storyId, head, state, events } = playable(storyFile());
    const before = state();
    const only = (changed: Partial<State>) => {
      const now = state();
      expect(now).toEqual({ ...before, ...changed });
      expect(events.at(-1)!.event.kind).toBe("path_changed");
    };
    const at = (edit: () => unknown) => { edit(); return state(); };

    let after = at(() => engine.setPremise(storyId, " A slow-burn romance. ", head(), "t"));
    only({ premise: "A slow-burn romance." });
    engine.setPremise(storyId, before.premise, head(), "t");

    after = at(() => engine.setStyle(storyId, "Dry and British.", head(), "t"));
    only({ premise: before.premise, style: "Dry and British." });
    engine.setStyle(storyId, before.style, head(), "t");

    after = at(() => engine.setReplyLength(storyId, "Short", head(), "t"));
    expect(after.replyLength).toBe("short");
    engine.setReplyLength(storyId, before.replyLength, head(), "t");

    after = at(() => engine.setArcs(storyId, ["Harry and Roopesh become friends.", " Hermione wants a reason. "], head(), "t"));
    only({ arcs: ["Harry and Roopesh become friends.", "Hermione wants a reason."] });
    engine.setArcs(storyId, before.arcs, head(), "t");

    after = at(() => engine.setLandmark(storyId, { name: "The betrothal", at: "Day 700 12:00", what: "Lucius announces it early." }, false, head(), "t"));
    only({ landmarks: [before.landmarks[0]!, { name: "The betrothal", at: "Day 700 12:00", what: "Lucius announces it early." }] });
    engine.setLandmark(storyId, { name: "The Yule Ball", at: "Day 100 19:00", what: "A dance." }, true, head(), "t");
    expect(state().landmarks.at(-1)).toEqual({ name: "The Yule Ball", at: "Day 100 19:00", what: "A dance." });
    engine.dropLandmark(storyId, "The Yule Ball", head(), "t");
    engine.setLandmark(storyId, before.landmarks[1]!, false, head(), "t");
    only({});

    engine.setPlace(storyId, { name: "The Room of Requirement", description: "Whatever room you need." }, false, true, head(), "t");
    expect(state().world.places.at(-1)).toEqual({ name: "The Room of Requirement", description: "Whatever room you need." });
    engine.setPlace(storyId, { name: "The Ministry of Magic", description: "Slower than ever." }, true, false, head(), "t");
    expect(state().world.institutions).toEqual([{ name: "The Ministry of Magic", description: "Slower than ever." }]);

    after = at(() => engine.setWorld(storyId, "Hogwarts, 1991.", "", head(), "t"));
    expect(after.world).toMatchObject({ summary: "Hogwarts, 1991.", history: "" });

    after = at(() => engine.setClock(storyId, "Day 4 09:00", undefined, head(), "t"));
    expect([after.clock, after.dayOneWeekday]).toEqual(["Day 4 09:00", "wednesday"]);
    after = at(() => engine.setClock(storyId, "Day 4 10:00", "friday", head(), "t"));
    expect([after.clock, after.dayOneWeekday]).toEqual(["Day 4 10:00", "friday"]);
  });

  it("refuses what would leave the Story blank, doubled, or contradicting what already happened, in words the phone shows", () => {
    const { engine, storyId, head, state } = playable(storyFile());
    const at = head();
    expect(refused(() => engine.setPremise(storyId, " ", head(), "t"))).toBe("Say what the Story is for.");
    expect(refused(() => engine.setStyle(storyId, "", head(), "t"))).toBe("Say how it is written.");
    expect(refused(() => engine.setReplyLength(storyId, "long", head(), "t"))).toBe("Say Short, Medium or Full.");
    expect(refused(() => engine.setArcs(storyId, ["One.", " "], head(), "t"))).toBe("An Arc needs words.");
    expect(refused(() => engine.setArcs(storyId, ["One.", "one."], head(), "t"))).toBe("That Arc is already there.");

    expect(refused(() => engine.setLandmark(storyId, { name: " ", at: "Day 9 10:00", what: "x" }, true, head(), "t"))).toBe("Give the Landmark a name.");
    expect(refused(() => engine.setLandmark(storyId, { name: "The betrothal", at: "Day 9 10:00", what: "x" }, true, head(), "t"))).toBe("The betrothal is already a Landmark.");
    expect(refused(() => engine.setLandmark(storyId, { name: "The Yule Ball", at: "Day 9 10:00", what: "x" }, false, head(), "t"))).toBe("The Story has no Landmark called The Yule Ball.");
    expect(refused(() => engine.setLandmark(storyId, { name: "The Yule Ball", at: "Day 9 10:00", what: " " }, true, head(), "t"))).toBe("Say what happens at The Yule Ball.");
    expect(refused(() => engine.setLandmark(storyId, { name: "The Yule Ball", at: "Christmas", what: "A dance." }, true, head(), "t"))).toBe("\"Christmas\" is not a time like \"Day 40 10:00\".");
    expect(refused(() => engine.setLandmark(storyId, { name: "The Yule Ball", at: "Day 3 21:00", what: "A dance." }, true, head(), "t"))).toBe("That time has passed on this Path.");
    expect(refused(() => engine.dropLandmark(storyId, "The Yule Ball", head(), "t"))).toBe("The Story has no Landmark called The Yule Ball.");

    expect(refused(() => engine.setPlace(storyId, { name: "", description: "x" }, false, true, head(), "t"))).toBe("Give the place a name.");
    expect(refused(() => engine.setPlace(storyId, { name: "the owlery", description: "x" }, false, true, head(), "t"))).toBe("the owlery is already a place.");
    expect(refused(() => engine.setPlace(storyId, { name: "The Ministry of Magic", description: "x" }, false, true, head(), "t"))).toBe("The Ministry of Magic is already an institution.");
    expect(refused(() => engine.setPlace(storyId, { name: "The kitchens", description: "x" }, false, false, head(), "t"))).toBe("The Story has no place called The kitchens.");
    expect(refused(() => engine.setPlace(storyId, { name: "The kitchens", description: " " }, false, true, head(), "t"))).toBe("Say what The kitchens is.");
    expect(refused(() => engine.setWorld(storyId, " ", "History.", head(), "t"))).toBe("Say what the World is.");

    expect(refused(() => engine.setClock(storyId, "tomorrow", undefined, head(), "t"))).toBe("\"tomorrow\" is not a time like \"Day 40 10:00\".");
    expect(refused(() => engine.setClock(storyId, "Day 3 21:40", undefined, head(), "t"))).toBe("The clock only moves on.");
    expect(refused(() => engine.setClock(storyId, "Day 4 09:00", "funday", head(), "t"))).toBe("\"funday\" is not a day of the week.");

    expect(refused(() => engine.rewordTaste(storyId, "keep Ron in the background", "x", head(), "t"))).toBe("Taste has no such line.");
    expect(refused(() => engine.setPremise(storyId, "A romance.", "not-the-head", "t"))).toBe("The Story has moved on since you last looked. Nothing was changed.");

    expect(head()).toBe(at);
    expect(state().landmarks).toHaveLength(2);
  });

  it("keeps a Landmark the World has passed where it was, and lets none be set before where the World stands", () => {
    const { engine, storyId, head } = playable(storyFile());
    engine.setClock(storyId, "Day 9 08:00", undefined, head(), "t");
    expect(refused(() => engine.setLandmark(storyId, { name: "Draconia's flying test", at: "Day 12 10:00", what: "Again." }, false, head(), "t")))
      .toBe("Draconia's flying test has already happened on this Path.");
    expect(refused(() => engine.dropLandmark(storyId, "Draconia's flying test", head(), "t"))).toBe("Draconia's flying test has already happened on this Path.");
    expect(refused(() => engine.setLandmark(storyId, { name: "The betrothal", at: "Day 9 07:00", what: "Early." }, false, head(), "t"))).toBe("That time has passed on this Path.");
  });

  it("rewords a Taste line in its place", () => {
    const { engine, storyId, head, state, mac } = playable(storyFile());
    const path = mac.tree.currentPath(storyId)!;
    const taste = mac.tree.append(storyId, head(), { kind: "taste_set", lines: ["Keep school procedure to a line.", "keep Ron in the background"] });
    mac.tree.moveHead(path.id, path.headEntryId, taste.id);
    expect(refused(() => engine.rewordTaste(storyId, "keep Ron in the background", " ", head(), "t"))).toBe("Say the lesson, or delete it.");
    engine.rewordTaste(storyId, "keep Ron in the background", "keep Ron in the background unless he's needed", head(), "t");
    expect(state().taste).toEqual(["Keep school procedure to a line.", "keep Ron in the background unless he's needed"]);
  });
});
