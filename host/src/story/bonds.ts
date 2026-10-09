import type { Mac } from "../mac.js";

/** Where things stand between him and someone is said in forty words or fewer (lasting-records design decision 1). */
export const MAX_STANDING_WORDS = 40;

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
 * docs/adr/0009): the Story File's standing to start from. Someone he has no history with is absent.
 */
export function bondsOn(mac: Mac, head: string): Map<string, Bond> {
  const bonds = new Map<string, Bond>();
  for (const entry of mac.tree.pathTo(head)) {
    const payload = entry.payload;
    if (payload.kind !== "story_set_up") continue;
    for (const person of payload.storyFile.people) if (person.bond) bonds.set(person.name, { standing: person.bond, turns: [] });
  }
  return bonds;
}
