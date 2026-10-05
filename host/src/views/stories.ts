import type { StorySummary } from "../protocol/generated/link.js";
import type { Mac } from "../mac.js";
import type { State } from "../story/state.js";
import { parseStoryTime, sayDay, sayTime } from "../time.js";

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
      return [{ id: story.id, title: story.title, ...whereItStands(state), updated_at: path.updatedAt }];
    })
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

/**
 * One line for where a Story stands and one under it: mid-Scene, the Scene and then the time and who is there; at the
 * Day View, the time and that the player is choosing, then how many Scenes have been played.
 */
function whereItStands(state: State): { standing: string; detail: string } {
  const scene = state.scene;
  if (!scene) return { standing: "Not begun", detail: "" };
  const now = parseStoryTime(state.clock);
  const when = now ? `${sayDay(now, state.dayOneWeekday)} ${sayTime(now)}` : state.clock;
  if (scene.closed) return { standing: `${when} · choosing where to go`, detail: `${scene.number} ${scene.number === 1 ? "Scene" : "Scenes"} played` };
  const firstNames = scene.here.map(name => name.split(/\s+/)[0]);
  const company = firstNames.length === 0 ? "alone"
    : firstNames.length === 1 ? `with ${firstNames[0]}`
      : `with ${firstNames.slice(0, -1).join(", ")} and ${firstNames.at(-1)}`;
  return { standing: `Scene ${scene.number} · ${scene.title}`, detail: `${when} · ${company}` };
}
