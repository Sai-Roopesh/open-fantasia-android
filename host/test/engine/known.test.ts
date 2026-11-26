import { describe, expect, it } from "vitest";
import { known } from "../../src/cli/commands.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

const capture = () => {
  const lines: string[] = [];
  return { out: (line: string) => { lines.push(line); }, text: () => lines.join("\n") };
};

describe("setting what the Player Character knows of someone on a Story being played (fantasia known)", () => {
  it("writes it on the Path, for the person as the Story names them, and tells the phones", () => {
    const { engine, storyId, head, state, events, path } = playable(hogwartsWorldStoryFile());
    engine.setKnown(storyId, "quirrell", "The Defence teacher. Stammers; smells of garlic.", head(), "trace-known");
    expect(state().known["Quirinus Quirrell"]).toEqual({ text: "The Defence teacher. Stammers; smells of garlic.", from: null });
    expect(path().at(-1)).toEqual({ kind: "known_set", person: "Quirinus Quirrell", text: "The Defence teacher. Stammers; smells of garlic." });
    expect(events.at(-1)!.event.kind).toBe("path_changed");
  });

  it("refuses someone not in the Story, the Player Character, no words, or a Reply being written", async () => {
    const story = playable(hogwartsWorldStoryFile());
    const { engine, storyId, head } = story;
    expect(() => engine.setKnown(storyId, "Gilderoy Lockhart", "A fraud.", head(), "t")).toThrow("Gilderoy Lockhart is not in this Story.");
    expect(() => engine.setKnown(storyId, "Roopesh Gantasala", "Himself.", head(), "t")).toThrow("Roopesh Gantasala is the Player Character; what he knows of himself is not kept.");
    expect(() => engine.setKnown(storyId, "Hermione Granger", "  ", head(), "t")).toThrow("Say what he knows of Hermione Granger.");
    expect(() => engine.setKnown(storyId, "Hermione Granger", "A Gryffindor.", "old-head", "t")).toThrow(/moved on/);
  });

  it("is set from the Mac's command line by the Story's id", () => {
    const { mac, engine, storyId, state } = playable(hogwartsWorldStoryFile());
    const done = capture();
    expect(known(mac, engine, storyId, "Hermione Granger", "A Gryffindor first-year who answers every question.", done.out)).toBe(true);
    expect(done.text()).toBe("What Roopesh Gantasala knows of Hermione Granger is now: A Gryffindor first-year who answers every question.");
    expect(state().known["Hermione Granger"]!.text).toBe("A Gryffindor first-year who answers every question.");
    const refused = capture();
    expect(known(mac, engine, "nowhere", "Hermione Granger", "x", refused.out)).toBe(false);
    expect(refused.text()).toBe("No Story nowhere on this Mac.");
  });
});
