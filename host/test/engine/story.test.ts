import { describe, expect, it } from "vitest";
import type { WorldMoved } from "../../src/story/entries.js";
import type { State } from "../../src/story/state.js";
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
    expect(models.actor.requests.at(-1)!.system).toContain("Let each Reply run as long as the moment needs");
    engine.setReplyLength(storyId, "short", head(), "length");
    await play("I ask what she is reading.");
    expect(models.actor.requests.at(-1)!.system).toContain("Keep each Reply short: one or two brief paragraphs.");
    expect(models.actor.requests.at(-1)!.system).not.toContain("Let each Reply run as long as the moment needs");
    expect(mac.states.at(before).replyLength).toBe("full");
  });
});

describe("stories › Anything can be edited or created in the app: Landmarks", () => {
  /** What the World recorded as happened on the Path at [head], with the Landmark each is, if any. */
  const happenedOn = (mac: ReturnType<typeof playable>["mac"], head: string) =>
    mac.tree.recordsOn(head, "world_moved").flatMap(entry => (entry.payload as WorldMoved).happened);

  // GIVEN the betrothal Landmark is set for Year 3 on two Paths
  // WHEN the player moves it to the end of Year 2 on one of them
  // THEN that Path brings it about at the end of Year 2
  // AND the other Path still has it in Year 3
  it("stories › Anything can be edited or created in the app › A Landmark is moved on one Path", async () => {
    const { mac, engine, storyId, head, state } = playable(storyFile());
    const other = mac.tree.createPath(storyId, "Year 3", head(), false);
    engine.setLandmark(storyId, { name: "The betrothal", at: "Day 700 12:00", what: "Lucius announces Draconia's engagement." }, false, head(), "move");
    // The Story is played on to the end of Year 2: the clock moves on past it, and the Scene ends.
    engine.setClock(storyId, "Day 701 10:00", undefined, head(), "on");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    const betrothal = happenedOn(mac, head()).find(item => item.landmark === "The betrothal");
    expect(betrothal?.at).toBe("Day 700 12:00");
    expect(state().landmarks.find(item => item.name === "The betrothal")?.at).toBe("Day 700 12:00");
    expect(mac.states.at(mac.tree.path(other.id)!.headEntryId).landmarks.find(item => item.name === "The betrothal")?.at).toBe("Day 760 12:00");
    expect(happenedOn(mac, mac.tree.path(other.id)!.headEntryId)).toEqual([]);
  });

  // GIVEN the Halloween feast Landmark happened on this Path in Scene 6
  // WHEN the player tries to move it to the following week
  // THEN nothing changes, and the app says it has already happened on this Path
  it("stories › Anything can be edited or created in the app › A Landmark the World has passed", async () => {
    const story = storyFile();
    story.landmarks.push({ name: "The Halloween feast", at: "Day 5 19:00", what: "The Great Hall, pumpkins, and a troll." });
    const { mac, engine, storyId, head, state } = playable(story);
    engine.setClock(storyId, "Day 6 09:00", undefined, head(), "on");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    expect(happenedOn(mac, head()).some(item => item.landmark === "The Halloween feast")).toBe(true);
    const at = head();
    expect(refused(() => engine.setLandmark(storyId, { name: "The Halloween feast", at: "Day 12 19:00", what: "The feast, a week late." }, false, head(), "move")))
      .toBe("The Halloween feast has already happened on this Path.");
    expect(head()).toBe(at);
    expect(state().landmarks.find(item => item.name === "The Halloween feast")?.at).toBe("Day 5 19:00");
  });
});

describe("stories › Anything can be edited or created in the app: the time", () => {
  const summons = { id: "P1", at: "Day 4 09:00", place: "McGonagall's office", what: "Your account of the troll.", who: ["Hermione Granger"], expected: true, pick: true };
  const owlery = { id: "P2", at: "Day 5 10:00", place: "The owlery", what: "Draconia sends a letter home.", who: ["Draconia Malfoy"], expected: false, pick: false };

  // GIVEN the Day View is waiting on Saturday at 7:40 am
  // WHEN the player moves the clock on to Sunday at 9:00 am
  // THEN the Day View is waiting on Sunday at 9:00 am, with nothing on before then among its choices
  // AND once the player has chosen, what happened in the World between Saturday and Sunday is in Backstage
  it("stories › Anything can be edited or created in the app › Moving the clock on", async () => {
    const story = { ...storyFile(), clock: { starts: "Day 3 22:40", day_one_weekday: "wednesday" as const }, opening: { ...storyFile().opening, at: "Day 3 22:40" } };
    const { mac, engine, storyId, head, view } = playable(story, { weaver: [{ answer: JSON.stringify({ lives: [], threads: [], happened: [], meanwhile: [], happenings: [summons, owlery] }) }] });
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    expect(view().day_view).toMatchObject({ at: "Day 4 07:30", day: "Saturday" });
    expect(view().day_view!.happenings.map(item => item.place)).toEqual(["McGonagall's office", "The owlery"]);

    engine.setClock(storyId, "Day 5 09:00", undefined, head(), "on");
    const sunday = view().day_view!;
    expect(sunday).toMatchObject({ at: "Day 5 09:00", day: "Sunday", time: "9:00 am" });
    expect(sunday.happenings.map(item => item.place)).toEqual(["The owlery"]);

    engine.choose(storyId, { after: head(), kind: "go", happening: sunday.happenings[0]!.id, gap: null }, "go");
    // The Gap is woven in the turn the choice starts, before the next Scene's first Reply.
    await engine.settled(storyId);
    const record = mac.tree.recordsOn(head(), "world_moved").at(-1)!.payload as WorldMoved;
    expect([record.from, record.until]).toEqual(["Day 4 07:30", "Day 5 10:00"]);
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
    await engine.woven(storyId);
    expect(models.weaver.requests.at(-1)!.system).toMatch(/The Room of Requirement: A room that is whatever you need it to be\./);
    expect(mac.states.at(before).world.places.map(place => place.name)).not.toContain("The Room of Requirement");
    expect(mac.states.at(other.headEntryId).world.places.map(place => place.name)).not.toContain("The Room of Requirement");
  });
});
