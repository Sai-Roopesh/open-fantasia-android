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

  it("names every rule an answer breaks", () => {
    const checked = checkChronicle(ask(), answer({
      summary: null,
      moments: [
        { what: "Meera offers biscuits.", quotes: [{ entry: "E3", text: "She offers him every biscuit she has." }], there: ["Meera Kulkarni"], weight: 2 },
        { what: "Ishaan tells Bhalla it was a joke.", quotes: [{ entry: "E5", text: "Ishaan tells him it was a joke." }], there: ["Uncle Bhalla", "Ishaan Mehra", "The Conductor"], weight: 2 },
        { what: "Ishaan takes a biscuit.", quotes: [{ entry: "E9", text: "I take one." }], there: [], weight: 1 }
      ],
      told: [{ moment: "M4", to: ["Meera Kulkarni"], entry: "E5" }]
    }));
    expect(checked.ok).toBe(false);
    expect(checked.ok ? [] : checked.problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/^summary: the Scene has ended/),
      expect.stringMatching(/^moments: moment 1, quote 1 is not word for word in E3/),
      expect.stringMatching(/^moments: moment 2, quote 1 is from a Reply and decides for the player's character/),
      expect.stringMatching(/^moments: moment 2, what says what the player's character did/),
      expect.stringMatching(/^moments: moment 2, there: Ishaan Mehra is the player's character/),
      expect.stringMatching(/^moments: moment 2, there: The Conductor is not in the story/),
      expect.stringMatching(/^moments: moment 3, quote 1 names E9, which is not an entry here/),
      expect.stringMatching(/^told: M4 is not a Moment you were shown/)
    ]));
  });

  it("writes where a Scene still being played stands so far, and records nothing from entries already recorded", () => {
    const checked = checkChronicle(ask({ sceneEnded: false, recordFrom: 3 }), answer({ summary: null }));
    expect(checked.ok ? [] : checked.problems).toEqual(expect.arrayContaining([
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

  it("repairs a refused answer once, and fails with its reasons when the repair is refused too", async () => {
    const { mac } = nightTrain();
    const bad = { answer: JSON.stringify(answer({ summary: null })) };
    const runner = new ScriptedRunner([bad, { answer: JSON.stringify(answer()) }]);
    const record = await writeChronicle(new Models(mac.db, { claude: runner }), SONNET, ask(), "story", "trace-c", new AbortController().signal);
    expect(record.value.summary).toMatch(/^On the night train/);
    expect(runner.requests[1]!.prompt).toMatch(/summary: the Scene has ended/);

    const failing = new ScriptedRunner([bad, bad]);
    const failure = await writeChronicle(new Models(mac.db, { claude: failing }), SONNET, ask(), "story", "trace-c", new AbortController().signal).then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(ChroniclerFailed);
  });
});
