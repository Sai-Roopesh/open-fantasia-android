import { describe, expect, it } from "vitest";
import { checkWeave, weaverPrompt, WeaverFailed, writeWeave, type WeaveAsk } from "../../src/agents/weaver.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { worldOn } from "../../src/story/world.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

const SONNET = { provider: "claude", model: "claude-sonnet-5-5" } as const;

/** The common room Scene after curfew, played and ended; the World moves on to Saturday morning. */
async function ended(landmarks: { name: string; at: string; what: string }[] = []) {
  const story = hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 21:40", who: ["Hermione Granger"] });
  story.landmarks = [...(story.landmarks ?? []), ...landmarks];
  const played = playable(story);
  await played.play("I say goodnight to Hermione and go up.");
  played.engine.endScene(played.storyId, played.head(), "trace-end");
  return played;
}

async function ask(changes: Partial<WeaveAsk> = {}, landmarks: { name: string; at: string; what: string }[] = []): Promise<WeaveAsk> {
  const played = await ended(landmarks);
  const head = played.head();
  return {
    state: played.state(),
    world: worldOn(played.mac, head),
    scene: played.mac.tree.pathTo(head).slice(-4),
    from: "Day 3 21:40",
    until: "Day 4 07:30",
    inScene: ["Hermione Granger"],
    ...changes
  };
}

function answer(changes: Record<string, unknown> = {}) {
  return {
    lives: [{ who: "Crabbe and Goyle", where: "the Slytherin common room", doing: "asleep after Draconia's errands", after: "Draconia's errands, and whatever she wants hit." }],
    threads: [{ name: "Quirrell and the third-floor door", now: "Quirrell has tried the wards twice and scorched the door" }],
    happened: [
      { id: "H1", what: "Quirrell tested the third-floor door and scorched it.", at: "Day 4 02:00", where: "the third-floor corridor", known_to: ["Quirinus Quirrell"], landmark: null },
      { id: "H2", what: "McGonagall slid a note under Roopesh's door asking for his account of the troll.", at: "Day 4 06:45", where: "the boys' dormitory", known_to: ["Minerva McGonagall", "Roopesh Gantasala"], landmark: null },
      { id: "H3", what: "Lavender told everyone Selwyn's bones broke one after another.", at: "Day 4 06:55", where: "the Gryffindor common room", known_to: ["Lavender Brown", "Roopesh Gantasala"], landmark: null }
    ],
    meanwhile: [
      { text: "A note under the door: \"My office, nine o'clock. Bring only what you saw.\" M. McGonagall.", how: "seen", happened: "H2", told_by: null },
      { text: "Lavender says Selwyn's bones broke one after another, \"like someone snapping kindling\".", how: "rumour", happened: "H3", told_by: null }
    ],
    happenings: [],
    ...changes
  };
}

