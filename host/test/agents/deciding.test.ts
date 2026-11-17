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

  // The Line allows how he looks to others (openspec scenes: The Reply never writes the Player Character › Others may
  // describe him): the Writer may plan the remark, but not decide what he feels.
  it("lets others say how he looks, and still catches what he is made to feel", () => {
    for (const seen of [
      "Meera tells Ishaan he looks like he hasn't slept.",
      "Ishaan looks like he hasn't slept.",
      "Meera says Ishu looks half asleep on his feet."
    ]) {
      expect(decidesForPlayer(seen, names), seen).toBeNull();
    }
    expect(decidesForPlayer("Ishaan feels exhausted after the night.", names)).not.toBeNull();
  });

  it("lets other people act on him, and his body answer, without that deciding for him", () => {
    for (const done of [
      "She forces Ishaan back against the door.",
      "Meera makes Ishaan let go of the railing.",
      "The slap makes Ishaan go red to the ears.",
      "Ishaan goes pale.",
      "Uncle Bhalla pulls Ishaan down onto the berth."
    ]) {
      expect(decidesForPlayer(done, names), done).toBeNull();
    }
    for (const chosen of ["Ishaan pushes her away.", "Ishaan pulls back from her.", "Ishaan holds her hand.", "The slap makes Ishaan cry."]) {
      expect(decidesForPlayer(chosen, names), chosen).not.toBeNull();
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
