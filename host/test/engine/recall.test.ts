import { describe, expect, it } from "vitest";
import { nothingTrue } from "../../src/agents/truth-record.js";
import { fakeEditorAnswer } from "../../src/models/fake.js";
import type { Script } from "../../src/models/scripted.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import type { Chronicle } from "../../src/story/entries.js";
import { NIGHT_TRAIN } from "../support/stories.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";
import { parse } from "yaml";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const beats = [{ text: "a", status: "in_play" }, { text: "b", status: "pending" }, { text: "c", status: "pending" }];

/**
 * A Writer's answer, the Reply [minutes] on: the first one in a Story frames its opening; [opens] frames a new Scene
 * from the Day View.
 */
function writer(comesIn: string[], minutes: number, opens?: { title: string; place: string }): Script {
  const frame = opens ? { ...opens, purpose: "p", exit: "e" } : { title: "kept", place: "kept", purpose: "p", exit: "e" };
  return { answer: JSON.stringify({ frame, comes_in: comesIn, goes: [], beats, note: "n", call: "continue", intensity: 2, minutes, in_play: [], moves_to: null }) };
}

/** A Chronicler's record: a line (its paragraph too), the Moments, who was told of a Moment already known, and the truth. */
function chronicle(summary: string, moments: unknown[], told: unknown[] = [], truth?: unknown): Script {
  return { answer: JSON.stringify({ summary, paragraph: summary, moments, told, known: [], bonds: [], engagements: [], changed: [], ...(truth ? { truth } : {}) }) };
}

/** Everything the Actor's latest call was given: where recall goes. */
const lastActor = (models: ReturnType<typeof playable>["models"]) => {
  const request = models.actor.requests.at(-1)!;
  return `${request.system}\n${request.prompt}`;
};

