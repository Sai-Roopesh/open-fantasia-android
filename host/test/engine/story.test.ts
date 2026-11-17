import { describe, expect, it } from "vitest";
import type { WorldMoved } from "../../src/story/entries.js";
import type { State } from "../../src/story/state.js";
import { besideOf, learnLesson, tasteOf } from "../../src/store/beside.js";
import { backstageView } from "../../src/views/backstage.js";
import { worldView } from "../../src/views/world.js";
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
    expect([after.clock, after.dayOne]).toEqual(["Day 4 09:00", "1991-09-04"]);
    after = at(() => engine.setClock(storyId, "Day 4 10:00", "1991-09-06", head(), "t"));
    expect([after.clock, after.dayOne]).toEqual(["Day 4 10:00", "1991-09-06"]);
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

    expect(refused(() => engine.setClock(storyId, "tomorrow", undefined, head(), "t"))).toBe("\"tomorrow\" is not a time like \"Day 40 10:00\".");
    expect(refused(() => engine.setClock(storyId, "Day 3 21:40", undefined, head(), "t"))).toBe("The clock only moves on.");
    expect(refused(() => engine.setClock(storyId, "Day 4 09:00", "funday", head(), "t"))).toBe("\"funday\" is not a date like \"1991-09-01\".");

    expect(refused(() => engine.rewordTaste(storyId, "keep Ron in the background", "x", "story", "t"))).toBe("Taste has no such line.");
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

  it("rewords a Taste line in its place, the Story's or the player's own", () => {
    const { engine, storyId, mac } = playable(storyFile());
    for (const lesson of ["Keep school procedure to a line.", "keep Ron in the background"]) learnLesson(mac, storyId, "story", lesson);
    learnLesson(mac, storyId, "player", "Don't decide what my character feels.");
    expect(refused(() => engine.rewordTaste(storyId, "keep Ron in the background", " ", "story", "t"))).toBe("Say the lesson, or delete it.");
    expect(refused(() => engine.rewordTaste(storyId, "keep Ron in the background", "x", "player", "t"))).toBe("Taste has no such line.");
    engine.rewordTaste(storyId, "keep Ron in the background", "keep Ron in the background unless he's needed", "story", "t");
    engine.rewordTaste(storyId, "Don't decide what my character feels.", "Never decide what my character feels.", "player", "t");
    expect(tasteOf(mac, storyId, "story")).toEqual(["Keep school procedure to a line.", "keep Ron in the background unless he's needed"]);
    expect(tasteOf(mac, storyId, "player")).toEqual(["Never decide what my character feels."]);
  });
});

describe("long-run › Style is the player's own words", () => {
  // WHEN the player adds "keep the humour dry and British" to the Style
  // THEN the Replies from then on are written that way
  it("long-run › Style is the player's own words › Changing the Style mid-Story", async () => {
    const { mac, engine, storyId, head, state, play, models } = playable(storyFile());
    await play("I sit at the other end of the sofa.");
    const before = head();
    const other = mac.tree.createPath(storyId, "Before", before, false);
    const actorBefore = models.actor.requests.at(-1)!.system;
    expect(actorBefore).not.toContain("keep the humour dry and British");
    engine.setStyle(storyId, `${state().style} Keep the humour dry and British.`, head(), "style");
    await play("I ask what she is reading.");
    for (const job of [models.actor, models.writer]) expect(job.requests.at(-1)!.system).toContain("Keep the humour dry and British.");
    expect(mac.states.at(before).style).not.toContain("dry and British");
    expect(mac.states.at(other.headEntryId).style).not.toContain("dry and British");
  });

  // GIVEN the reply length is Full
  // WHEN the player sets it to Short
  // THEN the Replies from then on are short
  it("long-run › Style is the player's own words › Changing the reply length", async () => {
    const { mac, engine, storyId, head, play, models } = playable({ ...storyFile(), reply_length: "full" });
    await play("I sit at the other end of the sofa.");
    const before = head();
    expect(models.actor.requests.at(-1)!.system).toContain("Write about six hundred words.");
    engine.setReplyLength(storyId, "short", head(), "length");
    await play("I ask what she is reading.");
    expect(models.actor.requests.at(-1)!.system).toContain("Write about two hundred words.");
    expect(models.actor.requests.at(-1)!.system).not.toContain("Write about six hundred words.");
    expect(mac.states.at(before).replyLength).toBe("full");
  });
});

