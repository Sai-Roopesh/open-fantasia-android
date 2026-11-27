import type { Mac } from "../mac.js";
import type { Catalog } from "../models/catalog.js";
import { actorOf, backupModels, editsEveryReply, JOBS, jobModels, rephrasesEveryReply, secondModel, storyActor, type Job } from "../models/jobs.js";
import type { ChosenModel, ModelJob, ModelsView } from "../protocol/generated/link.js";
import type { ModelChoice } from "../story/state.js";

/** Each job as the Models screen names it (Models.dc.html). */
const JOB_LINES: Record<Job, { title: string; does: string }> = {
  writer: { title: "Writer", does: "Plans each Reply before it starts" },
  rephraser: { title: "Rephraser", does: "Rewrites Replies into natural human speech" },
  editor: { title: "Editor", does: "Checks each Reply before you read it" },
  chronicler: { title: "Chronicler", does: "Records what happened" },
  weaver: { title: "Weaver", does: "Moves the World on" },
  director: { title: "Director", does: "Keeps the Outline and plans the days ahead" },
  folder: { title: "Folder", does: "Keeps The Story So Far short" }
};

/** Wire job id compatible with existing Android APKs (`rephraser` maps onto the unused `writer` enum slot). */
const wireJob = (job: (typeof JOBS)[number]): ModelJob => (job === "rephraser" ? "writer" : job);

/** The Models screen (openspec outside-the-scene: One Models screen). */
export function modelsView(mac: Mac, catalog: Catalog, traceId: string): ModelsView {
  const chosen = (choice: ModelChoice, labelOverride?: string): ChosenModel => ({ choice: { ...choice, effort: choice.effort ?? null }, label: labelOverride ?? catalog.label(choice) });
  const stories = mac.db.prepare("SELECT id, title FROM stories ORDER BY created_at").all() as { id: string; title: string }[];
  const jobs = jobModels(mac.home);
  const backups = backupModels(mac.home);
  const offers = catalog.view();
  const rephraserOn = rephrasesEveryReply(mac.home);
  return {
    stories: stories.flatMap(story => {
      const actor = actorOf(mac, story.id);
      return actor ? [{ story_id: story.id, title: story.title, actor: chosen(actor), own: storyActor(mac.home, story.id) !== null }] : [];
    }),
    actor_backup: chosen(backups.actor),
    // A job's second model as it runs: never its own model again, and skips unreachable providers when another is live.
    jobs: JOBS.map(job => ({
      job: wireJob(job),
      ...JOB_LINES[job],
      model: chosen(jobs[job], job === "rephraser" && !rephraserOn ? "Off" : undefined),
      backup: chosen(secondModel(jobs[job], backups[job], job, offers))
    })),
    providers: offers.map(offer => ({
      provider: offer.provider,
      label: offer.label,
      reachable: offer.reachable,
      reason: offer.reason,
      models: offer.models.map(model => ({ id: model.id, name: model.name, efforts: model.efforts, default_effort: model.defaultEffort }))
    })),
    edit_every_reply: editsEveryReply(mac.home),
    trace_id: traceId
  };
}
