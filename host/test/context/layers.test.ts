import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { asCall, layers, LIMITS, tokens, type Layers, type Reader } from "../../src/context/lens.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { nothingBeside, type Beside } from "../../src/story/beside.js";
import type { OutlineSet } from "../../src/story/entries.js";
import type { Act } from "../../src/story/outline.js";
import { emptyUpdate, type TruthUpdate } from "../../src/story/truth.js";
import { ledger, SONNET } from "../agents/ledger.js";

const READERS: Reader[] = ["writer", "actor", "editor", "director", "weaver", "chronicler"];
const DRACONIA = "Draconia Malfoy";
const HERMIONE = "Hermione Granger";
const ROOPESH = "Roopesh Gantasala";
const said = (entry: string, text: string) => ({ entry, text });

/** The Malfoy Problem as its Story File sets it up (examples/malfoy-problem). */
function malfoyProblem(): StoryFile {
  return parse(readFileSync(fileURLToPath(new URL("../../../examples/malfoy-problem/story.yaml", import.meta.url)), "utf8")) as StoryFile;
}

const act = (number: number, turns = 3): Act => ({
  number, title: ["Year One", "Year Two", "Year Three", "Year Four", "Year Five"][number - 1] ?? `Act ${number}`,
  question: "Does Draconia take back the word she said on the train?", buildsTo: "The Philosopher's Stone", detail: number === 1 ? "detailed" : "sketched",
  turns: Array.from({ length: turns }, (_, index) => ({ id: `t${number}.${index + 1}`, when: `week ${index + 1}`, what: `Turn ${index + 1} of the year: Draconia and Hermione go to war over him.`, serves: [DRACONIA, HERMIONE], state: "ahead" as const })),
  relationships: [{ people: [DRACONIA, ROOPESH], byEnd: "She has said it back, in her own way." }], movers: [{ who: "Lucius Malfoy", doing: "Looks for the masked wizards." }], handsOn: "Year Two opens on the Chamber."
});

const outlineSet = (current: number, turns = 3): OutlineSet => ({
  kind: "outline_set", reason: "The Story starts.", planFollows: false, dropped: [], callId: "c", model: SONNET,
  outline: {
    current, acts: [1, 2, 3, 4, 5].map(number => act(number, turns)), ending: "Voldemort is defeated at Hogwarts.",
    intentions: [{ who: DRACONIA, pursues: "Roopesh, openly", feelings: "jealous of Hermione", heading: "saying it back by Christmas" }, { who: "Harry Potter", pursues: "the Stone", feelings: "restless", heading: "the trapdoor" }],
    setups: [{ id: "s1", what: "The masked wizards from the train.", planted: 1, payoff: "Yaxley is unmasked at the Stone.", turn: "t1.3", state: "waiting", settled: null }],
    promoted: [], revisedAfter: 0, deep: true, lookedUp: []
  }
});

/** What the Story keeps by Scene 19 of Year One, as the Chronicler recorded it. */
const KEPT: TruthUpdate = {
  ...emptyUpdate(),
  now: [{ who: DRACONIA, now: "Has declared before the school that Roopesh is hers, and kissed him on the Hogsmeade road.", feelings: [{ about: ROOPESH, feels: "Hers, and she says so." }, { about: HERMIONE, feels: "A rival she respects and will not share with." }], wants: "Him, openly.", hides: "What the word on the train still costs her.", scene: 18, sources: [] }],
  beliefs: { open: [{ id: "b-power", holder: HERMIONE, what: "Roopesh can stop time", true: true, sources: [said("e-6", "Every clock in the library stopped")] }], close: [] },
  between: [{ people: [DRACONIA, HERMIONE], stands: "Rivals bound by a contract.", turn: { text: "They signed the contract over him.", scene: 8, sources: [] }, keepsakes: [] }],
  truths: { open: [{ id: "t-contract", kind: "agreement", what: "The contract between Draconia and Hermione over Roopesh.", terms: ["Nobody comes second", "Saturdays are Hermione's"], who: [DRACONIA, HERMIONE, ROOPESH], knownTo: [DRACONIA, HERMIONE, ROOPESH], due: null, replaces: null, sources: [said("e-8", "Nobody comes second.")] }], close: [] },
  rules: { open: [{ id: "r-doubles", what: "Roopesh's doubles last only minutes.", sources: [] }], close: [] },
  names: [{ name: "Silas Penhallow", kind: "person", what: "An Auror of Madam Bones's office", first: 16, sources: [] }]
};

/** The Malfoy Problem nineteen Scenes in, with its Outline and what it keeps, and Scene 20 open with Draconia and Hermione. */
function nineteenIn() {
  const story = ledger(malfoyProblem());
  story.add(outlineSet(1));
  story.close();
  story.chronicle({ scene: 19, truth: KEPT, paragraph: "Draconia claimed him on the Hogsmeade road, and Hermione saw." });
  story.open("Between them", "The Gryffindor common room", "Day 20 22:00", [DRACONIA, HERMIONE], "The fire is down to embers.");
  story.move("I sit down between them.");
  return story;
}

