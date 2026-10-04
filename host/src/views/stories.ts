import type { StorySummary } from "../protocol/generated/link.js";
import type { Mac } from "../mac.js";

/**
 * The home screen: every Story, with where it stands on its current Path, most recently played first
 * (openspec stories: Home shows where every Story stands).
 */
export function listStories(mac: Mac): StorySummary[] {
  const stories = mac.db.prepare("SELECT id, title FROM stories").all() as { id: string; title: string }[];
  return stories
    .flatMap(story => {
      const path = mac.tree.currentPath(story.id);
      if (!path) return [];
      const state = mac.states.at(path.headEntryId);
      const standing = state.scene ? `Scene ${state.scene.number} · ${state.scene.title}` : "Not begun";
      return [{ id: story.id, title: story.title, standing, updated_at: path.updatedAt }];
    })
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}
