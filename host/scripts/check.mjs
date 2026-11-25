import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HOST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(HOST_DIR, "src");
const CEILINGS_PATH = join(HOST_DIR, "scripts", "ceilings.json");

const ceilings = JSON.parse(readFileSync(CEILINGS_PATH, "utf8"));

const LAYER_RANK = {
  story: 1,
  store: 2,
  context: 3,
  models: 4,
  agents: 5,
  storyfile: 6,
  engine: 7,
  views: 8,
  link: 9,
  cli: 9
};

function walk(dir, predicate) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function rel(file) {
  return relative(SRC_DIR, file).replaceAll("\\", "/");
}

function layerOf(relPath) {
  const top = relPath.split("/")[0];
  return Object.prototype.hasOwnProperty.call(LAYER_RANK, top) ? top : null;
}

const failures = [];

// 1. Walk hand-written src files (.ts and .md, excluding generated protocol)
const handFiles = walk(SRC_DIR, f => (f.endsWith(".ts") || f.endsWith(".md")) && !rel(f).startsWith("protocol/generated/"));
const tsFiles = handFiles.filter(f => f.endsWith(".ts"));

// 2. Total LOC & per-file ceilings
let totalLines = 0;
for (const file of handFiles) {
  const r = rel(file);
  const lines = readFileSync(file, "utf8").split("\n").length;
  totalLines += lines;
  const max = ceilings.fileCeilings[r] ?? ceilings.defaultMaxFileLines;
  if (lines > max) {
    failures.push(`FILE_CEILING: ${r} has ${lines} lines (limit ${max})`);
  }
}
if (totalLines > ceilings.maxTotalLines) {
  failures.push(`TOTAL_LOC: hand-written host/src has ${totalLines} lines (limit ${ceilings.maxTotalLines})`);
}

// 3. Build import graph, check cycles & layer DAG
const graph = new Map();
const allowedLayerSet = new Set(ceilings.allowedLayerViolations ?? []);

for (const file of tsFiles) {
  const from = rel(file);
  const src = readFileSync(file, "utf8");
  const imports = [];
  for (const m of src.matchAll(/(?:import|export)\s+(?:type\s+)?[\s\S]*?from\s+["'](\.[^"']+)["']|import\(\s*["'](\.[^"']+)["']\s*\)/g)) {
    const spec = m[1] ?? m[2];
    if (!spec) continue;
    const targetAbs = resolve(dirname(file), spec.replace(/\.js$/, ".ts"));
    if (!existsSync(targetAbs)) continue;
    const to = rel(targetAbs);
    imports.push(to);

    const fromLayer = layerOf(from);
    const toLayer = layerOf(to);
    if (fromLayer && toLayer && LAYER_RANK[toLayer] > LAYER_RANK[fromLayer]) {
      const edge = `${from} -> ${to}`;
      if (!allowedLayerSet.has(edge)) {
        failures.push(`LAYER_VIOLATION: ${edge} (${fromLayer}[${LAYER_RANK[fromLayer]}] cannot import ${toLayer}[${LAYER_RANK[toLayer]}])`);
      }
    }
  }
  graph.set(from, [...new Set(imports)]);
}

const visited = new Set();
const inStack = new Set();
const cycles = [];
function dfs(node, trail) {
  visited.add(node);
  inStack.add(node);
  for (const next of graph.get(node) ?? []) {
    if (inStack.has(next)) {
      const cycle = [...trail.slice(trail.indexOf(next)), next];
      cycles.push(cycle.join(" -> "));
    } else if (!visited.has(next)) {
      dfs(next, [...trail, next]);
    }
  }
  inStack.delete(node);
}
for (const node of graph.keys()) {
  if (!visited.has(node)) dfs(node, [node]);
}

if (cycles.length > ceilings.maxCycles) {
  failures.push(`IMPORT_CYCLES: found ${cycles.length} (limit ${ceilings.maxCycles}):\n  - ${cycles.join("\n  - ")}`);
}

// 4. Forbidden files & legacy patterns
for (const forbidden of ceilings.forbiddenFiles ?? []) {
  if (existsSync(join(SRC_DIR, forbidden))) {
    failures.push(`FORBIDDEN_FILE: src/${forbidden} must not exist`);
  }
}
for (const rule of ceilings.forbiddenPatterns ?? []) {
  const re = new RegExp(rule.pattern);
  for (const file of tsFiles) {
    const r = rel(file);
    if (rule.except?.includes(r)) continue;
    const content = readFileSync(file, "utf8");
    if (re.test(content)) {
      failures.push(`FORBIDDEN_PATTERN (${rule.name}): matched in src/${r}`);
    }
  }
}

console.log(`[gate] host/src: ${handFiles.length} files, ${totalLines}/${ceilings.maxTotalLines} lines, ${cycles.length}/${ceilings.maxCycles} cycles`);

if (failures.length > 0) {
  console.error("\n[gate] Architecture fitness gate FAILED:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log("[gate] Architecture fitness gate PASSED");

if (!process.argv.includes("--gate-only")) {
  for (const [label, args] of [
    ["tsc", ["tsc", "--noEmit"]],
    ["vitest", ["vitest", "run"]],
    ["eslint", ["eslint", "."]]
  ]) {
    console.log(`\n[gate] Running ${label}...`);
    execFileSync("npx", args, { cwd: HOST_DIR, stdio: "inherit" });
  }
  console.log("\n[gate] ALL CHECKS PASSED");
}
