import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import type { JournalDay, JournalRow, JournalView } from "../protocol/generated/link.js";
import { sceneSpans } from "../story/spans.js";
import { parseStoryTime, sayDay, sayTime } from "../time.js";
import { summariesOn } from "./scene.js";

/**
 * The Journal (openspec outside-the-scene: The Journal reads the Story back): every Scene on the current Path with
 * the Chronicler's line, and what the Player Character heard Meanwhile between them, in order, by day. Built only from
 * what he saw and heard: nothing Backstage knows reaches it.
 */
export function journalView(mac: Mac, storyId: string, traceId: string): JournalView {
  const path = mac.tree.currentPath(storyId);
  if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
  const head = path.headEntryId;
  const entries = mac.tree.pathTo(head);
  const state = mac.states.at(head);
  const summaries = summariesOn(mac, head);
  const days: JournalDay[] = [];
  const add = (day: string, rows: JournalRow[]) => {
    if (rows.length === 0) return;
    const last = days.at(-1);
    if (last?.day === day) last.rows.push(...rows);
    else days.push({ day, rows: [...rows] });
  };
  const heard = (number: number, gap: boolean): JournalRow[] => state.meanwhile.filter(line => line.scene === number && line.gap === gap).map(line => ({ kind: "meanwhile", scene: null, meanwhile: { text: line.text, how: line.how } }));
  let previous: number | null = null;
  for (const span of sceneSpans(entries)) {
    const opened = span.opened;
    const at = parseStoryTime(opened.payload.at);
    const day = at ? sayDay(at, state.dayOneWeekday) : "";
    // What he heard over the Gap before this Scene, then the Scene, then what he heard after it ended.
    if (previous !== null) add(days.at(-1)?.day ?? day, heard(previous, true));
    const now = opened.id === state.scene?.openedBy;
    const label = `Scene ${opened.payload.number} · ${at ? sayTime(at) : opened.payload.at} · ${opened.payload.place}${now ? " · now" : ""}`;
    add(day, [{ kind: "scene", meanwhile: null, scene: { number: opened.payload.number, label, title: opened.payload.title, summary: summaries.get(opened.id) ?? "", now } }]);
    add(day, heard(opened.payload.number, false));
    previous = opened.payload.number;
  }
  return { story_id: storyId, days, trace_id: traceId };
}
