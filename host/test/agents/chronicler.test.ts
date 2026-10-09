import { describe, expect, it } from "vitest";
import { checkChronicle, chroniclerPrompt, ChroniclerFailed, writeChronicle, type ChronicleAsk } from "../../src/agents/chronicler.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import type { Entry, Payload } from "../../src/story/entries.js";
import { nightTrain } from "../support/stories.js";

const SONNET = { provider: "claude", model: "claude-sonnet-5-5" } as const;

let seq = 0;
function entry(payload: Payload): Entry {
  seq += 1;
  return { seq, id: `entry-${seq}`, storyId: "s", parentId: null, payload, createdAt: "2026-10-05T00:00:00Z" };
}

/** A Night Train Scene: the opening, then three exchanges. E1 is the opening, E2 the first Move, and so on. */
function scene() {
  seq = 0;
  const { state } = nightTrain();
  const entries = [
    entry({ kind: "scene_opened", number: 1, title: "The wrong berth", place: "The sleeper bay", at: "Day 1 22:40", who: ["Meera Kulkarni", "Uncle Bhalla"], prose: "\"You're in my seat,\" she says.", startsAt: null, purpose: null, exit: null }),
    entry({ kind: "move", text: "I tell her I'm going to Shimla for an interview I don't want, and that I haven't told anyone that part." }),
    entry({ kind: "reply", text: "Meera takes out a packet of Parle-G gone soft at the corners and holds it out. “For the tea,” she says. That's all.", callId: "c", model: state.actor }),
    entry({ kind: "move", text: "I take one." }),
    entry({ kind: "reply", text: "\"You told me at Panipat you hate trains,\" Bhalla says. Ishaan tells him it was a joke. Meera laughs into her collar.", callId: "c", model: state.actor })
  ];
  return { state, entries };
}

function ask(changes: Partial<ChronicleAsk> = {}): ChronicleAsk {
  const { state, entries } = scene();
  return { state, scene: { title: "The wrong berth", place: "The sleeper bay", at: "Day 1 22:40" }, entries, recordFrom: 0, sceneEnded: true, inScene: ["Meera Kulkarni", "Uncle Bhalla"], known: [], ...changes };
}

function answer(changes: Record<string, unknown> = {}) {
  return {
    summary: "On the night train, Ishaan gave up the window seat and told Meera the truth about the interview; she gave him biscuits for the tea.",
    moments: [{
      what: "Ishaan tells Meera the interview is one he doesn't want; she answers with biscuits.",
      quotes: [
        { entry: "E2", text: "I tell her I'm going to Shimla for an interview I don't want" },
        { entry: "E3", text: "\"For the tea,\" she says. That's all." }
      ],
      there: ["Meera"],
      weight: 3
    }],
    told: [],
    ...changes
  };
}