describe("the Weaver's answer", () => {
  it("is taken when it keeps every rule, with names as the Story keeps them and what happened given ids of its own", async () => {
    const checked = checkWeave(await ask(), answer({ lives: [{ who: "crabbe and goyle", where: "the dungeons", doing: "asleep", after: "Draconia's errands" }] }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.lives).toEqual([{ who: "Crabbe and Goyle", where: "the dungeons", doing: "asleep", after: "Draconia's errands" }]);
    expect(checked.value.happened.map(item => item.knownTo)).toEqual([["Quirinus Quirrell"], ["Minerva McGonagall", "Roopesh Gantasala"], ["Lavender Brown", "Roopesh Gantasala"]]);
    const ids = checked.value.happened.map(item => item.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.some(id => /^H\d$/.test(id))).toBe(false);
    expect(checked.value.meanwhile.map(item => item.happened)).toEqual([ids[1], ids[2]]);
  });

  it("names every rule an answer breaks, so one repair can fix them all", async () => {
    const checked = checkWeave(await ask({}, [{ name: "the Halloween feast", at: "Day 3 23:00", what: "The Great Hall feast." }]), answer({
      lives: [
        { who: "Roopesh Gantasala", where: "bed", doing: "sleeping", after: "x" },
        { who: "Vincent Crabbe", where: "the kitchens", doing: "eating", after: "x" },
        { who: "Professor Dumbledore", where: "his office", doing: "thinking", after: "x" }
      ],
      happened: [
        { id: "H1", what: "Quirrell tested the door.", at: "Day 5 10:00", where: "the third floor", known_to: ["Quirinus Quirrell"], landmark: null },
        { id: "H2", what: "A note under the door.", at: "Day 4 06:45", where: "the dormitory", known_to: ["Minerva McGonagall", "Roopesh Gantasala"], landmark: null }
      ],
      meanwhile: [
        { text: "Someone has been at the third-floor door.", how: "seen", happened: "H1", told_by: null },
        { text: "Hermione says there is a note.", how: "told", happened: "H2", told_by: "Hermione Granger" },
        ...Array.from({ length: 5 }, () => ({ text: "A note.", how: "seen", happened: "H2", told_by: null }))
      ]
    }));
    expect(checked.ok).toBe(false);
    expect(checked.ok ? [] : checked.problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/^lives: Roopesh Gantasala is the player's character/),
      expect.stringMatching(/^lives: Vincent Crabbe lives as one of Crabbe and Goyle/),
      expect.stringMatching(/^lives: Professor Dumbledore is not in the story/),
      expect.stringMatching(/^happened: H1 is at Day 5 10:00, outside the span/),
      expect.stringMatching(/^happened: the Landmark the Halloween feast falls in the span/),
      expect.stringMatching(/^meanwhile: item 1 tells of H1, which the player's character does not know/),
      expect.stringMatching(/^meanwhile: item 2 is told by Hermione Granger, who does not know H2/),
      expect.stringMatching(/^meanwhile: there are 7 items/)
    ]));
  });

  it("offers at most four Happenings from the Day View on, the pick first, with names as the Story keeps them", async () => {
    const summons = { id: "P1", at: "Day 4 09:00", place: "McGonagall's office", what: "Your account of the troll.", who: ["mcgonagall", "Hermione Granger"], expected: true, pick: true };
    const twins = { id: "P2", at: "Day 4 20:00", place: "The Three Broomsticks", what: "The twins buy a round for anyone who saw the troll.", who: ["Harry Potter"], expected: false, pick: false };
    const checked = checkWeave(await ask(), answer({ happenings: [summons, twins] }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.happenings.map(item => ({ who: item.who, expected: item.expected, pick: item.pick }))).toEqual([
      { who: ["Minerva McGonagall", "Hermione Granger"], expected: true, pick: true },
      { who: ["Harry Potter"], expected: false, pick: false }
    ]);
    expect(new Set(checked.value.happenings.map(item => item.id)).size).toBe(2);
  });

  it("names every rule its Happenings break", async () => {
    const happening = (changes: Record<string, unknown>) => ({ id: "P1", at: "Day 4 09:00", place: "The library", what: "Reading.", who: ["Hermione Granger"], expected: false, pick: false, ...changes });
    const checked = checkWeave(await ask(), answer({ happenings: [
      happening({ id: "P1", at: "Day 4 06:00" }),
      happening({ id: "P2", who: ["Roopesh Gantasala", "The Grey Lady"], pick: true }),
      happening({ id: "P3", pick: true }),
      happening({ id: "P4" }),
      happening({ id: "P5" })
    ] }));
    expect(checked.ok ? [] : checked.problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/^happenings: there are 5; offer at most four/),
      expect.stringMatching(/^happenings: P1 is at Day 4 06:00, before the Day View \(Day 4 07:30\)/),
      expect.stringMatching(/^happenings: P2, who: Roopesh Gantasala is the player's character/),
      expect.stringMatching(/^happenings: P2, who: The Grey Lady is not in the story/),
      expect.stringMatching(/^happenings: 2 are the pick; pick one, and put it first/)
    ]));
  });

  it("is refused when it does not match the schema", async () => {
    expect(checkWeave(await ask(), { lives: [] }).ok).toBe(false);
  });
});

describe("the Weaver's call", () => {
  it("gives the span, the World as it stands, the Scene that ended and the Landmarks in the span", async () => {
    const { system, prompt } = weaverPrompt(await ask({}, [{ name: "the Halloween feast", at: "Day 3 23:00", what: "The Great Hall feast." }]));
    expect(system).toContain("# The Weaver");
    expect(system).toMatch(/Crabbe and Goyle/);
    expect(prompt).toMatch(/<span from="Day 3 21:40 \(Friday 9:40 pm\)" until="Day 4 07:30 \(Saturday 7:30 am\)">/);
    expect(prompt).toMatch(/Quirrell and the third-floor door: Quirrell is testing the wards/);
    expect(prompt).toMatch(/<scene_that_ended title="After curfew"/);
    expect(prompt).toMatch(/<landmarks_in_span>\n- the Halloween feast, Day 3 23:00/);
  });

  it("repairs a refused answer once, and fails with its reasons when the repair is refused too", async () => {
    const played = playable();
    const bad = { answer: JSON.stringify(answer({ lives: [{ who: "Roopesh Gantasala", where: "bed", doing: "sleeping", after: "x" }] })) };
    const repaired = new ScriptedRunner([bad, { answer: JSON.stringify(answer()) }]);
    const record = await writeWeave(new Models(played.mac.db, { claude: repaired }), SONNET, await ask(), "story", "trace-w", new AbortController().signal);
    expect(record.value.lives[0]!.who).toBe("Crabbe and Goyle");
    expect(repaired.requests[1]!.prompt).toMatch(/lives: Roopesh Gantasala is the player's character/);
    const refused = new ScriptedRunner([bad, bad]);
    await expect(writeWeave(new Models(played.mac.db, { claude: refused }), SONNET, await ask(), "story", "trace-w", new AbortController().signal)).rejects.toThrow(WeaverFailed);
  });
});
