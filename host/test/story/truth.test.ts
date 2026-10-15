import { describe, expect, it } from "vitest";
import { layers, type Layers, type Reader } from "../../src/context/lens.js";
import { nothingBeside } from "../../src/story/beside.js";
import { applyTruth, betweenKey, emptyTruth, emptyUpdate, open, type Truth, type TruthUpdate } from "../../src/story/truth.js";
import { ledger, type Ledger } from "../agents/ledger.js";
import { malfoyProblemStoryFile } from "../support/story-files.js";

const DRACONIA = "Draconia Malfoy";
const HERMIONE = "Hermione Granger";
const ROOPESH = "Roopesh Gantasala";
const PANSY = "Pansy Parkinson";

const said = (entry: string, text: string) => ({ entry, text });

/** A record's truth update with only the parts a test needs. */
function update(parts: Partial<TruthUpdate>): TruthUpdate {
  return { ...emptyUpdate(), ...parts };
}

/** Scene [number] of The Malfoy Problem opens at [at], with [who] there besides him. */
function opens(story: Ledger, number: number, at: string, who: string[], title = `Scene ${number}`) {
  story.add({ kind: "scene_opened", number, title, place: "The Great Hall", at, who, prose: null, startsAt: null, purpose: null, exit: null });
}

/** The four layers [reader] is given for the Scene open now, with its people and the Move [move]. */
function given(story: Ledger, reader: Reader, move = "I sit down."): Layers {
  return layers(story.state(), nothingBeside(), reader, story.state().scene?.here ?? [], story.scene(), [`<move by="${ROOPESH}">\n${move}\n</move>`]);
}

const WRITERS: Reader[] = ["actor", "writer", "editor"];

/** The contract Draconia and Hermione signed over him in Scene 8, in its own words. */
const CONTRACT: Omit<Truth, "opened" | "closed" | "closedBy"> = {
  id: "t-contract", kind: "agreement", what: "The contract between Draconia and Hermione over Roopesh", terms: ["Nobody comes second", "Saturdays are Hermione's"],
  who: [DRACONIA, HERMIONE, ROOPESH], knownTo: [DRACONIA, HERMIONE, ROOPESH], due: null, replaces: null, sources: [said("e-8", "Nobody comes second, Granger. Sign it.")]
};

