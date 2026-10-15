import type { StoryFile } from "../protocol/generated/story-file.js";
import { currentAct } from "./outline.js";
import { applyTruth, emptyTruth, emptyUpdate, type TruthState } from "./truth.js";
import { nextFreeAfter } from "../time.js";
import type { BeatNote, Chronicle, DirectorPlan, Entry, SceneOpened, SceneRecorded, StoryFolded, StorySetUp, WorldMoved } from "./entries.js";
import type { Beat, CurrentScene, Fact, ModelChoice, Person, SceneEndStep, State, Told } from "./state.js";

const DIRECTIONS_KEPT = 10;
/** How many earlier plans' Scenes the Director is shown, so it does not repeat a shape (one-truth design decision 6). */
export const RECENT_PLANS = 3;

/** The Actor a Story File that names none gets (openspec outside-the-scene: One Models screen › The defaults). */
export const DEFAULT_ACTOR: ModelChoice = { provider: "claude", model: "claude-opus-5-5", effort: "high" };

/**
 * What one entry does to the State (docs/adr/0015). Pure, so the store can cache States and throw them away. Every
 * entry is on the Path, so this is the only place anything about the Story is worked out.
 */
export function apply(state: State | null, entry: Entry): State {
  const payload = entry.payload;
  if (state === null) {
    if (payload.kind !== "story_set_up") throw new Error(`A Story begins with its setup, not with a ${payload.kind}`);
    return setUp(payload);
  }
  switch (payload.kind) {
    case "story_set_up":
      throw new Error("A Story is set up once, by its first entry");
    case "scene_opened":
      return openScene(state, payload, entry.id);
    case "beat_note":
      return { ...state, clock: payload.clock, scene: followScene(inScene(state), payload), pendingDirection: null };
    case "redo":
      return { ...state, pendingDirection: { text: payload.direction, remember: payload.remember }, directions: payload.direction ? [...state.directions, payload.direction].slice(-DIRECTIONS_KEPT) : state.directions };
    case "scene_closed": {
      const scene = inScene(state);
      return {
        ...state,
        // A Move that leaves goes straight into the next Scene: no time passes to when he is next free.
        clock: payload.by === "move" ? state.clock : nextFreeAfter(state.clock),
        scene: { ...scene, closed: payload.by, endedAt: state.clock, focus: null, linger: false, ended: [] },
        curve: [...state.curve, { scene: scene.number, title: scene.title, peak: scene.peak }]
      };
    }
    case "focus_set":
      return { ...state, scene: { ...inScene(state), focus: payload.on } };
    case "linger_set":
      return { ...state, scene: { ...inScene(state), linger: payload.on } };
    case "reply":
      return state.scene?.goes.length ? { ...state, scene: leave(state.scene) } : state;
    case "move": {
      const choice = payload.choice;
      if (!choice) return state;
      return {
        ...state,
        kept: choice.engagement && choice.at ? [...state.kept, `${choice.engagement}@${choice.at}`] : state.kept,
        played: choice.scene ? [...state.played, choice.scene] : state.played
      };
    }
    case "scene_recorded":
      return recordedSoFar(state, payload, entry.id);
    case "chronicle":
      return ended(chronicled(state, payload, entry.id), "chronicler");
    case "outline_set": {
      const outlined = { ...state, outline: { ...payload.outline, version: (state.outline?.version ?? 0) + 1 } };
      return payload.planFollows ? outlined : ended(outlined, "director");
    }
    case "director_plan":
      return ended(planned(state, payload), "director");
    case "world_moved":
      return payload.gap ? woven(state, payload) : ended(woven(state, payload), "weaver");
    case "story_folded":
      return ended(folded(state, payload), "folder");
    case "person_set": {
      const name = payload.person.name;
      const before = state.people[name];
      const people = { ...state.people, [name]: { ...payload.person, portrait: before?.portrait ?? null, broughtIn: before?.broughtIn ?? null } };
      // What he knows of them, edited here, is what he knows from now on, until a Scene teaches him more.
      if (payload.person.known === (before?.known ?? null)) return { ...state, people };
      const known = Object.fromEntries(Object.entries(state.known).filter(([who]) => who !== name));
      return { ...state, people, known: payload.person.known ? { ...known, [name]: { text: payload.person.known, from: null } } : known };
    }
    case "lead_set":
      return { ...state, leads: payload.lead ? [...state.leads.filter(name => name !== payload.person), payload.person] : state.leads.filter(name => name !== payload.person) };
    case "group_set":
      return { ...state, groups: upsert(state.groups, { name: payload.group, description: payload.description }) };
    case "portrait_set": {
      const person = state.people[payload.person];
      return person ? { ...state, people: { ...state.people, [payload.person]: { ...person, portrait: payload.file } } } : state;
    }
    case "known_set":
      return { ...state, known: { ...state.known, [payload.person]: { text: payload.text, from: null } } };
    case "premise_set":
      return { ...state, premise: payload.premise };
    case "style_set":
      return { ...state, style: payload.style };
    case "reply_length_set":
      return { ...state, replyLength: payload.length };
    case "arcs_set":
      return { ...state, arcs: payload.arcs };
    case "landmark_set":
      return { ...state, landmarks: upsert(state.landmarks, payload.landmark) };
    case "landmark_dropped":
      return { ...state, landmarks: state.landmarks.filter(landmark => landmark.name !== payload.name) };
    case "place_set": {
      const list = payload.institution ? "institutions" : "places";
      return { ...state, world: { ...state.world, [list]: upsert(state.world[list], payload.place) } };
    }
    case "world_set":
      return { ...state, world: { ...state.world, summary: payload.summary, history: payload.history } };
    case "clock_set":
      return { ...state, clock: payload.clock, dayOne: payload.dayOne };
    case "routine_set":
      return { ...state, routine: payload.routine };
    default:
      // Taste, the brief and reactions were once kept on the Path; an old Path's entries for them change nothing now
      // that they are kept beside the Story (docs/adr/0020).
      return state;
  }
}