describe("recall", () => {
  // GIVEN the Moment at the Hogsmeade station where the Player Character saved Draconia
  // WHEN a later Scene brings up the life debt with Draconia
  // THEN her Replies draw on what was actually said and done at the station
  it("living-world › Moments are remembered from one record › Draconia remembers the station", async () => {
    const station = hogwartsStoryFile({ title: "The station", place: "Hogsmeade station", at: "Day 1 18:00", who: ["Draconia Malfoy"], prose: "The crowd surges toward the platform's edge." });
    const { play, engine, storyId, head, models, state } = playable(station, {
      writer: [writer(["Draconia Malfoy"], 2), writer(["Draconia Malfoy"], 9958, { title: "The library", place: "The library" })],
      actor: [{ answer: "\"I'd have managed,\" Draconia says, and doesn't look at you. She doesn't take her wrist back either." }],
      chronicler: [chronicle("Roopesh pulled Draconia back from the platform's edge.", [{
        what: "Roopesh pulls Draconia back from the edge of the platform; she says she'd have managed.",
        quotes: [{ entry: "P2", text: "I grab Draconia's wrist and pull her back from the edge of the platform." }, { entry: "P3", text: "\"I'd have managed,\" Draconia says, and doesn't look at you." }],
        there: ["Draconia Malfoy"], weight: 4
      }])]
    });
    await play("I grab Draconia's wrist and pull her back from the edge of the platform.");
    engine.endScene(storyId, head(), "t-end");
    await engine.ended(storyId);
    await play("A week later I find Draconia in the library and ask her about the life debt.");
    expect(state().scene).toMatchObject({ number: 2, at: "Day 8 16:00" });
    const given = lastActor(models);
    expect(given).toContain("(Scene 1; known to Roopesh Gantasala, Draconia Malfoy): Roopesh pulls Draconia back from the edge of the platform; she says she'd have managed.");
    expect(given).toContain("  \"I grab Draconia's wrist and pull her back from the edge of the platform.\"");
    expect(given).toContain("  \"\"I'd have managed,\" Draconia says, and doesn't look at you.\"");
  });

  // GIVEN only Hagrid, Ron and Harry know about the dragon egg
  // WHEN Hermione is alone with the Player Character
  // THEN nothing she says or does shows knowledge of the egg
  it("living-world › Characters know only what they could know › Hermione does not know about the egg", async () => {
    const hut = hogwartsStoryFile({ title: "Hagrid's hut", place: "Hagrid's hut", at: "Day 4 15:00", who: ["Rubeus Hagrid", "Ron Weasley", "Harry Potter"], prose: "Something is ticking in the fire." });
    const lifted = "Hagrid lifts the black egg out of the coals with his bare hands.";
    const egg = { what: "Hagrid shows them the dragon egg in the fire.", quotes: [{ entry: "P3", text: lifted }], there: ["Rubeus Hagrid", "Ron Weasley", "Harry Potter"], weight: 4 };
    const secret = "Hagrid is hatching a dragon egg in his hut";
    const kept = { ...nothingTrue(), truths: { open: [{ kind: "secret", what: secret, terms: [], who: ["Rubeus Hagrid"], known_to: ["Rubeus Hagrid", "Ron Weasley", "Harry Potter", "Roopesh Gantasala"], due: null, replaces: null, quotes: [{ entry: "P3", text: lifted }] }], close: [] } };
    const toldHer = { ...nothingTrue(), beliefs: { open: [{ holder: "Hermione Granger", what: secret, true: true, quotes: [{ entry: "P3", text: "Ron tells Hermione about the egg in a whisper." }] }], close: [] } };
    // The Actor is told everything (docs/adr/0017); a Reply in which Hermione, alone with him, shows she knows of the
    // egg is what the Editor reads for, and sends back.
    const shows = "Hermione looks up from her book. “Has Hagrid's egg hatched yet?”";
    const reads: Script = { from: request => {
      const facts = request.facts as { reply?: string; present?: string[] };
      const alone = facts.present?.length === 1 && facts.present[0] === "Hermione Granger";
      return alone && /egg/.test(facts.reply ?? "")
        ? { answer: JSON.stringify({ fixes: [], breaks: [{ kind: "leak", who: "Hermione Granger", words: "Has Hagrid's egg hatched yet?", why: "Only Hagrid, Ron, Harry and Roopesh know about the egg." }] }) }
        : fakeEditorAnswer(request);
    } };
    const { play, engine, storyId, head, models, state, view } = playable(hut, {
      writer: [writer(["Rubeus Hagrid", "Ron Weasley", "Harry Potter"], 5), writer(["Hermione Granger"], 295, { title: "The library", place: "The library" }),
        writer(["Hermione Granger", "Ron Weasley"], 1440, { title: "The common room", place: "The common room" }), writer(["Hermione Granger"], 780, { title: "Breakfast", place: "The Great Hall" })],
      actor: [{ answer: lifted }, { answer: shows }, { answer: "Hermione is reading." }, { answer: "Ron tells Hermione about the egg in a whisper." }],
      editor: Array.from({ length: 12 }, () => reads),
      // Ron tells her in the third Scene: the egg is the first Moment the people there remember.
      chronicler: [chronicle("Hagrid showed them a dragon egg.", [egg], [], kept), chronicle("Hermione read.", []), chronicle("Ron told Hermione about the egg.", [], [{ moment: "M1", to: ["Hermione Granger"] }], toldHer)]
    });
    await play("I look into the fire.");
    engine.endScene(storyId, head(), "t1");
    await engine.ended(storyId);
    expect(state().facts.find(fact => fact.what === egg.what)!.knownTo).toEqual(["Roopesh Gantasala", "Rubeus Hagrid", "Ron Weasley", "Harry Potter"]);
    await play("That evening I find Hermione alone in the library.");
    expect(state().scene!.here).toEqual(["Hermione Granger"]);
    // Whoever writes her is told plainly that she does not know, and given nothing of it as hers to remember.
    const [library, again] = models.actor.requests.slice(-2).map(request => request.prompt) as [string, string];
    expect(library).toContain(`Hermione Granger does not know ${secret}.`);
    expect(library).toContain("known to Roopesh Gantasala, Rubeus Hagrid, Ron Weasley, Harry Potter"); // Author sees the remembered fact; Hermione is not in its audience.
    // The Reply that had her show it was written again before the player read it; what the player read shows nothing.
    expect(again).toContain("Leak (Hermione Granger): \"Has Hagrid's egg hatched yet?\".");
    expect(view().exchanges.at(-1)!.reply!.text).toBe("Hermione is reading.");
    engine.endScene(storyId, head(), "t2");
    await engine.ended(storyId);
    await play("Ron tells Hermione about the egg while I listen.");
    engine.endScene(storyId, head(), "t3");
    await engine.ended(storyId);
    // Told on the page, she knows it from then on.
    expect(state().facts.find(fact => fact.what === egg.what)!.knownTo).toContain("Hermione Granger");
    await play("At breakfast I sit with Hermione.");
    expect(lastActor(models)).toContain("Hagrid lifts the black egg out of the coals with his bare hands.");
  });

  // GIVEN a Reply had Hermione say "you told me at breakfast you hate flying", and no Move ever said so
  // WHEN a later Scene brings up flying with Hermione
  // THEN nothing in it treats Roopesh's hating flying as something he said
  it("living-world › Only the player makes facts about the Player Character › An invented past is not remembered", async () => {
    const claim = "\"You told me at breakfast you hate flying,\" Hermione says. \"So why are you on the team list?\"";
    const { play, engine, storyId, head, models, path } = playable(hogwartsStoryFile(), {
      writer: [writer(["Hermione Granger"], 2), writer(["Hermione Granger"], 738, { title: "The pitch", place: "The Quidditch pitch" })],
      actor: [{ answer: claim }],
      chronicler: [chronicle("Hermione asked about flying.", [
        { what: "Hermione says Roopesh hates flying.", quotes: [{ entry: "P3", text: "\"You told me at breakfast you hate flying,\" Hermione says." }], there: ["Hermione Granger"], weight: 3 },
        { what: "Hermione asks why he is on the team list.", quotes: [{ entry: "P3", text: "\"So why are you on the team list?\"" }], there: ["Hermione Granger"], weight: 2 }
      ])]
    });
    await play("I sit down by the fire.");
    engine.endScene(storyId, head(), "t-end");
    await engine.ended(storyId);
    // The Moment that has a Reply decide what he said is left out, and noted; the rest of the record is kept.
    const record = path().find((payload): payload is Chronicle => payload.kind === "chronicle")!;
    expect(record.moments.map(moment => moment.what)).toEqual(["Hermione asks why he is on the team list."]);
    expect(record.dropped).toHaveLength(1);
    expect(models.chronicler.requests).toHaveLength(1);
    await play("On the pitch I ask Hermione whether she's coming to watch the flying lesson.");
    expect(record.moments.some(moment => moment.what.includes("hate flying"))).toBe(false); // Prior prose remains readable, but is not recorded as the player's past.
    expect(lastActor(models)).toContain("So why are you on the team list?");
  });

  // GIVEN a Move said "I tell her I'm going to Shimla for an interview I don't want"
  // WHEN a later Scene with Meera brings up Shimla
  // THEN Meera's Replies can draw on what he told her, in his words
  it("living-world › Only the player makes facts about the Player Character › What the player wrote is remembered", async () => {
    const nightTrain = parse(readFileSync(join(NIGHT_TRAIN, "story.yaml"), "utf8")) as StoryFile;
    const told = "I tell her I'm going to Shimla for an interview I don't want.";
    const { play, engine, storyId, head, models } = playable(nightTrain, {
      writer: [writer(["Meera Kulkarni", "Uncle Bhalla"], 5), writer(["Meera Kulkarni"], 10, { title: "Kalka", place: "Kalka station" })],
      chronicler: [chronicle("Ishaan told Meera about the interview.", [{ what: "Ishaan tells Meera he doesn't want the interview.", quotes: [{ entry: "P2", text: told }], there: ["Meera Kulkarni"], weight: 3 }])]
    });
    await play(told);
    engine.endScene(storyId, head(), "t-end");
    await engine.ended(storyId);
    await play("At Kalka I help Meera with her bag and say the interview is at eleven.");
    expect(lastActor(models)).toContain(`(Scene 1; known to Ishaan Mehra, Meera Kulkarni): Ishaan tells Meera he doesn't want the interview.\n  "${told}"`);
  });
});
