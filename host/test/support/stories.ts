import { join } from "node:path";
import { importStoryFile } from "../../src/storyfile/import.js";
import { freshHome } from "./host.js";

/** The example Story in the repository: Ishaan, Meera and Uncle Bhalla on the night train to Kalka. */
export const NIGHT_TRAIN = join(import.meta.dirname, "..", "..", "..", "examples", "night-train");

/** A fresh Mac with the Night Train imported, and the State at its head. */
export function nightTrain() {
  const mac = freshHome();
  const imported = importStoryFile(NIGHT_TRAIN, mac);
  if (!imported.ok) throw new Error(`The Night Train did not import: ${JSON.stringify(imported.problems)}`);
  const head = () => mac.tree.currentPath(imported.storyId)!.headEntryId;
  return { mac, storyId: imported.storyId, head, state: mac.states.at(head()) };
}