describe("stories › Anything can be edited or created in the app: Landmarks", () => {
  /** What the World recorded as happened on the Path at [head], with the Landmark each is, if any. */
  const happenedOn = (mac: ReturnType<typeof playable>["mac"], head: string) =>
    mac.tree.pathTo(head).flatMap(entry => (entry.payload.kind === "world_moved" ? entry.payload.happened : []));
  /** Ends the Scene, and skips to next week with the Gap left blank: the World moves on over the week. */
  const aWeekOn = async ({ engine, storyId, head, view }: ReturnType<typeof playable>) => {
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const week = view().day_view!.choices.skips.find(skip => skip.label === "Next week")!;
    engine.choose(storyId, { after: head(), kind: "skip", at: week.at, gap: null }, "week");
    await engine.settled(storyId);
  };

  // GIVEN the betrothal Landmark is set for Year 3 on two Paths
  // WHEN the player moves it to the end of Year 2 on one of them
  // THEN that Path brings it about at the end of Year 2
  // AND the other Path still has it in Year 3
  it("stories › Anything can be edited or created in the app › A Landmark is moved on one Path", async () => {
    const played = playable(storyFile());
    const { mac, engine, storyId, head, state } = played;
    const other = mac.tree.createPath(storyId, "Year 3", head(), false);
    // Moved up to within the coming week, which the World then moves on over.
    engine.setLandmark(storyId, { name: "The betrothal", at: "Day 9 12:00", what: "Lucius announces Draconia's engagement." }, false, head(), "move");
    await aWeekOn(played);
    const betrothal = happenedOn(mac, head()).find(item => item.landmark === "The betrothal");
    expect(betrothal?.at).toBe("Day 9 12:00");
    expect(state().facts.find(fact => fact.landmark === "The betrothal")?.at).toBe("Day 9 12:00");
    expect(state().landmarks.find(item => item.name === "The betrothal")?.at).toBe("Day 9 12:00");
    expect(mac.states.at(mac.tree.path(other.id)!.headEntryId).landmarks.find(item => item.name === "The betrothal")?.at).toBe("Day 760 12:00");
    expect(happenedOn(mac, mac.tree.path(other.id)!.headEntryId)).toEqual([]);
  });

  // GIVEN the Halloween feast Landmark happened on this Path in Scene 6
  // WHEN the player tries to move it to the following week
  // THEN nothing changes, and the app says it has already happened on this Path
  it("stories › Anything can be edited or created in the app › A Landmark the World has passed", async () => {
    const story = storyFile();
    story.landmarks.push({ name: "The Halloween feast", at: "Day 5 19:00", what: "The Great Hall, pumpkins, and a troll." });
    const played = playable(story);
    const { mac, engine, storyId, head, state } = played;
    await aWeekOn(played);
    expect(happenedOn(mac, head()).some(item => item.landmark === "The Halloween feast")).toBe(true);
    const at = head();
    expect(refused(() => engine.setLandmark(storyId, { name: "The Halloween feast", at: "Day 12 19:00", what: "The feast, a week late." }, false, head(), "move")))
      .toBe("The Halloween feast has already happened on this Path.");
    expect(head()).toBe(at);
    expect(state().landmarks.find(item => item.name === "The Halloween feast")?.at).toBe("Day 5 19:00");
  });
});