describe("the truth (openspec the-truth)", () => {
  it("opens, keeps and closes items by id, and never deletes one", () => {
    const contract = { id: "t1", kind: "agreement" as const, what: "The contract", terms: ["Nobody comes second", "Saturdays are Hermione's"], who: ["Draconia Malfoy", "Hermione Granger"], knownTo: ["Draconia Malfoy", "Hermione Granger"], due: null, replaces: null, sources: [said("e1", "nobody second")] };
    let truth = applyTruth(emptyTruth(), update({ truths: { open: [contract], close: [] } }), 8);
    expect(truth.truths.t1).toMatchObject({ opened: 8, closed: null, terms: contract.terms });
    // Amended in Scene 12: the old terms are closed, the new ones open, and both are kept.
    truth = applyTruth(truth, update({ truths: { open: [{ ...contract, id: "t2", terms: [...contract.terms, "Fridays are Draconia's"], replaces: "t1" }], close: [{ id: "t1", why: "amended" }] } }), 12);
    expect(open(truth.truths).map(item => item.id)).toEqual(["t2"]);
    expect(truth.truths.t1).toMatchObject({ closed: 12, closedBy: "amended" });
  });

  it("keeps who each person was before, between two people whichever way they are named, and a name from its first mention", () => {
    const now = (scene: number, text: string) => ({ who: "Draconia Malfoy", now: text, feelings: [], wants: "", hides: "", scene, sources: [] });
    let truth = applyTruth(emptyTruth(), update({ now: [now(1, "Calls him Stray and denies everything.")] }), 1);
    truth = applyTruth(truth, update({ now: [now(12, "Has declared herself taken in front of the school.")] }), 12);
    expect(truth.now["Draconia Malfoy"]?.scene).toBe(12);
    expect(truth.past.map(person => person.scene)).toEqual([1]);

    const kiss = { id: "k1", what: "Their first kiss, on the Hogsmeade road", scene: 18, words: [said("e9", "He kissed her on the open road")] };
    truth = applyTruth(truth, update({ between: [{ people: ["Roopesh Gantasala", "Draconia Malfoy"], stands: "She claims him in public.", turn: { text: "He kissed her on the road.", scene: 18, sources: [] }, keepsakes: [kiss] }] }), 18);
    truth = applyTruth(truth, update({ between: [{ people: ["Draconia Malfoy", "Roopesh Gantasala"], stands: null, turn: null, keepsakes: [kiss] }] }), 19);
    const between = truth.between[betweenKey("Roopesh Gantasala", "Draconia Malfoy")];
    expect(between).toMatchObject({ stands: "She claims him in public.", turns: [{ scene: 18 }], keepsakes: [kiss] });

    truth = applyTruth(truth, update({ names: [{ name: "Silas Penhallow", kind: "person", what: "An Auror of Madam Bones's office", first: 16, sources: [] }] }), 16);
    truth = applyTruth(truth, update({ names: [{ name: "Silas Penhallow", kind: "person", what: "Someone else", first: 20, sources: [] }] }), 20);
    expect(truth.names["Silas Penhallow"]).toMatchObject({ first: 16, what: "An Auror of Madam Bones's office" });
  });

  // GIVEN Draconia's betrothal to Selwyn was broken in Scene 30
  // WHEN a Scene in Scene 40 mentions it
  // THEN it is spoken of as broken, and the Story still knows it held from its making until Scene 30
  it("the-truth › Nothing is deleted › A betrothal broken", () => {
    const story = ledger(malfoyProblemStoryFile());
    const betrothal = { id: "b1", kind: "status" as const, what: "Draconia is betrothed to Evander Selwyn", terms: [], who: ["Draconia Malfoy", "Evander Selwyn"], knownTo: ["Draconia Malfoy", "Evander Selwyn"], due: null, replaces: null, sources: [said("e20", "Lucius announced the engagement")] };
    story.chronicle({ scene: 25, truth: update({ truths: { open: [betrothal], close: [] } }) });
    story.chronicle({ scene: 30, truth: update({ truths: { open: [], close: [{ id: "b1", why: "Draconia broke it before the school" }] } }) });
    const truth = story.state().truth;
    expect(open(truth.truths)).toEqual([]);
    expect(truth.truths.b1).toMatchObject({ opened: 25, closed: 30, closedBy: "Draconia broke it before the school", sources: betrothal.sources });
    // The prompt's half (the-storys-mind task 3.1): in Scene 40 it reads as ended, with when it held.
    opens(story, 40, "Day 200 19:00", [DRACONIA]);
    for (const reader of WRITERS) {
      const { standing } = given(story, reader, "I ask Draconia about Selwyn.");
      expect(standing, reader).toContain("What has ended or changed:\n- Draconia is betrothed to Evander Selwyn: no longer so. It held from Scene 25 until Scene 30: Draconia broke it before the school.");
      expect(standing, reader).not.toContain("How things stand, since Scene 25");
    }
  });
});

