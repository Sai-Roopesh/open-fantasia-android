import { describe, expect, it } from "vitest";
import { heardOn, knownOn } from "../../src/story/known.js";
import type { MeanwhileItem } from "../../src/story/entries.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

const model = { provider: "claude", model: "claude-sonnet-5-5" } as const;

/** The common room Scene, played and ended, with a Weaver's record of what he heard after it. */
async function heard(meanwhile: MeanwhileItem[]) {
  const played = playable(hogwartsWorldStoryFile());
  await played.play("I say goodnight to Hermione and go up.");
  const scene = played.mac.tree.pathTo(played.head()).find(entry => entry.payload.kind === "scene_opened")!;
  played.mac.tree.append(played.storyId, played.head(), { kind: "world_moved", scene: scene.id, from: "Day 3 21:40", until: "Day 4 07:30", lives: [], threads: [], happened: [], meanwhile, happenings: [], callId: "c", model });
  return played;
}

describe("what he has heard of someone", () => {
  it("is every line of Meanwhile about them, newest first, with how he heard it", async () => {
    const { mac, head } = await heard([
      { text: "Lavender says Hermione cried in the girls' bathroom.", how: "rumour", happened: "H1", toldBy: null, about: ["Hermione Granger"] },
      { text: "A note from McGonagall: her office at nine.", how: "seen", happened: "H2", toldBy: null, about: ["Minerva McGonagall"] }
    ]);
    expect(heardOn(mac, head()).get("Hermione Granger")).toEqual([{ text: "Lavender says Hermione cried in the girls' bathroom.", how: "rumour" }]);
    expect(heardOn(mac, head()).get("Minerva McGonagall")).toEqual([{ text: "A note from McGonagall: her office at nine.", how: "seen" }]);
  });

  it("counts a line woven before about as about everyone it names", async () => {
    const { mac, head } = await heard([{ text: "Lavender says Hermione and Ron argued again.", how: "rumour", happened: "H1", toldBy: null }]);
    expect(heardOn(mac, head()).get("Hermione Granger")).toEqual([{ text: "Lavender says Hermione and Ron argued again.", how: "rumour" }]);
    // Lavender is who said it, not who it is about, but an old line cannot tell them apart.
    expect([...heardOn(mac, head()).keys()]).toContain("Lavender Brown");
  });
});

describe("what he knows of someone", () => {
  it("is the Story File's line, then the newest a Chronicle or fantasia known wrote", async () => {
    const story = hogwartsWorldStoryFile();
    story.people = story.people.map(person => person.name === "Hermione Granger" ? { ...person, known: "A Gryffindor first-year." } : person) as typeof story.people;
    const { mac, engine, storyId, head, play } = playable(story);
    expect(knownOn(mac, head()).get("Hermione Granger")).toEqual({ text: "A Gryffindor first-year.", from: null });
    await play("I sit beside her.");
    const scene = mac.tree.pathTo(head()).find(entry => entry.payload.kind === "scene_opened")!;
    mac.tree.append(storyId, head(), { kind: "chronicle", scene: scene.id, summary: null, sceneEnded: false, moments: [], told: [], known: [{ who: "Hermione Granger", now: "A Gryffindor first-year. She noticed the inkwell." }], callId: "c", model });
    expect(knownOn(mac, head()).get("Hermione Granger")).toEqual({ text: "A Gryffindor first-year. She noticed the inkwell.", from: { number: 1, title: (scene.payload as { title: string }).title } });
    engine.setKnown(storyId, "Hermione Granger", "Set by hand.", head(), "t");
    expect(knownOn(mac, head()).get("Hermione Granger")).toEqual({ text: "Set by hand.", from: null });
    expect(knownOn(mac, head()).has("Vincent Crabbe")).toBe(false);
  });
});
