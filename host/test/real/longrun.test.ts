import { describe, expect, it } from "vitest";
import { Engine } from "../../src/engine/engine.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { fakeWeaveAnswer } from "../../src/models/fake.js";
import { Models, type ModelRunner } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { freshHome } from "../support/host.js";
import { malfoyProblemStoryFile, writeStoryFile } from "../support/story-files.js";

// The long run, played as Scene openings: the real Writer frames each Scene from an open Move at the Day View, and the
// real Director plans between them; the Actor, the Chronicler and the Weaver are scripted, and a Scene's record (its
// line and its paragraph of The Story So Far) is its purpose (the-director design decision 7). A judge reads what came of it. They run only with `npm run test:real`:
// each plays many Scenes, spends quota and takes minutes.
const token = readSecret(CLAUDE_TOKEN);
const OPEN_MOVES = ["The next day.", "Later that week.", "The following morning.", "That evening.", "A few days later."];

interface Played { title: string; purpose: string }

/** Plays [count] Scenes of The Malfoy Problem, each ended after its opening, and returns what each was for. */
async function season(count: number): Promise<{ scenes: Played[]; arcNow: string | null }> {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(malfoyProblemStoryFile()), mac);
  if (!imported.ok) throw new Error("import failed");
  const storyId = imported.storyId;
  const head = () => mac.tree.currentPath(storyId)!.headEntryId;
  const claude = new ClaudeRunner(mac.home, () => token);
  const scripted: Record<string, ModelRunner> = {
    actor: new ScriptedRunner([], () => ({ answer: "She looks at him, and the moment passes." })),
    // What the Chronicler says of a Scene is what the Writer framed it for.
    chronicler: new ScriptedRunner([], () => {
      const scene = mac.states.at(head()).scene;
      const said = `${scene?.title ?? "A Scene"}: ${scene?.purpose ?? "it passed"}`;
      return { answer: JSON.stringify({ summary: said, paragraph: said, moments: [], told: [], known: [], bonds: [], engagements: [], changed: [] }) };
    }),
    weaver: new ScriptedRunner([], fakeWeaveAnswer)
  };
  const engine = new Engine(mac, new Models(mac.db, { claude: { run: (request, onText, signal) => (scripted[request.agent] ?? claude).run(request, onText, signal) } }));
  const scenes: Played[] = [];
  try {
    for (let index = 0; index < count; index++) {
      engine.move(storyId, index === 0 ? "I hold her stare and say nothing." : OPEN_MOVES[index % OPEN_MOVES.length]!, head(), `season-${index}`);
      await engine.settled(storyId);
      const scene = mac.states.at(head()).scene;
      if (!scene?.purpose) throw new Error(`Scene ${index + 1} was not framed: ${JSON.stringify(engine.turnState(storyId))}`);
      scenes.push({ title: scene.title, purpose: scene.purpose });
      engine.endScene(storyId, head(), `season-end-${index}`);
      await engine.ended(storyId);
      const failed = engine.sceneEndOf(storyId).failed;
      if (failed) throw new Error(`Scene ${index + 1}'s end stopped at the ${failed.step}: ${failed.reason}`);
    }
    return { scenes, arcNow: mac.states.at(head()).plan?.arcs[0]?.now ?? null };
  } finally {
    claude.close();
  }
}

async function judge(question: string, passage: string): Promise<{ yes: boolean; said: string }> {
  const mac = freshHome();
  const runner = new ClaudeRunner(mac.home, () => token);
  const answer = await new Models(mac.db, { claude: runner }).call({
    agent: "judge",
    model: { provider: "claude", model: "claude-sonnet-5-5" },
    system: "You judge an author's plan for a story. Answer YES or NO first, then quote the exact words that decided it.",
    prompt: `<passage>\n${passage}\n</passage>\n\n${question}`,
    traceId: "judge",
    storyId: null
  });
  runner.close();
  return { yes: /^\W*YES\b/i.test(answer.text), said: answer.text };
}

describe.skipIf(!token)("the long run, live", () => {
  // GIVEN the Premise is an enemies-to-lovers romance with Draconia
  // WHEN ten Scenes are played
  // THEN several of them move what is between Draconia and the Player Character, and the others are not about her
  it("long-run › The Premise is what the Story serves › The Premise keeps returning", async () => {
    const { scenes } = await season(10);
    const verdicts = await Promise.all(scenes.map(scene => judge(
      "Is this Scene about what is between Draconia Malfoy and Roopesh: does it move their rivalry, or what is growing between them? Answer YES or NO.",
      `${scene.title}: ${scene.purpose}`)));
    const about = verdicts.filter(verdict => verdict.yes).length;
    const said = scenes.map((scene, index) => `${verdicts[index]!.yes ? "Draconia" : "other"} | ${scene.title}: ${scene.purpose}`).join("\n");
    expect(about, said).toBeGreaterThanOrEqual(3);
    expect(10 - about, said).toBeGreaterThanOrEqual(2);
  }, 1_800_000);

  // GIVEN the Arc "Draconia comes round to Roopesh, slowly, against everything she was raised to be"
  // WHEN twenty Scenes have passed
  // THEN she has moved from insults toward slips and jealousy, and has not jumped ahead to declaring anything
  it("long-run › Arcs are built toward, never resolved on a schedule › A slow burn stays slow", async () => {
    const { scenes, arcNow } = await season(20);
    const story = scenes.map((scene, index) => `Scene ${index + 1}, ${scene.title}: ${scene.purpose}`).join("\n") + `\n\nWhere the Arc stands now: ${arcNow ?? "not said"}`;
    const moved = await judge("Over these Scenes, has Draconia moved on from only insulting Roopesh, toward slips, grudging kindness, jealousy or tension she will not name? Answer YES or NO.", story);
    expect(moved.yes, `${moved.said}\n\n${story}`).toBe(true);
    const declared = await judge("Does Draconia, in any of these Scenes, declare her feelings, confess love or desire, kiss Roopesh, or become his partner? Answer YES or NO.", story);
    expect(declared.yes, `${declared.said}\n\n${story}`).toBe(false);
  }, 3_600_000);
});