describe("stories › Anything can be edited or created in the app: the time", () => {
  /** The World overnight: McGonagall's note summons him at 9:00 on Saturday, and Draconia is at the owlery on Sunday. */
  const overnight = {
    lives: [], threads: [],
    happened: [{ id: "H1", what: "McGonagall left a note for Roopesh.", at: "Day 4 07:00", where: "The Gryffindor common room", known_to: ["Minerva McGonagall", "Roopesh Gantasala"], landmark: null, move: null, missed: null }],
    meanwhile: [{ text: "McGonagall's note: your account of the troll, my office, nine o'clock.", how: "told", happened: "H1", told_by: "Minerva McGonagall", about: ["Minerva McGonagall"],
      engagement: { what: "Your account of the troll.", at: "Day 4 09:00", place: "McGonagall's office", who: ["Minerva McGonagall", "Hermione Granger"], expected: true, every: null } }],
    on: [{ at: "Day 5 10:00", place: "The owlery", what: "Draconia sends a letter home.", who: ["Draconia Malfoy"] }]
  };

  // GIVEN the Day View is waiting on Saturday at 7:40 am
  // WHEN the player moves the clock on to Sunday at 9:00 am
  // THEN the Day View is waiting on Sunday at 9:00 am, with nothing on before then among its choices
  // AND once the player has chosen, what happened in the World between Saturday and Sunday is in Backstage
  it("stories › Anything can be edited or created in the app › Moving the clock on", async () => {
    const story = { ...storyFile(), clock: { starts: "Day 3 22:40", day_one: "1991-09-04" }, opening: { ...storyFile().opening, at: "Day 3 22:40" } };
    const { mac, engine, storyId, head, view } = playable(story, { weaver: [{ answer: JSON.stringify(overnight) }] });
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(view().day_view).toMatchObject({ at: "Day 4 07:30", day: "Saturday 7 September" });
    // The Story's pick (the Director's, on Sunday), then McGonagall's summons and the owlery in time order.
    expect(view().day_view!.happenings.map(item => item.place)).toEqual(["the Great Hall", "McGonagall's office", "The owlery"]);

    engine.setClock(storyId, "Day 5 09:00", undefined, head(), "on");
    const sunday = view().day_view!;
    expect(sunday).toMatchObject({ at: "Day 5 09:00", day: "Sunday 8 September", time: "9:00 am" });
    expect(sunday.happenings.map(item => item.place)).toEqual(["the Great Hall", "The owlery"]);

    const owlery = sunday.happenings.find(item => item.place === "The owlery")!;
    engine.choose(storyId, { after: head(), kind: "go", happening: owlery.id, gap: null }, "go");
    // The Gap is woven in the turn the choice starts, before the next Scene's first Reply: from where the World stood.
    await engine.settled(storyId);
    const record = mac.tree.pathTo(head()).findLast(entry => entry.payload.kind === "world_moved")!.payload as WorldMoved;
    expect([record.gap, record.from, record.until]).toEqual([true, "Day 4 07:30", "Day 5 10:00"]);
    const saturday = backstageView(mac, storyId, "t").offscreen.find(day => day.day === "Saturday");
    expect(saturday?.items.map(item => item.what)).toEqual(["McGonagall's office went on without him, and they noticed."]);
  });

  // GIVEN the Scene is on Friday at 9:40 pm
  // WHEN the player tries to set the clock to Friday at 8:00 pm
  // THEN nothing changes, and the app says the clock only moves on
  it("stories › Anything can be edited or created in the app › The clock never goes back", () => {
    const { engine, storyId, head, state, view } = playable(storyFile());
    expect(view().scene.at_label).toBe("Friday 9:40 pm");
    const at = head();
    expect(refused(() => engine.setClock(storyId, "Day 3 20:00", undefined, head(), "back"))).toBe("The clock only moves on.");
    expect(head()).toBe(at);
    expect(state().clock).toBe("Day 3 21:40");
  });
});

describe("stories › Anything can be edited or created in the app: places", () => {
  // WHEN the player adds the Room of Requirement, with a description, during Scene 12
  // THEN it is among the World screen's places from then on on that Path, and Scenes can be set there
  // AND another Path has no such place
  it("stories › Anything can be edited or created in the app › A place is added mid-Story", async () => {
    const { mac, engine, storyId, head, play, models } = playable(storyFile());
    await play("I sit at the other end of the sofa.");
    const before = head();
    const other = mac.tree.createPath(storyId, "Without it", before, false);
    engine.setPlace(storyId, { name: "The Room of Requirement", description: "A room that is whatever you need it to be." }, false, true, head(), "add");
    expect(worldView(mac, storyId, "t").places.map(place => place.name)).toContain("The Room of Requirement");
    await play("I tell her I know somewhere we could practise.");
    expect(models.writer.requests.at(-1)!.system).toMatch(/The Room of Requirement: A room that is whatever you need it to be\./);
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    expect(models.weaver.requests.at(-1)!.system).toMatch(/The Room of Requirement: A room that is whatever you need it to be\./);
    expect(mac.states.at(before).world.places.map(place => place.name)).not.toContain("The Room of Requirement");
    expect(mac.states.at(other.headEntryId).world.places.map(place => place.name)).not.toContain("The Room of Requirement");
  });
});