function upsert<T extends { name: string }>(list: T[], item: T): T[] {
  return list.some(old => old.name === item.name) ? list.map(old => (old.name === item.name ? item : old)) : [...list, item];
}

/** Marks a step of the closed Scene's end as done. */
function ended(state: State, step: SceneEndStep): State {
  const scene = state.scene;
  // The Folder may fold more than once at one Scene's end; each fold is counted.
  if (!scene?.closed || (step !== "folder" && scene.ended.includes(step))) return state;
  return { ...state, scene: { ...scene, ended: [...scene.ended, step] } };
}

/** The Chronicler's record joins the State: Moments as facts, who was told what, Bonds, what he knows, the calendar. */
function chronicled(state: State, record: Chronicle, entryId: string): State {
  const scene = state.scene;
  const title = scene?.number === record.scene ? scene.title : "";
  const from = { number: record.scene, title };
  const at = scene?.at ?? state.clock;
  const pc = state.playerCharacter;
  // A Scene recorded while it was played already has Moments; the rest follow on from them.
  const before = state.facts.filter(fact => fact.source === "page" && fact.scene === record.scene).length;
  const moments: Fact[] = record.moments.map((moment, index) => ({
    id: `m${record.scene}.${before + index + 1}`, what: moment.what, at, where: scene?.place ?? null,
    knownTo: [...new Set([pc, ...moment.there])], source: "page", scene: record.scene, quotes: moment.quotes,
    weight: moment.weight, landmark: null, move: null
  }));
  let facts = [...state.facts, ...moments];
  for (const told of record.told) {
    facts = facts.map(fact => (fact.id === told.fact ? { ...fact, knownTo: [...new Set([...fact.knownTo, ...told.to])] } : fact));
  }
  const bonds = { ...state.bonds };
  for (const line of record.bonds) {
    const before = bonds[line.who];
    // Every turn that brought it there is kept (openspec living-world); each reader takes the latest it needs.
    bonds[line.who] = { standing: line.standing, turns: [...(before?.turns ?? []), { text: line.turn, scene: from }] };
  }
  const known = { ...state.known };
  for (const line of record.known) known[line.who] = { text: line.now, from };
  let calendar = [...state.calendar, ...record.engagements];
  for (const change of record.changed) {
    calendar = change.to === "off" ? calendar.filter(item => item.id !== change.engagement) : calendar.map(item => (item.id === change.engagement ? { ...item, at: change.to } : item));
  }
  const act = currentAct(state.outline);
  // The Act it was played in, so the Folder knows which Scenes to gather when the Act ends.
  const paragraph: Told = { from: at, until: scene?.endedAt ?? state.clock, text: record.paragraph, scene: from, who: scene?.met ?? [], ...(act ? { act: { number: act.number, title: act.title } } : {}) };
  void entryId;
  return {
    ...state, facts, bonds, known, calendar,
    // A record kept before the truth was (an old Path left by a rebuild) changes nothing in it.
    truth: applyTruth(state.truth, record.truth ?? emptyUpdate(), record.scene),
    storySoFar: { ...state.storySoFar, scenes: [...state.storySoFar.scenes, paragraph] },
    recorded: [...state.recorded, { number: record.scene, title, summary: record.summary, dropped: record.dropped }]
  };
}

