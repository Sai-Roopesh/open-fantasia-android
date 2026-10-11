import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Mac } from "../mac.js";
import type { ModelChoice } from "../story/state.js";

/** The jobs whose model is the Mac's to choose for every Story. The Actor is each Story's own (docs/adr/0008). */
export const JOBS = ["writer", "chronicler", "weaver", "director", "folder"] as const;
export type Job = (typeof JOBS)[number];

/** The Writer answers after every Move, before the Reply can start: a fast model keeps that wait short. */
export const DEFAULT_JOB_MODELS: Record<Job, ModelChoice> = {
  writer: { provider: "claude", model: "claude-sonnet-5-5" },
  // The Chronicler works in the background; Sonnet records carefully at a fraction of Opus's quota.
  chronicler: { provider: "claude", model: "claude-sonnet-5-5" },
  // The Day View waits for the Weaver, so it gets the faster model too.
  weaver: { provider: "claude", model: "claude-sonnet-5-5" },
  // The Director plans the long run, rarely and never in the player's way: the strongest model.
  director: { provider: "claude", model: "claude-opus-5-5" },
  folder: { provider: "claude", model: "claude-haiku-4-5-20251001" }
};

/** A job's second model, tried once when its own fails or runs too long (openspec presence: Nothing fails silently). */
const SONNET: ModelChoice = { provider: "claude", model: "claude-sonnet-5-5" };
const SOL: ModelChoice = { provider: "codex", model: "gpt-6.1-sol" };
export function defaultBackup(choice: ModelChoice): ModelChoice {
  return choice.provider === "claude" && choice.model === SONNET.model ? SOL : SONNET;
}

/** models.json: a model per job at the top, as it has always been, and each Story's own Actor under `actors`. */
type Saved = Partial<Record<Job, ModelChoice>> & { actors?: Record<string, ModelChoice>; backups?: Partial<Record<Job | "actor", ModelChoice>> };

const file = (home: string) => join(home, "models.json");

function saved(home: string): Saved {
  if (!existsSync(file(home))) return {};
  return JSON.parse(readFileSync(file(home), "utf8")) as Saved;
}

/** Written beside and renamed over, so a reader never sees half a file. */
function save(home: string, settings: Saved): void {
  const writing = `${file(home)}.writing`;
  writeFileSync(writing, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(writing, file(home));
}

/**
 * The model for each job, from models.json in the Mac's folder, or the default for any job it does not name. Read
 * every time a job runs, so a change reaches the next call without restarting anything.
 */
export function jobModels(home: string): Record<Job, ModelChoice> {
  const settings = saved(home);
  return Object.fromEntries(JOBS.map(job => [job, settings[job] ?? DEFAULT_JOB_MODELS[job]])) as Record<Job, ModelChoice>;
}

/** Each job's second model, from models.json or the default for its model. */
export function backupModels(home: string): Record<Job | "actor", ModelChoice> {
  const settings = saved(home);
  const models = jobModels(home);
  const backup = (job: Job | "actor", of: ModelChoice) => settings.backups?.[job] ?? defaultBackup(of);
  return { ...Object.fromEntries(JOBS.map(job => [job, backup(job, models[job])])), actor: settings.backups?.actor ?? SONNET } as Record<Job | "actor", ModelChoice>;
}

export function setBackupModel(home: string, job: Job | "actor", choice: ModelChoice): void {
  const settings = saved(home);
  save(home, { ...settings, backups: { ...(settings.backups ?? {}), [job]: choice } });
}

export function setJobModel(home: string, job: Job, choice: ModelChoice): void {
  save(home, { ...saved(home), [job]: choice });
}

/** The Actor the player set for this Story, or null when it is the one its Story File names. */
export function storyActor(home: string, storyId: string): ModelChoice | null {
  return saved(home).actors?.[storyId] ?? null;
}

/** The Actor writing a Story's Replies: the player's choice for it, or the one its Story File names (docs/adr/0008). */
export function actorOf(mac: Mac, storyId: string): ModelChoice | null {
  const own = storyActor(mac.home, storyId);
  if (own) return own;
  const path = mac.tree.currentPath(storyId);
  return path ? mac.states.at(path.headEntryId).actor : null;
}

/** Sets a Story's own Actor; null goes back to its Story File's. */
export function setStoryActor(home: string, storyId: string, choice: ModelChoice | null): void {
  const settings = saved(home);
  const others = Object.entries(settings.actors ?? {}).filter(([id]) => id !== storyId);
  save(home, { ...settings, actors: Object.fromEntries(choice ? [...others, [storyId, choice]] : others) });
}
