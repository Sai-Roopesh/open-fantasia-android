import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { Mac } from "../mac.js";
import { checkStoryFile, type Problem } from "./check.js";

export type Imported = { ok: true; storyId: string } | { ok: false; problems: Problem[] };

/**
 * Takes a Story File in whole, as a new Story (openspec story-file). Nothing is created unless the whole file
 * checks out; the Portraits are copied first and removed again if the Story cannot be written, so a refused or
 * failed import leaves the Mac as it was. Importing the same folder again makes another Story.
 */
export function importStoryFile(folder: string, mac: Mac): Imported {
  const checked = checkStoryFile(folder);
  if (!checked.ok) return checked;
  const { storyFile } = checked;
  const storyId = randomUUID();
  const portraitFolder = join(mac.home, "portraits", storyId);

  const portraits: Record<string, string> = {};
  try {
    storyFile.people.forEach((person, index) => {
      if (!person.portrait) return;
      mkdirSync(portraitFolder, { recursive: true });
      const stored = `${index}${extname(person.portrait).toLowerCase()}`;
      copyFileSync(join(folder, normalize(person.portrait)), join(portraitFolder, stored));
      portraits[person.name] = stored;
    });
    mac.db.transaction(() => {
      mac.db.prepare("INSERT INTO stories (id, title, folder, created_at) VALUES (?, ?, ?, ?)").run(storyId, storyFile.title, folder, new Date().toISOString());
      const setUp = mac.tree.append(storyId, null, { kind: "story_set_up", storyFile, portraits });
      const { title, place, at, who, prose } = storyFile.opening;
      const opened = mac.tree.append(storyId, setUp.id, { kind: "scene_opened", number: 1, title, place, at, who, prose, startsAt: null, purpose: null, exit: null });
      mac.tree.createPath(storyId, "Main", opened.id, true);
    })();
  } catch (error) {
    rmSync(portraitFolder, { recursive: true, force: true });
    throw error;
  }
  return { ok: true, storyId };
}
