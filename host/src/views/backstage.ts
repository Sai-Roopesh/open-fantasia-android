import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import type { BackstageDay, BackstageView, DirectorLine, HowItsGoing, JobHealth, NewThingRow, StretchLead, StretchScene, StretchView } from "../protocol/generated/link.js";
import { SCENE_END_KINDS } from "../story/entries.js";
import type { State } from "../story/state.js";
import { minutesOf, parseStoryTime, sayDay, sayTime } from "../time.js";

/** How many days of what happened off-screen Backstage keeps. */
const DAYS = 7;
/** How many Scene ends and Scenes How it's going looks back over. */
const LOOK_BACK = 10;

/**
 * Backstage (openspec outside-the-scene: Backstage shows everything else, only when visited): what happened off-screen
 * that he does not know, the Threads, the Lives, the Director's Stretch, the Writer's plan, Taste, The record, what
 * each Stretch brought, and How it's going. Read only when the screen is opened, and never shown anywhere else.
 */
export function backstageView(mac: Mac, storyId: string, traceId: string): BackstageView {
  const path = mac.tree.currentPath(storyId);
  if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
  const state = mac.states.at(path.headEntryId);
  const now = parseStoryTime(state.clock);
  const pc = state.playerCharacter;
  const days: BackstageDay[] = [];
  const hidden = state.facts.filter(fact => fact.source === "world" && !fact.knownTo.includes(pc))
    .sort((left, right) => minutesOf(parseStoryTime(right.at) ?? { day: 0, minuteOfDay: 0 }) - minutesOf(parseStoryTime(left.at) ?? { day: 0, minuteOfDay: 0 }));
  for (const fact of hidden) {
    const at = parseStoryTime(fact.at);
    if (!at || (now && at.day <= now.day - DAYS)) continue;
    const day = sayDay(at, state.dayOne);
    let group = days.find(entry => entry.day === day);
    if (!group) days.push(group = { day, items: [] });
    group.items.unshift({ time: sayTime(at), what: fact.what, known_to: fact.knownTo });
  }
  const scene = state.scene;
  return {
    story_id: storyId,
    offscreen: days,
    threads: state.threads.map(thread => ({ name: thread.name, now: thread.now })),
    lives: Object.entries(state.lives).map(([who, life]) => ({ who, where: life.where, doing: life.doing })),
    writer: scene && !scene.closed ? { call: scene.call, purpose: scene.purpose, beats: scene.beats.map(beat => ({ text: beat.text, status: beat.status })), exit: scene.exit } : null,
    taste: state.taste,
    director: directorLine(state),
    record: state.recorded.filter(row => row.dropped.length).reverse().map(row => ({ scene_number: row.number, scene_title: row.title, dropped: row.dropped })),
    new_things: newThings(state),
    how_its_going: howItsGoing(mac, storyId, path.headEntryId, state),
    trace_id: traceId
  };
}

/** What the Director is building toward, with the Stretch; null until he has planned on this Path. */
export function directorLine(state: State): DirectorLine | null {
  const plan = state.plan;
  if (!plan) return null;
  // As Backstage.dc.html says it (openspec outside-the-scene: What the Director is building toward).
  const line = plan.phase === "build" ? `Building toward ${plan.toward}. This stretch builds; rest comes after it.`
    : plan.phase === "peak" ? `Building toward ${plan.toward}. This stretch peaks.`
    : `Resting. Next, building toward ${plan.toward}.`;
  return { toward: plan.toward, phase: plan.phase, line, stretch: stretchOf(state) };
}

