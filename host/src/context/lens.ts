import { formatDated, minutesOf, parseStoryTime, sayFull } from "../time.js";
import { engagementsAhead, plannedAhead } from "../story/day.js";
import type { Beside } from "../story/beside.js";
import type { Entry } from "../story/entries.js";
import { currentAct, waiting, type Act } from "../story/outline.js";
import type { Fact, Person, State, Told } from "../story/state.js";
import { betweenKey, open, type Truth, type TruthKind } from "../story/truth.js";

/**
 * Who sees what (one-truth design decision 3): the Director and the Weaver see everything; the Writer sees everything
 * with who knows each thing; the Actor plays each person from what they know; the phone shows what he knows.
 */
export type Lens = "omniscient" | "author" | "character";

/** How much of each section an agent is given: the budgets that keep a long Story's context short. */
export const BUDGET = { facts: 14, moments: 5, calendar: 8, nearby: 12, perPerson: 6, recentScenes: 8 } as const;

/** Tokens as the audit counts them (docs/research/malfoy-memory-audit.md): characters over four. */
export function tokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Each layer's size limit, and each part's within it, in tokens (the-storys-mind design decision 7), tuned on The
 * Malfoy Problem: however long a Story runs, a prompt stays far from the earlier engine's 96k (docs/research/hce.md),
 * and an agent with tools looks up the rest. The job's own instructions are not counted. The Story So Far's limit
 * holds the current Act whole up to the Folder's ten thousand tokens, and five Acts' accounts before it.
 */
export const LIMITS = {
  // The Malfoy Problem's Story File comes to about 5k tokens: its people 3.1k, its Premise and Style 1.5k, its World 0.7k.
  layers: { story: 16_000, standing: 44_000, scene: 20_000, moment: 8_000 },
  parts: {
    story: 3_000, world: 2_500, people: 6_500, rules: 2_000, names: 2_000,
    storySoFar: 20_000, outline: 4_000, threads: 1_000, calendar: 1_500, wishes: 1_500,
    lives: 4_500, between: 3_500, knows: 2_000, truths: 3_000, lately: 1_000, moments: 2_000
  }
} as const;

/** [body] in a tag, closed by the tag's name alone; null when there is nothing in it. */
export function section(tag: string, body: string): string | null {
  return body.trim() ? `<${tag}>\n${body.trim()}\n</${tag.split(" ")[0]}>` : null;
}

export function join(parts: (string | null)[]): string {
  return parts.filter((part): part is string => part !== null).join("\n\n");
}

/** A Story time as agents read it: "Friday 6 September 1991, 9:40 pm" (openspec stories: Story time is told as dates). */
export function say(state: State, at: string): string {
  const time = parseStoryTime(at);
  return time ? sayFull(time, state.dayOne) : at;
}

/** A Story time as agents write it back: "1991-09-06 21:40", or the Story's own "Day N HH:MM" without a calendar. */
export function written(state: State, at: string): string {
  const time = parseStoryTime(at);
  return time ? formatDated(time, state.dayOne) : at;
}

const minutesAt = (at: string) => {
  const time = parseStoryTime(at);
  return time ? minutesOf(time) : 0;
};

/**
 * The Story as it was set up and edited: the same on every call until the player edits it, so it is the part of the
 * prompt the provider caches (docs/adr/0005).
 */
export function storyPart(state: State): string {
  const pc = state.playerCharacter;
  const person = (who: Person) => `- ${who.name}${who.aliases.length ? ` (also ${who.aliases.join(", ")})` : ""}${who.group ? `, of ${who.group}` : ""}: ${who.whoTheyAre}${who.after ? ` After: ${who.after}` : ""}`;
  return join([
    section("story", [
      `Title: ${state.title}`,
      `Premise: ${state.premise}`,
      state.arcs.length ? `Arcs:\n${state.arcs.map(arc => `- ${arc}`).join("\n")}` : "",
      state.landmarks.length ? `Landmarks:\n${state.landmarks.map(landmark => `- ${landmark.name}, ${say(state, landmark.at)}: ${landmark.what}`).join("\n")}` : "",
      `Style: ${state.style}`,
      state.world.summary ? `World: ${state.world.summary}` : "",
      state.world.history ? `History: ${state.world.history}` : ""
    ].filter(Boolean).join("\n")),
    section("places", [...state.world.places, ...state.world.institutions].map(place => `- ${place.name}${place.description ? `: ${place.description}` : ""}`).join("\n")),
    section("groups", state.groups.map(group => `- ${group.name}: ${group.description}`).join("\n")),
    section(`player_character name="${pc}"`, state.people[pc]?.whoTheyAre ?? ""),
    section("people", Object.values(state.people).filter(who => who.name !== pc && who.broughtIn === null).map(person).join("\n")),
    section("leads", state.leads.join(", "))
  ]);
}

/** Who matters now: present, then the Leads, then people in the plan, the calendar or what happened lately. */
export function salience(state: State, present: string[]): { full: string[]; nearby: string[]; resting: number } {
  const pc = state.playerCharacter;
  const full = [...new Set([...present, ...state.leads])].filter(name => name !== pc && state.people[name]);
  const lately = state.facts.slice(-BUDGET.facts).flatMap(fact => fact.knownTo);
  const plan = plannedAhead(state).flatMap(scene => scene.who);
  const calendar = engagementsAhead(state).flatMap(item => item.engagement.who);
  const brought = Object.values(state.people).filter(who => who.broughtIn !== null).map(who => who.name);
  const nearby = [...new Set([...brought, ...plan, ...calendar, ...lately])]
    .filter(name => name !== pc && !full.includes(name) && state.people[name])
    .slice(0, BUDGET.nearby);
  return { full, nearby, resting: Object.keys(state.people).length - full.length - nearby.length - 1 };
}

/** Who someone the Director brought in is: they are not in the Story's cached part. */
function broughtIn(state: State, name: string): string {
  const who = state.people[name];
  return who && who.broughtIn !== null ? ` (new to the Story: ${who.whoTheyAre})` : "";
}

