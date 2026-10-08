import type { Mac } from "../mac.js";
import { EDIT_KINDS } from "./entries.js";

/** When the Path at [head] was last played: its newest entry that is not an edit to the Story. */
export function lastPlayed(mac: Mac, head: string): string | undefined {
  let entry = mac.tree.entry(head);
  while (entry && EDIT_KINDS.has(entry.payload.kind) && entry.parentId) entry = mac.tree.entry(entry.parentId);
  return entry?.createdAt;
}
