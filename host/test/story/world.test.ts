import { describe, expect, it } from "vitest";
import type { WorldMoved } from "../../src/story/entries.js";
import { worldOn } from "../../src/story/world.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

const SONNET = { provider: "claude", model: "claude-sonnet-5-5" } as const;

/** Hogwarts with a Group, a Thread, and the Player Character's own Group-less life. */
function hogwarts() {
  const story = hogwartsStoryFile();
  story.people.push(
    { name: "Vincent Crabbe", who_they_are: "Draconia's bodyguard.", group: "Crabbe and Goyle" },
    { name: "Gregory Goyle", who_they_are: "Draconia's other bodyguard.", group: "Crabbe and Goyle" }
  );
  story.groups = [{ name: "Crabbe and Goyle", description: "Draconia's errands, and whatever she wants hit." }];
  story.threads = [{ name: "the dragon egg in Hagrid's hut", now: "Hagrid is keeping it warm in the fire" }];
  story.people.find(person => person.name === "Hagrid" || person.name === "Rubeus Hagrid")!.after = "A dragon of his own";
  return story;
}

/** The Weaver's record of [moved], hung off [parent] as the engine hangs it. */
function moved(played: ReturnType<typeof playable>, parent: string, change: Partial<WorldMoved>) {
  return played.mac.tree.append(played.storyId, parent, {
    kind: "world_moved", scene: "scene", from: "Day 3 21:40", until: "Day 4 07:00",
    lives: [], threads: [], happened: [], meanwhile: [], happenings: [], callId: "c", model: SONNET, ...change
  });
}

describe("the World beside the Path", () => {
  it("starts from the Story File: a Life for each person and Group, members living through their Group, and its Threads", () => {
    const played = playable(hogwarts());
    const world = worldOn(played.mac, played.head());
    expect(world.lives).toEqual(expect.arrayContaining([
      { who: "Rubeus Hagrid", where: null, doing: null, after: "A dragon of his own" },
      { who: "Crabbe and Goyle", where: null, doing: null, after: "Draconia's errands, and whatever she wants hit." }
    ]));
    expect(world.lives.map(life => life.who)).not.toContain("Vincent Crabbe");
    expect(world.lives.map(life => life.who)).not.toContain("Roopesh Gantasala");
    expect(world.threads).toEqual([{ name: "the dragon egg in Hagrid's hut", now: "Hagrid is keeping it warm in the fire" }]);
    expect(world.happened).toEqual([]);
  });

  it("takes each Life and Thread from the latest record that moved it, and what happened oldest first", async () => {
    const played = playable(hogwarts());
    await played.play("I say goodnight.");
    const first = played.head();
    moved(played, first, {
      until: "Day 4 07:00",
      lives: [{ who: "Rubeus Hagrid", where: "his hut", doing: "sitting up with the egg", after: "A dragon of his own" }],
      threads: [{ name: "the dragon egg in Hagrid's hut", now: "The egg has started to rock" }],
      happened: [{ id: "h1", what: "The egg rocked in the coals.", at: "Day 4 02:00", where: "Hagrid's hut", knownTo: ["Rubeus Hagrid"], landmark: null }]
    });
    await played.play("I go down to breakfast.");
    moved(played, played.head(), {
      from: "Day 4 07:00", until: "Day 4 12:00",
      lives: [{ who: "Rubeus Hagrid", where: "the Forbidden Forest", doing: "looking for firewood", after: "A dragon of his own" }],
      happened: [{ id: "h2", what: "Hagrid asked Kettleburn about dragons.", at: "Day 4 10:00", where: "the staff room", knownTo: ["Rubeus Hagrid"], landmark: null }]
    });
    const world = worldOn(played.mac, played.head());
    expect(world.until).toBe("Day 4 12:00");
    expect(world.lives.find(life => life.who === "Rubeus Hagrid")).toMatchObject({ where: "the Forbidden Forest" });
    expect(world.threads).toEqual([{ name: "the dragon egg in Hagrid's hut", now: "The egg has started to rock" }]);
    expect(world.happened.map(item => item.id)).toEqual(["h1", "h2"]);
    // A Path from before the second record sees only the first; walking a Path never meets either.
    expect(worldOn(played.mac, first).happened.map(item => item.id)).toEqual(["h1"]);
    expect(played.mac.tree.pathTo(played.head()).some(entry => entry.payload.kind === "world_moved")).toBe(false);
  });
});
