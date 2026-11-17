import { describe, expect, it } from "vitest";
import { actorPrompt, writeReply, type ActorAsk } from "../../src/agents/actor.js";
import { playersPart } from "../../src/agents/deciding.js";
import { writerPrompt } from "../../src/agents/writer.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import type { Gathered } from "../../src/story/entries.js";
import { hogwartsWorldStoryFile, malfoyProblemStoryFile, nightTrainStoryFile } from "../support/story-files.js";
import { nothingBeside, type Beside } from "../../src/story/beside.js";
import { ledger, SONNET, type Ledger } from "./ledger.js";

const GPT = { provider: "codex" as const, model: "gpt-6.1-sol" };

/** The Night Train's first Scene: Ishaan in the sleeper bay with Meera and Uncle Bhalla, Thursday at 10:40 pm. */
function berth() {
  return ledger(nightTrainStoryFile({ title: "The wrong berth", place: "The sleeper bay", at: "Day 1 22:40", who: ["Meera Kulkarni", "Uncle Bhalla"], prose: "\"You're in my seat,\" she says. \"Well. You're in the seat I wanted.\"" }));
}

/** What the Actor is given for the Reply to the Scene's latest Move. */
function asking(story: Ledger, changes: { beside?: Beside; gathered?: Gathered[]; again?: ActorAsk["again"] } = {}): ActorAsk {
  return { state: story.state(), beside: changes.beside ?? nothingBeside(), scene: story.scene(), gathered: changes.gathered ?? [], ...(changes.again ? { again: changes.again } : {}) };
}

/** The Actor's prompt for each Move in turn, in the Malfoy Problem's opening Scene. */
function sceneWithMoves(...moves: string[]) {
  const story = ledger(malfoyProblemStoryFile());
  return moves.map((text, index) => {
    story.move(text);
    const prompt = actorPrompt(asking(story));
    story.reply(`Reply ${index}`);
    return prompt;
  });
}

/** This moment's layer: from the time on. */
const moment = (prompt: string) => prompt.slice(prompt.lastIndexOf("<now>"));

