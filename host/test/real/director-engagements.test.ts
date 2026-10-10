import { describe, expect, it } from "vitest";
import { writePlan } from "../../src/agents/director.js";
import { directionDue } from "../../src/engine/directing.js";
import { Engine } from "../../src/engine/engine.js";
import { ClaudeRunner } from "../../src/models/claude.js";
import { DEFAULT_JOB_MODELS } from "../../src/models/jobs.js";
import { Models } from "../../src/models/model-call.js";
import { CLAUDE_TOKEN, readSecret } from "../../src/secrets.js";
import { samePlace } from "../../src/story/places.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { freshHome } from "../support/host.js";
import { malfoyProblemStoryFile, writeStoryFile } from "../support/story-files.js";

// director-knows-engagements task 3.2: the real Director, told of the library meeting he set in the first play's
// Scene 1, plans its Scene with Draconia as that meeting. It runs only with `npm run test:real`.
const token = readSecret(CLAUDE_TOKEN);

const MOVE = "I pocket the coins and tell Draconia quietly that if she wants to talk about the train and what she owes, she can meet me in the library tomorrow at ten. I will be there.";
const REPLY = "\"Did you hear that, Pansy? The Stray's making *appointments*.\" She turns a little so the whole bar gets her profile. \"Ten o'clock. The library.\" She straightens. \"Ten. On a *Saturday*. Some of us have lives, Stray.\" She plucks a thread of lint off her own sleeve that was never there. \"I'll think about it.\"";
const MEETING = { id: "g-library", what: "His meeting with Draconia about the train and what she owes.", at: "Day 2 10:00", place: "The library", who: ["Draconia Malfoy"], expected: true, every: null, quotes: [{ entry: "E1", text: "she can meet me in the library tomorrow at ten" }] };

/** Scene 1 of the first play, ended with the meeting recorded, and the real Director's plan after it. */
async function planned(): Promise<{ scenes: { at: string; place: string; who: string[]; engagement?: string | null }[]; said: string }> {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(malfoyProblemStoryFile()), mac);
  if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported.problems)}`);
  const runner = new ClaudeRunner(mac.home, () => token);
  const models = new Models(mac.db, { claude: runner });
  const path = mac.tree.currentPath(imported.storyId)!;
  const opening = path.headEntryId;
  const moved = mac.tree.append(imported.storyId, opening, { kind: "move", text: MOVE });
  const replied = mac.tree.append(imported.storyId, moved.id, { kind: "reply", text: REPLY, callId: "written-by-the-test", model: { provider: "claude", model: "written-by-the-test" } });
  mac.tree.moveHead(path.id, opening, replied.id);
  new Engine(mac, models).endScene(imported.storyId, replied.id, "real-end");
  const head = mac.tree.currentPath(imported.storyId)!.headEntryId;
  const sceneOpened = mac.tree.pathTo(head).find(entry => entry.payload.kind === "scene_opened")!;
  mac.tree.append(imported.storyId, head, { kind: "chronicle", scene: sceneOpened.id, summary: "He set a library meeting with Draconia; she said she would think about it.", sceneEnded: true, moments: [], told: [], engagements: [MEETING], callId: "written-by-the-test", model: { provider: "claude", model: "written-by-the-test" } });
  try {
    const due = directionDue(mac, head, null);
    if (!due) throw new Error("no plan was due after the first Scene");
    const plan = await writePlan(models, DEFAULT_JOB_MODELS.director, due.ask, imported.storyId, "real-plan", new AbortController().signal);
    return { scenes: plan.value.scenes, said: JSON.stringify({ scenes: plan.value.scenes, dropped: plan.dropped }) };
  } finally {
    runner.close();
  }
}

describe.skipIf(!token)("the real Director builds on what he has arranged", () => {
  it("plans its Scene with Draconia as the library meeting he set, in at least two of three runs, and never a second meeting beside it", async () => {
    const runs: { ok: boolean; said: string }[] = [];
    for (let run = 0; run < 3; run++) {
      const { scenes, said } = await planned();
      const isTheMeeting = scenes.some(scene => scene.engagement === MEETING.id && scene.at === MEETING.at);
      // A second library meeting with Draconia, beside the one he set, is the fault this fixes.
      const beside = scenes.filter(scene => scene.engagement !== MEETING.id && scene.who.includes("Draconia Malfoy") && samePlace(scene.place, MEETING.place));
      runs.push({ ok: isTheMeeting && beside.length === 0, said });
    }
    console.log(JSON.stringify(runs, null, 2));
    expect(runs.filter(run => run.ok).length, JSON.stringify(runs)).toBeGreaterThanOrEqual(2);
  }, 900_000);
});
