import type { Mac } from "../mac.js";
import type { Chronicle, Moment } from "./entries.js";

/** A Moment as a Path remembers it: which Scene it was in, and everyone who knows it besides the Player Character. */
export interface RememberedMoment {
  moment: Moment;
  scene: { id: string; number: number; title: string };
  /** Who was there, and who was told of it since. */
  knownTo: string[];
}

/**
 * Every Moment a Path remembers, in the order they were recorded: one record for everyone (docs/adr/0006). Who knows a
 * Moment is worked out here from who was there and who was told, so nobody holds a copy of their own.
 */
export function momentsOn(mac: Mac, head: string): RememberedMoment[] {
  const scenes = new Map(mac.tree.pathTo(head).flatMap(entry =>
    entry.payload.kind === "scene_opened" ? [[entry.id, { id: entry.id, number: entry.payload.number, title: entry.payload.title }] as const] : []));
  const chronicles = mac.tree.chroniclesOn(head).map(entry => entry.payload as Chronicle);
  const told = new Map<string, Set<string>>();
  for (const chronicle of chronicles) {
    for (const telling of chronicle.told) {
      const knowers = told.get(telling.moment) ?? new Set<string>();
      telling.to.forEach(name => knowers.add(name));
      told.set(telling.moment, knowers);
    }
  }
  return chronicles.flatMap(chronicle => {
    const scene = scenes.get(chronicle.scene);
    if (!scene) return [];
    return chronicle.moments.map(moment => ({
      moment,
      scene,
      knownTo: [...new Set([...moment.there, ...(told.get(moment.id) ?? [])])]
    }));
  });
}
