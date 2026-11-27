import { LinkError } from "../errors.js";
import type { Mac } from "../mac.js";
import type { BackstageDay, BackstageView, DirectorLine, HowItsGoing, JobHealth, LifeRow, LivesByTier, NewThingRow, OutlineView, SourceRow, StretchLead, StretchScene, StretchView, TruthView } from "../protocol/generated/link.js";
import { besideOf } from "../store/beside.js";
import type { Beside } from "../story/beside.js";
import { SCENE_END_KINDS, type Entry } from "../story/entries.js";
import { currentAct } from "../story/outline.js";
import { tiers } from "../story/relevance.js";
import type { Quote, Reaction, State } from "../story/state.js";
import { open, type Held } from "../story/truth.js";
import { minutesOf, parseStoryTime, sayDate, sayDay, sayTime } from "../time.js";

/** How many days of what happened off-screen Backstage keeps. */
const DAYS = 7;
/** How many Scene ends and Scenes How it's going looks back over. */
const LOOK_BACK = 10;

/**
 * Backstage (openspec outside-the-scene: Backstage shows everything else, only when visited): what happened off-screen
 * that he does not know, the Threads, the Lives by tier, the Outline and the player's steering notes, the truth with
 * where each part came from, the Director's Stretch, the Writer's plan, both Tastes, The record, what each Stretch
 * brought, and How it's going. Read only when the screen is opened, and never shown anywhere else.
 */
