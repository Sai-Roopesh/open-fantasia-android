#!/usr/bin/env node
// Ties tests to the specs they prove. Every test that proves a scenario is named
// "<capability> › <requirement> › <scenario>", copied from the spec. This lists every scenario in the living specs
// (openspec/specs) and in the changes under way (openspec/changes/*/specs), finds every test that names one, and
// fails when a test names a scenario that does not exist: a test that drifted from its spec proves nothing.
//
//   node scripts/scenarios.mjs            report coverage; fail on tests naming unknown scenarios
//   node scripts/scenarios.mjs --strict   also fail when a scenario has no test (for a finished change)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEPARATOR = " › ";

function walk(dir, keep, found = []) {
  let names;
  try { names = readdirSync(dir); } catch { return found; }
  for (const name of names) {
    if (name === "node_modules" || name === "build" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, keep, found);
    else if (keep(path)) found.push(path);
  }
  return found;
}

/** Every scenario in a spec file, as "<capability> › <requirement> › <scenario>". */
export function scenariosIn(path, capability) {
  const scenarios = [];
  let requirement = null;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const req = line.match(/^###\s+Requirement:\s*(.+?)\s*$/);
    if (req) { requirement = req[1]; continue; }
    const scen = line.match(/^####\s+Scenario:\s*(.+?)\s*$/);
    if (scen && requirement) scenarios.push([capability, requirement, scen[1]].join(SEPARATOR));
  }
  return scenarios;
}

export function allScenarios() {
  const specs = walk(join(repo, "openspec"), p => basename(p) === "spec.md" && !p.includes(`${join("changes", "archive")}`));
  return new Set(specs.flatMap(path => scenariosIn(path, basename(dirname(path)))));
}

/** Every scenario name a test file claims to prove, with where it says so. */
export function testClaims() {
  const tests = [
    ...walk(join(repo, "host", "test"), p => p.endsWith(".test.ts")),
    ...walk(join(repo, "android"), p => /\/(test|androidTest)\//.test(p) && p.endsWith(".kt"))
  ];
  const claims = [];
  // Test names are written in double quotes or backticks; an apostrophe belongs to the name ("Draconia's action").
  const name = /[`"]([^`"\n]*? › [^`"\n]*? › [^`"\n]*?)[`"]/g;
  for (const file of tests) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(name)) {
      const line = text.slice(0, match.index).split("\n").length;
      claims.push({ scenario: match[1].trim(), where: `${relative(repo, file)}:${line}` });
    }
  }
  return claims;
}

const strict = process.argv.includes("--strict");
const scenarios = allScenarios();
const claims = testClaims();
const unknown = claims.filter(claim => !scenarios.has(claim.scenario));
const proven = new Set(claims.map(claim => claim.scenario));
const untested = [...scenarios].filter(scenario => !proven.has(scenario));

console.log(`${scenarios.size} scenarios, ${proven.size - unknown.length} with tests, ${untested.length} without.`);
for (const claim of unknown) console.error(`Unknown scenario named by a test at ${claim.where}:\n  ${claim.scenario}`);
if (strict) for (const scenario of untested) console.error(`No test proves: ${scenario}`);
process.exit(unknown.length > 0 || (strict && untested.length > 0) ? 1 : 0);
