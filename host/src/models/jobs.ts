import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ModelChoice } from "../story/state.js";

/** The jobs whose model is the Mac's to choose. The Actor is each Story's own (its Story File says which). */
export const JOBS = ["writer", "chronicler"] as const;
export type Job = (typeof JOBS)[number];

/** The Writer answers after every Move, before the Reply can start: a fast model keeps that wait short. */
export const DEFAULT_JOB_MODELS: Record<Job, ModelChoice> = {
  writer: { provider: "claude", model: "claude-sonnet-5-5" },
  // The Chronicler works in the background; Sonnet records carefully at a fraction of Opus's quota.
  chronicler: { provider: "claude", model: "claude-sonnet-5-5" }
};

const file = (home: string) => join(home, "models.json");

/**
 * The model for each job, from models.json in the Mac's folder, or the default for any job it does not name. Read
 * every time a job runs, so a change reaches the next call without restarting anything.
 */
export function jobModels(home: string): Record<Job, ModelChoice> {
  if (!existsSync(file(home))) return { ...DEFAULT_JOB_MODELS };
  const saved = JSON.parse(readFileSync(file(home), "utf8")) as Partial<Record<Job, ModelChoice>>;
  return { ...DEFAULT_JOB_MODELS, ...saved };
}

export function setJobModel(home: string, job: Job, choice: ModelChoice): void {
  writeFileSync(file(home), `${JSON.stringify({ ...jobModels(home), [job]: choice }, null, 2)}\n`);
}