/**
 * A long Scene recorded while it is played (the-storys-mind design decision 8): its truth, Moments, Bonds and calendar
 * join the State as a finished Scene's do, but it is not told in The Story So Far or the Journal until it ends.
 */
function recordedSoFar(state: State, record: SceneRecorded, entryId: string): State {
  const kept = chronicled(state, { ...record, kind: "chronicle", summary: "" }, entryId);
  const scene = kept.scene ? { ...kept.scene, recorded: { through: record.through, paragraph: record.paragraph } } : null;
  return { ...kept, scene, storySoFar: state.storySoFar, recorded: state.recorded };
}

/** The Director's plan joins the State, and the people it brings in join the Story. */
function planned(state: State, record: DirectorPlan): State {
  const number = (state.plan?.number ?? 0) + 1;
  const people = { ...state.people };
  for (const person of record.people) if (!people[person.name]) people[person.name] = { ...person, portrait: null, broughtIn: number };
  const recentPlans = state.plan ? [...state.recentPlans, state.plan.scenes].slice(-RECENT_PLANS) : state.recentPlans;
  return {
    ...state, people, recentPlans,
    introduced: [...state.introduced, ...record.newThings.map(thing => ({ stretch: number, kind: thing.kind, what: thing.what }))],
    plan: {
      number, from: record.from, until: record.until, toward: record.toward, landmark: record.landmark, phase: record.phase,
      scenes: record.scenes, leads: record.leads, arcs: record.arcs, roadmap: record.roadmap, premise: record.premise,
      newThings: record.newThings, afterScene: record.afterScene
    }
  };
}

/** The World moved on: Lives and Threads, what happened with who knows it, what reached him, and what is on. */
function woven(state: State, record: WorldMoved): State {
  const lives = { ...state.lives };
  for (const life of record.lives) lives[life.who] = { where: life.where, doing: life.doing, after: life.after };
  const threads = [...state.threads];
  for (const thread of record.threads) {
    const at = threads.findIndex(old => old.name === thread.name);
    if (at >= 0) threads[at] = thread;
    else threads.push(thread);
  }
  const happened: Fact[] = record.happened.map(item => ({
    id: item.id, what: item.what, at: item.at, where: item.where, knownTo: item.knownTo, source: "world", scene: record.scene,
    quotes: [], weight: item.landmark || item.move ? 3 : 2, landmark: item.landmark, move: item.move
  }));
  const pc = state.playerCharacter;
  let facts = [...state.facts, ...happened];
  // What reached him: he knows it now.
  for (const line of record.meanwhile) facts = facts.map(fact => (fact.id === line.fact && !fact.knownTo.includes(pc) ? { ...fact, knownTo: [...fact.knownTo, pc] } : fact));
  const engagements = record.meanwhile.flatMap(line => (line.engagement ? [line.engagement] : []));
  return {
    ...state, lives, threads, facts,
    // A record kept before the truth was (an old Path left by a rebuild) changes nothing in it.
    truth: applyTruth(state.truth, record.truth ?? emptyUpdate(), record.scene),
    meanwhile: [...state.meanwhile, ...record.meanwhile.map(line => ({ text: line.text, how: line.how, fact: line.fact, toldBy: line.toldBy, about: line.about, scene: record.scene, gap: record.gap }))],
    calendar: [...state.calendar, ...engagements],
    on: record.gap ? state.on : record.on,
    worldAt: record.until
  };
}

