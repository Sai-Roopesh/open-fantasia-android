import { describe, expect, it } from "vitest";
import { writePlan } from "../../src/agents/director.js";
import { directionDue } from "../../src/engine/directing.js";
import { Engine } from "../../src/engine/engine.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { DEFAULT_JOB_MODELS } from "../../src/models/jobs.js";
import { Models } from "../../src/models/model-call.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { freshHome } from "../support/host.js";
import { malfoyProblemStoryFile, writeStoryFile } from "../support/story-files.js";

// director-knows-the-people task 1.2: the real Director, given the Story's people, names no one else. It runs only
// with `npm run test:real`.
const token = readSecret(CLAUDE_TOKEN);

/** The Story's first plan, after its opening Scene, and what its check left out. */
async function firstPlan(): Promise<string[]> {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(malfoyProblemStoryFile()), mac);
  if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported.problems)}`);
  const runner = new ClaudeRunner(mac.home, () => token);
  const models = new Models(mac.db, { claude: runner });
  const path = mac.tree.currentPath(imported.storyId)!;
  new Engine(mac, models).endScene(imported.storyId, path.headEntryId, "real-end");
  const head = mac.tree.currentPath(imported.storyId)!.headEntryId;
  try {
    const due = directionDue(mac, head, null);
    if (!due) throw new Error("no plan was due after the first Scene");
    const plan = await writePlan(models, DEFAULT_JOB_MODELS.director, due.ask, imported.storyId, "real-plan", new AbortController().signal);
    // What the first answer left out, whether or not its repair was kept: a refused first answer shows on its call.
    const refused = mac.db.prepare("select error from calls where agent = 'director' and error is not null").all() as { error: string }[];
    return [...plan.dropped, ...refused.map(row => row.error)];
  } finally {
    runner.close();
  }
}

describe.skipIf(!token)("the real Director names only the Story's people", () => {
  // GIVEN the Story has no librarian among its people
  // WHEN the Director plans a Scene that matters in the library
  // THEN everyone the Scene names is one of the Story's people, and the plan is not sent back for a name
  it("long-run › The Director shapes the long run around Arcs and Landmarks › Only the Story's people", async () => {
    const runs: string[][] = [];
    for (let run = 0; run < 3; run++) runs.push(await firstPlan());
    const named = runs.filter(left => !left.some(reason => /is not in the story/.test(reason)));
    expect(named.length, JSON.stringify(runs)).toBeGreaterThanOrEqual(2);
  }, 900_000);
});
