import { describe, expect, it } from "vitest";
import { checkEdit, editorPrompt, editReply, type EditorAsk } from "../../src/agents/editor.js";
import { playersPartBreak } from "../../src/agents/deciding.js";
import { FakeModels } from "../../src/models/fake.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { nothingBeside } from "../../src/story/beside.js";
import { emptyUpdate, type TruthUpdate } from "../../src/story/truth.js";
import { malfoyProblemStoryFile } from "../support/story-files.js";
import { ledger, SONNET } from "./ledger.js";

const said = (entry: string, text: string) => ({ entry, text });

/** A record's truth update with only the parts a test needs. */
function update(parts: Partial<TruthUpdate>): TruthUpdate {
  return { ...emptyUpdate(), ...parts };
}

/** What the Story keeps from Scene 18: the ribbon on his wrist was Draconia's grandmother's. */
const RIBBON = update({
  truths: {
    open: [{
      id: "t-ribbon", kind: "status", what: "The silk ribbon on Roopesh's wrist was Draconia's grandmother's; she tied it there as a lease.", terms: [],
      who: ["Draconia Malfoy", "Roopesh Gantasala"], knownTo: ["Draconia Malfoy", "Roopesh Gantasala"], due: null, replaces: null,
      sources: [said("e-18", "It's silk, it was my grandmother's")]
    }],
    close: []
  }
});

/** What the Story keeps from Scene 6: he showed Hermione he can stop time, and nobody else knows. */
const STOPPED_TIME = update({
  truths: {
    open: [{
      id: "t-power", kind: "secret", what: "Roopesh can stop time.", terms: [], who: ["Roopesh Gantasala"], knownTo: ["Roopesh Gantasala", "Hermione Granger"],
      due: null, replaces: null, sources: [said("e-6", "Every clock in the library stopped, and only the two of them moved.")]
    }],
    close: []
  },
  beliefs: {
    open: [{ id: "b-power", holder: "Hermione Granger", what: "Roopesh can stop time; he showed her in the library.", true: true, sources: [said("e-6", "Every clock in the library stopped")] }],
    close: []
  },
  rules: { open: [{ id: "r-doubles", what: "Roopesh's doubles last only minutes.", sources: [said("e-9", "It lasted four minutes")] }], close: [] }
});

/**
 * The Malfoy Problem with [records] kept at their Scenes' ends, and a late Scene open in the Gryffindor common room
 * with Draconia and Hermione, at 11:30 pm on Thursday 19 September 1991.
 */
function lateScene(records: { scene: number; truth: TruthUpdate }[] = []) {
  const story = ledger(malfoyProblemStoryFile());
  story.close();
  for (const record of records) story.chronicle({ scene: record.scene, truth: record.truth });
  story.open("Between them", "The Gryffindor common room", "Day 14 23:30", ["Draconia Malfoy", "Hermione Granger"], "The fire is down to embers. Draconia has not gone back to the dungeons.");
  return story;
}

function asking(story: ReturnType<typeof lateScene>, reply: string): EditorAsk {
  const state = story.state();
  return { state, beside: nothingBeside(), scene: story.scene(), reply, present: state.scene?.here ?? [] };
}

const editor = (answer: { fixes?: unknown[]; breaks?: unknown[] }) => ({ answer: JSON.stringify({ fixes: [], breaks: [], ...answer }) });

async function edit(story: ReturnType<typeof lateScene>, reply: string, runner: ScriptedRunner | FakeModels) {
  return editReply(new Models(story.mac.db, { claude: runner }), [SONNET], asking(story, reply), story.storyId, "trace-e", new AbortController().signal);
}