function personNow(state: State, name: string, lens: Lens): string {
  const life = state.lives[name];
  const bond = state.bonds[name];
  const known = state.known[name];
  return [
    `${name}${broughtIn(state, name)}`,
    lens !== "character" && life ? `  Now: ${[life.where ? `at ${life.where}` : "", life.doing ?? ""].filter(Boolean).join(", ")}${life.after ? `; after ${life.after}` : ""}` : "",
    bond ? `  Between them and ${state.playerCharacter}: ${bond.standing}${bond.turns.length ? ` (latest: ${bond.turns.slice(-2).map(turn => `${turn.scene ? `Scene ${turn.scene.number}: ` : ""}${turn.text}`).join("; ")})` : ""}` : "",
    known ? `  What ${state.playerCharacter} knows of them: ${known.text}` : ""
  ].filter(Boolean).join("\n");
}

/** The cast now, by salience: who matters in full, who is nearby in a line, and how many rest. */
export function castPart(state: State, present: string[], lens: Lens): string | null {
  const { full, nearby, resting } = salience(state, present);
  const line = (name: string) => {
    const life = state.lives[name];
    return `- ${name}${broughtIn(state, name)}${life ? `: ${[life.where ? `at ${life.where}` : "", life.doing ?? ""].filter(Boolean).join(", ")}` : ""}`;
  };
  return section("cast_now", [
    full.map(name => personNow(state, name, lens)).join("\n"),
    nearby.length && lens !== "character" ? `Nearby:\n${nearby.map(line).join("\n")}` : "",
    resting > 0 ? `${resting} others are about their own lives.` : ""
  ].filter(Boolean).join("\n\n"));
}

/** One part of The Story So Far as agents read it: a Scene's paragraph, a week's recap, or an Act's account. */
function toldLine(state: State, part: Told): string {
  if (part.scene) return `Scene ${part.scene.number}, ${part.scene.title} (${say(state, part.from)}): ${part.text}`;
  const span = `${say(state, part.from)} to ${say(state, part.until)}`;
  if (part.act || part.scenes) return `${part.act ? `Act ${part.act.number}, ${part.act.title}` : "An Act"} (${span}${part.scenes ? `, Scenes ${part.scenes.first} to ${part.scenes.last}` : ""}): ${part.text}`;
  return `${span}: ${part.text}`;
}

/**
 * The Story So Far, in time order: each finished Act as one account, then the current Act's folded weeks, then each of
 * its Scenes a paragraph (openspec living-world: Every agent knows the Story So Far). Past [limit] tokens the oldest
 * accounts are left out first, and the newest Scenes kept; every word stays stored on the Path.
 */
export function storySoFarPart(state: State, framing = "", limit: number = LIMITS.parts.storySoFar): string | null {
  const { acts, weeks, scenes } = state.storySoFar;
  const all = [...acts, ...weeks, ...scenes];
  // The newest parts are kept, so what is left out is always the oldest.
  const from = all.length - newest(all.map(part => toldLine(state, part)), limit - tokens(framing) - 40).length;
  const lines = (start: number, parts: Told[]) => parts.flatMap((part, index) => (start + index >= from ? [toldLine(state, part)] : []));
  const told = { acts: lines(0, acts), weeks: lines(acts.length, weeks), scenes: lines(acts.length + weeks.length, scenes) };
  return section("story_so_far", [
    framing,
    from ? `(The ${from} oldest parts are left out for length.)` : "",
    told.acts.length ? `Acts:\n${told.acts.join("\n")}` : "",
    told.weeks.length ? `Weeks:\n${told.weeks.join("\n")}` : "",
    told.scenes.length ? `Scenes:\n${told.scenes.join("\n")}` : ""
  ].filter(Boolean).join("\n\n"));
}

/** What he arranged and what is planned, as each lens may see it. */
export function calendarPart(state: State, lens: Lens): string | null {
  const engagements = engagementsAhead(state).slice(0, BUDGET.calendar).map(({ engagement, next }, index) =>
    `- E${index + 1} ${say(state, next)}${engagement.every === "week" ? ", every week" : ""}, ${engagement.place}: ${engagement.what}${engagement.who.length ? ` With ${engagement.who.join(", ")}.` : ""}${engagement.expected ? " He is expected." : ""}`);
  const landmarks = state.landmarks.filter(landmark => minutesAt(landmark.at) >= minutesAt(state.clock)).sort((left, right) => minutesAt(left.at) - minutesAt(right.at)).slice(0, 2).map(landmark => `- ${landmark.name}, ${say(state, landmark.at)}`);
  // What the World last had on, still ahead: the Weaver's `on` replaces it, so it carries forward what it keeps.
  const on = lens === "character" ? [] : state.on.filter(item => minutesAt(item.at) >= minutesAt(state.clock)).sort((left, right) => minutesAt(left.at) - minutesAt(right.at))
    .map(item => `- ${say(state, item.at)}, ${item.place}: ${item.what}${item.who.length ? ` (with ${item.who.join(", ")})` : ""}`);
  return section("calendar", [
    state.routine.length ? `Routine:\n${state.routine.map(line => `- ${line}`).join("\n")}` : "",
    engagements.length ? `What he has arranged:\n${engagements.join("\n")}` : "",
    on.length ? `What is on ahead:\n${on.join("\n")}` : "",
    landmarks.length ? `Landmarks next:\n${landmarks.join("\n")}` : "",
    lens !== "character" && plannedAhead(state).length ? `The plan's Scenes that matter ahead:\n${plannedAhead(state).map(scene => `- ${scene.id} ${say(state, scene.at)}, ${scene.place}, with ${scene.who.join(", ") || "nobody else"}: ${scene.for}`).join("\n")}` : ""
  ].filter(Boolean).join("\n\n"));
}

/** The Threads, for the lenses that see the World. */
export function threadsPart(state: State): string | null {
  return section("threads", state.threads.map(thread => `- ${thread.name}: ${thread.now}`).join("\n"));
}

/**
 * What happened lately, each with who knows it; the character lens sees only what someone present knows, and not what
 * only the Player Character knows until he tells them on the page.
 */
