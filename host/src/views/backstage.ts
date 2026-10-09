import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import { currentPlan } from "../engine/directing.js";
import { recordOn } from "../engine/chronicling.js";
import type { BackstageDay, BackstageView, DirectorLine, RecordRow, StretchLead, StretchScene, StretchView } from "../protocol/generated/link.js";
import type { DirectorPlan, Entry, WorldMoved } from "../story/entries.js";
import { worldOn } from "../story/world.js";
import { minutesOf, parseStoryTime, sayDay, sayTime } from "../time.js";

/** How many days of what happened off-screen Backstage keeps. */
const DAYS = 7;

/**
 * Backstage (openspec outside-the-scene: Backstage shows everything else, only when visited): what happened off-screen
 * that the Player Character does not know, by day, newest first; the Threads and where each stands; every Life; the
 * Writer's plan for the Scene he is in; and Taste. Read only when the screen is opened, and never shown anywhere else.
 */
export function backstageView(mac: Mac, storyId: string, traceId: string): BackstageView {
  const path = mac.tree.currentPath(storyId);
  if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
  const state = mac.states.at(path.headEntryId);
  const world = worldOn(mac, path.headEntryId);
  const now = parseStoryTime(state.clock);
  const days: BackstageDay[] = [];
  for (const item of world.happened.filter(happened => !happened.knownTo.includes(state.playerCharacter))) {
    const at = parseStoryTime(item.at);
    if (!at || (now && at.day <= now.day - DAYS)) continue;
    const day = sayDay(at, state.dayOneWeekday);
    let group = days.find(entry => entry.day === day);
    if (!group) days.push(group = { day, items: [] });
    group.items.push({ time: sayTime(at), what: item.what, known_to: item.knownTo });
  }
  // Newest day first; within a day, in the order it happened.
  const dayOf = (day: BackstageDay) => world.happened.find(item => {
    const at = parseStoryTime(item.at);
    return at && sayDay(at, state.dayOneWeekday) === day.day;
  });
  days.sort((left, right) => minutesOf(parseStoryTime(dayOf(right)?.at ?? "") ?? { day: 0, minuteOfDay: 0 }) - minutesOf(parseStoryTime(dayOf(left)?.at ?? "") ?? { day: 0, minuteOfDay: 0 }));
  const scene = state.scene;
  return {
    story_id: storyId,
    offscreen: days,
    threads: world.threads.map(thread => ({ name: thread.name, now: thread.now })),
    lives: world.lives.map(life => ({ who: life.who, where: life.where, doing: life.doing })),
    writer: scene && !scene.closed ? { call: scene.call, purpose: scene.purpose, beats: scene.beats.map(beat => ({ text: beat.text, status: beat.status })), exit: scene.exit } : null,
    taste: state.taste,
    director: directorLine(mac, path.headEntryId),
    record: recordRows(mac, path.headEntryId),
    trace_id: traceId
  };
}

/** The record (openspec outside-the-scene: Backstage shows everything else), the newest Scene first. */
function recordRows(mac: Mac, head: string): RecordRow[] {
  return recordOn(mac, head).reverse().map(row => ({ scene_number: row.scene.number, scene_title: row.scene.title, state: row.state, reason: row.reason, dropped: row.dropped }));
}

/** What the Director is building toward, as Backstage.dc.html says it, with the Stretch; null until he has planned on this Path. */
export function directorLine(mac: Mac, head: string): DirectorLine | null {
  const current = currentPlan(mac, head);
  const plan = current?.entry.payload;
  if (!current || !plan) return null;
  const line = plan.phase === "build" ? `Building toward ${plan.toward}. This stretch builds; rest comes after it.`
    : plan.phase === "peak" ? `Building toward ${plan.toward}. This stretch peaks.`
    : `Resting. Next, building toward ${plan.toward}.`;
  return { toward: plan.toward, phase: plan.phase, line, stretch: stretchOf(mac, head, current.entry) };
}

/**
 * The Stretch as Backstage shows it (story-in-stretches design decision 7): its days, each Scene that matters and
 * whether the player played it, and what each Lead did about him, on screen or off, and how it reached him.
 */
function stretchOf(mac: Mac, head: string, entry: Entry<DirectorPlan>): StretchView {
  const plan = entry.payload;
  const state = mac.states.at(head);
  const weekday = state.dayOneWeekday;
  const now = parseStoryTime(state.clock);
  const day = (n: number) => sayDay({ day: n, minuteOfDay: 0 }, weekday);
  const played = new Set(mac.tree.pathTo(head).flatMap(item => (item.payload.kind === "move" && item.payload.choice?.scene ? [item.payload.choice.scene] : [])));
  const scenes: StretchScene[] = plan.scenes.map(scene => {
    const at = parseStoryTime(scene.at);
    const when = at ? `${sayDay(at, weekday).slice(0, 3)} ${sayTime(at)}` : scene.at;
    const state = played.has(scene.id) ? "played" : at && now && minutesOf(at) <= minutesOf(now) ? "passed" : "ahead";
    return { time: when, place: scene.place, purpose: scene.for, who: scene.who, state };
  });
  // The Leads' off-screen moves, as the World recorded them after this plan; and how each reached him, if it did.
  const records = (mac.tree.recordsOn(head, "world_moved") as Entry<WorldMoved>[]).filter(record => record.seq > entry.seq);
  const leads: StretchLead[] = plan.leads.map(lead => {
    if (lead.scene !== null) {
      const scene = plan.scenes.find(item => item.id === lead.scene);
      const at = scene ? parseStoryTime(scene.at) : null;
      return { who: lead.who, move: lead.move, on_screen: true, label: `On screen · ${scene?.place ?? "a Scene that matters"}${at ? `, ${sayDay(at, weekday)}` : ""}` };
    }
    const record = records.find(item => item.payload.happened.some(happened => happened.move === lead.who));
    const made = record?.payload.happened.find(happened => happened.move === lead.who);
    if (!record || !made) return { who: lead.who, move: lead.move, on_screen: false, label: "Off-screen · still to come" };
    const at = parseStoryTime(made.at);
    const told = record.payload.meanwhile.find(item => item.happened === made.id);
    const reached = !told ? "" : told.how === "seen" ? " · he saw it" : told.how === "rumour" ? " · he heard it as a rumour" : ` · he heard it from ${told.toldBy ?? "someone"}`;
    return { who: lead.who, move: lead.move, on_screen: false, label: `Off-screen${at ? `, ${sayDay(at, weekday)}` : ""}${reached}` };
  });
  return { from_label: day(plan.from), until_label: day(plan.until), scenes, leads };
}
