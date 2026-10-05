import { describe, expect, it } from "vitest";
import { claimsAboutPlayer, decidesForPlayer, playerNames } from "../../src/agents/deciding.js";

describe("deciding for the Player Character", () => {
  const names = playerNames({ name: "Ishaan Mehra", aliases: ["Ishu"] });

  it("knows the Player Character by full name, first name and alias, longest first", () => {
    expect(names).toEqual(["Ishaan Mehra", "Ishaan", "Ishu"]);
  });

  it("catches what decides what he says, chooses, does on purpose or feels", () => {
    for (const deciding of [
      "Ishaan tells her the truth about the ticket.",
      "The whistle makes Ishaan cry.",
      "Ishaan goes quiet at the name.",
      "ishaan agrees to swap berths",
      "Ishaan Mehra realises she lied.",
      "Ishu stays silent through dinner.",
      "Ishaan leaves her at the station.",
      "Ishaan gives in to Uncle Bhalla.",
      "Ishaan lies to the conductor."
    ]) {
      expect(decidesForPlayer(deciding, names), deciding).not.toBeNull();
    }
  });

  it("lets circumstances, other people's choices and questions pass", () => {
    for (const circumstance of [
      "Ishaan is offered a seat by the window.",
      "Meera tells him the train is late.",
      "Ishaan's ticket is checked twice.",
      "She asks Ishaan where he is going.",
      "Ishaan leaves for Pune on Day 4.",
      "Ishaan stays in Bombay until Day 5.",
      "Will Ishaan tell her before Nagpur?"
    ]) {
      expect(decidesForPlayer(circumstance, names), circumstance).toBeNull();
    }
  });

  it("catches a Reply's claim about what he said, did or feels, when only his Moves may say so", () => {
    for (const claim of [
      "\"You told me at breakfast you hate flying,\" Hermione says.",
      "\"You promised,\" she says.",
      "\"You never said a word about Shimla.\"",
      "Ishaan said he would stay."
    ]) {
      expect(claimsAboutPlayer(claim, names), claim).not.toBeNull();
    }
    for (const fine of [
      "\"I'd have managed,\" Draconia says, and doesn't look at you.",
      "She holds the biscuits out to you.",
      "\"You look like you haven't slept,\" Hermione says.",
      "\"Did you?\" she asks."
    ]) {
      expect(claimsAboutPlayer(fine, names), fine).toBeNull();
    }
  });
});
