import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateResponse } from "./worker-lib.mjs";

/**
 * Host half of the shared validation contract. The Kotlin half lives in
 * ContinuityValidationParityTest and reads these same files, so a rule that drifts on one side
 * fails on the other instead of surfacing as a lost engine run.
 */
const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures", "validation");

function envelope(fixture) {
  const request = {
    protocol_version: 2,
    request_id: "request-1",
    thread_id: "thread-1",
    branch_id: "branch-1",
    target_turn_id: fixture.target_turn_id,
    baseline_hash: "baseline-hash",
    baseline_version: fixture.baseline_version,
    attempt_count: 0,
    exchanges: fixture.reachable_turn_ids.map((turnId, index) => ({
      turn_id: turnId,
      parent_turn_id: index === 0 ? null : fixture.reachable_turn_ids[index - 1],
      user: "u",
      assistant: "a",
      created_at: String(index)
    })),
    cast_seeds: fixture.seeds
  };
  const response = {
    protocol_version: 2,
    request_id: request.request_id,
    attempt_count: request.attempt_count,
    thread_id: request.thread_id,
    branch_id: request.branch_id,
    target_turn_id: request.target_turn_id,
    baseline_hash: request.baseline_hash,
    world_state: fixture.world_state,
    timeline_events: []
  };
  return { request, response };
}

const files = (await readdir(fixtureDir)).filter(name => name.endsWith(".json")).sort();

test("the fixture corpus is present", () => {
  assert.ok(files.length >= 20, `expected a meaningful corpus, found ${files.length}`);
});

for (const file of files) {
  const fixture = JSON.parse(await readFile(join(fixtureDir, file), "utf8"));
  // The asserted contract is the verdict, not the wording. Both sides enforce the same rules but
  // phrase their errors differently, and forcing identical strings across two languages would
  // couple them without making continuity any safer. `reason` documents which rule a case targets.
  test(`host: ${fixture.name}`, () => {
    const { request, response } = envelope(fixture);
    if (fixture.expect === "accept") {
      assert.doesNotThrow(() => validateResponse(request, response), `${fixture.name} (${fixture.reason})`);
    } else {
      assert.throws(() => validateResponse(request, response), undefined, `${fixture.name} (${fixture.reason})`);
    }
  });
}