function stretchOf(state: State): StretchView {
  const plan = state.plan;
  if (!plan) throw new Error("No plan");
  const dayOne = state.dayOne;
  const now = parseStoryTime(state.clock);
  const day = (n: number) => sayDay({ day: n, minuteOfDay: 0 }, dayOne);
  const scenes: StretchScene[] = plan.scenes.map(scene => {
    const at = parseStoryTime(scene.at);
    const when = at ? `${sayDay(at, dayOne).slice(0, 3)} ${sayTime(at)}` : scene.at;
    const played = state.played.includes(scene.id);
    return { time: when, place: scene.place, purpose: scene.headline || scene.for, who: scene.who, state: played ? "played" : at && now && minutesOf(at) <= minutesOf(now) ? "passed" : "ahead" };
  });
  const leads: StretchLead[] = plan.leads.map(lead => {
    if (lead.scene !== null) {
      const planned = plan.scenes.find(item => item.id === lead.scene);
      const at = planned ? parseStoryTime(planned.at) : null;
      return { who: lead.who, move: lead.move, on_screen: true, label: `On screen · ${planned?.place ?? "a Scene that matters"}${at ? `, ${sayDay(at, dayOne)}` : ""}` };
    }
    const made = state.facts.find(fact => fact.move === lead.who && fact.scene >= plan.afterScene);
    if (!made) return { who: lead.who, move: lead.move, on_screen: false, label: "Off-screen · still to come" };
    const at = parseStoryTime(made.at);
    const told = state.meanwhile.find(line => line.fact === made.id);
    const reached = !told ? "" : told.how === "seen" ? " · he saw it" : told.how === "rumour" ? " · he heard it as a rumour" : ` · he heard it from ${told.toldBy ?? "someone"}`;
    return { who: lead.who, move: lead.move, on_screen: false, label: `Off-screen${at ? `, ${sayDay(at, dayOne)}` : ""}${reached}` };
  });
  return { from_label: day(plan.from), until_label: day(plan.until), scenes, leads };
}

/** What each Stretch brought that was new, the newest first. */
function newThings(state: State): NewThingRow[] {
  const current = state.plan?.number ?? 0;
  return [...state.introduced].reverse().map(item => ({ kind: item.kind, what: item.what, stretch: item.stretch === current ? "This Stretch" : `Stretch ${item.stretch}` }));
}

/**
 * How it's going (openspec outside-the-scene: Backstage): how long the last Scene ends took, each job's calls and how
 * often its second model stepped in or both failed, the pace of the recent Scenes, the Story's picks taken, and the
 * player's reactions.
 */
function howItsGoing(mac: Mac, storyId: string, head: string, state: State): HowItsGoing {
  const path = mac.tree.pathTo(head);
  const seconds: number[] = [];
  path.forEach((entry, index) => {
    if (entry.payload.kind !== "scene_closed") return;
    let last = entry;
    for (const next of path.slice(index + 1)) {
      if (!SCENE_END_KINDS.has(next.payload.kind)) break;
      last = next;
    }
    if (last !== entry) seconds.push(Math.round((Date.parse(last.createdAt) - Date.parse(entry.createdAt)) / 1000));
  });
  const rows = mac.db.prepare("SELECT agent, trace_id, model, error FROM calls WHERE story_id = ?").all(storyId) as { agent: string; trace_id: string; model: string; error: string | null }[];
  const jobs: JobHealth[] = (["actor", "writer", "chronicler", "weaver", "director", "folder"] as const).map(job => {
    const traces = new Map<string, { models: Set<string>; ok: boolean }>();
    for (const row of rows.filter(item => item.agent === job)) {
      const trace = traces.get(row.trace_id) ?? { models: new Set<string>(), ok: false };
      trace.models.add(row.model);
      if (!row.error) trace.ok = true;
      traces.set(row.trace_id, trace);
    }
    const all = [...traces.values()];
    return { job, calls: all.length, second_model: all.filter(trace => trace.models.size > 1).length, failed: all.filter(trace => !trace.ok).length };
  });
  return {
    scene_end_seconds: seconds.slice(-LOOK_BACK),
    jobs,
    pace: state.curve.slice(-LOOK_BACK).map(item => ({ scene_number: item.scene, title: item.title, intensity: item.peak })),
    picks_offered: state.curve.filter(item => item.scene > (state.plan ? 0 : Infinity)).length,
    picks_taken: state.played.length,
    more: state.reactions.filter(item => item.reaction === "more").length,
    less: state.reactions.filter(item => item.reaction === "less").length
  };
}
