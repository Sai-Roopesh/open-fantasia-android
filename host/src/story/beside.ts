import type { Reaction } from "./state.js";

/** A note the player wrote to steer the Outline (openspec the-outline: The player sees and steers the Outline). */
export interface SteeringNote {
  id: string;
  text: string;
  writtenAt: string;
  /** The Outline version that answered it; null while it waits for the next Scene's end. */
  answeredBy: number | null;
  active?: boolean;
  /** A Backstage planning request, rather than a local Redo correction. Both guide future Replies. */
  requiresPlan?: boolean;
}

/**
 * What the Story has learned from the player, kept beside the Story and not on a Path (docs/adr/0020): the Story's
 * Taste, the player's own Taste that every Story starts with, the brief, the reactions and the steering notes. Every
 * agent that writes for the Story is given it alongside the State.
 */
export interface Beside {
  taste: string[];
  playerTaste: string[];
  brief: { more: string[]; less: string[] };
  reactions: Reaction[];
  notes: SteeringNote[];
}

export function nothingBeside(): Beside {
  return { taste: [], playerTaste: [], brief: { more: [], less: [] }, reactions: [], notes: [] };
}
