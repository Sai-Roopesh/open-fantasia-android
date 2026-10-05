import type { WeaveAsk } from "../agents/weaver.js";
import type { Mac } from "../mac.js";
import type { Entry, SceneOpened, WorldMoved } from "../story/entries.js";
import { sceneSpans } from "../story/spans.js";
import { worldOn } from "../story/world.js";

/** A Scene's end the Weaver owes: the Scene, the entry its record hangs off, and the span to move the World over. */
export interface DueWeave {
  scene: Entry<SceneOpened>;
  entries: Entry[];
  through: Entry;
  from: string;
  until: string;
}

/**
 * The Scene's end on the Path to [head] the Weaver owes, if any: the latest Scene that has ended (closed, or left by
 * the Move that opened the next) when it has no record yet. An older Scene passed without one is not woven after
 * the fact; the next span starts from where the World last stood. The span runs from there (or, before the Weaver has
 * ever run, the Scene's start) to when the Player Character is next free to choose, or to the next Scene's start.
 */
export function dueWeave(mac: Mac, head: string): DueWeave | null {
  const path = mac.tree.pathTo(head);
  const spans = sceneSpans(path);
  const woven = new Set(mac.tree.recordsOn(head, "world_moved").map(entry => (entry.payload as WorldMoved).scene));
  for (const [index, span] of [...spans.entries()].reverse()) {
    const entries = path.slice(span.start, span.end);
    const closed = entries.find(entry => entry.payload.kind === "scene_closed");
    const next = spans[index + 1];
    const until = closed ? mac.states.at(closed.id).clock : next?.opened.payload.at;
    if (until === undefined) continue;
    if (woven.has(span.opened.id)) return null;
    const through = closed ?? (entries.at(-1) as Entry);
    const from = worldOn(mac, through.id).until ?? span.opened.payload.at;
    return { scene: span.opened, entries, through, from, until };
  }
  return null;
}

/** What the Weaver reads for a due Scene's end: the Story, the World before, the Scene and who was in it. */
export function weaveAsk(mac: Mac, due: DueWeave): WeaveAsk {
  const inScene = [...new Set([
    ...due.scene.payload.who,
    ...due.entries.flatMap(entry => (entry.payload.kind === "beat_note" ? entry.payload.here : []))
  ])];
  return {
    state: mac.states.at(due.through.id),
    world: worldOn(mac, due.through.id),
    scene: due.entries,
    from: due.from,
    until: due.until,
    inScene
  };
}
