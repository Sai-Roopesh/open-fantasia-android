import { LinkError } from "../errors.js";
import type { Mac } from "../mac.js";
import type { Entry, Payload } from "../story/entries.js";
import type { StoryPath } from "../store/tree.js";

/**
 * Editing a Move or a Reply (openspec scenes: Editing). No entry is ever changed (docs/adr/0003): the edited words are
 * a new entry beside the original. The latest Move or Reply is edited in place, by carrying what came after it over
 * onto the edit; anything earlier carries the Story on from the edit on a new Path.
 */

/** The Move or Reply [entryId] on [path], or a Scene's opening prose, which the player reads as a Reply. */
export function passageOnPath(mac: Mac, path: StoryPath, entryId: string): Entry {
  const entry = mac.tree.pathTo(path.headEntryId).find(item => item.id === entryId);
  const kind = entry?.payload.kind;
  const passage = kind === "move" || kind === "reply" || (entry?.payload.kind === "scene_opened" && entry.payload.prose !== null);
  if (!entry || !passage) throw new LinkError("invalid", "Only a Move or a Reply on this Path can be edited.");
  return entry;
}

/** The words a passage reads. */
export function wordsOf(entry: Entry): string {
  const payload = entry.payload;
  if (payload.kind === "move" || payload.kind === "reply") return payload.text;
  if (payload.kind === "scene_opened") return payload.prose ?? "";
  return "";
}

/** [entry]'s payload reading [words] instead, everything else as it was. */
function reading(entry: Entry, words: string): Payload {
  const payload = entry.payload;
  if (payload.kind === "move" || payload.kind === "reply") return { ...payload, text: words };
  if (payload.kind === "scene_opened") return { ...payload, prose: words };
  throw new LinkError("invalid", "Only a Move or a Reply can be edited.");
}

/**
 * Whether [entry] is the latest Move or Reply on [path]. A Move is the latest when no Move comes after it, its own
 * Reply aside; a Reply when nothing but Focus, Linger and the Scene's end comes after it.
 */
export function isLatest(mac: Mac, path: StoryPath, entry: Entry): boolean {
  const entries = mac.tree.pathTo(path.headEntryId);
  const after = entries.slice(entries.findIndex(item => item.id === entry.id) + 1);
  const later = entry.payload.kind === "move" ? ["move"] : ["move", "reply"];
  return after.every(item => !later.includes(item.payload.kind));
}

/** [payload] with every id in [renamed] that it mentions pointing at its copy: the Scene a record is about, a quote. */
function remapped(payload: Payload, renamed: Map<string, string>): Payload {
  if (renamed.size === 0) return payload;
  return JSON.parse(JSON.stringify(payload), (_key, value: unknown) =>
    typeof value === "string" && renamed.has(value) ? renamed.get(value) : value) as Payload;
}

/**
 * Edits the latest Move or Reply in place: writes it beside the original with the records that hung off it. A Move is
 * then answered again; after a Reply, a copy of everything that came after the original follows, each with its
 * records, and the head moves to the last copy. The Path
 * keeps its id and name, and the World and the Chronicler find their records where they left them (Redo's pattern,
 * carried through the tail).
 */
export function editInPlace(mac: Mac, path: StoryPath, entry: Entry, words: string): Entry {
  const entries = mac.tree.pathTo(path.headEntryId);
  const tail = entries.slice(entries.findIndex(item => item.id === entry.id) + 1);
  return mac.db.transaction(() => {
    const renamed = new Map<string, string>();
    const copy = (original: Entry, parentId: string | null, payload: Payload): Entry => {
      const written = mac.tree.append(path.storyId, parentId, remapped(payload, renamed));
      renamed.set(original.id, written.id);
      return written;
    };
    let head = copy(entry, entry.parentId, reading(entry, words));
    // An edited latest Move is answered again: what followed the old words is left off the Path, as a redone Reply is.
    if (entry.payload.kind !== "move") for (const original of tail) head = copy(original, head.id, original.payload);
    if (!mac.tree.moveHead(path.id, path.headEntryId, head.id)) throw new LinkError("stale_head", "The Story has moved on since you last looked. Nothing was changed.");
    return head;
  })();
}

/** Edits an earlier Move or Reply: the edit beside the original, and a new Path from it that the player is now on. */
export function editEarlier(mac: Mac, path: StoryPath, entry: Entry, words: string): StoryPath {
  return mac.db.transaction(() => {
    const written = mac.tree.append(path.storyId, entry.parentId, reading(entry, words));
    return mac.tree.startPath(path.storyId, written.id, "edited", entry.id);
  })();
}
