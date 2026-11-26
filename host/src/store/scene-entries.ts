import type { Mac } from "../mac.js";
import type { Entry } from "../story/entries.js";
import type { State } from "../story/state.js";

/**
 * The entries of the Scene at [head]: from where it starts to the head. A Scene a Move opened starts at that Move;
 * a closed Scene is still the latest Scene until the next one opens.
 */
export function sceneEntries(mac: Mac, head: string): { state: State; entries: Entry[] } {
  const state = mac.states.at(head);
  if (!state.scene) throw new Error("No Scene has opened");
  const startsAt = state.scene.startsAt;
  const path = mac.tree.pathTo(head);
  return { state, entries: path.slice(path.findIndex(entry => entry.id === startsAt)) };
}