describe("the Chronicler's answer", () => {
  it("is taken when it keeps every rule: quotes word for word, stored as the entry has them, names as the Story keeps them", () => {
    const checked = checkChronicle(ask(), answer());
    expect(checked.ok).toBe(true);
    const record = checked.ok ? checked.value : null;
    expect(record!.moments[0]).toMatchObject({
      there: ["Meera Kulkarni"],
      weight: 3,
      quotes: [{ entry: "entry-2", text: "I tell her I'm going to Shimla for an interview I don't want" }, { entry: "entry-3", text: "“For the tea,” she says. That's all." }]
    });
    expect(record!.moments[0]!.id).toMatch(/\w{8}/);
    expect(record!.summary).toMatch(/^On the night train/);
  });

  // Records degrade, never vanish (openspec living-world, lasting-records): every rule broken is named, and only the
  // parts that break one are left out.
  it("names every rule an answer breaks, and leaves out only the parts that break one", () => {
    const checked = checkChronicle(ask(), answer({
      summary: null,
      moments: [
        { what: "Meera offers biscuits.", quotes: [{ entry: "E3", text: "She offers him every biscuit she has." }], there: ["Meera Kulkarni"], weight: 2 },
        { what: "Ishaan tells Bhalla it was a joke.", quotes: [{ entry: "E5", text: "Ishaan tells him it was a joke." }], there: ["Uncle Bhalla", "Ishaan Mehra", "The Conductor"], weight: 2 },
        { what: "Ishaan takes a biscuit.", quotes: [{ entry: "E9", text: "I take one." }], there: [], weight: 1 }
      ],
      told: [{ moment: "M4", to: ["Meera Kulkarni"], entry: "E5" }]
    }));
    expect(checked.ok).toBe(true);
    expect(checked.ok ? checked.value : null).toMatchObject({ summary: null, moments: [], told: [] });
    expect(checked.ok ? checked.dropped : []).toEqual(expect.arrayContaining([
      expect.stringMatching(/^summary: the Scene has ended/),
      expect.stringMatching(/^moments: moment 1, quote 1 is not word for word in E3/),
      expect.stringMatching(/^moments: moment 2, quote 1 is from a Reply and decides for the player's character/),
      expect.stringMatching(/^moments: moment 2 has no quote that could be kept/),
      expect.stringMatching(/^moments: moment 3, quote 1 names E9, which is not an entry here/),
      expect.stringMatching(/^told: M4 is not a Moment you were shown/)
    ]));
  });

  it("writes where a Scene still being played stands so far, and records nothing from entries already recorded", () => {
    const checked = checkChronicle(ask({ sceneEnded: false, recordFrom: 3 }), answer({ summary: null }));
    expect(checked.ok ? checked.dropped : []).toEqual(expect.arrayContaining([
      expect.stringMatching(/^summary: the Scene goes on; write where it stands so far/),
      expect.stringMatching(/^moments: moment 1, quote 1 is from E2, which was recorded already/)
    ]));
    const soFar = "Ishaan gave up the window seat and told Meera about the interview; she answered with biscuits.";
    expect(checkChronicle(ask({ sceneEnded: false }), answer({ summary: soFar }))).toMatchObject({ ok: true, value: { summary: soFar } });
  });

  it("records who was told an earlier Moment", () => {
    const told = ask({ known: [{ id: "moment-station", what: "Ishaan pulled Meera back from the platform's edge.", quotes: [{ entry: "old", text: "He pulls her back." }] }] });
    const checked = checkChronicle(told, answer({ told: [{ moment: "M1", to: ["Uncle Bhalla"], entry: "E5" }] }));
    expect(checked).toMatchObject({ ok: true, value: { told: [{ moment: "moment-station", to: ["Uncle Bhalla"], entry: "entry-5" }] } });
  });

  it("is refused when it does not match the schema", () => {
    const checked = checkChronicle(ask(), { summary: "x" });
    expect(checked.ok).toBe(false);
  });
});

describe("the Chronicler's call", () => {
  it("labels the entries, marks the ones already recorded, and lists the Moments known here", () => {
    const { system, prompt } = chroniclerPrompt(ask({ recordFrom: 3, known: [{ id: "m", what: "The station.", quotes: [{ entry: "old", text: "He pulls her back." }] }] }));
    expect(system).toContain("# The Chronicler");
    expect(prompt).toMatch(/<entry label="E2" kind="move" by="Ishaan Mehra" recorded="yes">/);
    expect(prompt).toMatch(/<entry label="E4" kind="move" by="Ishaan Mehra">/);
    expect(prompt).toMatch(/<moment id="M1">/);
    expect(prompt).toMatch(/The Scene has ended: write its summary\./);
    expect(chroniclerPrompt(ask({ sceneEnded: false })).prompt).toMatch(/The Scene goes on: write where it stands so far\./);
  });

  it("repairs an answer that left a part out once, and fails with its reasons only when no answer is usable", async () => {
    const { mac } = nightTrain();
    const partly = { answer: JSON.stringify(answer({ summary: null })) };
    const runner = new ScriptedRunner([partly, { answer: JSON.stringify(answer()) }]);
    const record = await writeChronicle(new Models(mac.db, { claude: runner }), SONNET, ask(), "story", "trace-c", new AbortController().signal);
    expect(record.value.summary).toMatch(/^On the night train/);
    expect(record.dropped).toEqual([]);
    expect(runner.requests[1]!.prompt).toMatch(/summary: the Scene has ended/);

    const bad = { answer: JSON.stringify({ summary: "x" }) };
    const failing = new ScriptedRunner([bad, bad]);
    const failure = await writeChronicle(new Models(mac.db, { claude: failing }), SONNET, ask(), "story", "trace-c", new AbortController().signal).then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(ChroniclerFailed);
  });
});

describe("what the Player Character knows of the people in the Scene (openspec outside-the-scene)", () => {
  const knownBefore = { "Meera Kulkarni": "A biologist going to Kalka; she wanted the window seat.", "Uncle Bhalla": null };

  it("is asked of each person in the Scene, with what he knew of them before", () => {
    const { prompt } = chroniclerPrompt(ask({ knownBefore }));
    expect(prompt).toContain("<what_he_knows>");
    expect(prompt).toContain("- Meera Kulkarni: A biologist going to Kalka; she wanted the window seat.");
    expect(prompt).toContain("- Uncle Bhalla: nothing yet");
    expect(prompt).toContain("For each person in the Scene whose line it changes, write in known what Ishaan Mehra now knows of them");
  });

  it("keeps a line for someone in the Scene, named as the Story names them", () => {
    const checked = checkChronicle(ask({ knownBefore }), answer({ known: [{ who: "meera", now: "A biologist counting birds near Kalka. She gave up the window seat and pretended not to mind." }] }));
    expect(checked.ok && checked.value.known).toEqual([{ who: "Meera Kulkarni", now: "A biologist counting birds near Kalka. She gave up the window seat and pretended not to mind." }]);
  });

  it("takes an answer with no lines: nothing he knows changed", () => {
    const checked = checkChronicle(ask({ knownBefore }), answer());
    expect(checked.ok && checked.value.known).toEqual([]);
  });

  it("leaves out a line for someone not in the Scene, for the Player Character, two for one person, or one too long", () => {
    const problems = (known: unknown) => { const checked = checkChronicle(ask({ knownBefore }), answer({ known })); return checked.ok ? checked.dropped ?? [] : checked.problems; };
    expect(problems([{ who: "Ishaan Mehra", now: "Himself." }])).toEqual(["known: Ishaan Mehra is the player's character, who is always there; leave them out"]);
    expect(problems([{ who: "Meera Kulkarni", now: "A." }, { who: "Meera", now: "B." }])).toEqual(["known: two lines for Meera Kulkarni; write one"]);
    expect(problems([{ who: "Meera Kulkarni", now: "word ".repeat(100) }])).toEqual(["known: the line for Meera Kulkarni is 100 words; say it in sixty or fewer"]);
    const notThere = ask({ knownBefore, inScene: ["Uncle Bhalla"] });
    const checked = checkChronicle(notThere, answer({ known: [{ who: "Meera Kulkarni", now: "A." }] }));
    expect(checked.ok ? checked.dropped : []).toContain("known: Meera Kulkarni was not in this Scene");
  });
});