/**
 * The Folder replaced the current Act's oldest Scene paragraphs with a week; or a finished Act's weeks and Scenes, the
 * oldest parts there are, with one account of the Act (the-storys-mind design decision 8). Nothing it replaced is lost:
 * every paragraph stays in its record on the Path.
 */
function folded(state: State, record: StoryFolded): State {
  const so = state.storySoFar;
  if (record.into === "week") {
    const told: Told = { from: record.from, until: record.until, text: record.text, scene: null, who: [] };
    return { ...state, storySoFar: { ...so, scenes: so.scenes.slice(record.count), weeks: [...so.weeks, told] } };
  }
  const telling = [...so.weeks, ...so.scenes];
  const gathered = telling.slice(0, record.count);
  const rest = telling.slice(record.count);
  const numbers = gathered.flatMap(part => (part.scene ? [part.scene.number] : []));
  const act = gathered.findLast(part => part.act)?.act;
  const account: Told = {
    from: record.from, until: record.until, text: record.text, scene: null, who: [...new Set(gathered.flatMap(part => part.who))],
    ...(act ? { act } : {}),
    scenes: { first: (so.acts.at(-1)?.scenes?.last ?? 0) + 1, last: numbers.length ? Math.max(...numbers) : so.acts.at(-1)?.scenes?.last ?? 0 }
  };
  return { ...state, storySoFar: { acts: [...so.acts, account], weeks: rest.filter(part => !part.scene), scenes: rest.filter(part => part.scene) } };
}

function leave(scene: CurrentScene): CurrentScene {
  return {
    ...scene,
    here: scene.here.filter(name => !scene.goes.includes(name)),
    focus: scene.focus !== null && scene.goes.includes(scene.focus) ? null : scene.focus,
    goes: []
  };
}

function inScene(state: State): CurrentScene {
  if (!state.scene) throw new Error("No Scene has opened in this Story");
  return state.scene;
}

const inPlayIndex = (beats: Beat[]) => beats.findIndex(beat => beat.status === "in_play");

function followScene(scene: CurrentScene, note: BeatNote): CurrentScene {
  const inPlay = inPlayIndex(note.beats);
  const sameBeat = inPlay >= 0 && scene.beats.length > 0 && inPlay === inPlayIndex(scene.beats);
  return {
    ...scene,
    place: note.place ?? scene.place,
    purpose: note.plan?.purpose ?? scene.purpose,
    exit: note.plan?.exit ?? scene.exit,
    here: note.here,
    met: [...new Set([...scene.met, ...note.here])],
    beats: note.beats,
    note: note.note,
    inPlay: note.inPlay,
    goes: note.goes,
    call: note.call,
    intensity: note.intensity,
    peak: Math.max(scene.peak, note.intensity),
    beatInPlayFor: inPlay < 0 ? 0 : sameBeat ? scene.beatInPlayFor + 1 : 1,
    withoutArc: note.arcMoved ? 0 : scene.withoutArc + 1
  };
}

