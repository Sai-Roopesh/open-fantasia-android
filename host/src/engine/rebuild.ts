import type { Entry } from "../story/entries.js";

/** What a rebuild writes afresh, and so does not copy from the old Path. */
export const DERIVED: ReadonlySet<string> = new Set(["chronicle", "outline_set", "director_plan", "world_moved", "story_folded", "scene_recorded"]);

/** What a rebuild copies as played: the player's words, the Story's Replies, and every edit; nothing kept beside the Story. */
export const KINDS: ReadonlySet<string> = new Set([
  "scene_opened", "move", "redo", "beat_note", "reply", "scene_closed", "focus_set", "linger_set",
  "known_set", "person_set", "lead_set", "group_set", "portrait_set", "premise_set", "style_set", "reply_length_set", "arcs_set",
  "landmark_set", "landmark_dropped", "place_set", "world_set", "clock_set", "routine_set"
]);

/** What a rebuild made. */
export interface Rebuilt {
  pathId: string;
  scenes: number;
  /** Off-page events of the old Path the new one no longer has, with the Scenes whose Replies seem to speak of them. */
  replaced: { what: string; mentionedIn: number[] }[];
}

const COMMON = new Set(["about", "after", "again", "their", "there", "these", "where", "which", "while", "would", "could", "should", "before", "being", "every", "other", "still", "through", "because", "under", "roopesh"]);

/** Off-page events the old Path had over a span the rebuild lived again, and the later Replies that share their words. */
export function replacedEvents(old: Entry[], rebuilt: Entry[]): Rebuilt["replaced"] {
  const now = new Set(rebuilt.flatMap(entry => (entry.payload.kind === "world_moved" ? entry.payload.happened.map(item => item.what) : [])));
  const words = (text: string) => new Set(text.split(/[^A-Za-z']+/).map(word => word.toLowerCase()).filter(word => word.length > 4 && !COMMON.has(word)));
  const replies: { scene: number; words: Set<string> }[] = [];
  let scene = 0;
  for (const entry of rebuilt) {
    if (entry.payload.kind === "scene_opened") scene = entry.payload.number;
    if (entry.payload.kind === "reply") replies.push({ scene, words: words(entry.payload.text) });
  }
  return old.flatMap(entry => (entry.payload.kind === "world_moved" && entry.payload.gap ? entry.payload.happened : []))
    .filter(item => !now.has(item.what))
    .map(item => {
      const own = [...words(item.what)];
      const mentionedIn = [...new Set(replies.filter(reply => own.filter(word => reply.words.has(word)).length >= 3).map(reply => reply.scene))];
      return { what: item.what, mentionedIn };
    });
}