export function factsPart(state: State, lens: Lens, present: string[]): string | null {
  const pc = state.playerCharacter;
  const visible = (fact: Fact) => lens !== "character" || fact.knownTo.some(name => name !== pc && present.includes(name));
  const lately = state.facts.filter(fact => fact.source === "world" && visible(fact)).slice(-BUDGET.facts);
  return section("lately", lately.map(fact => `- ${fact.id} ${say(state, fact.at)}${fact.where ? `, ${fact.where}` : ""}: ${fact.what} Known to: ${fact.knownTo.join(", ") || "nobody"}.`).join("\n"));
}

/**
 * The Moments the people present remember, in their own words, labelled M1 …: by who was there, then weight, then
 * how recent. Each says who knows it, so nobody acts on one they do not.
 */
export function recallFacts(state: State, present: string[]): Fact[] {
  const pc = state.playerCharacter;
  const people = new Set([pc, ...present]);
  const score = (fact: Fact) => fact.knownTo.filter(name => name !== pc && people.has(name)).length * 3 + fact.weight + fact.scene / 1000;
  return state.facts
    .filter(fact => fact.source === "page" && fact.scene !== state.scene?.number && fact.knownTo.some(name => name !== pc && people.has(name)))
    .sort((left, right) => score(right) - score(left))
    .slice(0, BUDGET.moments);
}

export function momentsPart(state: State, moments: Fact[]): string | null {
  return section("remembered", moments.map((fact, index) => [
    `M${index + 1} (Scene ${fact.scene}; known to ${fact.knownTo.join(", ")}): ${fact.what}`,
    ...fact.quotes.map(quote => `  "${quote.text}"`)
  ].join("\n")).join("\n"));
}

/** What each person present knows, for the Actor (the character lens). */
export function knowsPart(state: State, present: string[]): string | null {
  return section("what_each_knows", present.filter(name => state.people[name]).map(name => {
    const who = state.people[name];
    const theirs = state.facts.filter(fact => fact.knownTo.includes(name)).slice(-BUDGET.perPerson);
    return [`${name}:`, ...(who?.knows ?? []).map(line => `- ${line}`), ...theirs.map(fact => `- ${fact.what}${fact.quotes[0] ? ` ("${fact.quotes[0].text}")` : ""}`)].join("\n");
  }).join("\n\n"));
}

/**
 * The player's brief, reactions and Taste, kept beside the Story (docs/adr/0020): what the Director and the Writer
 * serve. Taste is the player's own, which every Story starts with, and then the Story's.
 */
export function steeringPart(beside: Beside): string | null {
  const reactions = beside.reactions.slice(-6);
  const taste = tasteLines(beside);
  return section("the_players_wishes", [
    beside.brief.more.length ? `More of:\n${beside.brief.more.map(line => `- ${line}`).join("\n")}` : "",
    beside.brief.less.length ? `Less of:\n${beside.brief.less.map(line => `- ${line}`).join("\n")}` : "",
    reactions.length ? `Reactions to recent Scenes:\n${reactions.map(item => `- Scene ${item.scene}, ${item.title}: ${item.reaction === "more" ? "more like this" : "less like this"}${item.note ? ` (${item.note})` : ""}`).join("\n")}` : "",
    taste.length ? `Taste:\n${taste.map(line => `- ${line}`).join("\n")}` : ""
  ].filter(Boolean).join("\n\n"));
}

/** Every lesson of Taste a Story is written to: the player's own first, then the Story's (openspec long-run). */
export function tasteLines(beside: Beside): string[] {
  return [...beside.playerTaste, ...beside.taste.filter(line => !beside.playerTaste.includes(line))];
}

/** Now, as people say it. */
export function nowPart(state: State): string {
  const time = parseStoryTime(state.clock);
  return section("now", `It is ${say(state, state.clock)}${time ? ` (${formatDated(time, state.dayOne)})` : ""}.`) ?? "";
}

/*
 * Prompts in four layers (the-storys-mind design decision 7; docs/research/design.md decision 14): every prompt is the
 * Story, then where things stand as of the last Scene's end, then the Scene, then the moment, slowest-changing first,
 * in prose, each with a size limit. Layers 1 and 2 are the same for every call in a Scene, so the provider caches them;
 * the time moves in layer 4.
 */

/**
 * Who a prompt in four layers is for. The Writer reads as the author, with who knows each thing; the Actor as a
 * novelist, shown everything about the people present with what each knows and believes stated plainly
 * (docs/adr/0017); the Editor what a Reply is checked against; the Director and the Weaver the whole World and where
 * it is going; the Chronicler what it records against, with each kept item's id so a record can change or close it.
 */
export type Reader = "writer" | "actor" | "editor" | "director" | "weaver" | "chronicler";

/** A prompt's four layers, slowest-changing first, each in prose. */
export interface Layers {
  /** Layer 1, the Story: the job's instructions, the Premise, Style, World and Rules. */
  story: string;
  /** Layer 2, where things stand as of the last Scene's end. */
  standing: string;
  /** Layer 3, the Scene so far. */
  scene: string;
  /** Layer 4, this moment: the time, and what the job brings to it. */
  moment: string;
}

/** Readers who look things up while they work (docs/adr/0018): a part cut for length tells them so. */
const LOOKS_UP: ReadonlySet<Reader> = new Set(["writer", "director", "weaver", "chronicler"]);
/** Readers who steer the Story: given the Outline, the Arcs, the Landmarks, the Threads and the player's wishes. */
const STEERS: ReadonlySet<Reader> = new Set(["writer", "director", "weaver"]);
/** Readers who write the truth, and change or close kept items by their ids. */
const RECORDS: ReadonlySet<Reader> = new Set(["chronicler", "weaver"]);
/** Readers who see the whole World, not only the people present. */
const SEES_ALL: ReadonlySet<Reader> = new Set(["director", "weaver"]);
/** How many things that ended are told, newest first, beside what is true now. */
const ENDED = 6;
/** How many of a recorded Scene's latest exchanges before its record's end are still carried word for word. */
const LATEST_EXCHANGES = 6;