/** Layer 4's parts for a reader: the Move, as the job brings it. */
const MOVE = ['<move by="Roopesh Gantasala">\nI sit down between them.\n</move>'];
const layered = (story: ReturnType<typeof nineteenIn>, reader: Reader, beside: Beside = nothingBeside(), present?: string[]): Layers =>
  layers(story.state(), beside, reader, present ?? story.state().scene?.here ?? [], story.scene().slice(0, -1), MOVE);

/** Each part of a layer, by its tag. */
function parts(layer: string): Map<string, string> {
  return new Map([...layer.matchAll(/^<([a-z_]+)[^>\n]*>\n[\s\S]*?\n<\/\1>$/gm)].map(match => [match[1]!, match[0]]));
}

const PART_LIMITS: Record<string, number> = {
  story: LIMITS.parts.story, world: LIMITS.parts.world, people: LIMITS.parts.people, rules: LIMITS.parts.rules, named: LIMITS.parts.names,
  story_so_far: LIMITS.parts.storySoFar, outline: LIMITS.parts.outline, threads: LIMITS.parts.threads, calendar: LIMITS.parts.calendar,
  the_players_wishes: LIMITS.parts.wishes, people_now: LIMITS.parts.lives, between: LIMITS.parts.between, what_each_knows: LIMITS.parts.knows,
  what_is_true: LIMITS.parts.truths, lately: LIMITS.parts.lately, remembered: LIMITS.parts.moments
};

