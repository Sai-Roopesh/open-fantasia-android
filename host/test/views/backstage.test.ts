import { describe, expect, it } from "vitest";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner, type Script } from "../../src/models/scripted.js";
import { learnLesson, writeNote } from "../../src/store/beside.js";
import type { Outline } from "../../src/story/outline.js";
import { emptyUpdate, type TruthUpdate } from "../../src/story/truth.js";
import { backstageView } from "../../src/views/backstage.js";
import { ledger } from "../agents/ledger.js";
import { malfoyProblemStoryFile } from "../support/story-files.js";

/** A record's truth update with only the parts a test needs. */
const update = (parts: Partial<TruthUpdate>): TruthUpdate => ({ ...emptyUpdate(), ...parts });

/** The Malfoy Problem written entry by entry, with the Path's head kept on the latest, as Backstage reads it. */
function story() {
  const written = ledger({ ...malfoyProblemStoryFile(), rules: ["Everyone at Hogwarts is eighteen or older."] });
  const follow = () => {
    const path = written.mac.tree.currentPath(written.storyId)!;
    written.mac.tree.moveHead(path.id, path.headEntryId, written.head());
  };
  return { ...written, backstage: () => (follow(), backstageView(written.mac, written.storyId, "trace")) };
}

describe("Backstage's view", () => {
  // WHEN the player opens what the Story keeps of the contract in Backstage
  // THEN it shows the passage where the contract was made
  it("the-truth › Nothing is deleted › Where it came from", () => {
    const malfoy = story();
    malfoy.close();
    malfoy.open("The contract", "The Room of Requirement", "Day 12 22:00", ["Draconia Malfoy", "Hermione Granger"]);
    malfoy.move("I read it twice and sign.");
    const made = malfoy.reply("Draconia pushes the parchment across. \"Nobody comes second. Saturdays are Hermione's. Sign, Stray.\"");
    malfoy.close();
    const contract = {
      id: "t1", kind: "agreement" as const, what: "The contract between Draconia and Hermione over Roopesh", terms: ["Nobody comes second", "Saturdays are Hermione's"],
      who: ["Draconia Malfoy", "Hermione Granger", "Roopesh Gantasala"], knownTo: ["Draconia Malfoy", "Hermione Granger", "Roopesh Gantasala"], due: null, replaces: null,
      sources: [{ entry: made.id, text: "Nobody comes second. Saturdays are Hermione's." }]
    };
    malfoy.chronicle({ scene: 2, truth: update({ truths: { open: [contract], close: [] } }) });

    const truth = malfoy.backstage().truth;
    expect(truth.truths).toEqual([{
      kind: "agreement", what: contract.what, terms: contract.terms, due_label: null, known_to: contract.knownTo, ended: null,
      sources: [{ scene_number: 2, text: "Nobody comes second. Saturdays are Hermione's." }]
    }]);
    // A Rule the Story File set came from the Story File, not from a Scene.
    expect(truth.rules).toEqual([{ what: "Everyone at Hogwarts is eighteen or older.", sources: [{ scene_number: null, text: "The Story File" }] }]);

    // Amended later: the old terms are shown ended, with where they came from still; nothing is deleted.
    malfoy.chronicle({ scene: 2, truth: update({ truths: { open: [{ ...contract, id: "t2", terms: [...contract.terms, "Fridays are Draconia's"], replaces: "t1", sources: [] }], close: [{ id: "t1", why: "amended" }] } }) });
    expect(malfoy.backstage().truth.truths.map(item => [item.terms.length, item.ended, item.sources.length])).toEqual([[3, null, 0], [2, "ended in Scene 2", 1]]);

    // A promise with a deadline says when it is due, as a date.
    const promise = { ...contract, id: "p1", kind: "promise" as const, what: "He promised Draconia the Yule Ball", terms: [], due: "Day 111 19:00", sources: [] };
    malfoy.chronicle({ scene: 2, truth: update({ truths: { open: [promise], close: [] } }) });
    expect(malfoy.backstage().truth.truths.find(item => item.kind === "promise")!.due_label).toBe("by Wednesday 25 December 1991");
  });

  it("counts a Reply the Editor set right in place, and one it sent back, from what it answered for each Reply", async () => {
    const malfoy = story();
    const edit = (fixes: number, breaks: number): Script => ({ answer: JSON.stringify({
      fixes: Array.from({ length: fixes }, () => ({ wrong: "Paris", right: "her grandmother", why: "Scene 18." })),
      breaks: Array.from({ length: breaks }, () => ({ kind: "leak", who: null, words: "She knew", why: "Nobody told her." }))
    }) });
    // Each Reply is checked under its own trace: clean; a slip set right; a break sent back and checked again; a check
    // whose own model failed before its second model answered clean; and one sent back that still broke.
    const runner = new ScriptedRunner([edit(0, 0), edit(1, 0), edit(0, 1), edit(0, 0), { fail: "Sonnet is overloaded" }, edit(0, 0), edit(0, 1), edit(1, 1)]);
    const models = new Models(malfoy.mac.db, { claude: runner });
    const check = async (traceId: string) => {
      try {
        await models.call({ agent: "editor", model: { provider: "claude", model: "claude-sonnet-5-5" }, system: "s", prompt: "p", schema: {}, traceId, storyId: malfoy.storyId });
      } catch {
        // A failed call is kept, and its second model is asked next.
      }
    };
    for (const traceId of ["t1", "t2", "t3", "t3", "t4", "t4", "t5", "t5"]) await check(traceId);
    const how = malfoy.backstage().how_its_going;
    expect({ fixed: how.editor_fixed, rewrote: how.editor_rewrote }).toEqual({ fixed: 1, rewrote: 2 });
    expect(how.jobs.find(job => job.job === "editor")).toEqual({ job: "editor", calls: 5, second_model: 0, failed: 0 });
  });

  it("shows the Outline, the Lives by tier, the steering notes and the player's own Taste", () => {
    const malfoy = story();
    const outline: Omit<Outline, "version"> = {
      current: 1,
      acts: [
        { number: 1, title: "Year One", question: "Will Draconia admit what he is to her?", buildsTo: "The Philosopher's Stone", detail: "detailed", handsOn: "The summer apart.",
          turns: [{ id: "a1.1", when: "Halloween", what: "The troll", serves: [], state: "done" }, { id: "a1.2", when: "Christmas", what: "The mirror", serves: [], state: "ahead" }],
          relationships: [{ people: ["Draconia Malfoy", "Roopesh Gantasala"], byEnd: "She claims him in public." }],
          movers: [{ who: "Student 1", doing: "Selling answers to the Charms exam." }] },
        { number: 2, title: "Year Two", question: "Who opened the Chamber?", buildsTo: "The Chamber", detail: "outlined", handsOn: "", turns: [], relationships: [], movers: [] },
        { number: 3, title: "Year Three", question: "Who is the prisoner?", buildsTo: "The Shrieking Shack", detail: "sketched", handsOn: "", turns: [], relationships: [], movers: [] }
      ],
      ending: "Voldemort falls, and one of them has him.",
      intentions: [{ who: "Draconia Malfoy", pursues: "Roopesh, on her terms", feelings: "Furious that she cares", heading: "A public claim by Christmas" }],
      setups: [{ id: "s1", what: "The ribbon on his wrist", planted: 3, payoff: "She asks for it back at the Yule Ball", turn: null, state: "waiting", settled: null }],
      promoted: [], revisedAfter: 4, deep: true, lookedUp: ["When the first Quidditch match of 1991 was played"]
    };
    malfoy.add({ kind: "outline_set", outline, reason: "The Act turned.", planFollows: false, dropped: [], callId: "c", model: { provider: "claude", model: "claude-fable-5-1" } });
    writeNote(malfoy.mac, malfoy.storyId, "Keep Hermione a rival this year");
    learnLesson(malfoy.mac, malfoy.storyId, "player", "Don't decide what my character feels.");
    learnLesson(malfoy.mac, malfoy.storyId, "story", "Never write her as a first-timer.");

    const view = malfoy.backstage();
    expect(view.outline).toEqual({
      current: {
        number: 1, title: "Year One", question: "Will Draconia admit what he is to her?", builds_to: "The Philosopher's Stone",
        turns: [{ when: "Halloween", what: "The troll", done: true }, { when: "Christmas", what: "The mirror", done: false }],
        relationships: [{ people: ["Draconia Malfoy", "Roopesh Gantasala"], by_end: "She claims him in public." }],
        movers: [{ who: "Student 1", doing: "Selling answers to the Charms exam." }],
        intentions: [{ who: "Draconia Malfoy", pursues: "Roopesh, on her terms", heading: "A public claim by Christmas" }]
      },
      later: [
        { number: 2, title: "Year Two", question: "Who opened the Chamber?", builds_to: "The Chamber", detail: "outlined" },
        { number: 3, title: "Year Three", question: "Who is the prisoner?", builds_to: "The Shrieking Shack", detail: "sketched" }
      ],
      ending: "Voldemort falls, and one of them has him.",
      setups: [{ what: "The ribbon on his wrist", payoff: "She asks for it back at the Yule Ball", state: "waiting", planted: "Scene 3" }],
      looked_up: ["When the first Quidditch match of 1991 was played"],
      revised: "after Scene 4, deeply"
    });
    // The Leads are Close; whoever drives the World this Act is a Mover; everyone else keeps a line.
    expect(view.lives_by_tier.close.map(life => life.who)).toEqual(["Draconia Malfoy", "Hermione Granger", "Harry Potter"]);
    expect(view.lives_by_tier.close[0]).toEqual({ who: "Draconia Malfoy", now: "Pure-blood heir, Slytherin, sharp-tongued and proud.", wants: "", heading: "A public claim by Christmas" });
    expect(view.lives_by_tier.movers.map(life => life.who)).toEqual(["Student 1"]);
    expect(view.lives_by_tier.others).toContain("Crabbe and Goyle");
    expect(view.lives_by_tier.others).not.toContain("Roopesh Gantasala");
    expect(view.notes).toEqual([{ id: expect.any(String), text: "Keep Hermione a rival this year", written_at: expect.any(String), answered: false }]);
    expect(view).toMatchObject({ taste: ["Never write her as a first-timer."], player_taste: ["Don't decide what my character feels."] });
  });
});