/**
 * The four layers of a prompt for [reader]: [present] are the people in the Scene besides the Player Character, or for
 * the Director and the Weaver the people who matter; [scene] is the Scene's entries up to the moment, told word for word
 * as far as its limit; [moment] is what the job brings to this moment, such as the Move, the Writer's plan or the span
 * to live, in the order it reads them; [instructions] are the job's own, at the top of layer 1.
 */
export function layers(state: State, beside: Beside, reader: Reader, present: string[], scene: Entry[], moment: (string | null)[], instructions = ""): Layers {
  const here = [...new Set(present)].filter(name => name !== state.playerCharacter);
  return {
    story: join([instructions.trim() || null, storyLayer(state, reader)]),
    standing: standingLayer(state, beside, reader, here),
    scene: sceneLayer(state, reader, scene),
    moment: momentLayer(state, moment)
  };
}

/** The four layers as a call: layer 1 as the system prompt, which the provider caches longest, and the rest after it. */
export function asCall(layered: Layers): { system: string; prompt: string } {
  return { system: layered.story, prompt: join([layered.standing, layered.scene, layered.moment]) };
}

/** The first of [lines], in order, that fit in [limit] tokens. */
function first(lines: string[], limit: number): string[] {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    used += tokens(line) + 1;
    if (used > limit) break;
    kept.push(line);
  }
  return kept;
}

/** The last of [lines], in order, that fit in [limit] tokens. */
function newest(lines: string[], limit: number): string[] {
  return first([...lines].reverse(), limit).reverse();
}

/**
 * One part of a layer: its heading, then as many of [items] as fit in [limit] tokens, the first or the newest, with how
 * many were left out, so nobody reads a cut part as the whole. Null when there is nothing to tell.
 */
function part(tag: string, heading: string, items: string[], limit: number, keep: "first" | "newest", lookUp: boolean): string | null {
  if (!items.length) return null;
  const room = limit - tokens(heading) - 30;
  const kept = keep === "first" ? first(items, room) : newest(items, room);
  const left = items.length - kept.length;
  const note = left ? `(${left} ${keep === "first" ? "more" : "earlier"} left out for length${lookUp ? "; look them up when you need them" : ""}.)` : null;
  return section(tag, [heading, ...(keep === "newest" && note ? [note] : []), ...kept, ...(keep === "first" && note ? [note] : [])].join("\n"));
}

/** [text] as a sentence: trimmed, and ended with a stop when it has none. */
function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?"'’”)]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** [text] as part of a sentence: trimmed, without its closing stop. */
function clause(text: string): string {
  return text.trim().replace(/[.]+$/, "");
}

/** Names as people say them: "Draconia", "Draconia and Hermione", "Draconia, Hermione and Harry". */
function list(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.join("");
}

/** Where things stand is as of the last Scene's end: while a Scene is played, its opening; after it, the clock. */
function asOf(state: State): string {
  return state.scene && !state.scene.closed ? state.scene.at : state.clock;
}

/** Layer 1, the Story: as it was set up and edited, its Rules, and the names given on the page. */
function storyLayer(state: State, reader: Reader): string {
  const pc = state.playerCharacter;
  const limits = LIMITS.parts;
  const steers = STEERS.has(reader);
  const lookUp = LOOKS_UP.has(reader);
  const ids = RECORDS.has(reader);
  const writes = reader === "actor" || reader === "writer" || reader === "editor";
  const lead = (name: string) => state.leads.includes(name);
  const person = (who: Person, role: string) => `- ${who.name}${role}${who.aliases.length ? `, also ${who.aliases.join(", ")}` : ""}${who.group ? `, of ${who.group}` : ""}: ${sentence(who.whoTheyAre)}${writes && who.appearance ? ` Looks: ${sentence(who.appearance)}` : ""}${who.after ? ` After: ${sentence(who.after)}` : ""}`;
  const pcPerson = state.people[pc];
  // The Leads first, so a Story too big for its limit loses the least.
  const people = Object.values(state.people).filter(who => who.name !== pc && who.broughtIn === null).sort((left, right) => Number(lead(right.name)) - Number(lead(left.name)));
  const places = (heading: string, items: { name: string; description: string }[]) => (items.length ? [heading, ...items.map(item => `- ${item.name}${item.description ? `: ${sentence(item.description)}` : ""}`)] : []);
  return join([
    part("story", `Title: ${state.title}`, [
      `Premise: ${state.premise}`,
      `Style: ${state.style}`,
      ...(steers && state.arcs.length ? ["Arcs:", ...state.arcs.map(arc => `- ${arc}`)] : []),
      ...(steers && state.landmarks.length ? ["Landmarks:", ...state.landmarks.map(landmark => `- ${landmark.name}, ${say(state, landmark.at)}: ${sentence(landmark.what)}`)] : [])
    ], limits.story, "first", lookUp),
    part("world", "The World.", [
      ...(state.world.summary ? [state.world.summary] : []),
      ...(state.world.history ? [`History: ${state.world.history}`] : []),
      ...places("Places:", state.world.places),
      ...places("Institutions:", state.world.institutions),
      ...places("Groups, each followed as one:", state.groups)
    ], limits.world, "first", lookUp),
    part("people", "Who each person was when the Story began. Who they are now is under where things stand, and comes first.", [
      ...(pcPerson ? [person(pcPerson, ", the player's character")] : []),
      ...people.map(who => person(who, lead(who.name) ? ", a Lead" : ""))
    ], limits.people, "first", lookUp),
    part("rules", "How this World works. Each Rule holds for the rest of the Story, unless the Story changes it on the page.",
      open(state.truth.rules).sort((left, right) => left.opened - right.opened).map(rule => `- ${ids ? `[${rule.id}] ` : ""}${sentence(rule.what)}${rule.opened ? ` (Scene ${rule.opened})` : ""}`),
      limits.rules, "first", lookUp),
    part("named", "Named on the page. Each is part of the World from then on, keeps its name, and is what was said of it.",
      Object.values(state.truth.names).sort((left, right) => left.first - right.first).map(name => `- ${name.name}, a ${name.kind} first named in Scene ${name.first}: ${sentence(name.what)}`),
      limits.names, "first", lookUp)
  ]);
}

