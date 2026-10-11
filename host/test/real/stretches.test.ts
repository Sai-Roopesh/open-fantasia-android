import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Engine } from "../../src/engine/engine.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { Models, type ModelRunner } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { isKind } from "../../src/story/entries.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { parseStoryTime } from "../../src/time.js";
import { sceneView } from "../../src/views/scene.js";
import { freshHome } from "../support/host.js";

// Story-in-stretches task 5.1: a month of The Malfoy Problem from Freshers' Friday, choosing the Story's pick each time.
// The real Writer frames each Scene, the real Director plans each Stretch and the real Weaver moves the World; the Actor
// and the Chronicler are scripted, one line each, to keep the quota spent on what this checks (the Chronicler's
// paragraph for The Story So Far is what the Writer framed the Scene for). A judge reads the plans.
// It runs only with `npm run test:real`, spends quota and takes a long while.
const token = readSecret(CLAUDE_TOKEN);
const MALFOY = fileURLToPath(new URL("../../../examples/malfoy-problem", import.meta.url));
const MOVES = ["I go along with it, and watch who is watching me.", "I keep my head down and listen.", "I say as little as I can get away with."];

describe.skipIf(!token)("a month of Stretches, live", () => {
  it("covers four weeks in under twenty Scenes, with Draconia acting every Stretch and nothing declared", async () => {
    const mac = freshHome();
    const imported = importStoryFile(MALFOY, mac);
    if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported.problems)}`);
    const storyId = imported.storyId;
    const head = () => mac.tree.currentPath(storyId)!.headEntryId;
    const claude = new ClaudeRunner(mac.home, () => token);
    const scripted: Record<string, ModelRunner> = {
      actor: new ScriptedRunner([], () => ({ answer: "The room goes on around him; nobody says what they mean." })),
      chronicler: new ScriptedRunner([], () => {
        const scene = mac.states.at(head()).scene;
        const said = `${scene?.title ?? "A Scene"}: ${scene?.purpose ?? "it passed"}`;
        return { answer: JSON.stringify({ summary: said, paragraph: said, moments: [], told: [], known: [], bonds: [], engagements: [], changed: [] }) };
      })
    };
    const engine = new Engine(mac, new Models(mac.db, { claude: { run: (request, onText, signal) => (scripted[request.agent] ?? claude).run(request, onText, signal) } }));
    const day = () => parseStoryTime(mac.states.at(head()).clock)?.day ?? 0;
    const start = day();
    let scenes = 0;
    try {
      // Freshers' Friday, as the Story File opens it.
      engine.move(storyId, MOVES[0]!, head(), "month-0");
      await engine.settled(storyId);
      while (scenes < 20 && day() - start < 28) {
        scenes += 1;
        engine.endScene(storyId, head(), `month-end-${scenes}`);
        await engine.ended(storyId);
        const dayView = sceneView(mac, engine, storyId, "month").day_view;
        if (!dayView || dayView.scene_end.step !== null || dayView.scene_end.failed !== null) throw new Error(`Scene ${scenes}'s end did not finish: ${JSON.stringify(dayView?.scene_end)}`);
        const pick = dayView.happenings.find(item => item.pick);
        if (pick) engine.choose(storyId, { after: head(), kind: "story", gap: null }, `month-pick-${scenes}`);
        else engine.choose(storyId, { after: head(), kind: "skip", at: dayView.choices.skips.find(skip => skip.label === "Tomorrow")!.at, gap: null }, `month-skip-${scenes}`);
        await engine.settled(storyId);
        engine.move(storyId, MOVES[scenes % MOVES.length]!, head(), `month-move-${scenes}`);
        await engine.settled(storyId);
      }
    } finally {
      claude.close();
    }
    const onPath = mac.tree.pathTo(head());
    const plans = onPath.filter(entry => isKind(entry, "director_plan"));
    const report = plans.map(plan => `Day ${plan.payload.from}–${plan.payload.until} (${plan.payload.phase}): ${plan.payload.scenes.map(scene => `${scene.at} ${scene.place}: ${scene.for}`).join(" | ")}\n  Draconia: ${plan.payload.leads.find(lead => lead.who === "Draconia Malfoy")?.move}\n  Arc next: ${plan.payload.arcs.map(arc => arc.next).join(" / ")}\n  Roadmap: ${plan.payload.roadmap.map(point => `${point.by}: ${point.stands}`).join(" / ")}`).join("\n");
    console.log(`${scenes} Scenes, Day ${start} to Day ${day()}\n${report}`);

    // Four weeks in under twenty Scenes.
    expect(day() - start, report).toBeGreaterThanOrEqual(28);
    expect(scenes, report).toBeLessThan(20);

    // Draconia acts in every Stretch that has run its course: on screen in a Scene that matters, or off-screen in the World.
    const worlds = onPath.filter(entry => isKind(entry, "world_moved"));
    for (const [index, plan] of plans.slice(0, -1).entries()) {
      const move = plan.payload.leads.find(lead => lead.who === "Draconia Malfoy");
      expect(move, `Stretch ${index + 1} has no move for Draconia\n${report}`).toBeDefined();
      if (move?.scene) continue;
      const later = plans[index + 1]!.seq;
      const made = worlds.some(world => world.seq > plan.seq && world.seq < later && world.payload.happened.some(item => item.move === "Draconia Malfoy"));
      expect(made, `Stretch ${index + 1}: Draconia's off-screen move was never made\n${report}`).toBe(true);
    }

    // A slow burn: nothing in the month's plans declares anything.
    const declared = await judge("These are an author's weekly plans for the first month of a four-year enemies-to-lovers romance between Draconia Malfoy and Roopesh. Does any plan have Draconia confess or declare romantic feelings, kiss him, or have them become a couple? Answer YES or NO.", report);
    expect(declared.yes, `${declared.said}\n${report}`).toBe(false);
  }, 3 * 60 * 60 * 1000);
});

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
