import { describe, expect, it } from "vitest";
import { arc, clock, landmark, length, place, premise, style, taste, worldIs } from "../../src/cli/commands.js";
import { learnLesson, tasteOf } from "../../src/store/beside.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

const capture = () => {
  const lines: string[] = [];
  return { out: (line: string) => { lines.push(line); }, text: () => lines.splice(0).join("\n") };
};

describe("editing the Story through the Mac's commands (editing-the-story design decision 5)", () => {
  it("sets the Premise, the Style, a line added to it, and the reply length, telling a phone watching", () => {
    const { mac, engine, storyId, state, events } = playable(hogwartsStoryFile());
    const said = capture();
    expect(premise(mac, engine, storyId, "A rivalry, slowly.", said.out)).toBe(true);
    expect(said.text()).toBe("The Premise is set, from here on this Path.");
    expect(state().premise).toBe("A rivalry, slowly.");
    expect(events.at(-1)!.event.kind).toBe("path_changed");

    expect(style(mac, engine, storyId, "", "Keep the humour dry and British.", said.out)).toBe(true);
    expect(state().style).toBe("Close third person, British English, 1991. Keep the humour dry and British.");
    expect(said.text()).toBe("The Style is set, from here on this Path.");
    expect(style(mac, engine, storyId, "", undefined, said.out)).toBe(false);
    expect(said.text()).toBe("Say the Style, or a line to add with --add.");

    expect(length(mac, engine, storyId, "Short", said.out)).toBe(true);
    expect(said.text()).toBe("Replies are short from here on this Path.");
    expect(length(mac, engine, storyId, "long", said.out)).toBe(false);
    expect(said.text()).toBe("Say Short, Medium or Full.");
  });

  it("lists, adds, rewrites and drops Arcs by number", () => {
    const { mac, engine, storyId, state } = playable(hogwartsStoryFile());
    const said = capture();
    expect(arc(mac, engine, storyId, [], said.out)).toBe(true);
    expect(said.text()).toBe("1. Draconia comes round to Roopesh, slowly, against everything she was raised to be.");
    expect(arc(mac, engine, storyId, ["add", "Harry", "and", "Roopesh", "become", "friends."], said.out)).toBe(true);
    expect(said.text()).toBe("The Arc is added, from here on this Path.");
    expect(arc(mac, engine, storyId, ["rewrite", "2", "Harry", "trusts", "Roopesh."], said.out)).toBe(true);
    expect(state().arcs.at(-1)).toBe("Harry trusts Roopesh.");
    expect(arc(mac, engine, storyId, ["drop", "1"], said.out)).toBe(true);
    expect(said.text()).toBe("The Arc is rewritten, from here on this Path.\nThe Arc is dropped, from here on this Path.");
    expect(state().arcs).toEqual(["Harry trusts Roopesh."]);
    expect(arc(mac, engine, storyId, ["drop", "5"], said.out)).toBe(false);
    expect(said.text()).toBe("Say which Arc by its number, 1 to 1.");
  });

  it("creates, moves and drops a Landmark, and refuses one with no time, saying why", () => {
    const { mac, engine, storyId, state } = playable(hogwartsStoryFile());
    const said = capture();
    expect(landmark(mac, engine, storyId, "The Yule Ball", { what: "A dance." }, said.out)).toBe(false);
    expect(said.text()).toBe("Say when The Yule Ball is with --at, and what happens with --what: it is not a Landmark yet.");
    expect(landmark(mac, engine, storyId, "The Yule Ball", { at: "Day 100 19:00", what: "A dance." }, said.out)).toBe(true);
    expect(said.text()).toBe("The Yule Ball is a Landmark now, from here on this Path.");
    expect(landmark(mac, engine, storyId, "The Yule Ball", { at: "Day 90 19:00" }, said.out)).toBe(true);
    expect(state().landmarks.find(item => item.name === "The Yule Ball")).toEqual({ name: "The Yule Ball", at: "Day 90 19:00", what: "A dance." });
    expect(landmark(mac, engine, storyId, "The Yule Ball", { at: "Day 1 19:00" }, said.out)).toBe(false);
    expect(said.text()).toBe("The Yule Ball is set, from here on this Path.\nThat time has passed on this Path.");
    expect(landmark(mac, engine, storyId, "The Yule Ball", { drop: true }, said.out)).toBe(true);
    expect(said.text()).toBe("The Yule Ball is dropped, from here on this Path.");
  });

  it("adds a place and an institution, sets what the World is, and moves the clock on but never back", () => {
    const { mac, engine, storyId, state } = playable(hogwartsStoryFile());
    const said = capture();
    expect(place(mac, engine, storyId, "The Room of Requirement", "Whatever room you need.", false, said.out)).toBe(true);
    expect(place(mac, engine, storyId, "The Ministry of Magic", "Slow and proud.", true, said.out)).toBe(true);
    expect(place(mac, engine, storyId, "The Room of Requirement", "A room that hides.", false, said.out)).toBe(true);
    expect(said.text()).toBe("The Room of Requirement is a place in the Story now, from here on this Path.\nThe Ministry of Magic is an institution in the Story now, from here on this Path.\nThe Room of Requirement is set, from here on this Path.");
    expect(state().world.places).toEqual([{ name: "The Room of Requirement", description: "A room that hides." }]);

    expect(worldIs(mac, engine, storyId, undefined, "The war ended in a truce.", said.out)).toBe(true);
    expect(said.text()).toBe("The World is set, from here on this Path.");
    expect(state().world.history).toBe("The war ended in a truce.");

    expect(clock(mac, engine, storyId, "Day 4 09:00", undefined, said.out)).toBe(true);
    expect(said.text()).toBe("It is Saturday 9:00 am now on this Path. The World catches up when it next moves.");
    expect(clock(mac, engine, storyId, "Day 4 08:00", undefined, said.out)).toBe(false);
    expect(said.text()).toBe("The clock only moves on.");
  });

  it("lists Taste's lessons, rewords one and deletes one", () => {
    const { mac, engine, storyId } = playable(hogwartsStoryFile());
    const said = capture();
    expect(taste(mac, engine, storyId, [], said.out)).toBe(true);
    expect(said.text()).toBe("Taste has no lessons yet.");
    for (const lesson of ["Keep school procedure to a line.", "keep Ron in the background"]) learnLesson(mac, storyId, "story", lesson);
    expect(taste(mac, engine, storyId, [], said.out)).toBe(true);
    expect(said.text()).toBe("1. Keep school procedure to a line.\n2. keep Ron in the background");
    expect(taste(mac, engine, storyId, ["reword", "2", "keep", "Ron", "in", "the", "background", "unless", "he's", "needed"], said.out)).toBe(true);
    expect(taste(mac, engine, storyId, ["drop", "1"], said.out)).toBe(true);
    expect(said.text()).toBe("The lesson is reworded, on every Path.\nThe lesson is deleted, on every Path.");
    expect(tasteOf(mac, storyId, "story")).toEqual(["keep Ron in the background unless he's needed"]);
    expect(taste(mac, engine, storyId, ["reword", "3", "x"], said.out)).toBe(false);
    expect(said.text()).toBe("Say which lesson by its number, 1 to 1.");
  });
});