/** Layer 2, where things stand as of the last Scene's end: what does not hang on who is present first, then what does. */
function standingLayer(state: State, beside: Beside, reader: Reader, here: string[]): string {
  const at = asOf(state);
  const steers = STEERS.has(reader);
  return join([
    storySoFarPart(state),
    steers ? outlinePart(state, reader, here) : null,
    steers ? part("threads", "What is developing in the World on its own.", state.threads.map(thread => `- ${thread.name}: ${sentence(thread.now)}`), LIMITS.parts.threads, "first", true) : null,
    calendarOf(state, reader, at),
    wishesPart(beside, reader),
    livesPart(state, reader, here),
    betweenPart(state, reader, here),
    knowsOf(state, reader, here),
    truthsPart(state, reader, here, at),
    latelyPart(state, reader, here),
    reader === "editor" ? rememberedPart(state, here) : null
  ]);
}

/** The Outline: the current Act in detail, where each person is heading, and the setups waiting; all of it for the Director. */
function outlinePart(state: State, reader: Reader, here: string[]): string | null {
  const outline = state.outline;
  if (!outline) return null;
  const director = reader === "director";
  const id = (value: string) => (director ? `[${value}] ` : "");
  const detail = (act: Act): string[] => [
    `Act ${act.number}, ${act.title}${act.number === outline.current ? ", now" : ""}. Its question: ${sentence(act.question)} It builds to ${sentence(act.buildsTo)}`,
    ...act.turns.map(turn => `- ${id(turn.id)}${turn.state === "done" ? "Done" : "Ahead"}, ${turn.when}: ${sentence(turn.what)}${turn.serves.length ? ` It moves ${list(turn.serves)}.` : ""}`),
    ...act.relationships.map(item => `- By its end, ${list(item.people)}: ${sentence(item.byEnd)}`),
    ...act.movers.map(item => `- ${item.who} this Act: ${sentence(item.doing)}`),
    ...(act.handsOn ? [`It hands on: ${sentence(act.handsOn)}`] : [])
  ];
  const current = currentAct(outline);
  const later = outline.acts.filter(act => act.number > outline.current);
  const intentions = outline.intentions.filter(item => SEES_ALL.has(reader) || here.includes(item.who));
  const setups = director ? outline.setups : waiting(outline);
  return part("outline", `Where the Story is going, the Outline${director ? `, as last revised ${outline.revisedAfter ? `after Scene ${outline.revisedAfter}` : "when the Story started"}` : ""}.`, [
    ...(current ? detail(current) : []),
    ...(director ? outline.acts.filter(act => act !== current).flatMap(detail) : later.slice(0, 1).map(act => `Next, Act ${act.number}, ${act.title}: ${sentence(act.question)}`)),
    ...(director && outline.ending ? [`How it ends: ${sentence(outline.ending)}`] : []),
    ...(director && outline.promoted.length ? [`Brought forward, whatever play says: ${list(outline.promoted)}.`] : []),
    ...(intentions.length ? ["Where each is heading this Act, for their own sake:", ...intentions.map(item => `- ${item.who} pursues ${clause(item.pursues)}; feels ${clause(item.feelings)}; heading for ${clause(item.heading)}.`)] : []),
    ...(setups.length ? ["Setups planted to pay off:", ...setups.map(setup => `- ${id(setup.id)}${sentence(setup.what)} ${setup.planted === null ? "Not planted yet." : `Planted in Scene ${setup.planted}.`} It pays off: ${sentence(setup.payoff)}${director ? ` (${setup.state})` : ""}`)] : [])
  ], LIMITS.parts.outline, "first", true);
}

/** The calendar as of the last Scene's end, in dates: what each reader may see of it. */
function calendarOf(state: State, reader: Reader, at: string): string | null {
  const ahead = (when: string) => minutesAt(when) >= minutesAt(at);
  const soonest = <T extends { at: string }>(items: T[]) => [...items].sort((left, right) => minutesAt(left.at) - minutesAt(right.at));
  const sees = reader !== "actor" && reader !== "editor";
  const engagements = engagementsAhead(state, at).slice(0, BUDGET.calendar).map(({ engagement, next }, index) =>
    `- E${index + 1} ${say(state, next)}${engagement.every === "week" ? ", every week" : ""}, ${engagement.place}: ${sentence(engagement.what)}${engagement.who.length ? ` With ${list(engagement.who)}.` : ""}${engagement.expected ? " He is expected." : ""}`);
  const on = sees ? soonest(state.on.filter(item => ahead(item.at))).map(item => `- ${say(state, item.at)}, ${item.place}: ${sentence(item.what)}${item.who.length ? ` With ${list(item.who)}.` : ""}`) : [];
  const landmarks = sees ? soonest(state.landmarks.filter(landmark => ahead(landmark.at))).slice(0, 2).map(landmark => `- ${landmark.name}, ${say(state, landmark.at)}`) : [];
  const planned = STEERS.has(reader) ? plannedAhead(state, at).map(scene => `- ${scene.id} ${say(state, scene.at)}, ${scene.place}, with ${scene.who.length ? list(scene.who) : "nobody else"}: ${sentence(scene.for)}`) : [];
  return part("calendar", `The calendar, as of ${say(state, at)}.`, [
    ...(state.routine.length ? ["His routine:", ...state.routine.map(line => `- ${line}`)] : []),
    ...(engagements.length ? ["What he has arranged:", ...engagements] : []),
    ...(on.length ? ["What is on ahead:", ...on] : []),
    ...(landmarks.length ? ["Landmarks next:", ...landmarks] : []),
    ...(planned.length ? ["The plan's Scenes that matter ahead:", ...planned] : [])
  ], LIMITS.parts.calendar, "first", LOOKS_UP.has(reader));
}

