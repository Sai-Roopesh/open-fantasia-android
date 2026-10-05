import { describe, expect, it } from "vitest";
import { writeWeave } from "../../src/agents/weaver.js";
import { Engine } from "../../src/engine/engine.js";
import { dueWeave, weaveAsk } from "../../src/engine/weaving.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { DEFAULT_JOB_MODELS } from "../../src/models/jobs.js";
import { FakeModels } from "../../src/models/fake.js";
import { Models, type ModelRunner } from "../../src/models/model-call.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { sceneView } from "../../src/views/scene.js";
import { freshHome } from "../support/host.js";
import { hogwartsWorldStoryFile, writeStoryFile } from "../support/story-files.js";

// These call the real Weaver, Writer and Actor through the player's Claude subscription, and a judge. They run only
// with `npm run test:real`.
const token = readSecret(CLAUDE_TOKEN);
const RUNS = 3;

/** A Story on [runners] (real Claude unless a job is scripted), with the common room after curfew played and ended. */
function afterCurfew(story: StoryFile, runners: (claude: ModelRunner) => ModelRunner = claude => claude) {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(story), mac);
  if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported.problems)}`);
  const claude = new ClaudeRunner(mac.home, () => token);
  const models = new Models(mac.db, { claude: runners(claude) });
  const engine = new Engine(mac, models);
  const storyId = imported.storyId;
  const head = () => mac.tree.currentPath(storyId)!.headEntryId;
  const path = mac.tree.currentPath(storyId)!;
  let at = path.headEntryId;
  for (const [move, reply] of [
    ["I sit at the other end of the sofa.", "Hermione does not look up from her book. \"McGonagall wants everyone who saw the troll in her office at nine tomorrow,\" she says. \"Including you. She said so at dinner.\""],
    ["I say goodnight and go up to bed.", "\"Nine,\" Hermione says to the book. \"Don't be late.\""]
  ] as [string, string][]) {
    const moved = mac.tree.append(storyId, at, { kind: "move", text: move });
    const replied = mac.tree.append(storyId, moved.id, { kind: "reply", text: reply, callId: "written-by-the-test", model: { provider: "claude", model: "written-by-the-test" } });
    mac.tree.moveHead(path.id, at, replied.id);
    at = replied.id;
  }
  engine.endScene(storyId, at, "real-end");
  const view = () => sceneView(mac, engine, storyId, "real");
  return { mac, claude, models, engine, storyId, head, view, close: () => claude.close() };
}

async function judge(question: string, passage: string): Promise<{ yes: boolean; said: string }> {
  const mac = freshHome();
  const runner = new ClaudeRunner(mac.home, () => token);
  const answer = await new Models(mac.db, { claude: runner }).call({
    agent: "judge", model: { provider: "claude", model: "claude-sonnet-5-5" },
    system: "You judge a passage. Answer YES or NO first, then quote the exact words that decided it.",
    prompt: `<passage>\n${passage}\n</passage>\n\n${question}`, traceId: "judge", storyId: null
  });
  runner.close();
  return { yes: /^\W*YES\b/i.test(answer.text), said: answer.text };
}

const story = () => hogwartsWorldStoryFile({ title: "After curfew", place: "The Gryffindor common room", at: "Day 3 22:40", who: ["Hermione Granger"] });

describe.skipIf(!token)("where to be, on Claude", () => {
  it("offers at most four Happenings from the Day View on, the summons expected and the pick first, each one that could happen", async () => {
    for (let run = 0; run < RUNS; run++) {
      const played = afterCurfew(story());
      try {
        const { value } = await writeWeave(played.models, DEFAULT_JOB_MODELS.weaver, weaveAsk(played.mac, dueWeave(played.mac, played.head())!), played.storyId, "real-today", new AbortController().signal);
        const shown = JSON.stringify(value.happenings, null, 2);
        expect(value.happenings.length, `run ${run + 1}: ${shown}`).toBeGreaterThan(0);
        expect(value.happenings.length, `run ${run + 1}`).toBeLessThanOrEqual(4);
        expect(value.happenings[0]!.pick, `run ${run + 1}: ${shown}`).toBe(true);
        expect(value.happenings.some(item => item.expected && item.who.includes("Minerva McGonagall")), `run ${run + 1}: ${shown}`).toBe(true);
        const verdict = await judge("The passage lists things going on at Hogwarts tomorrow that a first-year could go to, each with a time, a place and who will be there. Could every one of them plausibly happen at that time and place with those people? Answer YES or NO.", shown);
        expect(verdict.yes, `run ${run + 1}: ${verdict.said}\n${shown}`).toBe(true);
      } finally {
        played.close();
      }
    }
  });

  // GIVEN the Player Character skipped McGonagall's 9:00 summons
  // WHEN he next meets McGonagall
  // THEN she knows he did not come, and acts on it
  it("day-view › Missing something has consequences › McGonagall answers the absence", async () => {
    const summons = { id: "P1", at: "Day 4 09:00", place: "McGonagall's office", what: "Accounts of the troll from everyone who saw it.", who: ["Minerva McGonagall", "Hermione Granger"], expected: true, pick: true };
    for (let run = 0; run < RUNS; run++) {
      // Saturday morning is scripted, so the summons is on; the Gap, the Writer and the Actor are Claude's.
      const scripted = new FakeModels({ weaver: [{ answer: JSON.stringify({ lives: [], threads: [], happened: [], meanwhile: [], happenings: [summons] }) }] });
      let first = true;
      const played = afterCurfew(story(), claude => ({
        run: (request, onText, signal) => (request.agent === "weaver" && first ? ((first = false), scripted.run(request, onText, signal)) : claude.run(request, onText, signal))
      }));
      try {
        await played.engine.woven(played.storyId);
        const skip = played.view().day_view!.choices.skips.find(item => item.label === "This evening")!;
        played.engine.choose(played.storyId, { after: played.head(), kind: "skip", at: skip.at, gap: null }, "real-skip");
        await played.engine.settled(played.storyId);
        // The meeting itself is the Move: he knocks, and she is there.
        played.engine.move(played.storyId, "Before dinner I knock on Professor McGonagall's office door, and she tells me to come in.", played.head(), "real-office");
        await played.engine.settled(played.storyId);
        const reply = played.view().exchanges.at(-1)?.reply?.text ?? "";
        expect(reply, played.view().turn.reason ?? "no Reply").not.toBe("");
        const verdict = await judge("Roopesh was summoned to Professor McGonagall's office at nine this morning, with everyone who saw the troll, and he did not go. Does this passage show McGonagall knowing he did not come, and acting on it (in what she says or does)? Answer YES or NO.", reply);
        expect(verdict.yes, `run ${run + 1}: ${verdict.said}\n---\n${reply}`).toBe(true);
      } finally {
        played.close();
      }
    }
  });
});