describe("long-run › Arcs are built toward, never resolved on a schedule", () => {
  // GIVEN the Arcs include "Harry and Roopesh become friends"
  // WHEN the player drops it during Scene 15
  // THEN the Scenes from then on on that Path no longer build toward it
  // AND the Arcs at Scene 14, and on other Paths, still include it
  it("long-run › Arcs are built toward, never resolved on a schedule › An Arc is dropped", async () => {
    const { mac, engine, storyId, head, state, play, models } = playable(storyFile());
    await play("I sit at the other end of the sofa.");
    const before = head();
    const other = mac.tree.createPath(storyId, "With it", before, false);
    expect(models.writer.requests.at(-1)!.system).toContain("Harry and Roopesh become friends.");
    engine.setArcs(storyId, state().arcs.filter(arc => arc !== "Harry and Roopesh become friends."), head(), "drop");
    await play("I ask what she is reading.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    for (const job of [models.writer, models.weaver, models.director]) {
      expect(job.requests.length).toBeGreaterThan(0);
      expect(job.requests.at(-1)!.system).not.toContain("Harry and Roopesh become friends.");
      expect(job.requests.at(-1)!.system).toContain("Draconia comes round to Roopesh, slowly.");
    }
    expect(mac.states.at(before).arcs).toContain("Harry and Roopesh become friends.");
    expect(mac.states.at(other.headEntryId).arcs).toContain("Harry and Roopesh become friends.");
  });
});

describe("long-run › Taste is short, readable and the player's", () => {
  // GIVEN Taste has the line "keep Ron in the background"
  // WHEN the player rewords it to "keep Ron in the background unless he's needed"
  // THEN later Scenes read the new words, and the old ones are gone from Taste
  it("long-run › Taste is short, readable and the player's › Rewording a lesson", async () => {
    const { mac, engine, storyId, play, models } = playable(storyFile());
    learnLesson(mac, storyId, "story", "keep Ron in the background");
    engine.rewordTaste(storyId, "keep Ron in the background", "keep Ron in the background unless he's needed", "story", "reword");
    expect(tasteOf(mac, storyId, "story")).toEqual(["keep Ron in the background unless he's needed"]);
    await play("I sit at the other end of the sofa.");
    // The Writer and the Actor read Taste, and only the new words.
    for (const job of [models.writer, models.actor]) {
      const asked = `${job.requests.at(-1)!.system}\n${job.requests.at(-1)!.prompt}`;
      expect(asked).toContain("- keep Ron in the background unless he's needed");
      expect(asked.split("keep Ron in the background").length - 1).toBe(1);
    }
  });
});

