import type { Mac } from "../mac.js";
import type { Catalog } from "../models/catalog.js";
import { actorOf, backupModels, JOBS, jobModels, secondModel, storyActor, type Job } from "../models/jobs.js";
import type { ChosenModel, ModelsView } from "../protocol/generated/link.js";
import type { ModelChoice } from "../story/state.js";

/** Each job as the Models screen names it (Models.dc.html). */
const JOB_LINES: Record<Job, { title: string; does: string }> = {
  writer: { title: "Writer", does: "Plans each Reply before it starts" },
  editor: { title: "Editor", does: "Checks each Reply before you read it" },
  chronicler: { title: "Chronicler", does: "Records what happened" },
  weaver: { title: "Weaver", does: "Moves the World on" },
  director: { title: "Director", does: "Keeps the Outline and plans the days ahead" },
  folder: { title: "Folder", does: "Keeps The Story So Far short" }
};

/** The Models screen (openspec outside-the-scene: One Models screen). */
export function modelsView(mac: Mac, catalog: Catalog, traceId: string): ModelsView {
  const chosen = (choice: ModelChoice): ChosenModel => ({ choice: { ...choice, effort: choice.effort ?? null }, label: catalog.label(choice) });
  const stories = mac.db.prepare("SELECT id, title FROM stories WHERE before_ledger = 0 ORDER BY created_at").all() as { id: string; title: string }[];
  const jobs = jobModels(mac.home);
  const backups = backupModels(mac.home);
  return {
    stories: stories.flatMap(story => {
      const actor = actorOf(mac, story.id);
      return actor ? [{ story_id: story.id, title: story.title, actor: chosen(actor), own: storyActor(mac.home, story.id) !== null }] : [];
    }),
    actor_backup: chosen(backups.actor),
    // A job's second model as it runs: never its own model again (secondModel).
    jobs: JOBS.map(job => ({ job, ...JOB_LINES[job], model: chosen(jobs[job]), backup: chosen(secondModel(jobs[job], backups[job], job)) })),
    providers: catalog.view().map(offer => ({
      provider: offer.provider,
      label: offer.label,
      reachable: offer.reachable,
      reason: offer.reason,
      models: offer.models.map(model => ({ id: model.id, name: model.name, efforts: model.efforts, default_effort: model.defaultEffort }))
    })),
    trace_id: traceId
  };
}
