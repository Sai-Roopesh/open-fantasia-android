import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Mac } from "../mac.js";
import type { ModelChoice } from "../story/state.js";

/** The jobs whose model is the Mac's to choose for every Story. The Actor is each Story's own (docs/adr/0008). */
export const JOBS = ["editor", "chronicler", "director", "weaver", "folder"] as const;
/** Writer remains readable in historical settings and failed turns; new writing uses the Story's Actor. */
export type Job = (typeof JOBS)[number] | "writer";

const OPUS: ModelChoice = { provider: "claude", model: "claude-opus-5-5" };

/**
 * Each job's model until the player sets one (openspec outside-the-scene: One Models screen › The defaults). The
 * player chose quality over speed (docs/goal.md): Opus 5.5 for every job, the Writer and the Chronicler at medium
 * effort since one plans before every Reply and the other holds up every Scene's end; Fable 5.1 at high effort for the Director, who shapes the whole Story; and Sonnet 5.5 for the
 * Editor, who checks every Reply against what is established while the player waits.
 */
export const DEFAULT_JOB_MODELS: Record<Job, ModelChoice> = {
  writer: { ...OPUS, effort: "medium" },
  editor: { provider: "claude", model: "claude-sonnet-5-5" },
  // Recording a Scene is careful reading, not deep thought: at medium effort it takes a minute or two, not five.
  chronicler: { ...OPUS, effort: "medium" },
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
type Saved = Partial<Record<Job, ModelChoice>> & {
  actors?: Record<string, ModelChoice>;
  backups?: Partial<Record<Job | "actor", ModelChoice>>;
  /** Whether a model Editor reads every Reply before the player does (docs/adr/0024). Off unless turned on. */
  editEveryReply?: boolean;
};

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
 * Whether a model Editor reads every Reply before the player does. Off unless turned on (docs/adr/0024): it found
 * something in 7 of 110 Replies for 28.6% of all input, and every Reply waited for it.
 */
export function editsEveryReply(home: string): boolean {
  return saved(home).editEveryReply === true;
}

export function setEditsEveryReply(home: string, on: boolean): void {
  save(home, { ...saved(home), editEveryReply: on });
}

/**
 * The model for each job, from models.json in the Mac's folder, or the default for any job it does not name. Read
 * every time a job runs, so a change reaches the next call without restarting anything.
 */
export function jobModels(home: string): Record<Job, ModelChoice> {
  const settings = saved(home);
  return { writer: settings.writer ?? DEFAULT_JOB_MODELS.writer, ...Object.fromEntries(JOBS.map(job => [job, settings[job] ?? DEFAULT_JOB_MODELS[job]])) } as Record<Job, ModelChoice>;
}

/** Each job's second model, from models.json or GPT 6.1 Sol. */
export function backupModels(home: string): Record<Job | "actor", ModelChoice> {
  const settings = saved(home);
  return { writer: settings.backups?.writer ?? SOL, ...Object.fromEntries(JOBS.map(job => [job, settings.backups?.[job] ?? SOL])), actor: settings.backups?.actor ?? SOL } as Record<Job | "actor", ModelChoice>;
}

const same = (a: ModelChoice, b: ModelChoice) => a.provider === b.provider && a.model === b.model;

export interface ReachableOffer {
  provider: ModelChoice["provider"];
  reachable: boolean;
  models: { id: string; defaultEffort: string | null }[];
}

/**
 * The second model a job really gets with [own] as its model and [backup] as its second: [backup], unless it is the
 * same model or its provider is unreachable while another reachable provider is available in [offers].
 */
export function secondModel(own: ModelChoice, backup: ModelChoice, job: Job | "actor", offers?: readonly ReachableOffer[]): ModelChoice {
  const reachable = offers?.filter(offer => offer.reachable && offer.models.length > 0) ?? [];
  const isReachable = (choice: ModelChoice) => !reachable.length || reachable.some(offer => offer.provider === choice.provider);
  if (!same(own, backup) && isReachable(backup)) return backup;
  const fallback = job === "actor" ? OPUS : DEFAULT_JOB_MODELS[job];
  if (!same(own, fallback) && isReachable(fallback)) return fallback;
  const alt = same(own, OPUS) ? SOL : OPUS;
  if (!same(own, alt) && isReachable(alt)) return alt;
  const otherProvider = reachable.find(offer => offer.provider !== own.provider);
  const picked = otherProvider?.models[0] ?? reachable.flatMap(offer => offer.models.map(model => ({ provider: offer.provider, model }))).find(item => item.provider !== own.provider || item.model.id !== own.model);
  if (otherProvider && otherProvider.models[0]) {
    const first = otherProvider.models[0];
    return { provider: otherProvider.provider, model: first.id, ...(first.defaultEffort ? { effort: first.defaultEffort } : {}) };
  }
  if (picked && "provider" in picked) {
    return { provider: picked.provider, model: picked.model.id, ...(picked.model.defaultEffort ? { effort: picked.model.defaultEffort } : {}) };
  }
  return alt;
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
