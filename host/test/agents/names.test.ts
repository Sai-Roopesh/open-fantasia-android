import { describe, expect, it } from "vitest";
import { nameIndex, storyName } from "../../src/agents/names.js";
import type { Person } from "../../src/story/state.js";

const person = (name: string, aliases: string[] = []): Person => ({ name, aliases, whoTheyAre: "", known: null, appearance: "", after: "", knows: [], voice: [], portrait: null, group: null });

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

  it("knows people named with a title, and a title before a shared surname is still nobody's (play-check-fixes design decision 3)", () => {
    const staff = nameIndex([person("Rolanda Hooch"), person("Minerva McGonagall"), person("Filius Flitwick"), person("Argus Filch"), person("Draconia Malfoy"), person("Lucius Malfoy")]);
    expect(storyName(staff, "Madam Hooch")).toBe("Rolanda Hooch");
    expect(storyName(staff, "Professor McGonagall")).toBe("Minerva McGonagall");
    expect(storyName(staff, "Prof. Flitwick")).toBe("Filius Flitwick");
    expect(storyName(staff, "Mr Filch")).toBe("Argus Filch");
    expect(storyName(staff, "Mr. Malfoy")).toBeNull();
    expect(storyName(staff, "Professor Snape")).toBeNull();
  });
});
