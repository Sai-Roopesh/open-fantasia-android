import { describe, expect, it } from "vitest";
import { nameIndex, storyName } from "../../src/agents/names.js";
import type { Person } from "../../src/story/state.js";

const person = (name: string, aliases: string[] = []): Person => ({ name, aliases, whoTheyAre: "", appearance: "", after: "", knows: [], voice: [], portrait: null, group: null });

describe("names", () => {
  const index = nameIndex([person("Rubeus Hagrid"), person("Draconia Malfoy", ["Connie"]), person("Lucius Malfoy"), person("Hermione Granger"), person("Uncle Bhalla")]);

  it("knows people by full name, alias, first name, and a surname nobody else has", () => {
    expect(storyName(index, "Hagrid")).toBe("Rubeus Hagrid");
    expect(storyName(index, "rubeus")).toBe("Rubeus Hagrid");
    expect(storyName(index, "Connie")).toBe("Draconia Malfoy");
    expect(storyName(index, "Granger")).toBe("Hermione Granger");
    expect(storyName(index, "Bhalla")).toBe("Uncle Bhalla");
  });

  it("gives a surname two people share to nobody", () => {
    expect(storyName(index, "Malfoy")).toBeNull();
  });
});
