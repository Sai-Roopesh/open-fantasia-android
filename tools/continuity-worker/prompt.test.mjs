import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderContinuityModelInput, CONTRACT_FILES } from "./host-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const prompt = await readFile(join(here, "PROMPT.md"), "utf8");

/**
 * The engine's instructions had a half missing. Every rule said what to record and none said how to
 * write it, and a model told only to include more fills the space it is given: the measured thread
 * carried facts averaging 389 characters against 150 elsewhere, near-duplicates of each other, and
 * timeline titles like "The mirror" and "Hopeless" that name nothing a later reader can use.
 *
 * Three sentences did most of it, all of them quotas wearing the costume of thoroughness. They are
 * asserted gone by their own words, because the failure mode is that someone reads the empty buckets
 * an engine occasionally produces and puts one of them back.
 */
test("nothing in the prompt asks for volume", () => {
  for (const quota of [
    "That is not permission to write little",
    "safety ceilings, not targets",
    "a few hundred characters is almost always too few",
    "is a failed update, not a cautious one"
  ]) {
    assert.equal(prompt.includes(quota), false, `quota pressure is back: "${quota}"`);
  }
});

test("the prompt says how to write, not only what to record", () => {
  assert.match(prompt, /## How to write it/);
  assert.match(prompt, /Say what happened/);
  assert.match(prompt, /One claim per fact/);
  assert.match(prompt, /Do not restate/);
  assert.match(prompt, /Length follows content/);
});

test("a timeline title has to name what happened", () => {
  assert.match(prompt, /`title` says who did what/);
  // Importance had stopped ranking anything: 120 of one thread's 229 beats were rated 5 of 5, so the
  // Stage could not tell a decisive beat from an ordinary one and fell back on recency.
  assert.match(prompt, /`importance` is a ranking/);
});

test("the completeness rule survives without the volume threat", () => {
  // Removing the quotas must not remove the reason they were written. An engine that records a world
  // of named people holding nothing is still failing, and the prompt still says so.
  const flat = prompt.replace(/\s+/g, " ");
  assert.match(flat, /A world of named people with no facts and no relationships between them is a failed update/);
  assert.match(flat, /needs an operation or it is lost/);
});

test("every engine is given the same instructions", () => {
  // Codex, Antigravity and Claude each build their task through this one function from this one file,
  // so there is no second copy of the register to drift. The contract guard restarts a host whose
  // PROMPT.md no longer matches the one it loaded.
  const rendered = renderContinuityModelInput(prompt, {
    request_id: "r", thread_id: "t", baseline: {}, exchanges: []
  });
  assert.ok(rendered.includes("## How to write it"));
  assert.ok(CONTRACT_FILES.includes("PROMPT.md"));
});
