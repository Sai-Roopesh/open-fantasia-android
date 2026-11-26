import type { Entry, SceneOpened } from "./entries.js";

/** Where one Scene's entries lie on a Path: from where it starts to just before the next Scene starts. */
export interface SceneSpan {
  opened: Entry<SceneOpened>;
  start: number;
  /** One past the Scene's last entry. */
  end: number;
}

/**
 * The Scenes on a Path, in order. A Scene a Move opened starts at that Move, which belongs to it; a Story File's
 * opening starts at its opening. Each Scene runs to just before the next one starts, or to the end of the Path.
 */
export function sceneSpans(path: Entry[]): SceneSpan[] {
  const position = new Map(path.map((entry, index) => [entry.id, index]));
  const openings = path.flatMap((entry, index) => (entry.payload.kind === "scene_opened" ? [index] : []));
  const startOf = (opened: Entry<SceneOpened>) => position.get(opened.payload.startsAt ?? opened.id) ?? position.get(opened.id) ?? 0;
  return openings.map((at, scene) => {
    const opened = path[at] as Entry<SceneOpened>;
    const next = openings[scene + 1];
    return { opened, start: startOf(opened), end: next === undefined ? path.length : startOf(path[next] as Entry<SceneOpened>) };
  });
}
