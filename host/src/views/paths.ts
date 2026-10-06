import { clearable } from "../engine/paths.js";
import type { Mac } from "../mac.js";
import type { PathCard, PathRow, PathsView } from "../protocol/generated/link.js";
import type { StoryPath } from "../store/tree.js";
import type { Entry } from "../story/entries.js";
import type { State } from "../story/state.js";
import { parseStoryTime, sayStoryTime } from "../time.js";

/** A Path with its entries, root first. */
interface Laid {
  path: StoryPath;
  entries: Entry[];
}

function say(state: State, at: string): string {
  const time = parseStoryTime(at);
  return time ? sayStoryTime(time, state.dayOneWeekday) : at;
}

const scenes = (count: number) => `${count} ${count === 1 ? "Scene" : "Scenes"}`;

/**
 * The Paths screen (openspec paths: The Paths screen): the Story as a tree, in reading order. Where a group of Paths
 * shares a run of Scenes, the run is folded into one row, then the Scene where they part, then each part in turn,
 * the one the player is on first; a part of one Path is its card.
 */
export function pathsView(mac: Mac, storyId: string, traceId: string): PathsView {
  const laid = mac.tree.paths(storyId).map(path => ({ path, entries: mac.tree.pathTo(path.headEntryId) }));
  return { story_id: storyId, rows: lay(mac, laid, 0, 0), clearable: clearable(mac, storyId).length, trace_id: traceId };
}

function lay(mac: Mac, group: Laid[], from: number, depth: number): PathRow[] {
  const [first] = group;
  if (!first) return [];
  if (group.length === 1) {
    const card = pathCard(mac, first);
    return [{ kind: "path", depth, label: card.label, title: null, path: card }];
  }
  // The run every Path in the group shares, from [from] on.
  let shared = from;
  while (sharedAt(group, shared)) shared++;
  const last = first.entries[shared - 1];
  const fork = last ? mac.states.at(last.id) : null;
  if (!last || !fork?.scene) return group.flatMap(item => lay(mac, [item], shared, depth));
  const forkScene = fork.scene;
  const rows: PathRow[] = [];
  const start = first.entries[from] ?? last;
  const firstScene = from === 0 ? 1 : mac.states.at(start.id).scene?.number ?? forkScene.number;
  if (forkScene.number > firstScene) {
    // Folded: the Scenes before the one where the group parts, as the clock stood when the last of them ended.
    const forkOpened = first.entries.slice(from, shared).find(entry => entry.payload.kind === "scene_opened" && entry.payload.number === forkScene.number);
    const runEnd = forkOpened?.parentId ? mac.states.at(forkOpened.parentId) : fork;
    const span = forkScene.number - 1 === firstScene ? `Scene ${firstScene}` : `Scenes ${firstScene} – ${forkScene.number - 1}`;
    rows.push({ kind: "scenes", depth, label: `${span} · ${say(runEnd, runEnd.clock)}`, title: null, path: null });
  }
  rows.push({ kind: "fork", depth, label: `Scene ${forkScene.number} · ${say(fork, forkScene.at)}`, title: forkScene.title, path: null });
  // Each part, by the entry that follows the shared run; the part the player is on first, then the oldest.
  const parts = new Map<string, Laid[]>();
  for (const item of group) {
    const key = item.entries[shared]?.id ?? "";
    parts.set(key, [...(parts.get(key) ?? []), item]);
  }
  const ordered = [...parts.values()].sort((left, right) => Number(right.some(item => item.path.isCurrent)) - Number(left.some(item => item.path.isCurrent)));
  for (const part of ordered) rows.push(...lay(mac, part, shared, depth + 1));
  return rows;
}

/** Whether every Path in [group] has the same entry at [index]. */
function sharedAt(group: Laid[], index: number): boolean {
  const id = group[0]?.entries[index]?.id;
  return id !== undefined && group.every(item => item.entries[index]?.id === id);
}

/** A Path's card: how it began, what it is called, how far it has gone, and when it was played. */
function pathCard(mac: Mac, { path, entries }: Laid): PathCard {
  const state = mac.states.at(path.headEntryId);
  const scene = state.scene ?? { number: 0, title: "Not begun" };
  const forkScene = path.forkedAt ? mac.states.at(path.forkedAt).scene?.number ?? null : null;
  const began = path.origin === "tried" ? `FROM SCENE ${forkScene} · TRIED ANOTHER WAY`
    : path.origin === "set_aside" ? `SET ASIDE AT SCENE ${forkScene}`
    : path.origin === "beginning" ? "FROM THE BEGINNING"
    : path.origin === "edited" ? `FROM SCENE ${forkScene} · EDITED` : "MAIN";
  const label = path.isCurrent ? `${began} · YOU ARE HERE` : began;
  // Its own Scenes: from the one it forked in, or every Scene for a Path that began at the opening.
  const opened = entries.filter(entry => entry.payload.kind === "scene_opened").length;
  const own = forkScene === null ? opened : scene.number - forkScene + 1;
  return {
    id: path.id,
    label,
    title: path.named ? path.name : `Scene ${scene.number} · ${scene.title}`,
    detail: `${scenes(own)} · ${say(state, state.clock)}`,
    current: path.isCurrent,
    played_at: path.updatedAt,
    can_delete: !path.isCurrent
  };
}