/** What the player wants, kept beside the Story (docs/adr/0020): Taste for whoever writes, the rest for who steers. */
function wishesPart(beside: Beside, reader: Reader): string | null {
  if (reader === "chronicler") return null;
  const steers = STEERS.has(reader);
  const taste = tasteLines(beside);
  const waiting = beside.notes.filter(note => note.answeredBy === null);
  return part("the_players_wishes", "What the player wants.", [
    ...(taste.length ? ["Taste, the lessons the player has taught:", ...taste.map(line => `- ${line}`)] : []),
    ...(reader === "director" && waiting.length ? ["The player's steering notes, not yet answered. They are orders, and win over your own reading of play:", ...waiting.map(note => `- ${note.text}`)] : []),
    ...(steers && beside.brief.more.length ? ["More of:", ...beside.brief.more.map(line => `- ${line}`)] : []),
    ...(steers && beside.brief.less.length ? ["Less of:", ...beside.brief.less.map(line => `- ${line}`)] : []),
    ...(steers && beside.reactions.length ? ["Reactions to recent Scenes:", ...beside.reactions.slice(-6).map(item => `- Scene ${item.scene}, ${item.title}: ${item.reaction === "more" ? "more like this" : "less like this"}${item.note ? ` (${item.note})` : ""}`)] : [])
  ], LIMITS.parts.wishes, "first", false);
}

/** Who each person is now (openspec the-truth: Who each person is now is kept): what writes them reads it first. */
function livesPart(state: State, reader: Reader, here: string[]): string | null {
  const pc = state.playerCharacter;
  const steers = STEERS.has(reader);
  // Each person's share of the part: who they are now first, so a long list of feelings never pushes it out.
  const share = Math.max(500, Math.floor(LIMITS.parts.lives / Math.max(1, here.length)));
  const writes = reader === "actor" || reader === "writer" || reader === "editor";
  const life = (name: string): string => {
    const person = state.people[name];
    const now = state.truth.now[name];
    const lately = state.lives[name];
    const named = state.truth.names[name];
    const intention = steers ? state.outline?.intentions.find(item => item.who === name) : undefined;
    const known = reader !== "actor" ? state.known[name] : undefined;
    return first([
      `${name}${person && person.broughtIn !== null ? ` (new to the Story: ${clause(person.whoTheyAre)})` : ""}${!person && named ? ` (first named in Scene ${named.first}: ${clause(named.what)})` : ""}`,
      // Someone the Director brought in is not among the people in layer 1: whoever writes them is told how they look here.
      ...(writes && person && person.broughtIn !== null && person.appearance ? [`  Looks: ${sentence(person.appearance)}`] : []),
      now ? `  Now, as of Scene ${now.scene}: ${sentence(now.now)}` : "  Now: as when the Story began.",
      ...(now?.feelings ?? []).map(item => `  About ${item.about}: ${sentence(item.feels)}`),
      ...(now?.wants ? [`  Wants: ${sentence(now.wants)}`] : []),
      ...(now?.hides ? [`  Hides: ${sentence(now.hides)}`] : []),
      ...(lately && (lately.where || lately.doing) ? [`  Lately: ${[lately.where ? `at ${lately.where}` : "", lately.doing ?? ""].filter(Boolean).join(", ")}.`] : []),
      ...(lately?.after ? [`  After: ${sentence(lately.after)}`] : []),
      ...(intention ? [`  Heading this Act: ${sentence(intention.heading)}`] : []),
      ...(known ? [`  What ${pc} knows of them: ${sentence(known.text)}`] : [])
    ], share).join("\n");
  };
  const who = SEES_ALL.has(reader) ? "Who each person who matters is now" : "Who each person here is now";
  return part("people_now", `${who}, as of the last Scene's end. Write them from this, not from who they were when the Story began.`, here.map(life), LIMITS.parts.lives, "first", LOOKS_UP.has(reader));
}

/**
 * Where things stand between each two of the people here, the Player Character among them (openspec the-truth: Where
 * things stand between any two people is kept): the turn that began it and the newest, and every keepsake in its own
 * words, which never fades.
 */
function betweenPart(state: State, reader: Reader, here: string[]): string | null {
  const people = [state.playerCharacter, ...here];
  const pairs = people.flatMap((one, index) => people.slice(index + 1).map(other => [one, other] as const));
  const known = pairs.filter(([one, other]) => state.truth.between[betweenKey(one, other)] || bondOf(state, one, other));
  const share = Math.max(400, Math.floor(LIMITS.parts.between / Math.max(1, known.length)));
  return part("between", "Where things stand between them, the turns that brought it there, and the moments they would remember for life, in their own words.",
    known.flatMap(([one, other]) => pairOf(state, one, other, share) ?? []), LIMITS.parts.between, "first", LOOKS_UP.has(reader));
}

/** The Bond, his side of where things stand with [one] or [other], for a pair the truth has not kept yet. */
function bondOf(state: State, one: string, other: string) {
  const pc = state.playerCharacter;
  return one === pc ? state.bonds[other] : other === pc ? state.bonds[one] : undefined;
}

function pairOf(state: State, one: string, other: string, budget: number): string | null {
  const record = state.truth.between[betweenKey(one, other)];
  if (!record) {
    const bond = bondOf(state, one, other);
    const them = one === state.playerCharacter ? other : one;
    if (!bond) return null;
    const turns = bond.turns.map(turn => `  ${turn.scene ? `Scene ${turn.scene.number}: ` : ""}${sentence(turn.text)}`);
    return [`${them} and ${state.playerCharacter}, as he has seen it: ${sentence(bond.standing)}`, ...newest(turns, budget)].join("\n");
  }
  const [a, b] = record.people;
  const head = `${a} and ${b}: ${record.stands ? sentence(record.stands) : "where it stands has not been said."}`;
  const newestFirst = (count: number) => Array.from({ length: count }, (_, index) => count - 1 - index);
  // Keepsakes come first and never fade: the first of them, then the newest, as many as the pair's room holds; past it,
  // they are looked up, never lost.
  const keepsakes = pick(record.keepsakes.map(keepsake => `  Keepsake, Scene ${keepsake.scene}: ${sentence(keepsake.what)}${keepsake.words.length ? ` In their own words: ${keepsake.words.map(word => `"${word.text}"`).join(" ")}` : ""}`),
    [0, ...newestFirst(record.keepsakes.length)], budget - tokens(head) - 40);
  // Of the turns: the one that began it, those that made what still binds the two of them, then the newest.
  const binding = new Set(open(state.truth.truths).filter(truth => truth.who.includes(a) && truth.who.includes(b)).map(truth => truth.opened));
  const turns = pick(record.turns.map(turn => `  Scene ${turn.scene}: ${sentence(turn.text)}`),
    [0, ...record.turns.flatMap((turn, index) => (binding.has(turn.scene) ? [index] : [])), ...newestFirst(record.turns.length)], keepsakes.room);
  return [
    head,
    ...(record.turns.length ? ["  How it turned:", ...turns.kept, ...(turns.left ? [`  (${turns.left} more turns left out for length.)`] : [])] : []),
    ...keepsakes.kept,
    ...(keepsakes.left ? [`  (${keepsakes.left} more keepsakes left out for length.)`] : [])
  ].join("\n");
}

