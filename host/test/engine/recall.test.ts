import { describe, expect, it } from "vitest";
import type { Script } from "../../src/models/scripted.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { NIGHT_TRAIN } from "../support/stories.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];

/** A Writer's answer: the first one in a Story frames its opening; [opens] frames a new Scene from the Day View. */
function writer(comesIn: string[], clock: string, opens?: { title: string; place: string }): Script {
  const frame = opens ? { ...opens, purpose: "p", exit: "e" } : { title: "kept", place: "kept", purpose: "p", exit: "e" };
  return { answer: JSON.stringify({ leaves_scene: false, frame, comes_in: comesIn, goes: [], beats, note: "n", call: "continue", intensity: 2, arc_moved: true, clock, taste: null, in_play: [] }) };
}

function chronicle(summary: string, moments: unknown[], told: unknown[] = []): Script {
  return { answer: JSON.stringify({ summary, moments, told }) };
}

/** The system prompt of the Actor's latest call: where recall goes. */
const lastActorSystem = (models: ReturnType<typeof playable>["models"]) => models.actor.requests.at(-1)!.system;

describe("recall", () => {
  // GIVEN the Moment at the Hogsmeade station where the Player Character saved Draconia
  // WHEN a later Scene brings up the life debt with Draconia
  // THEN her Replies draw on what was actually said and done at the station
  it("living-world › Moments are remembered from one record › Draconia remembers the station", async () => {
    const station = hogwartsStoryFile({ title: "The station", place: "Hogsmeade station", at: "Day 1 18:00", who: ["Draconia Malfoy"], prose: "The crowd surges toward the platform's edge." });
    const { play, engine, storyId, head, models } = playable(station, {
      writer: [writer(["Draconia Malfoy"], "Day 1 18:02"), writer(["Draconia Malfoy"], "Day 8 16:00", { title: "The library", place: "The library" })],
      actor: [{ answer: "\"I'd have managed,\" Draconia says, and doesn't look at you. She doesn't take her wrist back either." }],
      chronicler: [chronicle("Roopesh pulled Draconia back from the platform's edge.", [{
        what: "Roopesh pulls Draconia back from the edge of the platform; she says she'd have managed.",
        quotes: [{ entry: "E2", text: "I grab Draconia's wrist and pull her back from the edge of the platform." }, { entry: "E3", text: "\"I'd have managed,\" Draconia says, and doesn't look at you." }],
        there: ["Draconia"], weight: 4
      }])]
    });
    await play("I grab Draconia's wrist and pull her back from the edge of the platform.");
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    await play("A week later I find Draconia in the library and ask her about the life debt.");
    const system = lastActorSystem(models);
    expect(system).toContain("I grab Draconia's wrist and pull her back from the edge of the platform.");
    expect(system).toContain("\"I'd have managed,\" Draconia says, and doesn't look at you.");
    expect(system).toMatch(/Scene 1 · The station/);
  });

  // GIVEN only Hagrid, Ron and Harry know about the dragon egg
  // WHEN Hermione is alone with the Player Character
  // THEN nothing she says or does shows knowledge of the egg
  it("living-world › Characters know only what they could know › Hermione does not know about the egg", async () => {
    const hut = hogwartsStoryFile({ title: "Hagrid's hut", place: "Hagrid's hut", at: "Day 4 15:00", who: ["Rubeus Hagrid", "Ron Weasley", "Harry Potter"], prose: "Something is ticking in the fire." });
    const egg = { what: "Hagrid shows them the dragon egg in the fire.", quotes: [{ entry: "E3", text: "Hagrid lifts the black egg out of the coals with his bare hands." }], there: ["Hagrid", "Ron", "Harry"], weight: 4 };
    const { play, engine, storyId, head, models } = playable(hut, {
      writer: [writer(["Rubeus Hagrid", "Ron Weasley", "Harry Potter"], "Day 4 15:05"), writer(["Hermione Granger"], "Day 4 20:00", { title: "The library", place: "The library" }),
        writer(["Hermione Granger", "Ron Weasley"], "Day 5 20:00", { title: "The common room", place: "The common room" }), writer(["Hermione Granger"], "Day 6 09:00", { title: "Breakfast", place: "The Great Hall" })],
      actor: [{ answer: "Hagrid lifts the black egg out of the coals with his bare hands." }, { answer: "Hermione is reading." }, { answer: "Ron tells Hermione about the egg in a whisper." }],
      chronicler: [chronicle("Hagrid showed them a dragon egg.", [egg]), chronicle("Hermione read.", []), chronicle("Ron told Hermione.", [], [{ moment: "M1", to: ["Hermione"], entry: "E2" }])]
    });
    await play("I look into the fire.");
    engine.endScene(storyId, head(), "t1");
    await engine.chronicled(storyId);
    await play("That evening I find Hermione alone in the library.");
    expect(lastActorSystem(models)).not.toContain("black egg");
    engine.endScene(storyId, head(), "t2");
    await engine.chronicled(storyId);
    await play("Ron tells Hermione about the egg while I listen.");
    engine.endScene(storyId, head(), "t3");
    await engine.chronicled(storyId);
    await play("At breakfast I sit with Hermione.");
    expect(lastActorSystem(models)).toContain("Hagrid lifts the black egg out of the coals with his bare hands.");
  });

  // GIVEN a Reply had Hermione say "you told me at breakfast you hate flying", and no Move ever said so
  // WHEN a later Scene brings up flying with Hermione
  // THEN nothing in it treats Roopesh's hating flying as something he said
  it("living-world › Only the player makes facts about the Player Character › An invented past is not remembered", async () => {
    const claim = "\"You told me at breakfast you hate flying,\" Hermione says. \"So why are you on the team list?\"";
    const { play, engine, storyId, head, models } = playable(hogwartsStoryFile(), {
      writer: [writer(["Hermione Granger"], "Day 3 21:42"), writer(["Hermione Granger"], "Day 4 10:00", { title: "The pitch", place: "The Quidditch pitch" })],
      actor: [{ answer: claim }],
      chronicler: [
        chronicle("Hermione asked about flying.", [{ what: "Hermione says Roopesh hates flying.", quotes: [{ entry: "E3", text: "\"You told me at breakfast you hate flying,\" Hermione says." }], there: ["Hermione"], weight: 3 }]),
        chronicle("Hermione asked why he is on the team list.", [{ what: "Hermione asks why he is on the team list.", quotes: [{ entry: "E3", text: "\"So why are you on the team list?\"" }], there: ["Hermione"], weight: 2 }])
      ]
    });
    await play("I sit down by the fire.");
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    expect(models.chronicler.requests).toHaveLength(2);
    expect(models.chronicler.requests[1]!.prompt).toMatch(/is from a Reply and decides for the player's character \("You told me at breakfast you hate flying/);
    await play("On the pitch I ask Hermione whether she's coming to watch the flying lesson.");
    expect(lastActorSystem(models)).not.toContain("hate flying");
    expect(lastActorSystem(models)).toContain("So why are you on the team list?");
  });

  // GIVEN a Move said "I tell her I'm going to Shimla for an interview I don't want"
  // WHEN a later Scene with Meera brings up Shimla
  // THEN Meera's Replies can draw on what he told her, in his words
  it("living-world › Only the player makes facts about the Player Character › What the player wrote is remembered", async () => {
    const nightTrain = parse(readFileSync(join(NIGHT_TRAIN, "story.yaml"), "utf8")) as StoryFile;
    const told = "I tell her I'm going to Shimla for an interview I don't want.";
    const { play, engine, storyId, head, models } = playable(nightTrain, {
      writer: [writer(["Meera Kulkarni", "Uncle Bhalla"], "Day 1 22:45"), writer(["Meera Kulkarni"], "Day 2 07:40", { title: "Kalka", place: "Kalka station" })],
      chronicler: [chronicle("Ishaan told Meera about the interview.", [{ what: "Ishaan tells Meera he doesn't want the interview.", quotes: [{ entry: "E2", text: told }], there: ["Meera"], weight: 3 }])]
    });
    await play(told);
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    await play("At Kalka I help Meera with her bag and say the interview is at eleven.");
    const system = lastActorSystem(models);
    expect(system).toContain(`<move by="Ishaan Mehra">\n${told}\n</move>`);
  });
});
