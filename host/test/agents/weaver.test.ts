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

  it("names every rule an answer breaks, so one repair can fix them all, and refuses it while a Landmark in the span is missing", async () => {
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
      expect.stringMatching(/^meanwhile: item 1 tells of H1, which is not something that happened here/),
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

  it("leaves out the Happenings that break a rule, and keeps one pick, first", async () => {
    const happening = (changes: Record<string, unknown>) => ({ id: "P1", at: "Day 4 09:00", place: "The library", what: "Reading.", who: ["Hermione Granger"], expected: false, pick: false, ...changes });
    const checked = checkWeave(await ask(), answer({ happenings: [
      happening({ id: "P1", at: "Day 4 06:00" }),
      happening({ id: "P2", who: ["Roopesh Gantasala", "The Grey Lady"], pick: true }),
      happening({ id: "P3", pick: true }),
      happening({ id: "P4" }),
      happening({ id: "P5" })
    ] }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.happenings.map(item => ({ place: item.place, who: item.who, pick: item.pick }))).toEqual([
      { place: "The library", who: [], pick: true },
      { place: "The library", who: ["Hermione Granger"], pick: false },
      { place: "The library", who: ["Hermione Granger"], pick: false }
    ]);
    expect(checked.dropped).toEqual(expect.arrayContaining([
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

  // Records degrade, never vanish (lasting-records design decision 3): a name not in the Story costs that name, not the
  // World's record.
  it("keeps a partly bad answer, leaving out only the parts that break a rule", async () => {
    const checked = checkWeave(await ask(), answer({
      lives: [{ who: "Professor Dumbledore", where: "his office", doing: "thinking", after: "x" }],
      happened: [{ id: "H1", what: "Quirrell tested the door, for his master.", at: "Day 4 06:45", where: "the third floor", known_to: ["Quirinus Quirrell", "Lord Voldemort"], landmark: null }],
      meanwhile: [{ text: "Someone was on the third floor.", how: "rumour", happened: "H1", told_by: null, about: ["Gilderoy Lockhart"] }]
    }));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.lives).toEqual([]);
    expect(checked.value.happened.map(item => item.knownTo)).toEqual([["Quirinus Quirrell"]]);
    expect(checked.dropped).toEqual([
      "lives: Professor Dumbledore is not in the story; use a name from the people or the Groups",
      "happened: H1, known_to: Lord Voldemort is not in the story",
      "meanwhile: item 1 tells of H1, which the player's character does not know: he did not see it and nobody told him; leave it out"
    ]);
  });
});

describe("the Weaver follows the Stretch (docs/adr/0010)", () => {
  const next = { id: "s-thursday", at: "Day 9 10:00", place: "The corridor outside Charms", who: ["Draconia Malfoy"], for: "She corners him about the seating plan.", lead: "Draconia Malfoy" };
  const offer = (changes: Record<string, unknown> = {}) => ({ id: "P1", at: "Day 9 10:00", place: "The corridor outside Charms", what: "Draconia has been waiting for Charms to end.", who: ["Draconia Malfoy"], expected: false, pick: true, scene: "s-thursday", ...changes });

  it("is shown the next Scene that matters, and its pick is that Scene, at its time, days away or not", async () => {
    const stretch = await ask({ stretch: { next } });
    expect(weaverPrompt(stretch).prompt).toContain('<next_scene_that_matters id="s-thursday" at="Day 9 10:00 (Thursday 10:00 am)" place="The corridor outside Charms" with="Draconia Malfoy">\nShe corners him about the seating plan.');
    const kept = checkWeave(stretch, answer({ happenings: [offer()] }));
    expect(kept.ok && kept.value.happenings[0]).toMatchObject({ at: "Day 9 10:00", pick: true, scene: "s-thursday" });
    expect(checkWeave(stretch, answer({ happenings: [offer({ scene: null })] }))).toMatchObject({ ok: false, problems: ["happenings: your pick is the next Scene that matters, s-thursday at Day 9 10:00; offer it, with scene \"s-thursday\" and pick true"] });
    expect(checkWeave(stretch, answer({ happenings: [offer({ at: "Day 9 11:00" })] }))).toMatchObject({ ok: false, problems: ["happenings: the next Scene that matters is at Day 9 10:00; give your pick that time"] });
  });

  it("does not offer the next Scene that matters again while it is on, and keeps any other Happening ordinary", async () => {
    const on = { id: "p-old", at: "Day 9 10:00", place: "The corridor outside Charms", what: "Draconia waits.", who: ["Draconia Malfoy"], expected: false, pick: true, scene: "s-thursday" };
    const stillOn = await ask({ stretch: { next }, stillOn: [on] });
    expect(weaverPrompt(stillOn).prompt).not.toContain("<next_scene_that_matters");
    const checked = checkWeave(stillOn, answer({ happenings: [offer(), offer({ id: "P2", at: "Day 4 20:00", place: "The Three Broomsticks", pick: false, scene: "s-other" })] }));
    expect(checked.ok && checked.value.happenings.map(item => [item.place, item.scene])).toEqual([["The Three Broomsticks", null]]);
    expect(checked.ok && checked.dropped).toEqual([
      "happenings: P1 is the next Scene that matters, which is on already; leave it out",
      "happenings: P2 names the Scene s-other, which is not the next Scene that matters; it is an ordinary Happening"
    ]);
  });
});

describe("Leads act off-screen (story-in-stretches design decision 4)", () => {
  const seating = { who: "Draconia Malfoy", move: "Has his name taken off the Charms seating plan.", scene: null };
  const made = { id: "H1", what: "Draconia had his name taken off the Charms seating plan.", at: "Day 4 06:00", where: "Flitwick's office", known_to: ["Draconia Malfoy", "Neville Longbottom"], landmark: null, move: "Draconia Malfoy" };

  it("is given each Lead's move still to make off-screen, and by when", async () => {
    const { prompt } = weaverPrompt(await ask({ stretch: { next: null, moves: [seating], movesBy: "Day 10 15:00" } }));
    expect(prompt).toContain('<lead_moves_offscreen by="Day 10 15:00 (Friday 3:00 pm)">\n- Draconia Malfoy: Has his name taken off the Charms seating plan.');
  });

  it("keeps a move made, marked with its Lead, and leaves the mark off anything else", async () => {
    const stretch = await ask({ stretch: { next: null, moves: [seating], movesBy: "Day 10 15:00" } });
    const checked = checkWeave(stretch, answer({ happened: [made, { ...made, id: "H2", what: "Hermione re-read her notes.", known_to: ["Hermione Granger"], move: "Hermione Granger" }], meanwhile: [] }));
    expect(checked.ok && checked.value.happened.map(item => item.move)).toEqual(["Draconia Malfoy", null]);
    // Set right, not left out (docs/adr/0012): the happening is kept, and nothing is asked again.
    expect(checked.ok && checked.dropped).toEqual([]);
  });

  // GIVEN no Lead has a move to make off-screen
  // WHEN the World's record marks Harry's evening in the common room as his move
  // THEN it is kept as an ordinary happening, and the World is not asked again
  it("living-world › Moments are remembered from one record › Set right, not asked again", async () => {
    const played = playable();
    const evening = { id: "H4", what: "Harry spent the evening in the common room with Ron.", at: "Day 3 22:30", where: "the Gryffindor common room", known_to: ["Harry Potter"], landmark: null, move: "Harry Potter" };
    const runner = new ScriptedRunner([{ answer: JSON.stringify(answer({ happened: [...answer().happened, evening] })) }]);
    const record = await writeWeave(new Models(played.mac.db, { claude: runner }), SONNET, await ask({ stretch: { next: null, moves: [], movesBy: null } }), "story", "trace-w", new AbortController().signal);
    expect(record.value.happened.find(item => item.what === evening.what)).toMatchObject({ move: null });
    expect(record.dropped).toEqual([]);
    expect(runner.requests).toHaveLength(1);
  });

  it("asks for every move still to make once the span reaches the Stretch's last Scene that matters, and keeps the rest without it", async () => {
    const due = await ask({ stretch: { next: null, moves: [seating], movesBy: "Day 4 07:00" } });
    expect(checkWeave(due, answer({ meanwhile: [] }))).toMatchObject({ ok: true, dropped: ["happened: Draconia Malfoy's move this Stretch is still to make, and the Stretch's last Scene that matters is here: make it now (Has his name taken off the Charms seating plan.), with move \"Draconia Malfoy\""] });
    const early = await ask({ stretch: { next: null, moves: [seating], movesBy: "Day 10 15:00" } });
    expect(checkWeave(early, answer({ meanwhile: [] }))).toMatchObject({ ok: true, dropped: [] });
  });
});

describe("what he missed keeps its time (play-check-fixes design decision 4)", () => {
  const trials = { id: "p-trials", at: "Day 4 06:00", place: "The library", what: "Draconia at the back table in the Charms stacks.", who: ["Draconia Malfoy"], expected: false, pick: true };

  // GIVEN Draconia's library Scene was on Sunday at 2:00 pm
  // WHEN the player skips to next week, and the World writes it going on without him on Saturday
  // THEN it went on on Sunday at 2:00 pm, in the library
  it("day-view › Missing something has consequences › What he missed keeps its time", async () => {
    const gap = await ask({ gap: true, missed: [trials] });
    const without = { id: "H9", what: "Draconia waited at the back table; he did not come.", at: "Day 3 23:00", where: "the Slytherin common room", known_to: ["Draconia Malfoy"], landmark: null, missed: "G1" };
    const checked = checkWeave(gap, answer({ happened: [without], meanwhile: [] }));
    expect(checked.ok && checked.value.happened[0]).toMatchObject({ at: "Day 4 06:00", where: "The library" });
    expect(checked.ok && checked.dropped).toEqual([]);
  });

  it("says the day of what he missed, so a span of days names the right one", async () => {
    const { prompt } = weaverPrompt(await ask({ gap: true, missed: [trials] }));
    expect(prompt).toContain("- G1 Saturday 6:00 am, The library:");
  });
});

describe("an Engagement carried by Meanwhile (engagements design decision 1)", () => {
  const note = { text: "A note under the door: \"My office, nine o'clock.\" M. McGonagall.", how: "seen", happened: "H2", told_by: null };
  const summons = { what: "McGonagall wants his account of the troll.", at: "Day 4 09:00", place: "McGonagall's office", who: ["mcgonagall"], expected: true, every: null };

  it("keeps the Engagement a line of Meanwhile carries, with names as the Story keeps them", async () => {
    const checked = checkWeave(await ask(), answer({ meanwhile: [{ ...note, engagement: summons }] }));
    expect(checked).toMatchObject({ ok: true, dropped: [] });
    expect(checked.ok && checked.value.meanwhile[0]!.engagement).toEqual({ id: expect.stringMatching(/^g-/), what: summons.what, at: "Day 4 09:00", place: "McGonagall's office", who: ["Minerva McGonagall"], expected: true, every: null });
    expect(weaverPrompt(await ask()).system).toContain("`engagement`");
  });

  it("is told the Engagements on, so it does not offer them again", async () => {
    const on = [{ engagement: { id: "g-1", what: "Draconia's hour in the library.", at: "Day 8 19:30", place: "The library", who: ["Draconia Malfoy"], expected: true, every: "week" as const }, next: "Day 8 19:30" }];
    expect(weaverPrompt(await ask({ engagementsOn: on })).prompt).toContain("<engagements_on>\n- Day 8 19:30 (every week), The library: Draconia's hour in the library. He is expected.\n</engagements_on>");
  });

  it("leaves out an Engagement before the span's end, and a name not in the Story, and keeps the line", async () => {
    const early = checkWeave(await ask(), answer({ meanwhile: [{ ...note, engagement: { ...summons, at: "Day 4 07:00" } }] }));
    expect(early).toMatchObject({ ok: true, dropped: ["meanwhile: item 1, engagement: it is at Day 4 07:00, before the span ends (Day 4 07:30); it is not ahead of him"] });
    expect(early.ok && early.value.meanwhile[0]).toMatchObject({ text: note.text });
    expect(early.ok && early.value.meanwhile[0]!.engagement).toBeUndefined();
    const stranger = checkWeave(await ask(), answer({ meanwhile: [{ ...note, engagement: { ...summons, who: ["Minerva McGonagall", "Gilderoy Lockhart"] } }] }));
    expect(stranger).toMatchObject({ ok: true, dropped: ["meanwhile: item 1, engagement, who: Gilderoy Lockhart is not in the story"] });
    expect(stranger.ok && stranger.value.meanwhile[0]!.engagement?.who).toEqual(["Minerva McGonagall"]);
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

  // GIVEN the World last stood at 7:40 am at Kalka, and a Scene at Barog opens at 9:05 am and ends with Ishaan still on the platform
  // WHEN the World moves on
  // THEN what happened at Barog happened at 9:05 am, as the Scene says
  // AND nothing that happened before 9:05 am is known to Ishaan, and nothing has him back on the train
  it("living-world › Only the player makes facts about the Player Character › The World moves on around him", async () => {
    const { prompt } = weaverPrompt(await ask({ from: "Day 3 20:00" }));
    expect(prompt).toMatch(/<scene_that_ended title="After curfew" place="The Gryffindor common room" from="Day 3 21:40 \(Friday 9:40 pm\)" until="Day 3 \d\d:\d\d \(Friday \d+:\d\d pm\)"/);
    expect(prompt).toMatch(/The Scene ran from Friday 9:40 pm to Friday \d+:\d\d pm: what happened in it happened then\./);
    expect(prompt).toMatch(/Before Friday 9:40 pm, Roopesh Gantasala was off-screen, and only the player says where he was and what he did/);
  });

  it("repairs a partly bad answer once, keeps its good parts when the repair is no better, and fails only when nothing is usable", async () => {
    const played = playable();
    const bad = { answer: JSON.stringify(answer({ lives: [{ who: "Roopesh Gantasala", where: "bed", doing: "sleeping", after: "x" }] })) };
    const repaired = new ScriptedRunner([bad, { answer: JSON.stringify(answer()) }]);
    const record = await writeWeave(new Models(played.mac.db, { claude: repaired }), SONNET, await ask(), "story", "trace-w", new AbortController().signal);
    expect(record.value.lives[0]!.who).toBe("Crabbe and Goyle");
    expect(record.dropped).toEqual([]);
    expect(repaired.requests[1]!.prompt).toMatch(/lives: Roopesh Gantasala is the player's character/);
    const twice = await writeWeave(new Models(played.mac.db, { claude: new ScriptedRunner([bad, bad]) }), SONNET, await ask(), "story", "trace-w", new AbortController().signal);
    expect(twice.value.lives).toEqual([]);
    expect(twice.value.happened).toHaveLength(3);
    expect(twice.dropped).toEqual([expect.stringMatching(/^lives: Roopesh Gantasala is the player's character/)]);
    const unusable = { answer: JSON.stringify({ lives: [] }) };
    await expect(writeWeave(new Models(played.mac.db, { claude: new ScriptedRunner([unusable, unusable]) }), SONNET, await ask(), "story", "trace-w", new AbortController().signal)).rejects.toThrow(WeaverFailed);
  });
});

describe("rest after a peak (openspec long-run: Rest is deliberate)", () => {
  const pick = (quiet: boolean | undefined) => ({ id: "P1", at: "Day 4 09:00", place: "the Great Hall", what: quiet ? "Breakfast, late, with nothing to do after." : "Draconia calls him out in front of Slytherin.", who: ["Hermione Granger"], expected: false, pick: true, ...(quiet === undefined ? {} : { quiet }) });

  it("is asked for when the Scene that ended peaked", async () => {
    expect(weaverPrompt(await ask({ afterPeak: true })).prompt).toContain("The Scene that ended peaked. Your pick is a quiet Happening, nothing at stake in it, with quiet true");
    expect(weaverPrompt(await ask()).prompt).not.toContain("peaked");
  });

  it("refuses a pick that is not quiet, or no pick at all, after a peak", async () => {
    const after = await ask({ afterPeak: true });
    expect(checkWeave(after, answer({ happenings: [pick(false)] }))).toMatchObject({ ok: false, problems: ["happenings: the Scene that ended peaked; make your pick a quiet Happening, nothing at stake in it, and set its quiet true"] });
    expect(checkWeave(after, answer({ happenings: [pick(undefined)] })).ok).toBe(false);
    expect(checkWeave(after, answer({ happenings: [] }))).toMatchObject({ ok: false, problems: ["happenings: the Scene that ended peaked; offer a quiet Happening as your pick, nothing at stake in it, with quiet true"] });
    const quiet = checkWeave(after, answer({ happenings: [pick(true)] }));
    expect(quiet.ok && quiet.value.happenings[0]).toMatchObject({ pick: true, quiet: true });
  });

  // GIVEN a Scene just peaked, and the Director's new Stretch is a rest whose next Scene that matters is a quiet
  //   breakfast on Monday
  // THEN the Story's own pick at the Day View is Monday's breakfast, and the World moves on at the first answer that
  //   offers it
  it("long-run › Rest is deliberate › The rest the Director planned", async () => {
    const breakfast = { id: "s-rest", at: "Day 6 08:00", place: "The Great Hall", who: ["Hermione Granger"], for: "A slow breakfast after the night before.", lead: null };
    const rest = await ask({ afterPeak: true, stretch: { next: breakfast, moves: [], movesBy: null } });
    // The Weaver is told only the one rule: the pick is the Scene the Director planned as the rest.
    expect(weaverPrompt(rest).prompt).not.toContain("The Scene that ended peaked");
    const offered = { id: "P1", at: "Day 6 08:00", place: "The Great Hall", what: "Breakfast, late, with Hermione.", who: ["Hermione Granger"], expected: false, pick: true, scene: "s-rest" };
    const checked = checkWeave(rest, answer({ happenings: [offered] }));
    expect(checked.ok).toBe(true);
    expect(checked.ok && checked.value.happenings[0]).toMatchObject({ pick: true, scene: "s-rest", quiet: true });
  });

  it("leaves the pick to the Weaver when nothing peaked", async () => {
    expect(checkWeave(await ask(), answer({ happenings: [pick(false)] })).ok).toBe(true);
  });
});


describe("who a line of Meanwhile is about (the-world-screen: what he has heard)", () => {
  const withAbout = (about: unknown) => answer({ meanwhile: [{ text: "A note under the door: \"My office, nine o'clock.\" M. McGonagall.", how: "seen", happened: "H2", told_by: null, ...(about === undefined ? {} : { about }) }] });

  it("is asked for, and kept with the line in the Story's names", async () => {
    expect(weaverPrompt(await ask()).system).toContain("`about`");
    const checked = checkWeave(await ask(), withAbout(["mcgonagall"]));
    expect(checked.ok && checked.value.meanwhile[0]!.about).toEqual(["Minerva McGonagall"]);
  });

  it("leaves out someone not in the Story, or the Player Character, from about, and keeps the line", async () => {
    const stranger = checkWeave(await ask(), withAbout(["Gilderoy Lockhart", "mcgonagall"]));
    expect(stranger).toMatchObject({ ok: true, dropped: ["meanwhile: item 1, about: Gilderoy Lockhart is not in the story"] });
    expect(stranger.ok && stranger.value.meanwhile[0]!.about).toEqual(["Minerva McGonagall"]);
    const himself = checkWeave(await ask(), withAbout(["Roopesh Gantasala"]));
    expect(himself).toMatchObject({ ok: true, dropped: ["meanwhile: item 1, about: Roopesh Gantasala is the player's character; say who else it is about"] });
  });

  it("takes a line without about, as the Weaver wrote them before", async () => {
    const checked = checkWeave(await ask(), withAbout(undefined));
    expect(checked.ok && checked.value.meanwhile[0]!.about).toBeUndefined();
  });
});
