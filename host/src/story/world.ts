import type { Mac } from "../mac.js";
import type { Happened, Life, ThreadNow, WorldMoved } from "./entries.js";

/** The World off-screen at one point of a Path: the Weaver's alone to move (docs/adr/0004). */
export interface World {
  /** The Story time the World was last moved on to; null until the Weaver has moved it. */
  until: string | null;
  /** A Life for each person and Group besides the Player Character; a person in a Group lives through its Life. */
  lives: Life[];
  threads: ThreadNow[];
  /** What happened off-screen, oldest first, each with who knows it. */
  happened: (Happened & { record: string })[];
}

/** The World of a Story the Weaver has never moved, with nothing in it: for prompts built without a Story. */
export const NO_WORLD: World = { until: null, lives: [], threads: [], happened: [] };

/** A person's own Life, or the Life of the Group they live through. */
export function lifeOf(world: World, person: { name: string; group: string | null }): Life | null {
  return world.lives.find(life => life.who === (person.group ?? person.name)) ?? null;
}

/**
 * The World at [head], worked out beside the Path (docs/adr/0007): Lives and Threads as the Story File set them, each
 * replaced by the latest Weaver's record that moved it, and everything that happened, oldest first. A Path from an
 * earlier entry sees only the records before it; a Redo or Rewind that takes a Scene's end off the Path takes its
 * record with it.
 */
export function worldOn(mac: Mac, head: string): World {
  const state = mac.states.at(head);
  const pc = state.playerCharacter;
  const lives = new Map<string, Life>();
  for (const person of Object.values(state.people)) {
    if (person.name === pc || person.group) continue;
    lives.set(person.name, { who: person.name, where: null, doing: null, after: person.after });
  }
  for (const group of state.groups) lives.set(group.name, { who: group.name, where: null, doing: null, after: group.description });
  const threads = new Map(state.threads.map(thread => [thread.name, { ...thread }]));

  let until: string | null = null;
  const happened: World["happened"] = [];
  for (const entry of mac.tree.recordsOn(head, "world_moved")) {
    const record = entry.payload as WorldMoved;
    for (const life of record.lives) lives.set(life.who, life);
    for (const thread of record.threads) threads.set(thread.name, thread);
    happened.push(...record.happened.map(item => ({ ...item, record: entry.id })));
    until = record.until;
  }
  return { until, lives: [...lives.values()], threads: [...threads.values()], happened };
}