/** Of [lines], those at [order]'s indices that fit in [room] tokens, taken in that order and kept in their own. */
function pick(lines: string[], order: number[], room: number): { kept: string[]; left: number; room: number } {
  const chosen = new Set<number>();
  let rest = room;
  for (const index of order) {
    const line = lines[index];
    if (line === undefined || chosen.has(index)) continue;
    if (tokens(line) + 1 > rest) break;
    chosen.add(index);
    rest -= tokens(line) + 1;
  }
  return { kept: lines.filter((_, index) => chosen.has(index)), left: lines.length - chosen.size, room: rest };
}

/**
 * What each person here knows and believes, as plain statements (docs/adr/0017; openspec the-truth: What each person
 * knows and believes is kept): what they believe wrongly says so, and a secret that touches them says whether they know it.
 */
function knowsOf(state: State, reader: Reader, here: string[]): string | null {
  const ids = RECORDS.has(reader);
  const touched = new Set([state.playerCharacter, ...here]);
  const beliefs = open(state.truth.beliefs).sort((left, right) => left.opened - right.opened);
  // A secret touches the Scene when it concerns someone here, or someone here knows it and could let it out.
  const secrets = open(state.truth.truths).filter(truth => truth.kind === "secret" && (truth.who.some(name => touched.has(name)) || truth.knownTo.some(name => touched.has(name))))
    .sort((left, right) => left.opened - right.opened);
  const statements = here.flatMap(name => {
    const own = beliefs.filter(belief => belief.holder === name);
    return [
      ...own.map(belief => `${ids ? `[${belief.id}] ` : ""}${name} ${belief.true ? "knows" : "believes"} ${clause(belief.what)}${belief.opened ? ` (since Scene ${belief.opened})` : ""}.${belief.true ? "" : " That is not so."}`),
      ...secrets.filter(secret => !own.some(belief => clause(belief.what) === clause(secret.what))).map(secret => `${name} ${secret.knownTo.includes(name) ? "knows" : "does not know"} ${clause(secret.what)}.`)
    ];
  });
  const heading = reader === "actor"
    ? "What each person here knows and believes. Play each of them from this: they act on what they believe, wrong or not, and never on what they do not know."
    : "What each person knows and believes, wrong or not. Nobody acts on what they do not know.";
  return part("what_each_knows", heading, statements, LIMITS.parts.knows, "first", LOOKS_UP.has(reader));
}

const KINDS: Record<TruthKind, string> = { agreement: "An agreement", promise: "A promise", debt: "A debt", threat: "A threat", secret: "A secret", status: "How things stand" };

/** A deadline in dates, counted from [at]. */
function dueBy(state: State, due: string, at: string): string {
  const when = parseStoryTime(due);
  const now = parseStoryTime(at);
  const days = when && now ? when.day - now.day : null;
  if (days !== null && days < 0) return `It was due by ${say(state, due)}, ${-days} day${days === -1 ? "" : "s"} ago.`;
  return `Due by ${say(state, due)}${days === null ? "" : days === 0 ? ", today" : days === 1 ? ", tomorrow" : `, in ${days} days`}.`;
}

/**
 * What is true now that touches the people here, with who knows each (openspec the-truth: What is true now is kept);
 * the Director and the Weaver see all of it. What touched them and has ended reads as ended, with when it held; what
 * was changed reads as changed.
 */
function truthsPart(state: State, reader: Reader, here: string[], at: string): string | null {
  const pc = state.playerCharacter;
  const ids = RECORDS.has(reader);
  const all = SEES_ALL.has(reader);
  const people = new Set(here);
  const touches = (truth: Truth) => truth.who.some(name => people.has(name)) || truth.knownTo.some(name => people.has(name));
  const now = open(state.truth.truths).filter(truth => all || touches(truth) || truth.who.includes(pc))
    .sort((left, right) => Number(touches(right)) - Number(touches(left)) || right.opened - left.opened);
  const ended = Object.values(state.truth.truths).filter(truth => truth.closed !== null && touches(truth))
    .sort((left, right) => (right.closed ?? 0) - (left.closed ?? 0)).slice(0, ENDED);
  const since = (scene: number) => (scene ? `Scene ${scene}` : "the start");
  // What was changed rather than ended (a contract amended, a secret more people know) is told as changed.
  const replaced = new Set(Object.values(state.truth.truths).flatMap(truth => (truth.replaces ? [truth.replaces] : [])));
  const before = (truth: Truth) => replaced.has(truth.id)
    ? `- ${ids ? `[${truth.id}] ` : ""}Changed in Scene ${truth.closed}${truth.closedBy ? `: ${sentence(truth.closedBy)}` : "."} Before that, since ${since(truth.opened)}: ${sentence(truth.what)}${truth.terms.length ? ` Its terms were: ${truth.terms.map(clause).join("; ")}.` : ""}`
    : `- ${ids ? `[${truth.id}] ` : ""}${clause(truth.what)}: no longer so. It held from ${since(truth.opened)} until Scene ${truth.closed}${truth.closedBy ? `: ${sentence(truth.closedBy)}` : "."}`;
  return part("what_is_true", `What is true now${all ? "" : " that touches the people here"}, with who knows each. It holds unless it is changed on the page.`, [
    ...now.map(truth => [
      `- ${ids ? `[${truth.id}] ` : ""}${KINDS[truth.kind]}, since ${since(truth.opened)}: ${sentence(truth.what)}`,
      truth.terms.length ? `Its terms: ${truth.terms.map(clause).join("; ")}.` : "",
      truth.due ? dueBy(state, truth.due, at) : "",
      truth.who.length ? `It concerns ${list(truth.who)}.` : "",
      `Known to ${truth.knownTo.length ? list(truth.knownTo) : "nobody"}.`,
      truth.sources[0] ? `As it was said: "${truth.sources[0].text}"` : ""
    ].filter(Boolean).join(" ")),
    ...(ended.length ? ["What has ended or changed:", ...ended.map(before)] : [])
  ], LIMITS.parts.truths, "first", LOOKS_UP.has(reader));
}

