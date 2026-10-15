import type { Mac } from "../mac.js";
import { besideOf, learnLesson, setBrief, setReaction } from "./beside.js";

/**
 * Carries what a Story learned from the player while it was still kept on its Paths (Taste lessons, the brief, the
 * reactions) beside the Story, from every branch, abandoned ones included (docs/adr/0020). Lessons a Redo left on a
 * branch the player did not keep are carried too: that is the point. Running it again changes nothing.
 */
export function carryBeside(mac: Pick<Mac, "db">, storyId: string): { lessons: number; brief: boolean; reactions: number } {
  const rows = mac.db.prepare("SELECT kind, payload FROM entries WHERE story_id = ? ORDER BY seq").all(storyId) as { kind: string; payload: string }[];
  const before = besideOf(mac, storyId);
  const titles = new Map<number, string>();
  const lessons: string[] = [];
  let brief: { more: string[]; less: string[] } | null = null;
  const reactions = new Map<number, { reaction: "more" | "less" | null; note: string | null }>();
  for (const row of rows) {
    const payload = JSON.parse(row.payload) as Record<string, unknown>;
    switch (row.kind) {
      case "story_set_up": {
        const file = (payload.storyFile ?? {}) as { brief?: { more?: string[]; less?: string[] } };
        if (file.brief) brief = { more: file.brief.more ?? [], less: file.brief.less ?? [] };
        break;
      }
      case "scene_opened":
        titles.set(payload.number as number, payload.title as string);
        break;
      case "beat_note":
        if (typeof payload.taste === "string" && payload.taste.trim()) lessons.push(payload.taste.trim());
        break;
      case "taste_set":
        for (const line of (payload.lines as string[] | undefined) ?? []) lessons.push(line);
        break;
      case "brief_set":
        brief = { more: (payload.more as string[] | undefined) ?? [], less: (payload.less as string[] | undefined) ?? [] };
        break;
      case "reaction_set":
        reactions.set(payload.scene as number, { reaction: payload.reaction as "more" | "less" | null, note: (payload.note as string | null | undefined) ?? null });
        break;
    }
  }
  // A lesson about one World stays with the Story; only the player moves one to their own Taste.
  for (const line of lessons) learnLesson(mac, storyId, "story", line);
  if (brief && !before.brief.more.length && !before.brief.less.length) setBrief(mac, storyId, brief);
  let carried = 0;
  for (const [scene, { reaction, note }] of reactions) {
    if (before.reactions.some(item => item.scene === scene)) continue;
    setReaction(mac, storyId, scene, reaction ? { title: titles.get(scene) ?? `Scene ${scene}`, reaction, note } : null);
    if (reaction) carried++;
  }
  const after = besideOf(mac, storyId);
  return { lessons: after.taste.length - before.taste.length, brief: brief !== null && !before.brief.more.length && !before.brief.less.length, reactions: carried };
}