describe("the Editor's prompt", () => {
  it("is the Story, its Rules and the instructions first, the same for every Reply in a Scene, with no time in it", () => {
    const story = lateScene([{ scene: 9, truth: STOPPED_TIME }]);
    story.move("I sit down between them.");
    const first = editorPrompt(asking(story, "Hermione moves her bag."));
    story.reply("Hermione moves her bag.");
    story.move("I ask what they are reading.");
    story.note({ clock: "Day 14 23:40" });
    const second = editorPrompt(asking(story, "Neither of them answers."));
    expect(second.system).toBe(first.system);
    expect(first.system).toContain("# The Editor");
    expect(first.system).toMatch(/<rules>[\s\S]*- Roopesh's doubles last only minutes\.[\s\S]*<\/rules>/);
    expect(first.system).toContain("Premise: An enemies-to-lovers romance");
    expect(first.system).not.toMatch(/11:30 pm|11:40 pm/);
  });

  it("puts where things stand before the Scene, and the Move, the time and the Reply last", () => {
    const story = lateScene([{ scene: 6, truth: STOPPED_TIME }]);
    story.move("I sit down between them.");
    const { prompt } = editorPrompt(asking(story, "Hermione moves her bag."));
    const order = ["<story_so_far>", "<what_is_true>", "<scene>", "<scene_so_far>", "<now>", "<move by=\"Roopesh Gantasala\">", "<reply>", "<task>"].map(tag => prompt.indexOf(tag));
    expect(order.every(at => at >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(prompt).toContain("<now>\nIt is Thursday 19 September 1991, 11:30 pm (1991-09-19 23:30).\n</now>");
    expect(prompt).toContain("<reply>\nHermione moves her bag.\n</reply>");
  });

  it("says plainly what each person here knows and believes, and who does not know a secret", () => {
    const story = lateScene([{ scene: 6, truth: STOPPED_TIME }]);
    story.move("I sit down between them.");
    const { prompt } = editorPrompt(asking(story, "Hermione moves her bag."));
    expect(prompt).toContain("Hermione Granger knows Roopesh can stop time; he showed her in the library");
    expect(prompt).toContain("Draconia Malfoy does not know Roopesh can stop time.");
    expect(prompt).toContain("\"Every clock in the library stopped, and only the two of them moved.\"");
  });
});

describe("the Editor's check of a Reply", () => {
  // The ribbon was "bought in Paris" in one Scene and "my grandmother's" in another
  // (docs/research/malfoy-memory-audit.md).
  it("sets a slip against what is established right in place, from the words it was established in", async () => {
    const story = lateScene([{ scene: 18, truth: RIBBON }]);
    story.move("I hold out my wrist so she can see the ribbon.");
    const reply = "Draconia catches his wrist and turns the ribbon over. “I bought this in Paris last spring,” she says. “Don't you dare fray it.”";
    const { prompt } = editorPrompt(asking(story, reply));
    expect(prompt).toMatch(/since Scene 18: The silk ribbon on Roopesh's wrist was Draconia's grandmother's; she tied it there as a lease\.[^\n]*"It's silk, it was my grandmother's"/);

    const runner = new ScriptedRunner([editor({ fixes: [{ wrong: "I bought this in Paris last spring", right: "This was my grandmother's", why: "Draconia said in Scene 18 that the ribbon was her grandmother's." }] })]);
    const edited = await edit(story, reply, runner);
    expect(edited.verdict).toBe("fixed");
    expect(edited.text).toBe("Draconia catches his wrist and turns the ribbon over. “This was my grandmother's,” she says. “Don't you dare fray it.”");
    expect(edited.fixed).toEqual([{ wrong: "I bought this in Paris last spring", right: "This was my grandmother's", why: "Draconia said in Scene 18 that the ribbon was her grandmother's." }]);
    expect(edited.notes).toEqual([]);
    expect(runner.requests[0]).toMatchObject({ agent: "editor", model: SONNET, traceId: "trace-e" });
  });

  // Midnight was narrated, then the clock went back to half past ten (docs/research/malfoy-memory-audit.md).
  it("sets a time that goes back on the Scene's clock right in place", async () => {
    const story = lateScene();
    story.move("I wait with them by the window.");
    story.reply("Somewhere above them the tower clock strikes midnight, and Hermione counts the strokes under her breath.");
    story.move("I ask Draconia whether she means to go back to the dungeons.");
    story.note({ clock: "Day 15 00:20" });
    const reply = "“It's only half past ten,” Draconia says. “Nobody in the dungeons is asleep yet.”";
    const { prompt } = editorPrompt(asking(story, reply));
    expect(prompt).toContain("the tower clock strikes midnight");
    expect(prompt).toContain("<now>\nIt is Friday 20 September 1991, 12:20 am (1991-09-20 00:20).\n</now>");

    const edited = await edit(story, reply, new ScriptedRunner([editor({ fixes: [{ wrong: "half past ten", right: "twenty past twelve", why: "Midnight struck earlier in the Scene; it is 12:20 am." }] })]));
    expect(edited.verdict).toBe("fixed");
    expect(edited.text).toBe("“It's only twenty past twelve,” Draconia says. “Nobody in the dungeons is asleep yet.”");
  });

  it("sends a Reply in which someone knows what only another person knows back to be written again, saying what breaks and why", async () => {
    const story = lateScene([{ scene: 6, truth: STOPPED_TIME }]);
    story.move("I sit down between them.");
    const reply = "Draconia leans across Hermione. “Stop the clocks again, Gantasala, and I'll tell my father what you are.”";
    const edited = await edit(story, reply, new ScriptedRunner([editor({ breaks: [{ kind: "leak", who: "Draconia", words: "Stop the clocks again, Gantasala", why: "Only Hermione knows Roopesh can stop time; Draconia has never seen it or been told." }] })]));
    expect(edited.verdict).toBe("rewrite");
    expect(edited.notes).toEqual(["Leak (Draconia Malfoy): \"Stop the clocks again, Gantasala\". Only Hermione knows Roopesh can stop time; Draconia has never seen it or been told."]);
    expect(edited.text).toBe(reply);
  });

  it("sends a Reply that says what the Player Character feels back to be written again, even when the model passes it", async () => {
    const story = lateScene();
    story.move("I sit down beside Hermione.");
    const reply = "Hermione closes the book on her finger. Roopesh feels the old pull toward her, and hates it.";
    const fake = new FakeModels();
    const edited = await edit(story, reply, fake);
    expect(fake.editor.requests).toHaveLength(1);
    expect(edited.verdict).toBe("rewrite");
    expect(edited.notes).toEqual([`Decides for Roopesh Gantasala: "Roopesh feels the old pull toward her, and hates it". ${playersPartBreak("Roopesh Gantasala")}`]);
  });

  it("lets a Reply act on the Player Character and say where it leaves him", async () => {
    const story = lateScene();
    story.move("I block the door.");
    const reply = "Hermione shoves him hard in the chest. She forces Roopesh back against the shelves, and the slap that follows makes Roopesh go red to the ears.";
    const edited = await edit(story, reply, new FakeModels());
    expect(edited.verdict).toBe("clean");
  });

  it("sends back deciding for the Player Character that only the model sees", async () => {
    const story = lateScene();
    story.move("I sit down beside Hermione.");
    const reply = "Hermione closes the book on her finger. His heart turns over at the sight of her, as it always has.";
    const edited = await edit(story, reply, new ScriptedRunner([editor({ breaks: [{ kind: "decides_for_player", who: "Roopesh Gantasala", words: "His heart turns over at the sight of her", why: "It says what Roopesh feels about Hermione." }] })]));
    expect(edited.verdict).toBe("rewrite");
    expect(edited.notes).toEqual(["Decides for Roopesh Gantasala: \"His heart turns over at the sight of her\". It says what Roopesh feels about Hermione."]);
  });

  it("passes what others say of the Player Character aloud, and a clause that only waits on him", async () => {
    const story = lateScene();
    story.move("I sit down beside Hermione.");
    const aloud = "“Roopesh tells me everything,” Hermione says, not looking at Draconia. “Roopesh feels nothing for you.”";
    expect(await edit(story, aloud, new FakeModels())).toMatchObject({ verdict: "clean", text: aloud, notes: [], fixed: [] });
    const waiting = "Before Roopesh says a word, Draconia is on her feet.";
    expect(await edit(story, waiting, new FakeModels())).toMatchObject({ verdict: "clean", text: waiting, notes: [] });
  });

  it("catches second-person narration writing the player's dialogue, actions, or feelings, while allowing speech and physical actions done to you", async () => {
    const story = lateScene();
    story.move("I look at Hermione.");
    const hijack = "Hermione steps back. You pull away and say you are done listening.";
    const edited = await edit(story, hijack, new FakeModels());
    expect(edited.verdict).toBe("rewrite");
    expect(edited.notes[0]).toContain("Decides for Roopesh Gantasala:");

    const fine = "\"You told me not to follow,\" Hermione snaps, catching your sleeve before you say a word and pulling you into the alcove. The way you said her name makes her flinch; after you asked about Scott, she does not look back.";
    expect(await edit(story, fine, new FakeModels())).toMatchObject({ verdict: "clean", text: fine, notes: [] });
  });

  it("is clean when nothing breaks, and the fake Editor finds nothing", async () => {
    const story = lateScene();
    story.move("I sit down between them.");
    const reply = "Hermione moves her bag without looking up. Draconia watches her do it.";
    const fake = new FakeModels();
    const edited = await edit(story, reply, fake);
    expect(edited).toMatchObject({ verdict: "clean", text: reply, notes: [], fixed: [], dropped: [] });
  });

  // Checked for truth only (docs/adr/0012): what the Editor says the Reply says must be in it.
  it("leaves out a fix whose words are not in the Reply, and keeps a break without words that are not", () => {
    const story = lateScene();
    story.move("I sit down between them.");
    const given = asking(story, "Draconia says it was bought in Paris. Hermione says nothing.");
    const checked = checkEdit(given, {
      fixes: [
        { wrong: "bought in Rome", right: "her grandmother's", why: "Established in Scene 18." },
        { wrong: "Hermione says nothing", right: "Hermione says nothing", why: "It is right as it is." }
      ],
      breaks: [{ kind: "contradiction", who: "Pansy Parkinson", words: "Pansy laughs at the door", why: "Pansy left in the last Reply." }]
    });
    expect(checked).toMatchObject({ ok: true });
    if (!checked.ok) return;
    expect(checked.value.verdict).toBe("rewrite");
    expect(checked.value.text).toBe("Draconia says it was bought in Paris. Hermione says nothing.");
    expect(checked.value.notes).toEqual(["Contradiction: Pansy left in the last Reply."]);
    expect(checked.dropped).toEqual([
      "fixes[0]: \"bought in Rome\" is not in the Reply",
      "fixes[1]: it changes nothing",
      "breaks[0]: Pansy Parkinson is not in the Story",
      "breaks[0]: \"Pansy laughs at the door\" is not in the Reply"
    ]);
  });

  it("is sent back only when it is not an answer at all", () => {
    const story = lateScene();
    story.move("I sit down between them.");
    expect(checkEdit(asking(story, "Hermione moves her bag."), { fixes: [] })).toMatchObject({ ok: false, problems: ["answer: must have required property 'breaks'"] });
  });
});