function setUp({ storyFile, portraits }: StorySetUp): State {
  const file: StoryFile = storyFile;
  const people: Record<string, Person> = {};
  const known: State["known"] = {};
  const bonds: State["bonds"] = {};
  for (const person of file.people) {
    people[person.name] = {
      name: person.name, aliases: person.aliases ?? [], whoTheyAre: person.who_they_are, known: person.known ?? null,
      appearance: person.appearance ?? "", after: person.after ?? "", knows: person.knows ?? [], voice: person.voice ?? [],
      portrait: portraits[person.name] ?? null, group: person.group ?? null, broughtIn: null
    };
    if (person.known) known[person.name] = { text: person.known, from: null };
    if (person.bond) bonds[person.name] = { standing: person.bond, turns: [] };
  }
  return {
    title: file.title, premise: file.premise, style: file.style, replyLength: file.reply_length ?? "full",
    actor: file.actor ? withoutUndefined(file.actor) : DEFAULT_ACTOR,
    dayOne: file.clock?.day_one ?? null,
    clock: file.clock?.starts ?? file.opening.at,
    // The World as the Story File sets it stands at the opening Scene.
    worldAt: file.opening.at,
    world: {
      summary: file.world?.summary ?? "", history: file.world?.history ?? "",
      places: (file.world?.places ?? []).map(place => ({ name: place.name, description: place.description ?? "" })),
      institutions: (file.world?.institutions ?? []).map(place => ({ name: place.name, description: place.description ?? "" }))
    },
    routine: file.routine ?? [],
    people, groups: (file.groups ?? []).map(group => ({ name: group.name, description: group.description ?? "" })),
    leads: file.leads ?? [], playerCharacter: file.player_character, arcs: file.arcs ?? [],
    landmarks: (file.landmarks ?? []).map(landmark => ({ name: landmark.name, at: landmark.at, what: landmark.what })),
    threads: (file.threads ?? []).map(thread => ({ name: thread.name, now: thread.now })),
    lives: {}, facts: [], meanwhile: [], bonds, known, calendar: [], on: [], plan: null, recentPlans: [],
    truth: { ...emptyTruth(), rules: startingRules(file), beliefs: startingBeliefs(file) }, outline: null,
    storySoFar: { acts: [], weeks: [], scenes: [] }, curve: [], recorded: [], kept: [], played: [], introduced: [],
    scene: null, scenesPlayed: 0, directions: [], pendingDirection: null
  };
}

/** The Story File's Rules, open from Scene 0, the Story's start (openspec story-file: Rules to start from). */
function startingRules(file: StoryFile): TruthState["rules"] {
  return Object.fromEntries((file.rules ?? []).map((what, index) => {
    const id = `r0.${index + 1}`;
    return [id, { id, what, opened: 0, closed: null, closedBy: null, sources: [] }];
  }));
}

/**
 * What each person knew when the Story began, as the Story File says it: beliefs held from Scene 0, true, so it reaches
 * whoever writes them through the truth (openspec the-truth: What each person knows and believes is kept).
 */
function startingBeliefs(file: StoryFile): TruthState["beliefs"] {
  return Object.fromEntries(file.people.flatMap(person => (person.knows ?? []).map((what, index) => {
    const id = `k0.${person.name}.${index + 1}`;
    return [id, { id, holder: person.name, what, true: true, opened: 0, closed: null, closedBy: null, sources: [] }];
  })));
}

function openScene(state: State, scene: SceneOpened, entryId: string): State {
  return {
    ...state,
    clock: scene.at,
    scene: {
      number: scene.number, title: scene.title, place: scene.place, at: scene.at, here: scene.who, met: scene.who, openedBy: entryId,
      startsAt: scene.startsAt ?? entryId, purpose: scene.purpose, exit: scene.exit, beats: [], note: null, inPlay: [],
      goes: [], endedAt: null, call: null, intensity: null, peak: 0, beatInPlayFor: 0, withoutArc: 0,
      focus: scene.who.length === 1 ? scene.who[0] ?? null : null, linger: false, closed: null, ended: []
    },
    scenesPlayed: state.scenesPlayed + (state.scene ? 1 : 0)
  };
}

function withoutUndefined(choice: { provider: ModelChoice["provider"]; model: string; effort?: string | undefined }): ModelChoice {
  return choice.effort === undefined ? { provider: choice.provider, model: choice.model } : { provider: choice.provider, model: choice.model, effort: choice.effort };
}