export function backstageView(mac: Mac, storyId: string, traceId: string): BackstageView {
  const current = mac.tree.currentPath(storyId);
  if (!current) throw new LinkError("not_found", "That Story is not on this Mac.");
  const state = mac.states.at(current.headEntryId);
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
  // What the Story has learned from the player is kept beside it, not on the Path (docs/adr/0020).
  const beside = besideOf(mac, storyId, current.headEntryId);
  const path = mac.tree.pathTo(current.headEntryId);
  return {
    story_id: storyId,
    outline: outlineView(state),
    lives_by_tier: livesByTier(state),
    notes: beside.notes.map(note => ({ id: note.id, text: note.text, written_at: note.writtenAt, answered: note.answeredBy !== null, active: note.active !== false })),
    truth: truthView(state, path),
    player_taste: beside.playerTaste,
    offscreen: days,
    threads: state.threads.map(thread => ({ name: thread.name, now: thread.now })),
    lives: Object.entries(state.lives).map(([who, life]) => ({ who, where: life.where, doing: life.doing })),
    writer: scene && !scene.closed ? { call: scene.call, purpose: scene.purpose, beats: scene.beats.map(beat => ({ text: beat.text, status: beat.status })), exit: scene.exit } : null,
    taste: beside.taste,
    director: directorLine(state),
    record: state.recorded.filter(row => row.dropped.length).reverse().map(row => ({ scene_number: row.number, scene_title: row.title, dropped: row.dropped })),
    new_things: newThings(state),
    how_its_going: howItsGoing(mac, storyId, path, state, beside),
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

/** The Outline as Backstage shows it: the current Act in detail, the rest sketched, the setups and where they stand. */
function outlineView(state: State): OutlineView | null {
  const outline = state.outline;
  if (!outline) return null;
  const act = currentAct(outline);
  return {
    current: act ? {
      number: act.number, title: act.title, question: act.question, builds_to: act.buildsTo,
      turns: act.turns.map(turn => ({ when: turn.when, what: turn.what, done: turn.state === "done" })),
      relationships: act.relationships.map(item => ({ people: item.people, by_end: item.byEnd })),
      movers: act.movers.map(mover => ({ who: mover.who, doing: mover.doing })),
      intentions: outline.intentions.map(intention => ({ who: intention.who, pursues: intention.pursues, heading: intention.heading }))
    } : null,
    later: outline.acts.filter(later => later.number > outline.current)
      .map(later => ({ number: later.number, title: later.title, question: later.question, builds_to: later.buildsTo, detail: later.detail === "sketched" ? "sketched" : "outlined" })),
    ending: outline.ending,
    setups: outline.setups.map(setup => ({ what: setup.what, payoff: setup.payoff, state: setup.state, planted: setup.planted === null ? null : `Scene ${setup.planted}` })),
    looked_up: outline.lookedUp,
    revised: outline.revisedAfter === 0 ? "when the Story started" : `after Scene ${outline.revisedAfter}${outline.deep ? ", deeply" : ""}`
  };
}

/** Everyone's Life by how much they matter (openspec living-world: Everyone has a Life): Close, Movers, the rest. */
function livesByTier(state: State): LivesByTier {
  const { close, movers, others } = tiers(state);
  const row = (who: string): LifeRow => {
    const now = state.truth.now[who];
    const life = state.lives[who];
    const person = state.people[who];
    return {
      who,
      now: now?.now ?? life?.doing ?? person?.whoTheyAre ?? state.groups.find(group => group.name === who)?.description ?? "",
      wants: now?.wants ?? life?.after ?? person?.after ?? "",
      heading: state.outline?.intentions.find(intention => intention.who === who)?.heading ?? ""
    };
  };
  return { close: close.map(row), movers: movers.map(row), others };
}

/**
 * What the Story keeps (openspec the-truth), each part with where it came from: the Scene and the words. What has
 * stopped being true is shown as ended, since nothing is deleted; a Rule the Story File set came from it, not a Scene.
 */
function truthView(state: State, path: Entry[]): TruthView {
  const sceneOf = scenesOf(path);
  const sources = (quotes: Quote[], held?: Held): SourceRow[] => quotes.length || held?.opened !== 0
    ? quotes.map(quote => ({ scene_number: sceneOf.get(quote.entry) ?? null, text: quote.text }))
    : [{ scene_number: null, text: "The Story File" }];
  const truth = state.truth;
  return {
    people: Object.values(truth.now).map(person => ({ who: person.who, now: person.now, sources: sources(person.sources) })),
    between: Object.values(truth.between).map(between => ({
      people: between.people, stands: between.stands, keepsakes: between.keepsakes.map(keepsake => keepsake.what),
      sources: sources([...between.turns.flatMap(turn => turn.sources), ...between.keepsakes.flatMap(keepsake => keepsake.words)])
    })),
    truths: Object.values(truth.truths).sort((left, right) => (left.closed === null ? 0 : 1) - (right.closed === null ? 0 : 1) || left.opened - right.opened).map(item => ({
      kind: item.kind, what: item.what, terms: item.terms, due_label: item.due ? dueBy(state, item.due) : null, known_to: item.knownTo,
      ended: item.closed === null ? null : `ended in Scene ${item.closed}`,
      sources: sources(item.sources, item)
    })),
    rules: open(truth.rules).map(rule => ({ what: rule.what, sources: sources(rule.sources, rule) })),
    names: Object.values(truth.names).map(name => ({ name: name.name, kind: name.kind, what: name.what, first_scene: name.first }))
  };
}

/** The Scene each entry on the Path was played in: a Scene a Move opened starts at that Move. */
function scenesOf(path: Entry[]): Map<string, number> {
  const startsAt = new Map(path.flatMap(entry => (entry.payload.kind === "scene_opened" && entry.payload.startsAt ? [[entry.payload.startsAt, entry.payload.number] as const] : [])));
  const scenes = new Map<string, number>();
  let number = 0;
  for (const entry of path) {
    if (entry.payload.kind === "scene_opened") number = entry.payload.number;
    scenes.set(entry.id, startsAt.get(entry.id) ?? number);
  }
  return scenes;
}

/** A deadline as Backstage says it: "by Wednesday 25 December 1991". */
const dueBy = (state: State, at: string) => {
  const time = parseStoryTime(at);
  return `by ${time ? sayDate(time, state.dayOne, true) : at}`;
};

/**
 * How it's going (openspec outside-the-scene: Backstage): how long the last Scene ends and Replies took, each job's
 * calls and how often its second model stepped in or both failed, how often the Editor set a Reply right in place or
 * sent it back, the pace of the recent Scenes, the Story's picks taken, and the player's reactions.
 */
function howItsGoing(mac: Mac, storyId: string, path: Entry[], state: State, beside: Beside): HowItsGoing {
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
  const rows = mac.db.prepare("SELECT agent, trace_id, model, answer, error FROM calls WHERE story_id = ? ORDER BY rowid").all(storyId) as CallRow[];
  const jobs: JobHealth[] = (["actor", "writer", "editor", "chronicler", "weaver", "director", "folder"] as const).map(job => {
    const traces = new Map<string, { models: Set<string>; ok: boolean }>();
    for (const row of rows.filter(item => item.agent === job || (job === "writer" && item.agent === "rephraser"))) {
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
    more: count(beside.reactions, "more"),
    less: count(beside.reactions, "less"),
    reply_seconds: replySeconds(mac, path).slice(-LOOK_BACK),
    ...editorCounts(rows)
  };
}

interface CallRow {
  agent: string;
  trace_id: string;
  model: string;
  answer: string | null;
  error: string | null;
}

const count = (reactions: Reaction[], reaction: Reaction["reaction"]) => reactions.filter(item => item.reaction === reaction).length;

/** How long each Reply on the Path took the player to get: single batched lookup instead of N+1 queries. */
function replySeconds(mac: Mac, path: Entry[]): number[] {
  const pairs: { callId: string; replyAt: string }[] = [];
  let planned: string | null = null;
  for (const entry of path) {
    if (entry.payload.kind === "beat_note") planned = entry.payload.callId;
    if (entry.payload.kind !== "reply" || !planned) continue;
    pairs.push({ callId: planned, replyAt: entry.createdAt });
    planned = null;
  }
  const recent = pairs.slice(-LOOK_BACK);
  if (recent.length === 0) return [];
  const ids = [...new Set(recent.map(pair => pair.callId))];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = mac.db.prepare(`SELECT id, started_at FROM calls WHERE id IN (${placeholders})`).all(...ids) as { id: string; started_at: string }[];
  const startedById = new Map(rows.map(row => [row.id, row.started_at]));
  return recent.flatMap(pair => {
    const startedAt = startedById.get(pair.callId);
    return startedAt ? [Math.max(0, Math.round((Date.parse(pair.replyAt) - Date.parse(startedAt)) / 1000))] : [];
  });
}

/**
 * How often the Editor set a Reply right in place, and how often it sent one back to be written again: per Reply (its
 * trace), from what the Editor answered. A Reply checked twice was sent back once; one with only fixes was set right.
 * Its checks of an Act's account are not Replies, and are not counted.
 */
function editorCounts(rows: CallRow[]): { editor_fixed: number; editor_rewrote: number } {
  const checks = new Map<string, { fixes: number; breaks: number; answered: number }>();
  for (const row of rows) {
    if (row.agent !== "editor" || row.error || !row.answer) continue;
    const answer = readEdit(row.answer);
    if (!answer) continue;
    const check = checks.get(row.trace_id) ?? { fixes: 0, breaks: 0, answered: 0 };
    checks.set(row.trace_id, { fixes: check.fixes + answer.fixes, breaks: check.breaks + answer.breaks, answered: check.answered + 1 });
  }
  const all = [...checks.values()];
  const rewrote = all.filter(check => check.answered > 1 || check.breaks > 0);
  return { editor_fixed: all.filter(check => !rewrote.includes(check) && check.fixes > 0).length, editor_rewrote: rewrote.length };
}

/** What the Editor's check of a Reply found; null for an answer that is not one, such as its check of an Act's account. */
function readEdit(answer: string): { fixes: number; breaks: number } | null {
  try {
    const read = JSON.parse(answer) as { fixes?: unknown; breaks?: unknown };
    if (!Array.isArray(read.fixes) && !Array.isArray(read.breaks)) return null;
    return { fixes: Array.isArray(read.fixes) ? read.fixes.length : 0, breaks: Array.isArray(read.breaks) ? read.breaks.length : 0 };
  } catch {
    return { fixes: 0, breaks: 0 };
  }
}