/** What happened lately off the page, with who knows it; the Actor is given what someone here knows. */
function latelyPart(state: State, reader: Reader, here: string[]): string | null {
  const pc = state.playerCharacter;
  const visible = (fact: Fact) => reader !== "actor" || fact.knownTo.some(name => name !== pc && here.includes(name));
  const lately = state.facts.filter(fact => fact.source === "world" && visible(fact)).slice(-BUDGET.facts);
  return part("lately", "What happened lately off the page, and who knows it.",
    lately.map(fact => `- ${say(state, fact.at)}${fact.where ? `, ${fact.where}` : ""}: ${sentence(fact.what)} Known to ${fact.knownTo.length ? list(fact.knownTo) : "nobody"}.`),
    LIMITS.parts.lately, "newest", LOOKS_UP.has(reader));
}

/**
 * The Moments the people here were at or were told of, in their own words, weightiest and newest first: for the
 * Editor, so a Reply that contradicts what the Story keeps only as a Moment is caught.
 */
function rememberedPart(state: State, here: string[]): string | null {
  const pc = state.playerCharacter;
  const moments = state.facts
    .filter(fact => fact.source === "page" && fact.knownTo.some(name => name !== pc && here.includes(name)))
    .sort((left, right) => right.weight - left.weight || right.scene - left.scene);
  return part("remembered", "Moments the people here remember, in their own words, with who knows each.", moments.map(fact => [
    `- Scene ${fact.scene}, known to ${list(fact.knownTo)}: ${sentence(fact.what)}`,
    ...fact.quotes.map(quote => `  "${quote.text}"`)
  ].join("\n")), LIMITS.parts.moments, "first", false);
}

/** Layer 3, the Scene: where and with whom, and what has passed in it word for word, its newest passages as far as fit. */
function sceneLayer(state: State, reader: Reader, entries: Entry[]): string {
  const scene = state.scene;
  if (!scene) return "";
  const pc = state.playerCharacter;
  const writer = reader === "writer";
  const playing = !scene.closed;
  const head = [
    `${scene.title}. ${scene.place}, from ${say(state, scene.at)}${scene.closed && scene.endedAt ? ` until ${say(state, scene.endedAt)}, when it ended` : ""}.`,
    `Here besides ${pc}: ${scene.here.length ? list(scene.here) : "nobody"}.`,
    ...(writer && scene.purpose ? [`Purpose: ${scene.purpose}`, `Exit: ${scene.exit ?? ""}`] : []),
    ...(writer && scene.beats.length ? ["Beats:", ...scene.beats.map(beat => `- [${beat.status}] ${beat.text}`)] : []),
    ...(playing && scene.focus ? [`Focus is on ${scene.focus}.`] : []),
    ...(playing && scene.linger ? ["Linger is on: the moment is held."] : [])
  ].join("\n");
  const words = (from: Entry[]) => from.flatMap(entry => {
    switch (entry.payload.kind) {
      case "scene_opened": return entry.payload.prose ? [entry.payload.prose] : [];
      case "move": return [`<move by="${pc}">\n${entry.payload.text}\n</move>`];
      case "reply": return [entry.payload.text];
      default: return [];
    }
  });
  // A Scene recorded while it was played, once it ran long (the-storys-mind design decision 8), is carried as its
  // record, then word for word from its latest exchanges before the record's end.
  const recorded = scene.recorded;
  const through = recorded ? entries.findIndex(entry => entry.id === recorded.through) : -1;
  const before = through >= 0 ? words(entries.slice(0, through + 1)) : [];
  const latest = before.slice(-LATEST_EXCHANGES * 2);
  const passages = through >= 0 ? [...latest, ...words(entries.slice(through + 1))] : words(entries);
  const record = recorded && through >= 0 ? section("recorded_so_far", `The Scene so far, as it was recorded while it was played: ${recorded.paragraph}`) : null;
  const kept = newest(passages, LIMITS.layers.scene - tokens(head) - tokens(record ?? "") - 60);
  const left = passages.length - kept.length + before.length - latest.length;
  const readIt = LOOKS_UP.has(reader) ? "; read the Scene in full when you need them" : "";
  return join([
    section("scene", head),
    record,
    section("scene_so_far", [...(left ? [`(The Scene's first ${left} passages are left out${record ? ", told in its record above" : " for length"}${readIt}.)`] : []), ...kept].join("\n\n"))
  ]);
}

/** Layer 4, the moment: the time, which moves here and nowhere else, then what the job brings, its longest part cut to fit. */
function momentLayer(state: State, parts: (string | null)[]): string {
  const now = nowPart(state);
  const given = parts.filter((item): item is string => item !== null && item.trim() !== "");
  const room = LIMITS.layers.moment - tokens(now) - 10;
  const total = given.reduce((sum, item) => sum + tokens(item), 0);
  if (total <= room) return join([now, ...given]);
  const longest = given.reduce((at, item, index) => (item.length > (given[at]?.length ?? 0) ? index : at), 0);
  const kept = Math.max(0, (room - (total - tokens(given[longest] ?? ""))) * 4 - 40);
  return join([now, ...given.map((item, index) => (index === longest ? `${item.slice(0, kept)}\n(The rest is cut for length.)` : item))]);
}