describe("long-run › The player steers with a brief and reactions", () => {
  const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];
  /** A Writer's answer opening a Scene in [frame], with [comesIn]. */
  const opening = (frame: { title: string; place: string }, comesIn: string[]) => ({ answer: JSON.stringify({ frame: { ...frame, purpose: "p", exit: "e" }, comes_in: comesIn, goes: [], beats,
    note: "n", call: "continue", intensity: 2, minutes: 2, in_play: [], moves_to: null }) });

  // GIVEN the player reacted "less like this" to two library Scenes
  // WHEN the Director plans the next Stretch
  // THEN it puts no Scene that matters in the library
  it("long-run › The player steers with a brief and reactions › Less library", async () => {
    const story = storyFile();
    story.world.places.push({ name: "The library", description: "Dust, lamplight and Madam Pince." });
    story.opening = { ...story.opening, title: "The library", place: "The library" };
    const { engine, storyId, head, view, play, models, mac } = playable(story);
    const end = async (trace: string) => {
      engine.endScene(storyId, head(), trace);
      await engine.ended(storyId);
    };
    // Scene 1 is in the library; the player reacts to it at the Day View, and the reaction is on the Path.
    await play("I find Hermione at the end table.");
    await end("end-1");
    engine.setReaction(storyId, 1, "less", null, "react-1");
    expect(view().day_view!.reaction).toBe("less");
    // Scene 2 is back in the library. The Stretch planned after Scene 1 still runs, so no plan is due at its end.
    models.writer.then(opening({ title: "Back to the library", place: "The library" }, ["Hermione Granger"]));
    engine.choose(storyId, { after: head(), kind: "somewhere", place: "The library", gap: null }, "library");
    await engine.settled(storyId);
    await end("end-2");
    expect(models.director.requests).toHaveLength(1);
    engine.setReaction(storyId, 2, "less", "Too much reading.", "react-2");
    expect(besideOf(mac, storyId).reactions).toEqual([
      { scene: 1, title: "The library", reaction: "less", note: null },
      { scene: 2, title: "Back to the library", reaction: "less", note: "Too much reading." }
    ]);
    // Scene 3 is a week on, past the Stretch's Scenes that matter: the Director plans the next Stretch.
    const week = view().day_view!.choices.skips.find(skip => skip.label === "Next week")!;
    engine.choose(storyId, { after: head(), kind: "skip", at: week.at, gap: null }, "week");
    await engine.settled(storyId);
    await end("end-3");
    expect(models.director.requests).toHaveLength(2);
    const [first, next] = models.director.requests.map(request => request.prompt);
    expect(first).not.toContain("Reactions to recent Scenes");
    // It plans from both reactions, and knows from The Story So Far what each of those Scenes was.
    expect(next).toContain("Reactions to recent Scenes:\n- Scene 1, The library: less like this\n- Scene 2, Back to the library: less like this (Too much reading.)\n</the_players_wishes>");
    expect(next).toMatch(/<story_so_far>[\s\S]*Scene 1, The library \([\s\S]*Scene 2, Back to the library \([\s\S]*<\/story_so_far>/);
  });
});

describe("the Premise and the World, and phones told of every edit", () => {
  it("has every agent that reads the Premise or the World read the new words on its next call", async () => {
    const { engine, storyId, head, play, models } = playable(storyFile());
    engine.setPremise(storyId, "A rivalry that turns, slowly, into something else.", head(), "premise");
    engine.setWorld(storyId, "Hogwarts in 1991, cold and candlelit.", "The war ended in a truce nobody trusts.", head(), "world");
    await play("I sit at the other end of the sofa.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    // Every one of them reads the Story in four layers: the Premise, and the World as its own part of layer 1.
    for (const job of [models.writer, models.actor, models.weaver, models.director]) {
      expect(job.requests.at(-1)!.system).toContain("Premise: A rivalry that turns, slowly, into something else.");
      expect(job.requests.at(-1)!.system).toContain("<world>\nThe World.\nHogwarts in 1991, cold and candlelit.\nHistory: The war ended in a truce nobody trusts.");
    }
  });

  it("tells a phone watching that the Story changed, for each of the nine edits", () => {
    const { engine, storyId, head, events } = playable(storyFile());
    const edits: [string, () => unknown][] = [
      ["premise_set", () => engine.setPremise(storyId, "A romance.", head(), "t")],
      ["style_set", () => engine.setStyle(storyId, "Dry.", head(), "t")],
      ["reply_length_set", () => engine.setReplyLength(storyId, "short", head(), "t")],
      ["arcs_set", () => engine.setArcs(storyId, ["One."], head(), "t")],
      ["landmark_set", () => engine.setLandmark(storyId, { name: "The Yule Ball", at: "Day 100 19:00", what: "A dance." }, true, head(), "t")],
      ["landmark_dropped", () => engine.dropLandmark(storyId, "The Yule Ball", head(), "t")],
      ["place_set", () => engine.setPlace(storyId, { name: "The kitchens", description: "Elves and warmth." }, false, true, head(), "t")],
      ["world_set", () => engine.setWorld(storyId, "Hogwarts.", "", head(), "t")],
      ["clock_set", () => engine.setClock(storyId, "Day 4 09:00", undefined, head(), "t")]
    ];
    for (const [kind, edit] of edits) {
      const told = events.length;
      edit();
      expect(events.slice(told).map(event => event.event.kind), kind).toEqual(["path_changed"]);
    }
  });
});
