import { describe, expect, it } from "vitest";
import { actorPrompt, writeReply } from "../../src/agents/actor.js";
import { writerPrompt } from "../../src/agents/writer.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { hogwartsWorldStoryFile, malfoyProblemStoryFile, nightTrainStoryFile } from "../support/story-files.js";
import { ledger, SONNET } from "./ledger.js";

/** The Night Train's first Scene: Ishaan in the sleeper bay with Meera and Uncle Bhalla, Thursday at 10:40 pm. */
function berth() {
  return ledger(nightTrainStoryFile({ title: "The wrong berth", place: "The sleeper bay", at: "Day 1 22:40", who: ["Meera Kulkarni", "Uncle Bhalla"], prose: "\"You're in my seat,\" she says. \"Well. You're in the seat I wanted.\"" }));
}

/** The Actor's prompt for each Move in turn, in the Malfoy Problem's opening Scene. */
function sceneWithMoves(...moves: string[]) {
  const story = ledger(malfoyProblemStoryFile());
  return moves.map((text, index) => {
    story.move(text);
    const prompt = actorPrompt(story.state(), story.scene());
    story.reply(`Reply ${index}`);
    return prompt;
  });
}

describe("the Actor's prompt", () => {
  it("tells each person present their own Life, and nobody else's", () => {
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
    const { system, prompt } = actorPrompt(story.state(), story.scene());
    expect(system).toMatch(/<person name="Meera Kulkarni">[\s\S]*Lately: the platform at Kalka; looking for the toy train\.\nAfter: A month of counting birds in the hills/);
    expect(`${system}\n${prompt}`).not.toContain("drinking tea");
    expect(`${system}\n${prompt}`).not.toContain("scolded him for the goat story");
  });

  it("sends the same system prompt for every Reply in a Scene, so the prompt cache hits", () => {
    const [first, second] = sceneWithMoves("I raise my glass to her.", "I ask the barman for another.");
    expect(second!.system).toBe(first!.system);
    expect(second!.prompt).not.toBe(first!.prompt);
  });

  // The two ways the Actor was seen crossing the Line around a remark (the-last-scene-scenarios design decision 3): a
  // past for him as someone's memory, and his own perception. Each is named in the system prompt and again last.
  it("tells the Actor that people remember of him only what the Story has shown, and that nothing is told from inside him", () => {
    const [{ system, prompt }] = sceneWithMoves("I sit down across from her.") as [{ system: string; prompt: string }];
    expect(system).toContain("The people here remember of Roopesh Gantasala only what the scene so far, lived and remembered show, and their own past: they never recall anything else he said, chose or did on purpose.");
    expect(system).toContain("Tell nothing from inside Roopesh Gantasala: what can be seen of him, never what he sees, notices or feels.");
    expect(prompt.split("\n").at(-1)).toBe("Write what happens next. What Roopesh Gantasala says, chooses, thinks and feels belongs to the player, now and in anything the story has not shown; what he did before is only what the scene, lived and remembered show, as they show it. Leave the rest out.");
  });

  it("carries the Scene word for word and ends on the Move to answer", () => {
    const [, second] = sceneWithMoves("I raise my glass to her.", "I ask the barman for another.");
    expect(second!.prompt).toContain("don't they have mirrors at the mission?");
    expect(second!.prompt).toContain("<move by=\"Roopesh Gantasala\">\nI raise my glass to her.\n</move>\n\nReply 0");
    expect(second!.prompt).toMatch(/<move by="Roopesh Gantasala">\nI ask the barman for another\.\n<\/move>\n\n<this_reply>/);
  });

  it("describes the people in the Scene and the Player Character, and never the Premise or the Arcs", () => {
    const [first] = sceneWithMoves("I raise my glass to her.");
    expect(first!.system).toContain('<person name="Draconia Malfoy">');
    expect(first!.system).toContain('<player_character name="Roopesh Gantasala">');
    expect(first!.system).not.toContain("Student 12");
    expect(first!.system + first!.prompt).not.toContain("enemies-to-lovers");
    expect(first!.system + first!.prompt).not.toContain("comes round to Roopesh");
    expect(first!.system).toContain("The insult. The Three Broomsticks, Friday 6 September 1991, 9:40 pm.");
  });

  it("gives The Story So Far only as far as the people here lived it", () => {
    const story = berth();
    story.close();
    story.chronicle({ paragraph: "Ishaan gave Meera the window berth, and she gave him biscuits for the tea." });
    story.open("The vestibule", "The vestibule", "Day 2 06:00", ["Uncle Bhalla"]);
    story.close();
    story.chronicle({ paragraph: "Uncle Bhalla told Ishaan how the trains used to run." });
    story.open("Kalka", "The platform at Kalka", "Day 2 07:30", ["Meera Kulkarni"]);
    story.move("I help her down with her bag.");
    const { prompt } = actorPrompt(story.state(), story.scene());
    expect(prompt).toContain("<lived>\nScene 1, The wrong berth (with Meera Kulkarni): Ishaan gave Meera the window berth, and she gave him biscuits for the tea.\n</lived>");
    expect(prompt).not.toContain("how the trains used to run");
  });

  it("writes the Reply on the Story's Actor, streaming its words", async () => {
    const story = berth();
    story.move("I offer her the window seat.");
    const runner = new ScriptedRunner([{ answer: "She takes it without a word." }]);
    const streamed: string[] = [];
    const answer = await writeReply(new Models(story.mac.db, { claude: runner }), SONNET, story.state(), story.scene(), story.storyId, "trace-a", delta => streamed.push(delta), new AbortController().signal);
    expect(answer.text).toBe("She takes it without a word.");
    expect(streamed.join("")).toBe("She takes it without a word.");
    expect(runner.requests[0]).toMatchObject({ agent: "actor", model: SONNET, traceId: "trace-a" });
  });
});