describe("what every writer of a Scene is given of the truth (the-storys-mind design decision 7)", () => {
  // GIVEN Draconia declared herself taken in front of the school in Scene 12 and kissed him on the road in Scene 18
  // WHEN a Scene with her opens
  // THEN she is written as who she is now, and does not hide that she wants him as she did in the first week
  it("the-truth › Who each person is now is kept › Not her first-week self", () => {
    const story = ledger(malfoyProblemStoryFile());
    const draconia = (scene: number, now: string, wants: string, hides: string) =>
      ({ who: DRACONIA, now, feelings: [{ about: ROOPESH, feels: scene === 1 ? "A debt she resents." : "Hers, and she says so." }], wants, hides, scene, sources: [said(`e-${scene}`, now)] });
    story.chronicle({ scene: 1, truth: update({ now: [draconia(1, "Calls him Stray and mocks the charity fund; would rather die than admit she wants him.", "To pay her debt and be done with him.", "That she wants him.")] }) });
    story.chronicle({ scene: 12, truth: update({ now: [draconia(12, "Declared in front of the school, in the Great Hall, that Roopesh is taken: by her.", "Him, and everyone to know it.", "What the word on the train still costs her.")] }) });
    story.chronicle({ scene: 18, truth: update({ now: [draconia(18, "Kissed him on the Hogsmeade road in front of half the school, and has stopped pretending.", "Him, openly; she says so to anyone who asks.", "What the word on the train still costs her.")] }) });
    opens(story, 19, "Day 60 09:00", [DRACONIA]);
    for (const reader of WRITERS) {
      const { story: first, standing } = given(story, reader);
      expect(standing, reader).toContain(`${DRACONIA}\n  Now, as of Scene 18: Kissed him on the Hogsmeade road in front of half the school, and has stopped pretending.\n  About ${ROOPESH}: Hers, and she says so.\n  Wants: Him, openly; she says so to anyone who asks.`);
      expect(standing, reader).not.toContain("would rather die than admit she wants him");
      expect(standing, reader).not.toContain("Hides: That she wants him.");
      // Who the Story File said she was stays her beginning, read after who she is now.
      expect(first, reader).toContain("Who each person was when the Story began. Who they are now is under where things stand, and comes first.");
      expect(first, reader).toContain(`- ${DRACONIA}, a Lead, also Connie: Pure-blood heir, Slytherin, sharp-tongued and proud.`);
    }
    // Nothing is deleted: who she was in the first week is kept.
    expect(story.state().truth.past.map(before => before.scene)).toEqual([1, 12]);
  });

  // GIVEN Roopesh told Hermione in Scene 6 that he can stop time, and Draconia believes only her parents and Dumbledore
  //   know
  // WHEN both are in a Scene with him
  // THEN Hermione acts knowing it, and Draconia acts as if Hermione does not
  it("the-truth › What each person knows and believes is kept › Who knows his secret", () => {
    const story = ledger(malfoyProblemStoryFile());
    const power = { id: "t-power", kind: "secret" as const, what: "Roopesh can stop time", terms: [], who: [ROOPESH], knownTo: [ROOPESH, DRACONIA, "Albus Dumbledore", "Lucius Malfoy", "Narcissa Malfoy"], due: null, replaces: null, sources: [said("e-1", "and then the world stopped")] };
    story.chronicle({ scene: 1, truth: update({
      truths: { open: [power], close: [] },
      beliefs: { open: [{ id: "b-who-knows", holder: DRACONIA, what: "only her parents and Dumbledore know Roopesh can stop time", true: false, sources: [said("e-1", "Only my parents know. And Dumbledore.")] }], close: [] }
    }) });
    story.chronicle({ scene: 6, truth: update({
      truths: { open: [{ ...power, id: "t-power-6", knownTo: [...power.knownTo, HERMIONE], replaces: "t-power" }], close: [{ id: "t-power", why: "He told Hermione in the library" }] },
      beliefs: { open: [{ id: "b-hermione", holder: HERMIONE, what: "Roopesh can stop time: he told her himself, in the library", true: true, sources: [said("e-6", "Every clock in the library stopped.")] }], close: [] }
    }) });
    opens(story, 9, "Day 30 20:00", [DRACONIA, HERMIONE]);
    for (const reader of ["actor", "editor"] as const) {
      const { standing } = given(story, reader);
      expect(standing, reader).toContain(`${HERMIONE} knows Roopesh can stop time: he told her himself, in the library (since Scene 6).`);
      expect(standing, reader).toContain(`${DRACONIA} believes only her parents and Dumbledore know Roopesh can stop time (since Scene 1). That is not so.`);
      expect(standing, reader).toContain(`${DRACONIA} knows Roopesh can stop time.`);
      expect(standing, reader).toContain(`Known to ${ROOPESH}, ${DRACONIA}, Albus Dumbledore, Lucius Malfoy, Narcissa Malfoy and ${HERMIONE}.`);
      // That Hermione came to know it is a change, not an end: the power is still true.
      expect(standing, reader).toContain("- Changed in Scene 6: He told Hermione in the library. Before that, since Scene 1: Roopesh can stop time.");
      expect(standing, reader).not.toContain("Roopesh can stop time: no longer so");
    }
    expect(given(story, "actor").standing).toContain("Play each of them from this: they act on what they believe, wrong or not, and never on what they do not know.");
  });

  // GIVEN Pansy took the page from Draconia's diary, and Draconia believes Hermione did
  // WHEN Draconia and Hermione meet
  // THEN Draconia blames Hermione, until she learns otherwise on the page
  it("the-truth › What each person knows and believes is kept › A wrong belief held", () => {
    const story = ledger(malfoyProblemStoryFile());
    const page = { id: "t-page", kind: "secret" as const, what: "Pansy took the page from Draconia's diary", terms: [], who: [PANSY, DRACONIA], knownTo: [PANSY], due: null, replaces: null, sources: [said("e-9", "Pansy folded the page into her sleeve.")] };
    story.chronicle({ scene: 9, truth: update({
      truths: { open: [page], close: [] },
      beliefs: { open: [{ id: "b-page", holder: DRACONIA, what: "Hermione took the page from her diary", true: false, sources: [said("e-9", "It was Granger. It's always Granger.")] }], close: [] }
    }) });
    opens(story, 10, "Day 31 13:00", [DRACONIA, HERMIONE]);
    const before = given(story, "actor").standing;
    expect(before).toContain(`${DRACONIA} believes Hermione took the page from her diary (since Scene 9). That is not so.`);
    expect(before).toContain(`${DRACONIA} does not know Pansy took the page from Draconia's diary.`);
    expect(before).toContain(`${HERMIONE} does not know Pansy took the page from Draconia's diary.`);
    expect(given(story, "writer").standing).toContain("- A secret, since Scene 9: Pansy took the page from Draconia's diary. It concerns Pansy Parkinson and Draconia Malfoy. Known to Pansy Parkinson.");

    // She learns otherwise on the page, and from then on knows it.
    story.close();
    story.chronicle({ scene: 10, truth: update({
      truths: { open: [{ ...page, id: "t-page-10", knownTo: [PANSY, DRACONIA], replaces: "t-page" }], close: [{ id: "t-page", why: "Pansy confessed, in front of Draconia" }] },
      beliefs: { open: [{ id: "b-page-10", holder: DRACONIA, what: "Pansy took the page from her diary", true: true, sources: [said("e-10", "It was me, Draconia.")] }], close: [{ id: "b-page", why: "Pansy confessed" }] }
    }) });
    opens(story, 11, "Day 32 13:00", [DRACONIA, HERMIONE]);
    const after = given(story, "actor").standing;
    expect(after).not.toContain("believes Hermione took the page");
    expect(after).toContain(`${DRACONIA} knows Pansy took the page from her diary (since Scene 10).`);
  });

  // GIVEN Draconia and Hermione have fought over him since Scene 1 and signed a contract in Scene 8
  // WHEN they meet in Scene 40
  // THEN they act from where things stand between them, with the contract and how it came about
  it("the-truth › Where things stand between any two people is kept › Two rivals", () => {
    const story = ledger(malfoyProblemStoryFile());
    const rivals = (scene: number, text: string, stands: string | null = null) => update({ between: [{ people: [HERMIONE, DRACONIA], stands, turn: { text, scene, sources: [] }, keepsakes: [] }] });
    story.chronicle({ scene: 1, truth: rivals(1, "They fought over him at the Three Broomsticks, the first night.", "Rivals over him from the first night.") });
    story.chronicle({ scene: 8, truth: { ...rivals(8, "They signed a contract over him in the Room of Requirement, after a duel neither won.", "Rivals bound by a contract they both mean to bend."), truths: { open: [CONTRACT], close: [] } } });
    for (let scene = 9; scene < 40; scene++) story.chronicle({ scene, truth: rivals(scene, `Scene ${scene}: ${"They fought over him again, in a corridor, in front of everyone, and neither gave an inch. ".repeat(8)}`) });
    opens(story, 40, "Day 150 19:00", [DRACONIA, HERMIONE]);
    for (const reader of ["actor", "writer"] as const) {
      const { standing } = given(story, reader);
      const between = standing.slice(standing.indexOf("<between>"), standing.indexOf("</between>"));
      expect(between, reader).toContain(`${DRACONIA} and ${HERMIONE}: Rivals bound by a contract they both mean to bend.\n  How it turned:\n  Scene 1: They fought over him at the Three Broomsticks, the first night.\n  Scene 8: They signed a contract over him in the Room of Requirement, after a duel neither won.`);
      expect(between, reader).toContain("  Scene 39: Scene 39: They fought over him again");
      expect(between, reader).toMatch(/\(\d+ more turns left out for length\.\)/);
      expect(standing, reader).toContain(`- An agreement, since Scene 8: The contract between Draconia and Hermione over Roopesh. Its terms: Nobody comes second; Saturdays are Hermione's. It concerns ${DRACONIA}, ${HERMIONE} and ${ROOPESH}. Known to ${DRACONIA}, ${HERMIONE} and ${ROOPESH}. As it was said: "Nobody comes second, Granger. Sign it."`);
    }
  });

  // GIVEN Draconia first kissed him in Scene 18
  // WHEN they kiss in a Scene in Year Four
  // THEN the first kiss is with them in its own words, and the Reply can call back to it
  it("the-truth › Where things stand between any two people is kept › The first kiss, years later", () => {
    const story = ledger(malfoyProblemStoryFile());
    const words = "She kissed him in the middle of the road, in front of half the school, and said, \"Mine. Get used to it.\"";
    story.close();
    story.chronicle({ scene: 18, paragraph: "On the Hogsmeade road Draconia kissed him in front of half the school.", truth: update({ between: [{ people: [DRACONIA, ROOPESH], stands: "She has claimed him in public.", turn: { text: "She kissed him on the Hogsmeade road.", scene: 18, sources: [] }, keepsakes: [{ id: "k-first-kiss", what: "Their first kiss, on the Hogsmeade road", scene: 18, words: [said("e-18", words)] }] }] }) });
    // Three years of Scenes, each with a turn and something to remember, and The Story So Far folded into Acts.
    for (let scene = 19; scene < 300; scene++) {
      story.chronicle({ scene, truth: update({ between: [{ people: [DRACONIA, ROOPESH], stands: "Hers, and he knows it.", turn: { text: `Scene ${scene}: they quarrelled and made up.`, scene, sources: [] }, keepsakes: scene % 3 === 0 ? [{ id: `k-${scene}`, what: `A night in Scene ${scene} they would not forget`, scene, words: [said(`e-${scene}`, "She fell asleep on his shoulder in the common room and denied it in the morning.")] }] : [] }] }) });
    }
    story.fold({ into: "act", count: story.state().storySoFar.scenes.length, from: "Day 1 21:40", until: "Day 1000 22:00", text: "Years One to Three, told whole." });
    opens(story, 300, "Day 1100 21:00", [DRACONIA]);
    for (const reader of ["actor", "writer", "editor"] as const) {
      const { standing } = given(story, reader, "I kiss her.");
      expect(standing, reader).toContain(`  Keepsake, Scene 18: Their first kiss, on the Hogsmeade road. In their own words: "${words}"`);
      expect(standing, reader).not.toContain("On the Hogsmeade road Draconia kissed him");
      expect(standing, reader).toMatch(/\(\d+ more keepsakes left out for length\.\)/);
    }
  });

  // GIVEN the contract says nobody comes second and Saturdays are Hermione's
  // WHEN Draconia claims him on a Saturday
  // THEN the Scene knows the clause, and Hermione holds him to it unless it is changed on the page
  it("the-truth › What is true now is kept › The contract's clauses", () => {
    const story = ledger(malfoyProblemStoryFile());
    story.chronicle({ scene: 8, truth: update({ truths: { open: [CONTRACT], close: [] } }) });
    opens(story, 9, "Day 16 11:00", [DRACONIA]);
    for (const reader of WRITERS) {
      const { standing, moment } = given(story, reader, "Draconia takes my arm in front of the whole Great Hall.");
      expect(standing, reader).toContain("Its terms: Nobody comes second; Saturdays are Hermione's.");
      expect(moment, reader).toContain("It is Saturday 21 September 1991, 11:00 am");
    }
    // Changed on the page: the new clause holds, and the old one reads as changed.
    story.close();
    story.chronicle({ scene: 9, truth: update({ truths: { open: [{ ...CONTRACT, id: "t-contract-9", terms: ["Nobody comes second", "Saturdays are shared"], replaces: "t-contract" }], close: [{ id: "t-contract", why: "Amended over breakfast: Saturdays are shared now" }] } }) });
    opens(story, 10, "Day 23 11:00", [DRACONIA]);
    const { standing } = given(story, "writer");
    expect(standing).toContain("- An agreement, since Scene 9: The contract between Draconia and Hermione over Roopesh. Its terms: Nobody comes second; Saturdays are shared.");
    expect(standing).toContain("- Changed in Scene 9: Amended over breakfast: Saturdays are shared now. Before that, since Scene 8: The contract between Draconia and Hermione over Roopesh. Its terms were: Nobody comes second; Saturdays are Hermione's.");
  });

  // GIVEN Hermione wrote that Draconia must say it back by Christmas
  // WHEN December comes
  // THEN the people who know of it remember it, and the deadline counts
  it("the-truth › What is true now is kept › A deadline coming", () => {
    const story = ledger(malfoyProblemStoryFile());
    const christmas = { id: "t-christmas", kind: "promise" as const, what: "Draconia must say it back to Roopesh by Christmas, as Hermione wrote in her letter", terms: [], who: [DRACONIA, HERMIONE], knownTo: [DRACONIA, HERMIONE], due: "Day 111 00:00", replaces: null, sources: [said("e-15", "Say it back by Christmas, or I will.")] };
    story.chronicle({ scene: 15, truth: update({ truths: { open: [christmas], close: [] } }) });
    opens(story, 16, "Day 96 20:00", [DRACONIA]);
    for (const reader of WRITERS) {
      expect(given(story, reader).standing, reader).toContain(`- A promise, since Scene 15: Draconia must say it back to Roopesh by Christmas, as Hermione wrote in her letter. Due by Wednesday 25 December 1991, 12:00 am, in 15 days. It concerns ${DRACONIA} and ${HERMIONE}. Known to ${DRACONIA} and ${HERMIONE}.`);
    }
    // Nobody who does not know of it is written as knowing it.
    opens(story, 17, "Day 97 10:00", ["Harry Potter"]);
    expect(given(story, "actor").standing).not.toContain("say it back");
    // Past Christmas and still not kept, it counts as overdue.
    opens(story, 18, "Day 113 10:00", [HERMIONE]);
    expect(given(story, "actor").standing).toContain("It was due by Wednesday 25 December 1991, 12:00 am, 2 days ago.");
  });

  // GIVEN it was established that his doubles last only minutes
  // WHEN a later Reply has him doubled
  // THEN the double does not last an hour
  it("the-truth › Rules hold › A power's limits", () => {
    const story = ledger(malfoyProblemStoryFile());
    story.chronicle({ scene: 9, truth: update({ rules: { open: [{ id: "r-doubles", what: "Roopesh's doubles last only minutes", sources: [said("e-9", "The double flickered out after four minutes.")] }], close: [] } }) });
    opens(story, 30, "Day 120 21:00", [HERMIONE]);
    for (const reader of WRITERS) {
      expect(given(story, reader, "I split into two.").story, reader).toContain("<rules>\nHow this World works. Each Rule holds for the rest of the Story, unless the Story changes it on the page.\n- Roopesh's doubles last only minutes. (Scene 9)\n</rules>");
    }
    expect(given(story, "chronicler").story).toContain("- [r-doubles] Roopesh's doubles last only minutes. (Scene 9)");
    // Changed on the page, it holds as changed.
    story.close();
    story.chronicle({ scene: 30, truth: update({ rules: { open: [{ id: "r-doubles-30", what: "Roopesh can hold a double for an hour, at a cost", sources: [] }], close: [{ id: "r-doubles", why: "He held one for an hour on the page" }] } }) });
    opens(story, 31, "Day 121 21:00", [HERMIONE]);
    const { story: first } = given(story, "actor");
    expect(first).toContain("- Roopesh can hold a double for an hour, at a cost. (Scene 30)");
    expect(first).not.toContain("last only minutes");
  });

  // GIVEN an Auror introduced himself in Scene 16 as Silas Penhallow of Madam Bones's office
  // WHEN he comes back in a later Scene
  // THEN he is Silas Penhallow of Madam Bones's office, and nobody calls him by another name
  it("the-truth › What is named stays named › The Auror's name", () => {
    const story = ledger(malfoyProblemStoryFile());
    const what = "An Auror of Madam Bones's office, who introduced himself at the Three Broomsticks";
    story.chronicle({ scene: 16, truth: update({ names: [{ name: "Silas Penhallow", kind: "person", what, first: 16, sources: [said("e-16", "Silas Penhallow. Madam Bones's office.")] }] }) });
    story.chronicle({ scene: 20, truth: update({ names: [{ name: "Silas Penhallow", kind: "person", what: "A Ministry man", first: 20, sources: [] }] }) });
    opens(story, 25, "Day 90 15:00", ["Silas Penhallow", HERMIONE]);
    for (const reader of WRITERS) {
      const { story: first, standing } = given(story, reader, "I recognise the Auror from the pub.");
      expect(first, reader).toContain(`- Silas Penhallow, a person first named in Scene 16: ${what}.`);
      expect(standing, reader).toContain(`Silas Penhallow (first named in Scene 16: ${what})`);
      expect(`${first}${standing}`, reader).not.toContain("A Ministry man");
    }
  });
});
