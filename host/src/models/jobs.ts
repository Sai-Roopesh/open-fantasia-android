import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Mac } from "../mac.js";
import type { ModelChoice } from "../story/state.js";

/** The jobs whose model is the Mac's to choose for every Story. The Actor is each Story's own (docs/adr/0008). */
export const JOBS = ["writer", "editor", "chronicler", "director", "weaver", "folder"] as const;
export type Job = (typeof JOBS)[number];

const OPUS: ModelChoice = { provider: "claude", model: "claude-opus-5-5" };

/**
 * Each job's model until the player sets one (openspec outside-the-scene: One Models screen › The defaults). The
 * player chose quality over speed (docs/goal.md): Opus 5.5 for every job, the Writer at medium effort since it plans
 * before every Reply; Fable 5.1 at high effort for the Director, who shapes the whole Story; and Sonnet 5.5 for the
 * Editor, who checks every Reply against what is established while the player waits.
 */
export const DEFAULT_JOB_MODELS: Record<Job, ModelChoice> = {
  writer: { ...OPUS, effort: "medium" },
  editor: { provider: "claude", model: "claude-sonnet-5-5" },
  chronicler: OPUS,
  weaver: OPUS,
  director: { provider: "claude", model: "claude-fable-5-1", effort: "high" },
  folder: OPUS
};

/**
 * Every job's second model, the Actor's too, tried once when its own fails or runs too long (openspec presence:
 * Nothing fails silently): GPT 6.1 Sol, on another provider, which can search the web.
 */
const SOL: ModelChoice = { provider: "codex", model: "gpt-6.1-sol" };

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

/** Each job's second model, from models.json or GPT 6.1 Sol. */
export function backupModels(home: string): Record<Job | "actor", ModelChoice> {
  const settings = saved(home);
  return { ...Object.fromEntries(JOBS.map(job => [job, settings.backups?.[job] ?? SOL])), actor: settings.backups?.actor ?? SOL } as Record<Job | "actor", ModelChoice>;
}

const same = (a: ModelChoice, b: ModelChoice) => a.provider === b.provider && a.model === b.model;

/**
 * The second model a job really gets with [own] as its model and [backup] as its second: [backup], unless it is the
 * same model, when a second try on it would be no second try. Then it is the job's default, or Opus 5.5 when that is the
 * same model too, or GPT 6.1 Sol when even Opus is.
 */
export function secondModel(own: ModelChoice, backup: ModelChoice, job: Job | "actor"): ModelChoice {
  if (!same(own, backup)) return backup;
  const fallback = job === "actor" ? OPUS : DEFAULT_JOB_MODELS[job];
  if (!same(own, fallback)) return fallback;
  return same(own, OPUS) ? SOL : OPUS;
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