describe("the Actor's prompt for one Reply", () => {
  const planned = (changes: { focus?: boolean; linger?: boolean; taste?: string[]; call?: "continue" | "land" | "end" } = {}) => {
    const story = berth();
    if (changes.taste) story.add({ kind: "taste_set", lines: changes.taste });
    if (changes.focus) story.add({ kind: "focus_set", on: "Meera Kulkarni" });
    if (changes.linger) story.add({ kind: "linger_set", on: true });
    story.move("I offer her the window seat.");
    story.note({
      plan: { purpose: "Meera decides whether this stranger is someone to talk to.", exit: "She climbs to the upper berth, or sits down opposite him." },
      beats: [{ text: "Uncle Bhalla takes a side, loudly.", status: "in_play" }, { text: "Meera asks about Shimla.", status: "pending" }, { text: "The lights go out.", status: "pending" }],
      note: "Bhalla rules for Meera. She sits anyway, opposite, and asks about Shimla.", call: changes.call ?? "continue", clock: "Day 1 22:52"
    });
    return actorPrompt(story.state(), story.scene());
  };

  it("adds the time, the Beat Note, Focus, Linger and Taste after the Move, and never the beats, purpose or exit", () => {
    const { system, prompt } = planned({ focus: true, linger: true, taste: ["Keep Uncle Bhalla to the edges."] });
    const afterMove = prompt.slice(prompt.indexOf("I offer her the window seat."));
    expect(afterMove).toContain("It is Thursday 16 July 2026, 10:52 pm.");
    expect(afterMove).toContain("What happens next: Bhalla rules for Meera. She sits anyway, opposite, and asks about Shimla.");
    expect(afterMove).toContain("Stay close beside Meera Kulkarni");
    expect(afterMove).toMatch(/Nobody new comes in unless the Move brings them/);
    expect(afterMove).toMatch(/Force nothing/);
    expect(afterMove).toContain("<taste>\n- Keep Uncle Bhalla to the edges.\n</taste>");
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
    const { prompt } = actorPrompt(story.state(), story.scene());
    expect(prompt).toMatch(/<in_play>\n\(known to Ishaan Mehra, Meera Kulkarni\) Ishaan gives up the window seat\.\n {2}"I offer her the window seat\."\n<\/in_play>\n\nWrite what happens next/);
    story.note({ inPlay: [] });
    expect(actorPrompt(story.state(), story.scene()).prompt).not.toContain("<in_play>");
  });

  it("says what the call means for this Reply", () => {
    expect(planned({ call: "land" }).prompt).toMatch(/toward its turn/);
    expect(planned({ call: "end" }).prompt).toMatch(/This Reply closes the Scene on this moment\. End on someone else's closing moment, never one of Ishaan Mehra's\./);
    expect(planned({ call: "continue" }).prompt).not.toMatch(/closes the Scene|toward its turn/);
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
    const alone = actorPrompt(story.state(), story.scene());
    expect(`${alone.system}\n${alone.prompt}`).not.toContain("seating plan");
    // The Writer steers the Scene knowing who knows it.
    expect(writerPrompt({ state: story.state(), scene: story.scene().slice(0, -1), move: "I sit down next to Hermione.", choice: null }, []).prompt).toContain(`${seating} Known to: Draconia Malfoy, Neville Longbottom.`);

    // With Neville there, it is his to tell: the Actor is given it as his, and nobody else's.
    story.note({ here: ["Hermione Granger", "Neville Longbottom"] });
    story.move("I ask Neville why he looks so worried.");
    const withNeville = actorPrompt(story.state(), story.scene());
    expect(withNeville.prompt).toContain(`<lately>\n(Saturday 7 September 1991, 8:00 am; known to Draconia Malfoy, Neville Longbottom) ${seating}\n</lately>`);
    expect(withNeville.system).toMatch(new RegExp(`<person name="Neville Longbottom">[^<]*Knows of late: ${seating}`));
    expect(withNeville.system).not.toMatch(new RegExp(`<person name="Hermione Granger">[^<]*seating plan`));

    // Once Neville has told her on the page, and the record says so, she knows it in the next Scene.
    story.close();
    story.chronicle({ told: [{ fact: "h-seat", to: ["Hermione Granger"] }] });
    story.open("The library", "The library", "Day 4 15:00", ["Hermione Granger"]);
    story.move("I find Hermione at the end table.");
    const told = actorPrompt(story.state(), story.scene());
    expect(told.system).toMatch(new RegExp(`<person name="Hermione Granger">[^<]*Knows of late: ${seating}`));
  });

  it("does not give her what only he knows: what reached him off-screen stays his until he tells her", () => {
    const story = behindHerBack();
    story.world({ meanwhile: [{ text: "Neville says Draconia had you taken off the seating plan.", how: "told", fact: "h-seat", toldBy: "Neville Longbottom", about: ["Draconia Malfoy"], engagement: null }] });
    story.open("Charms", "The Charms classroom", "Day 4 09:00", ["Hermione Granger"]);
    story.move("I sit down next to Hermione.");
    const { system, prompt } = actorPrompt(story.state(), story.scene());
    expect(`${system}\n${prompt}`).not.toContain("seating plan");
  });
});