describe("prompts in four layers (the-storys-mind design decision 7)", () => {
  it("gives every reader the Story, then where things stand, then the Scene, then the moment, in prose", () => {
    const story = nineteenIn();
    for (const reader of READERS) {
      const four = layered(story, reader);
      const { system, prompt } = asCall({ ...four, story: `You are the ${reader}.\n\n${four.story}` });
      expect(system.startsWith(`You are the ${reader}.\n\n<story>\nTitle: The Malfoy Problem\nPremise: Roopesh's years at Hogwarts`), reader).toBe(true);
      expect(system, reader).toContain("Everyone at Hogwarts, students and staff, is eighteen or older.");
      // Slowest-changing first: the Story So Far, the Scene, then the moment, which ends on the Move.
      expect(prompt.indexOf("<story_so_far>"), reader).toBe(0);
      expect(prompt.indexOf("<story_so_far>"), reader).toBeLessThan(prompt.indexOf("<scene>"));
      expect(prompt.indexOf("<scene_so_far>"), reader).toBeLessThan(prompt.indexOf("<now>"));
      expect(prompt.endsWith(MOVE[0]!), reader).toBe(true);
      // Prose, never JSON.
      expect(`${system}${prompt}`, reader).not.toMatch(/[{[]"/);
    }
  });

  it("keeps layers 1 and 2 the same for every Reply in a Scene, and moves the time only in layer 4", () => {
    const story = nineteenIn();
    const before = Object.fromEntries(READERS.map(reader => [reader, layered(story, reader)]));
    story.note({ clock: "Day 20 23:45" });
    story.reply("Draconia does not move up.");
    story.move("I stay where I am.");
    for (const reader of READERS) {
      const after = layered(story, reader);
      expect(after.story, reader).toBe(before[reader]!.story);
      expect(after.standing, reader).toBe(before[reader]!.standing);
      expect(after.moment, reader).toContain("<now>\nIt is Friday 20 September 1991, 11:45 pm (1991-09-20 23:45).\n</now>");
      expect(before[reader]!.moment, reader).toContain("It is Friday 20 September 1991, 10:00 pm");
      for (const layer of [after.story, after.standing, after.scene]) expect(layer, reader).not.toContain("11:45 pm");
    }
  });

  it("gives The Malfoy Problem's Story File whole in layer 1, with the Leads first", () => {
    const story = nineteenIn();
    for (const reader of READERS) {
      const first = layered(story, reader).story;
      expect(first, reader).not.toContain("left out");
      expect(tokens(first), reader).toBeLessThan(LIMITS.layers.story / 2);
    }
    const people = parts(layered(story, "actor").story).get("people")!;
    expect(people.indexOf(`- ${ROOPESH}, the player's character`)).toBeLessThan(people.indexOf(`- ${DRACONIA}, a Lead`));
    expect(people.indexOf(`- ${HERMIONE}, a Lead`)).toBeLessThan(people.indexOf("- Ron Weasley"));
  });

  it("keeps every layer and every part within its limit, however long the Story runs", () => {
    const story = ledger(malfoyProblem());
    story.add(outlineSet(4, 60));
    const many = <T>(count: number, make: (index: number) => T): T[] => Array.from({ length: count }, (_, index) => make(index));
    const long = (index: number) => `${index}: ${"Draconia and Hermione fought over him again, in front of everyone. ".repeat(4)}`;
    const leads = [DRACONIA, HERMIONE, "Harry Potter"];
    const present = [...leads, ...malfoyProblem().people.slice(4, 16).map(person => person.name)];
    story.close();
    story.chronicle({
      scene: 400,
      paragraph: long(400),
      moments: many(80, index => ({ what: long(index), quotes: [said("e", long(index))], there: [HERMIONE], weight: 1 + (index % 5) })),
      engagements: many(30, index => ({ id: `g${index}`, what: long(index), at: `Day ${30 + index} 19:00`, place: "The library", who: [HERMIONE], expected: true, every: null, quotes: [] })),
      truth: {
        now: present.map(who => ({ who, now: long(1), feelings: many(30, index => ({ about: present[index % present.length]!, feels: long(index) })), wants: long(2), hides: long(3), scene: 399, sources: [] })),
        beliefs: { open: present.flatMap(holder => many(20, index => ({ id: `b-${holder}-${index}`, holder, what: long(index), true: index % 2 === 0, sources: [] }))), close: [] },
        between: present.flatMap((one, at) => present.slice(at + 1).flatMap(other => many(12, index => ({ people: [one, other] as [string, string], stands: long(index), turn: { text: long(index), scene: index + 1, sources: [] }, keepsakes: [{ id: `k-${one}-${other}-${index}`, what: long(index), scene: index + 1, words: [said("e", long(index))] }] })))),
        truths: { open: many(200, index => ({ id: `t${index}`, kind: index % 3 === 0 ? "secret" as const : "promise" as const, what: long(index), terms: many(4, long), who: [present[index % present.length]!], knownTo: leads, due: `Day ${200 + index} 00:00`, replaces: null, sources: [said("e", long(index))] })), close: [] },
        rules: { open: many(120, index => ({ id: `r${index}`, what: long(index), sources: [] })), close: [] },
        names: many(200, index => ({ name: `Stranger ${index}`, kind: "person" as const, what: long(index), first: index + 1, sources: [] }))
      }
    });
    story.chronicle({ scene: 401, truth: { ...emptyUpdate(), truths: { open: [], close: many(60, index => ({ id: `t${index}`, why: long(index) })) } } });
    for (let index = 0; index < 8; index++) story.fold({ into: "act", count: 0, from: "Day 1 08:00", until: "Day 300 22:00", text: long(index).repeat(60) });
    story.world({ happened: many(40, index => ({ id: `h${index}`, what: long(index), at: `Day ${2 + index} 10:00`, where: "the castle", knownTo: [HERMIONE], landmark: null, move: null })), threads: many(40, index => ({ name: `Thread ${index}`, now: long(index) })) });
    story.open("The longest night", "The Room of Requirement", "Day 700 20:00", present);
    for (let index = 0; index < 30; index++) {
      story.move(`I say something, ${index}.`);
      story.reply(long(index).repeat(40));
    }
    const beside: Beside = {
      taste: many(60, long), playerTaste: many(20, long), brief: { more: many(30, long), less: many(30, long) },
      reactions: many(30, index => ({ scene: index + 1, title: `Scene ${index + 1}`, reaction: "more" as const, note: long(index) })),
      notes: many(30, index => ({ id: `n${index}`, text: long(index), writtenAt: "", answeredBy: null }))
    };
    for (const reader of READERS) {
      const four = layers(story.state(), beside, reader, present, story.scene(), [long(1).repeat(400), MOVE[0]!]);
      expect(tokens(four.story), reader).toBeLessThanOrEqual(LIMITS.layers.story);
      expect(tokens(four.standing), reader).toBeLessThanOrEqual(LIMITS.layers.standing);
      expect(tokens(four.scene), reader).toBeLessThanOrEqual(LIMITS.layers.scene);
      expect(tokens(four.moment), reader).toBeLessThanOrEqual(LIMITS.layers.moment);
      // Every part within its own limit, and saying when it was cut.
      for (const [tag, text] of [...parts(four.story), ...parts(four.standing)]) {
        expect(PART_LIMITS[tag], `${reader} ${tag}`).toBeDefined();
        expect(tokens(text), `${reader} ${tag}`).toBeLessThanOrEqual(PART_LIMITS[tag]!);
      }
      expect(four.standing, reader).toContain("left out for length");
      expect(four.scene, reader).toMatch(/\(The Scene's first \d+ passages are left out for length/);
      // The Move is never what is cut.
      expect(four.moment.endsWith(MOVE[0]!), reader).toBe(true);
      expect(four.moment, reader).toContain("(The rest is cut for length.)");
    }
    // A part cut for someone who can look things up says so.
    expect(layers(story.state(), beside, "writer", present, story.scene(), []).standing).toContain("look them up when you need them");
  }, 30_000);
});

describe("what each reader is given (the-storys-mind design decision 7)", () => {
  it("gives the Outline, the Threads and the brief only to those who steer, and steering notes only to the Director", () => {
    const story = nineteenIn();
    const beside: Beside = { ...nothingBeside(), taste: ["Never write her as a first-timer."], brief: { more: ["the rivalry"], less: [] }, notes: [{ id: "n1", text: "Let Hermione win Christmas.", writtenAt: "", answeredBy: null }] };
    const standing = Object.fromEntries(READERS.map(reader => [reader, layered(story, reader, beside).standing]));
    for (const reader of ["writer", "director", "weaver"]) {
      expect(standing[reader], reader).toContain("Act 1, Year One, now. Its question: Does Draconia take back the word she said on the train?");
      expect(standing[reader], reader).toContain("<threads>");
      expect(standing[reader], reader).toContain("More of:\n- the rivalry");
    }
    for (const reader of ["actor", "editor", "chronicler"]) {
      expect(standing[reader], reader).not.toContain("<outline>");
      expect(standing[reader], reader).not.toContain("the rivalry");
    }
    expect(standing.director).toContain("- [t1.1] Ahead, week 1:");
    expect(standing.director).toContain("Let Hermione win Christmas.");
    expect(standing.writer).not.toContain("Let Hermione win Christmas.");
    // Where each person present is heading, for the Writer; everyone's for the Director.
    expect(standing.writer).toContain(`- ${DRACONIA} pursues Roopesh, openly; feels jealous of Hermione; heading for saying it back by Christmas.`);
    expect(standing.writer).not.toContain("- Harry Potter pursues the Stone");
    expect(standing.director).toContain("- Harry Potter pursues the Stone");
    // Taste for whoever writes or steers; nothing of the player for the Chronicler, which only records.
    for (const reader of ["writer", "actor", "editor", "director", "weaver"]) expect(standing[reader], reader).toContain("- Never write her as a first-timer.");
    expect(standing.chronicler).not.toContain("first-timer");
  });

  it("gives those who write the truth each kept item's id, so a record can change or close it", () => {
    const story = nineteenIn();
    for (const reader of ["chronicler", "weaver"] as const) {
      const four = layered(story, reader);
      expect(four.story, reader).toContain("- [r-doubles] Roopesh's doubles last only minutes. (Scene 19)");
      expect(four.standing, reader).toContain("- [t-contract] An agreement, since Scene 19:");
      expect(four.standing, reader).toContain(`[b-power] ${HERMIONE} knows Roopesh can stop time (since Scene 19).`);
    }
    expect(layered(story, "actor").standing).not.toContain("[t-contract]");
  });

  it("gives the Editor the Moments the people here remember, in their own words, and none only others were at", () => {
    const story = nineteenIn();
    story.close();
    story.chronicle({ moments: [
      { what: "Draconia said the ribbon was her grandmother's.", quotes: [said("e-18", "It's silk, it was my grandmother's.")], there: [DRACONIA], weight: 4 },
      { what: "Harry found the trapdoor.", quotes: [said("e-19", "There's a trapdoor under the dog.")], there: ["Harry Potter"], weight: 5 }
    ] });
    story.open("After", "The Gryffindor common room", "Day 21 22:00", [DRACONIA, HERMIONE]);
    const editor = layered(story, "editor").standing;
    expect(editor).toContain(`<remembered>\nMoments the people here remember, in their own words, with who knows each.\n- Scene 2, known to ${ROOPESH} and ${DRACONIA}: Draconia said the ribbon was her grandmother's.\n  "It's silk, it was my grandmother's."\n</remembered>`);
    expect(editor).not.toContain("trapdoor");
    // The Writer gathers Moments for the Actor in layer 4; layer 2 does not carry them for anyone else.
    for (const reader of ["writer", "actor", "director"] as const) expect(layered(story, reader).standing, reader).not.toContain("<remembered>");
  });

  it("gives the Actor only the off-page happenings someone here knows, and the Writer all of them with who knows each", () => {
    const story = nineteenIn();
    story.world({ happened: [{ id: "h-seat", what: "Draconia had his name taken off the Charms seating plan.", at: "Day 20 08:00", where: "Flitwick's office", knownTo: ["Neville Longbottom"], landmark: null, move: DRACONIA }] });
    expect(layered(story, "actor").standing).not.toContain("seating plan");
    expect(layered(story, "writer").standing).toContain("Draconia had his name taken off the Charms seating plan. Known to Neville Longbottom.");
    expect(layered(story, "actor", nothingBeside(), [HERMIONE, "Neville Longbottom"]).standing).toContain("seating plan");
  });
});
