import type { Mac } from "../mac.js";
import type { Chronicle, Entry, SceneOpened } from "./entries.js";

/** Where things stand between him and someone is said in forty words or fewer (lasting-records design decision 1). */
export const MAX_STANDING_WORDS = 40;
/** A turn is one line: what changed between them in a Scene, in twenty-five words or fewer. */
export const MAX_TURN_WORDS = 25;

/** One turn in a Bond: what changed between them, and the Scene it changed in (null for one from before the Story). */
export interface BondTurn {
  text: string;
  scene: { number: number; title: string } | null;
}

/** Where things stand between the Player Character and someone, and the turns that brought it there, oldest first. */
export interface Bond {
  standing: string;
  turns: BondTurn[];
}

/**
 * Each Bond on the Path at [head] (openspec living-world: Where things stand between him and each person is kept;
 * docs/adr/0009): the Story File's standing to start from, then each Chronicle's rows in the order of their Scenes, so
 * a Scene recorded late (lasting-records design decision 4) never stands over a later one. Someone he has no history
 * with is absent.
 */
export function bondsOn(mac: Mac, head: string): Map<string, Bond> {
  const bonds = new Map<string, Bond>();
  const scenes = new Map<string, SceneOpened>();
  for (const entry of mac.tree.pathTo(head)) {
    const payload = entry.payload;
    if (payload.kind === "story_set_up") {
      for (const person of payload.storyFile.people) if (person.bond) bonds.set(person.name, { standing: person.bond, turns: [] });
    } else if (payload.kind === "scene_opened") scenes.set(entry.id, payload);
  }
  const records = (mac.tree.recordsOn(head, "chronicle") as Entry<Chronicle>[])
    .map(record => ({ record, scene: scenes.get(record.payload.scene) ?? null }))
    .sort((left, right) => (left.scene?.number ?? 0) - (right.scene?.number ?? 0) || left.record.seq - right.record.seq);
  for (const { record, scene } of records) {
    for (const row of record.payload.bonds ?? []) {
      const turns = bonds.get(row.who)?.turns ?? [];
      bonds.set(row.who, { standing: row.standing, turns: [...turns, { text: row.turn, scene: scene ? { number: scene.number, title: scene.title } : null }] });
    }
  }
  return bonds;
}