describe("the Actor's prompt, as a novelist (docs/adr/0017)", () => {
  it("tells who each person here is now, and nobody else's Life", () => {
    const story = berth();
    story.world({
      lives: [
        { who: "Meera Kulkarni", where: "the platform at Kalka", doing: "looking for the toy train", after: "A month of counting birds in the hills" },
        { who: "Uncle Bhalla", where: "his daughter's house in Kalka", doing: "drinking tea", after: "A nap" }
      ],
      happened: [{ id: "h-goat", what: "Bhalla's daughter scolded him for the goat story.", at: "Day 1 22:41", where: "Kalka", knownTo: ["Uncle Bhalla"], landmark: null, move: null }]
    });
    story.note({ here: ["Meera Kulkarni"] });
    story.move("I ask Meera where she is going.");
    const { system, prompt } = actorPrompt(asking(story));
    expect(prompt).toMatch(/<people_now>[\s\S]*Meera Kulkarni\n {2}Now: as when the Story began\.[\s\S]*Lately: at the platform at Kalka, looking for the toy train\.\n {2}After: A month of counting birds in the hills\./);
    expect(`${system}\n${prompt}`).not.toContain("drinking tea");
    expect(`${system}\n${prompt}`).not.toContain("scolded him for the goat story");
  });

  it("is told who someone the Director brought in is, and how they look, though the Story File never named them", () => {
    const story = berth();
    story.close();
    story.plan({ people: [{ name: "Elspeth Vane", aliases: [], whoTheyAre: "A seventh-year who runs the Hogsmeade duelling club.", known: null, appearance: "Tall, with a duelling scar through one eyebrow.", after: "", knows: [], voice: [], group: null }] });
    story.open("The duelling club", "The back room at the Hog's Head", "Day 2 14:00", ["Elspeth Vane"]);
    story.move("I put my name down.");
    const { system, prompt } = actorPrompt(asking(story));
    expect(system).not.toContain("Elspeth Vane");
    expect(prompt).toContain("Elspeth Vane (new to the Story: A seventh-year who runs the Hogsmeade duelling club)\n  Looks: Tall, with a duelling scar through one eyebrow.\n  Now: as when the Story began.");
  });

  it("sends the same system prompt for every Reply in a Scene, so the prompt cache hits", () => {
    const [first, second] = sceneWithMoves("I raise my glass to her.", "I ask the barman for another.");
    expect(second!.system).toBe(first!.system);
    expect(second!.prompt).not.toBe(first!.prompt);
    expect(first!.system).not.toMatch(/9:40 pm/);
  });

  // The two ways the Actor was seen crossing the Line around a remark (the-last-scene-scenarios design decision 3): a
  // past for him as someone's memory, and his own perception. Each is named in the instructions and again last.
  it("tells the Actor that people remember of him only what the Story has shown, and where the player's part ends", () => {
    const [{ system, prompt }] = sceneWithMoves("I sit down across from her.") as [{ system: string; prompt: string }];
    expect(system).toContain("The people here remember of Roopesh Gantasala only what the scene so far, The Story So Far and what they remember show, and their own past: they never recall anything else he said, chose or did on purpose.");
    expect(system).toContain(playersPart("Roopesh Gantasala"));
    expect(system).not.toContain("never what he sees, notices or feels");
    expect(system).toContain("What each person here knows and believes is said plainly under what_each_knows: play each of them from it.");
    expect(prompt.split("\n").at(-1)).toBe("Write what happens next. What Roopesh Gantasala says, chooses, thinks and feels belongs to the player, now and in anything the story has not shown; what is done to him lands. What he did before is only what the story has shown, as it shows it.");
  });

  it("carries the Scene word for word in its layer, and the Move to answer in this moment's", () => {
    const [, second] = sceneWithMoves("I raise my glass to her.", "I ask the barman for another.");
    const scene = second!.prompt.slice(second!.prompt.indexOf("<scene>"), second!.prompt.lastIndexOf("<now>"));
    expect(scene).toContain("don't they have mirrors at the mission?");
    expect(scene).toContain("<move by=\"Roopesh Gantasala\">\nI raise my glass to her.\n</move>\n\nReply 0");
    expect(scene).not.toContain("I ask the barman for another.");
    expect(moment(second!.prompt)).toMatch(/^<now>\nIt is Friday 6 September 1991, 9:40 pm \(1991-09-06 21:40\)\.\n<\/now>\n\n<move by="Roopesh Gantasala">\nI ask the barman for another\.\n<\/move>/);
  });

  it("is shown the Story and everyone in it as they began, and never the Arcs, the Outline or the Writer's plan for the Scene", () => {
    const [first] = sceneWithMoves("I raise my glass to her.");
    expect(first!.system).toContain("Premise: An enemies-to-lovers romance");
    expect(first!.system).toMatch(/<people>[\s\S]*- Draconia Malfoy, a Lead, also Connie[\s\S]*- Student 12: A first-year\./);
    expect(first!.system).toMatch(/- Roopesh Gantasala, the player's character/);
    expect(first!.system + first!.prompt).not.toContain("comes round to Roopesh");
    expect(first!.prompt).toContain("<scene>\nThe insult. The Three Broomsticks, from Friday 6 September 1991, 9:40 pm.");
  });

  it("is given The Story So Far whole: a novelist knows what happened, and writes people who know less", () => {
    const story = berth();
    story.close();
    story.chronicle({ paragraph: "Ishaan gave Meera the window berth, and she gave him biscuits for the tea." });
    story.open("The vestibule", "The vestibule", "Day 2 06:00", ["Uncle Bhalla"]);
    story.close();
    story.chronicle({ paragraph: "Uncle Bhalla told Ishaan how the trains used to run." });
    story.open("Kalka", "The platform at Kalka", "Day 2 07:30", ["Meera Kulkarni"]);
    story.move("I help her down with her bag.");
    const { prompt } = actorPrompt(asking(story));
    expect(prompt).toContain("Scene 1, The wrong berth (Thursday 16 July 2026, 10:40 pm): Ishaan gave Meera the window berth, and she gave him biscuits for the tea.");
    expect(prompt).toContain("Scene 2, The vestibule (Friday 17 July 2026, 6:00 am): Uncle Bhalla told Ishaan how the trains used to run.");
  });
});

describe("the Actor's prompt for one Reply", () => {
  const planned = (changes: { focus?: boolean; linger?: boolean; taste?: string[]; call?: "continue" | "land" } = {}) => {
    const story = berth();
    if (changes.focus) story.add({ kind: "focus_set", on: "Meera Kulkarni" });
    if (changes.linger) story.add({ kind: "linger_set", on: true });
    story.move("I offer her the window seat.");
    story.note({
      plan: { purpose: "Meera decides whether this stranger is someone to talk to.", exit: "She climbs to the upper berth, or sits down opposite him." },
      beats: [{ text: "Uncle Bhalla takes a side, loudly.", status: "in_play" }, { text: "Meera asks about Shimla.", status: "pending" }, { text: "The lights go out.", status: "pending" }],
      note: "Bhalla rules for Meera. She sits anyway, opposite, and asks about Shimla.", call: changes.call ?? "continue", clock: "Day 1 22:52"
    });
    // Taste is kept beside the Story (docs/adr/0020).
    return actorPrompt(asking(story, { beside: { ...nothingBeside(), taste: changes.taste ?? [] } }));
  };

  it("adds the time, the Beat Note, Focus and Linger after the Move, Taste where things stand, and never the beats, purpose or exit", () => {
    const { system, prompt } = planned({ focus: true, linger: true, taste: ["Keep Uncle Bhalla to the edges."] });
    const now = moment(prompt);
    expect(now).toContain("It is Thursday 16 July 2026, 10:52 pm (2026-07-16 22:52).");
    expect(now).toContain("What happens next: Bhalla rules for Meera. She sits anyway, opposite, and asks about Shimla.");
    expect(now).toContain("Stay close beside Meera Kulkarni");
    expect(now).toMatch(/Nobody new comes in unless the Move brings them/);
    expect(now).toMatch(/Force nothing/);
    expect(prompt).toMatch(/<the_players_wishes>[\s\S]*- Keep Uncle Bhalla to the edges\./);
    for (const secret of ["Meera decides whether this stranger", "climbs to the upper berth", "The lights go out", "Meera asks about Shimla."]) {
      expect(system + prompt).not.toContain(secret);
    }
  });

  it("puts the words of the Moments in play after the Move, right before its last line", () => {
    const story = berth();
    story.move("I offer her the window seat.");
    story.close();
    story.chronicle({ moments: [{ what: "Ishaan gives up the window seat.", quotes: [{ entry: "e", text: "I offer her the window seat." }], there: ["Meera Kulkarni"], weight: 3 }] });
    story.open("Ambala", "The sleeper bay", "Day 2 06:10", ["Meera Kulkarni"]);
    story.move("I ask about the window seat.");
    story.note({ inPlay: ["m1.1"] });
    const { prompt } = actorPrompt(asking(story));
    expect(prompt).toMatch(/<in_play>\n\(known to Ishaan Mehra, Meera Kulkarni\) Ishaan gives up the window seat\.\n {2}"I offer her the window seat\."\n<\/in_play>\n\nWrite what happens next/);
    // What the people here remember of earlier Scenes is given in their own words too.
    expect(moment(prompt)).toContain("<remembered>\n(Scene 1; known to Ishaan Mehra, Meera Kulkarni) Ishaan gives up the window seat.\n  \"I offer her the window seat.\"\n</remembered>");
    story.note({ inPlay: [] });
    expect(actorPrompt(asking(story)).prompt).not.toContain("<in_play>");
  });

  it("gives the passages the Writer gathered, in the Story's own words, with where each came from", () => {
    const story = berth();
    story.move("I ask Meera what she meant about the seat.");
    const { prompt } = actorPrompt(asking(story, { gathered: [{ scene: 1, words: "\"You're in my seat,\" she says." }, { scene: null, words: "Meera's mother rang the station master at Kalka." }] }));
    expect(moment(prompt)).toContain("<gathered>\nFrom Scene 1: “\"You're in my seat,\" she says.”\nOff the page: “Meera's mother rang the station master at Kalka.”\n</gathered>");
  });

  it("is told, when its Reply is sent back, what breaks it and what it wrote, and to mend it", () => {
    const story = berth();
    story.move("I offer her the window seat.");
    const draft = "Ishaan feels a flush of shame as she sits.";
    const { prompt } = actorPrompt(asking(story, { again: { draft, notes: ["Decides for Ishaan Mehra: \"Ishaan feels a flush of shame\". Show only what can be seen of him."] } }));
    expect(moment(prompt)).toContain(`<sent_back>\nYour Reply was read before the player saw it, and sent back to be written again. What breaks it:\n- Decides for Ishaan Mehra: "Ishaan feels a flush of shame". Show only what can be seen of him.\n\nIt read:\n${draft}\n</sent_back>`);
    expect(prompt.split("\n").at(-1)).toMatch(/^Write what happens next, again: mend what it was sent back for, and keep what was right\./);
  });

  it("says what the call means for this Reply", () => {
    expect(planned({ call: "land" }).prompt).toContain("Keep the Scene open; do not wrap it up or skip past the aftermath.");
    expect(planned({ call: "continue" }).prompt).not.toMatch(/closes the Scene|toward its turn/);
  });
});

describe("the Actor writes the Reply whole (docs/adr/0019)", () => {
  it("writes on the Story's Actor, and hands the Reply on whole, with nothing told before it is done", async () => {
    const story = berth();
    story.move("I offer her the window seat.");
    const runner = new ScriptedRunner([{ answer: "She takes it without a word.\n" }]);
    const reply = await writeReply(new Models(story.mac.db, { claude: runner }), [SONNET, GPT], asking(story), story.storyId, "trace-a", new AbortController().signal);
    expect(reply).toEqual({ text: "She takes it without a word.", callId: expect.any(String), model: SONNET });
    expect(runner.requests[0]).toMatchObject({ agent: "actor", model: SONNET, traceId: "trace-a" });
    expect(runner.requests[0]!.tools).toBeUndefined();
  });

  it("goes to its second model whenever its own fails, since nobody has read a word of it", async () => {
    const story = berth();
    story.move("I offer her the window seat.");
    const runner = new ScriptedRunner([{ fail: "Opus is overloaded" }, { answer: "She takes it." }]);
    const models = new Models(story.mac.db, { claude: runner, codex: runner });
    expect(await writeReply(models, [SONNET, GPT], asking(story), story.storyId, "trace-a", new AbortController().signal)).toMatchObject({ text: "She takes it.", model: GPT });
    const failing = new ScriptedRunner([{ fail: "Opus is overloaded" }, { fail: "Sol is overloaded" }]);
    await expect(writeReply(new Models(story.mac.db, { claude: failing, codex: failing }), [SONNET, GPT], asking(story), story.storyId, "trace-b", new AbortController().signal))
      .rejects.toThrow("claude-sonnet-5-5: Opus is overloaded | gpt-6.1-sol: Sol is overloaded");
  });
});

describe("what each person here knows (openspec living-world: Characters know only what they could know)", () => {
  const seating = "Draconia had his name taken off the Charms seating plan.";

  /** After curfew, then the World moves on: off-screen, Draconia has his name taken off the seating plan, and only Neville sees. */
  function behindHerBack() {
    const story = ledger(hogwartsWorldStoryFile());
    story.move("I say goodnight to Hermione and go up.");
    story.close();
    story.chronicle();
    story.world({ happened: [{ id: "h-seat", what: seating, at: "Day 4 08:00", where: "Flitwick's classroom", knownTo: ["Draconia Malfoy", "Neville Longbottom"], landmark: null, move: "Draconia Malfoy" }] });
    return story;
  }

  // GIVEN off-screen, Draconia had his name taken off the Charms seating plan, and only Neville saw
  // WHEN Hermione is in the next Scene with him
  // THEN she does not know of it, unless Neville or he tells her on the page
  it("living-world › Characters know only what they could know › What happened behind her back", () => {
    const story = behindHerBack();
    story.open("Charms", "The Charms classroom", "Day 4 09:00", ["Hermione Granger"]);
    story.move("I sit down next to Hermione.");
    const alone = actorPrompt(asking(story));
    expect(`${alone.system}\n${alone.prompt}`).not.toContain("seating plan");
    // The Writer steers the Scene knowing who knows it.
    expect(writerPrompt({ state: story.state(), scene: story.scene().slice(0, -1), move: "I sit down next to Hermione.", choice: null, beside: nothingBeside() }, [], "").prompt).toContain(`${seating} Known to Draconia Malfoy and Neville Longbottom.`);

    // With Neville there, it is his to tell: the Actor is given it, with who knows it.
    story.note({ here: ["Hermione Granger", "Neville Longbottom"] });
    story.move("I ask Neville why he looks so worried.");
    const withNeville = actorPrompt(asking(story));
    expect(withNeville.prompt).toMatch(new RegExp(`<lately>\\n[^\\n]*\\n- Saturday 7 September 1991, 8:00 am, Flitwick's classroom: ${seating} Known to Draconia Malfoy and Neville Longbottom\\.\\n</lately>`));

    // Once Neville has told her on the page, and the record says so, she knows it in the next Scene.
    story.close();
    story.chronicle({ told: [{ fact: "h-seat", to: ["Hermione Granger"] }] });
    story.open("The library", "The library", "Day 4 15:00", ["Hermione Granger"]);
    story.move("I find Hermione at the end table.");
    const told = actorPrompt(asking(story));
    expect(told.prompt).toContain(`${seating} Known to Draconia Malfoy, Neville Longbottom and Hermione Granger.`);
  });

  it("does not give her what only he knows: what reached him off-screen stays his until he tells her", () => {
    const story = behindHerBack();
    story.world({ meanwhile: [{ text: "Neville says Draconia had you taken off the seating plan.", how: "told", fact: "h-seat", toldBy: "Neville Longbottom", about: ["Draconia Malfoy"], engagement: null }] });
    story.open("Charms", "The Charms classroom", "Day 4 09:00", ["Hermione Granger"]);
    story.move("I sit down next to Hermione.");
    const { system, prompt } = actorPrompt(asking(story));
    expect(`${system}\n${prompt}`).not.toContain("seating plan");
  });
});
