import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import type { Entry } from "../story/entries.js";
import type { StoryPath } from "../store/tree.js";

/**
 * Paths through the Story's tree (openspec paths). Every change here moves or makes a pointer; no entry is written or
 * removed, so going back, trying something else and starting again never lose anything (docs/adr/0003).
 */

/**
 * The moment [entryId] names on [path]: a Reply, or a Scene's opening prose, which the player reads as one, is that
 * moment; a Move names the moment before it, the entry it answered (openspec scenes: The latest Reply has its actions
 * in view).
 */
export function replyOnPath(mac: Mac, path: StoryPath, entryId: string): Entry {
  const entries = mac.tree.pathTo(path.headEntryId);
  const entry = entries.find(item => item.id === entryId);
  if (entry?.payload.kind === "move") {
    const before = entries.find(item => item.id === entry.parentId);
    if (before) return before;
  }
  const reply = entry && (entry.payload.kind === "reply" || (entry.payload.kind === "scene_opened" && entry.payload.prose !== null));
  if (!entry || !reply) throw new LinkError("invalid", "That is not a Reply or a Move on this Path.");
  return entry;
}

/** The Story's opening Scene on [path], where starting again begins. */
export function openingOf(mac: Mac, path: StoryPath): Entry {
  const opening = mac.tree.pathTo(path.headEntryId).find(entry => entry.payload.kind === "scene_opened");
  if (!opening) throw new LinkError("internal", "The Story has no opening Scene.");
  return opening;
}

/** Try another way from [from], or start again from the opening when it is null: a new Path the player is now on. */
export function tryAnotherWay(mac: Mac, path: StoryPath, from: string | null): StoryPath {
  if (from === null) {
    const opening = openingOf(mac, path);
    // Keep the Story's pre-play initial Outline if one was already prepared directly on the opening Scene.
    const initialOutline = mac.db
      .prepare("SELECT id FROM entries WHERE story_id = ? AND parent_id = ? AND kind = 'outline_set' ORDER BY seq DESC LIMIT 1")
      .get(path.storyId, opening.id) as { id: string } | undefined;
    return mac.tree.startPath(path.storyId, initialOutline?.id ?? opening.id, "beginning", null);
  }
  const reply = replyOnPath(mac, path, from);
  return mac.tree.startPath(path.storyId, reply.id, "tried", reply.id);
}

/** Rewind [path] to [to]: what came after is set aside as a Path of its own, and [path] goes back to [to]. */
export function rewind(mac: Mac, path: StoryPath, to: string): StoryPath {
  const reply = replyOnPath(mac, path, to);
  if (reply.id === path.headEntryId) throw new LinkError("invalid", "Nothing comes after the latest Reply to set aside.");
  return mac.db.transaction(() => {
    const aside = mac.tree.createPath(path.storyId, "", path.headEntryId, false, "set_aside", reply.id);
    if (!mac.tree.moveHead(path.id, path.headEntryId, reply.id)) throw new LinkError("stale_head", "The Story has moved on since you last looked. Nothing was changed.");
    return aside;
  })();
}

/** What Clear removes: the Paths Rewind set aside that the player never opened (openspec paths: Rewind sets aside). */
export function clearable(mac: Mac, storyId: string): StoryPath[] {
  return mac.tree.paths(storyId).filter(path => path.origin === "set_aside" && !path.opened && !path.isCurrent);
}
