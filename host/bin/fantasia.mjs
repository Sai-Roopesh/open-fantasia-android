#!/usr/bin/env node
// Runs the `fantasia` command from its TypeScript source through tsx, so there is no build step to forget.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tsx = createRequire(import.meta.url).resolve("tsx");
const result = spawnSync(process.execPath, ["--import", tsx, join(here, "..", "src", "cli", "main.ts"), ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
