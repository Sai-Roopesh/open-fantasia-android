import { describe, expect, it } from "vitest";
import { directionDue, writePlan } from "../../src/agents/director.js";
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

/** A name the plan could not keep, or an answer sent back for one. */
const NAME_PROBLEM = /is not in the story|who(\.\d+)?: must be equal to one of the allowed values/i;

/** The Story's first plan, after its opening Scene: who its Scenes name, and what was left out or sent back. */
async function firstPlan(): Promise<{ strangers: string[]; problems: string[] }> {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(malfoyProblemStoryFile()), mac);
  if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported.problems)}`);
  const runner = new ClaudeRunner(mac.home, () => token);
  const models = new Models(mac.db, { claude: runner });
  const path = mac.tree.currentPath(imported.storyId)!;
  const closed = mac.tree.append(imported.storyId, path.headEntryId, { kind: "scene_closed", by: "player" });
  mac.tree.moveHead(path.id, path.headEntryId, closed.id);
  const state = mac.states.at(closed.id);
  try {
    const due = directionDue(state);
    if (!due) throw new Error("no plan was due after the first Scene");
    const plan = await writePlan(models, [DEFAULT_JOB_MODELS.director], state, due, imported.storyId, "real-plan", new AbortController().signal);
    const people = new Set([...Object.keys(state.people), ...state.groups.map(group => group.name), ...plan.value.people.map(person => person.name)]);
    // What the first answer left out, whether or not its repair was kept: a refused first answer shows on its call.
    const refused = mac.db.prepare("select error from calls where agent = 'director' and error is not null").all() as { error: string }[];
    return {
      strangers: plan.value.scenes.flatMap(scene => scene.who.filter(name => !people.has(name))),
      problems: [...plan.dropped, ...refused.map(row => row.error)].filter(reason => NAME_PROBLEM.test(reason))
    };
  } finally {
    runner.close();
  }
}

describe.skipIf(!token)("the real Director names only the Story's people", () => {
  // GIVEN the Story has no librarian among its people
  // WHEN the Director plans a Scene that matters in the library
  // THEN everyone the Scene names is one of the Story's people, and the plan is not sent back for a name
  it("long-run › The Director shapes the long run around Arcs and Landmarks › Only the Story's people", async () => {
    const runs: { strangers: string[]; problems: string[] }[] = [];
    for (let run = 0; run < 3; run++) runs.push(await firstPlan());
    for (const run of runs) expect(run.strangers, JSON.stringify(runs)).toEqual([]);
    const named = runs.filter(run => run.problems.length === 0);
    expect(named.length, JSON.stringify(runs)).toBeGreaterThanOrEqual(2);
  }, 900_000);
});
