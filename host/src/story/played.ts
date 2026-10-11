import type { Mac } from "../mac.js";
import { EDIT_KINDS, SCENE_END_KINDS } from "./entries.js";

/** When the Path at [head] was last played: its newest entry that is neither an edit nor written at a Scene's end. */
export function lastPlayed(mac: Mac, head: string): string | undefined {
  let entry = mac.tree.entry(head);
  while (entry && (EDIT_KINDS.has(entry.payload.kind) || SCENE_END_KINDS.has(entry.payload.kind)) && entry.parentId) entry = mac.tree.entry(entry.parentId);
  return entry?.createdAt;
}
