import type { Choice, Entry, Gathered } from "../story/entries.js";
import type { Beat, Fact, SceneCall, State } from "../story/state.js";
import type { Beside } from "../story/beside.js";
import { minutesOf, parseStoryTime, sayDate, sayTime } from "../time.js";
import { asCall, asTurns, layers, LIMITS, momentsPart, recallFacts, section, tokens } from "../context/lens.js";
import { decidesForPlayer, playerNames } from "./deciding.js";
import { addMinutes, matches, namer, nullable, oneOf, peopleEnum, text } from "./format.js";
import { nameIndex, namedIn } from "./names.js";
import type { Checked } from "./step.js";

/**
 * What a Scene is for and what happens next in it, as the writing call plans it beside the Reply it writes
 * (docs/adr/0022): the plan's format, its prompt in four layers, and the check that holds it to the Story.
 */

/** The most passages the Writer hands the Actor for one Reply. */
const GATHERED = 4;

/**
 * How long a Scene is carried before the Chronicler records it incrementally (the-storys-mind design decision 8):
 * fourteen exchanges (or approaching the Scene layer's token budget), so long open scenes keep `truth`, bonds,
 * moments, and `world` state alive instead of staying frozen until End Scene.
 */
export const LONG_SCENE = { exchanges: 18, tokens: LIMITS.layers.scene - 2_000 } as const;

export interface WriterAsk {
  state: State;
  /** The Scene's entries before the Move. */
  scene: Entry[];
  move: string;
  choice: Choice | null;
  /** What the Story has learned from the player, kept beside it (docs/adr/0020). */
  beside: Beside;
  /**
   * The Path up to the Move: what the Writer may look things up in, and where every passage it gathers must be found.
   * Without it, it looks nothing up in the Story, and gathers only from the Scene.
   */
  path?: Entry[];
}

export interface Frame {
  title: string;
  place: string;
  purpose: string;
  exit: string;
}

export interface WriterPlan {
  opens: Frame | null;
  plans: { purpose: string; exit: string } | null;
  here: string[];
  goes: string[];
  beats: Beat[];
  note: string;
  call: SceneCall;
  intensity: number;
  clock: string;
  inPlay: string[];
  movesTo: string | null;
  /** What it found in its lookups that the Reply needs, in the Story's own words. */
  gathered: Gathered[];
}

interface Raw {
  frame: Frame | null;
  comes_in: string[];
  goes: string[];
  beats: Beat[];
  note: string;
  call: SceneCall;
  intensity: number;
  minutes: number;
  in_play: string[];
  moves_to: string | null;
  /** Asked of every model; an answer without it gathered nothing. */
  gathered?: { words: string }[];
}

type Opening = "day_view" | "unplanned" | null;

function openingOf(state: State): Opening {
  if (!state.scene || state.scene.closed) return "day_view";
  return state.scene.purpose === null ? "unplanned" : null;
}

/**
 * Who the Writer reads where things stand for in Layer 2 (standing): pinned to Leads + the Scene's opening cast so
 * Turn 0 never mutates mid-Scene when a supporting character walks in or is mentioned — preserving 95%+ KV-cache hits
 * across the entire Scene. Anyone who entered later or is mentioned in the Move goes into Layer 4 (`<mentioned>`).
 */
function presentFor(ask: WriterAsk): string[] {
  const opening = openingOf(ask.state);
  if (opening === "day_view") return [...new Set([...ask.state.leads, ...(ask.choice?.who ?? ask.state.scene?.here ?? [])])];
  const opened = ask.scene.find(entry => entry.payload.kind === "scene_opened");
  const initialWho = opened?.payload.kind === "scene_opened" ? opened.payload.who : ask.state.scene?.here ?? [];
  return [...new Set([...ask.state.leads, ...initialWho])];
}

/** People currently present (who entered mid-Scene) or named in the Move who are not already in Layer 2's static cast. */
function mentionedPart(ask: WriterAsk, standing: string[]): string | null {
  const pc = ask.state.playerCharacter;
  const known = new Set([pc, ...standing]);
  const midSceneHere = openingOf(ask.state) === "day_view" ? [] : ask.state.scene?.here ?? [];
  const extra = [...new Set([...midSceneHere, ...namedIn(ask.move, nameIndex(Object.values(ask.state.people)))])].filter(name => !known.has(name));
  if (!extra.length) return null;
  const lines = extra.map(name => {
    const now = ask.state.truth.now[name];
    const life = ask.state.lives[name];
    const detail = [
      now ? now.now : ask.state.people[name]?.whoTheyAre ?? "",
      life && (life.where || life.doing) ? `Lately: ${[life.where ? `at ${life.where}` : "", life.doing ?? ""].filter(Boolean).join(", ")}.` : ""
    ].filter(Boolean).join(" ");
    return `- ${name}: ${detail}`;
  });
  return section("mentioned", lines.join("\n"));
}

/** The Writer's answer for this Story: its people and remembered Moments as fixed lists. */
export function writerFormat(state: State, moments: Fact[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["frame", "comes_in", "goes", "beats", "note", "call", "intensity", "minutes", "in_play", "moves_to", "gathered"],
    properties: {
      frame: { description: "The Scene's frame, when one opens or has no plan yet; otherwise null.", ...nullable({ type: "object", additionalProperties: false, required: ["title", "place", "purpose", "exit"], properties: { title: text, place: text, purpose: text, exit: text } }) },
      comes_in: { type: "array", items: peopleEnum(state), description: "Who comes into the Scene in the next Reply; when a Scene opens, everyone there besides the player's character." },
      goes: { type: "array", items: peopleEnum(state), description: "Who leaves the Scene in the next Reply." },
      beats: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "status"], properties: { text, status: { type: "string", enum: ["done", "in_play", "pending", "skipped"] } } } },
      note: { ...text, description: "The Beat Note for the Reply, about forty words." },
      call: { type: "string", enum: ["continue", "land"] },
      intensity: { type: "integer", minimum: 1, maximum: 5 },
      minutes: { type: "integer", minimum: 0, description: "How many minutes after now the Reply begins: a few in an ordinary exchange, more when the Move passes time." },
      in_play: { type: "array", items: oneOf(moments.map((_, index) => `M${index + 1}`)), description: "Up to two remembered Moments the Reply draws on; usually none." },
      moves_to: { type: ["string", "null"], description: "The new place whenever the Move changes location, even after a time skip or a change of activity; otherwise null. The Scene stays open." },
      gathered: {
        type: "array",
        description: `Up to ${GATHERED} passages your lookups found that the Reply needs, each copied exactly as the Story has it; usually none.`,
        items: { type: "object", additionalProperties: false, required: ["words"], properties: { words: { ...text, description: "The Story's own words: from a Move, a Reply, a Scene's opening or what happened off the page." } } }
      }
    }
  } as const;
}

/** How many exchanges the Scene has run before the Move. */
function exchangesIn(scene: Entry[]): number {
  return scene.filter(entry => entry.payload.kind === "move").length;
}

/**
 * Whether the open Scene has run past what is carried word for word and has not been recorded so far yet
 * (the-storys-mind design decision 8): the Chronicler then records it once, before the Writer plans the next Reply.
 */
export function recordDue(state: State, scene: Entry[]): boolean {
  if (!state.scene || state.scene.closed) return false;
  const recorded = state.scene.recorded;
  const through = recorded ? scene.findIndex(entry => entry.id === recorded.through) : -1;
  const delta = through >= 0 ? scene.slice(through + 1) : scene;
  const words = delta.flatMap(entry => {
    const payload = entry.payload;
    return payload.kind === "move" || payload.kind === "reply" ? [payload.text] : payload.kind === "scene_opened" && payload.prose ? [payload.prose] : [];
  });
  return exchangesIn(delta) > LONG_SCENE.exchanges || tokens(words.join("\n\n")) > LONG_SCENE.tokens;
}

/** People of the Story the last Reply named who are not here: it may have shown them come in. */
function shownNotHere(ask: WriterAsk): string[] {
  const reply = ask.scene.findLast(entry => entry.payload.kind === "reply");
  if (reply?.payload.kind !== "reply" || !ask.state.scene) return [];
  const here = ask.state.scene.here;
  return namedIn(reply.payload.text, nameIndex(Object.values(ask.state.people))).filter(name => name !== ask.state.playerCharacter && !here.includes(name));
}

function longRunPart(state: State): string | null {
  return state.plan ? section("long_run", [
    `Toward ${state.plan.toward}, a ${state.plan.phase} Stretch.`,
    ...state.plan.arcs.map(arc => `- ${arc.arc}: now ${arc.now}; may move to ${arc.next}; not yet ${arc.notYet}`),
    `Premise: ${state.plan.premise}`
  ].join("\n")) : null;
}

function writerMoment(ask: WriterAsk, moments: Fact[], standing: string[]): (string | null)[] {
  const { state } = ask;
  const pc = state.playerCharacter;
  const scene = state.scene;
  const opening = openingOf(state);
  const tasks: string[] = [];
  if (opening === "day_view") tasks.push(ask.choice ? `The player chose at the Day View: ${describeChoice(state, ask.choice)}. Open the Scene it begins.` : "The last Scene has closed: the Move opens a new one. Frame it.");
  if (opening === "unplanned") tasks.push("This Scene opened without a plan: frame it as it stands, keeping its title and place.");
  if (scene && !scene.closed) tasks.push("Only the player's End Scene action closes this Scene. A change of place, time or activity continues it: update moves_to and minutes as needed. There is no turn limit or deadline for a beat.");
  if (scene && !scene.closed && scene.recorded) tasks.push(`This Scene has run ${exchangesIn(ask.scene)} exchanges and was recorded so far. Continue from that record and the latest exchanges; recording does not end it.`);
  if (scene?.focus && !scene.closed) tasks.push(`Focus is on ${scene.focus}.`);
  if (scene?.linger && !scene.closed) tasks.push("Linger is on: hold the beat in play, force nothing, and call continue. Wherever the Move goes and however long it takes, the Scene goes on; set moves_to when they go somewhere.");
  if (state.pendingDirection?.text) tasks.push(`The player redid the last Reply with this Direction: ${state.pendingDirection.text}`);
  const plan = longRunPart(state);
  const chosen = ask.choice?.scene ? state.plan?.scenes.find(item => item.id === ask.choice?.scene) : undefined;
  return [
    plan,
    chosen ? section("scene_that_matters", [`${chosen.for}${chosen.lead ? ` It is about ${chosen.lead}.` : ""}`, ...(state.plan?.leads ?? []).filter(lead => lead.scene === chosen.id).map(lead => `${lead.who}'s move in it: ${lead.move}`)].join("\n")) : null,
    mentionedPart(ask, standing),
    momentsPart(state, moments),
    section("shown_not_here", shownNotHere(ask).join(", ")),
    section(`move by="${pc}"`, ask.move),
    section("task", tasks.join("\n"))
  ];
}

/**
 * The Writer's prompt in four layers (the-storys-mind design decision 7): the Story with its instructions; where
 * things stand for the people the Reply is with; the Scene so far; and this moment: the Stretch's plan and the Scene
 * that matters, the Moments the people here remember, who the last Reply named, the Move, and its task.
 */
export function writerPrompt(ask: WriterAsk, moments: Fact[], instructions: string): { system: string; prompt: string } {
  const standing = presentFor(ask);
  return asCall(layers(ask.state, ask.beside, "writer", standing, ask.scene, writerMoment(ask, moments, standing), instructions));
}

/** The Writer's prompt with strictly append-only alternating user/assistant Scene turns for 97%+ KV-cache hits. */
export function writerTurns(ask: WriterAsk, moments: Fact[], instructions: string): { system: string; prompt: string; turns: { role: "user" | "assistant"; text: string }[] } {
  const standing = presentFor(ask);
  const opening = openingOf(ask.state);
  const extra: (string | null)[] = [
    opening === "day_view"
      ? section("task", ask.choice ? `The player chose at the Day View: ${describeChoice(ask.state, ask.choice)}. Open the Scene it begins.` : "The last Scene has closed: this Move opens a new Scene.")
      : null,
    mentionedPart(ask, standing),
    ask.state.pendingDirection?.text ? section("direction", `Redo direction: ${ask.state.pendingDirection.text}`) : null
  ];
  // Static per-Scene standing blocks (<long_run> and cross-Scene <remembered> Moments) live in Turn 0 so they reach
  // direct Codex/Antigravity calls while staying 100% KV-cached across every turn of the Scene.
  const staticStanding: (string | null)[] = [longRunPart(ask.state), momentsPart(ask.state, moments)];
  return asTurns(ask.state, ask.beside, "writer", standing, ask.scene, writerMoment(ask, moments, standing), instructions, { text: ask.move, extra, staticStanding });
}

function describeChoice(state: State, choice: Choice): string {
  const parts = [choice.kind === "follow" ? `follow ${choice.who.join(", ")}` : choice.kind === "somewhere" ? `go to ${choice.place}` : choice.kind === "skip" ? "skip ahead" : `go to ${choice.place ?? "what is on"}`];
  const at = choice.at ? parseStoryTime(choice.at) : null;
  if (at) parts.push(`on ${sayDate(at, state.dayOne, true)} at ${sayTime(at)}`);
  if (choice.who.length && choice.kind !== "follow") parts.push(`with ${choice.who.join(", ")}`);
  return parts.join(" ");
}

/** [value] with its quote marks made plain and its spaces single, and where each of its characters came from. */
function plain(value: string): { out: string; at: number[] } {
  let out = "";
  const at: number[] = [];
  for (let index = 0; index < value.length; index++) {
    let char = value[index] ?? "";
    if (char === "‘" || char === "’") char = "'";
    if (char === "“" || char === "”") char = "\"";
    if (/\s/.test(char)) {
      if (out.endsWith(" ") || out.length === 0) continue;
      char = " ";
    }
    out += char;
    at.push(index);
  }
  return { out, at };
}

/** [words] as [source] has them, whatever their quote marks and spacing, or null when they are not in it. */
function wordsIn(source: string, words: string): string | null {
  const from = plain(source);
  const wanted = plain(words.trim()).out.trim();
  const start = wanted ? from.out.indexOf(wanted) : -1;
  if (start < 0) return null;
  return source.slice(from.at[start] ?? 0, (from.at[start + wanted.length - 1] ?? 0) + 1);
}

/** What the Story says in its own words on [path], each with the Scene it was played in, or null off the page. */
function passagesOn(path: Entry[]): { scene: number | null; text: string }[] {
  let scene = 0;
  return path.flatMap(entry => {
    const payload = entry.payload;
    if (payload.kind === "scene_opened") scene = payload.number;
    switch (payload.kind) {
      case "scene_opened": return payload.prose ? [{ scene, text: payload.prose }] : [];
      case "move":
      case "reply": return [{ scene: scene || null, text: payload.text }];
      case "world_moved": return payload.happened.map(item => ({ scene: null, text: item.what }));
      default: return [];
    }
  });
}

/** Checks the Writer's answer: only what makes it unusable is sent back (one-truth design decision 5). */
export function checkWriter(ask: WriterAsk, moments: Fact[], answer: unknown): Checked<WriterPlan> {
  const { state } = ask;
  const asked = writerFormat(state, moments);
  // A plan that gathers nothing is still a plan.
  const format = matches<Raw>({ ...asked, required: asked.required.filter(key => key !== "gathered") }, answer);
  if (!format.ok) return format;
  const raw = format.value;
  const dropped: string[] = [];
  const problems: string[] = [];
  const pc = state.playerCharacter;
  const pcNames = playerNames({ name: pc, aliases: state.people[pc]?.aliases ?? [] }, Object.values(state.people));
  // Only check active/future beats (pending/in_play), never done/skipped beats that merely summarize a past Move.
  const activeBeats = raw.beats.flatMap((beat, index) => (beat.status === "pending" || beat.status === "in_play" ? [[`beats[${index}]`, beat.text] as [string, string]] : []));
  for (const [where, value] of [["note", raw.note], ...activeBeats, ["frame.purpose", raw.frame?.purpose ?? ""]] as [string, string][]) {
    const phrase = decidesForPlayer(value, pcNames);
    if (phrase) problems.push(`${where} decides for the player's character ("${phrase}"); make it a circumstance or someone else's choice`);
  }
  const opening = openingOf(state);
  const opensScene = opening === "day_view";
  if ((opensScene || opening === "unplanned") && !raw.frame) problems.push(opensScene ? "frame: this Move opens a new Scene; write its frame" : "frame: this Scene has no plan yet; write its frame");
  if (problems.length) return { ok: false, problems };

  const named = namer(state, dropped, "people");
  const comesIn = named(raw.comes_in);
  const goes = named(raw.goes);
  const before = opensScene ? [] : state.scene?.here ?? [];
  // A Scene opened by a choice at the Day View is where the choice was, with whoever it was with: the code keeps the
  // books, whatever the frame says (one-truth design decision 5).
  const chosen = opening === "day_view" ? ask.choice : null;
  const chosenWho = (chosen?.who ?? []).filter(name => name !== pc && state.people[name]);
  const here = [...new Set([...before, ...chosenWho, ...comesIn])];
  const now = parseStoryTime(state.clock);
  let clock = addMinutes(state.clock, raw.minutes);
  const at = ask.choice?.at ? parseStoryTime(ask.choice.at) : null;
  if (opening === "day_view" && at && now && minutesOf(at) > minutesOf(parseStoryTime(clock) ?? now)) clock = ask.choice?.at ?? clock;
  const inPlay = raw.in_play.slice(0, 2).flatMap(label => {
    const fact = moments[Number(label.slice(1)) - 1];
    return fact ? [fact.id] : [];
  });
  // What it gathered is kept in the Story's own words, and only where the Story has them (docs/adr/0012).
  const story = passagesOn(ask.path ?? ask.scene);
  const gathered = (raw.gathered ?? []).slice(0, GATHERED).flatMap((item, index) => {
    for (const passage of story) {
      const words = wordsIn(passage.text, item.words);
      if (words) return [{ scene: passage.scene, words }];
    }
    dropped.push(`gathered[${index}]: "${item.words.trim().slice(0, 40)}" is not in the Story`);
    return [];
  });
  const frame = raw.frame;
  // A lingered Scene does not close or turn on its own: the call is set right, never sent back.
  const lingering = !opensScene && state.scene?.linger === true && !state.scene.closed;
  if (lingering && raw.call !== "continue") dropped.push(`call: Linger is on, so the Scene goes on rather than "${raw.call}"`);
  const call: SceneCall = lingering ? "continue" : raw.call;
  return {
    ok: true,
    dropped,
    value: {
      opens: opensScene && frame ? { ...frame, place: chosen?.place?.trim() || frame.place } : null,
      plans: !opensScene && frame ? { purpose: frame.purpose, exit: frame.exit } : null,
      here, goes: goes.filter(name => here.includes(name)), beats: raw.beats, note: raw.note.trim(), call,
      intensity: raw.intensity, clock, inPlay,
      movesTo: opensScene ? null : raw.moves_to?.trim() || null,
      gathered
    }
  };
}

/** The Writer's prompt for [ask], with the Moments it recalls for the people present and real Scene turns. */
export function writerCall(ask: WriterAsk, instructions: string): { system: string; prompt: string; turns: { role: "user" | "assistant"; text: string }[]; moments: Fact[] } {
  const moments = recallFacts(ask.state, presentFor(ask));
  return { ...writerTurns(ask, moments, instructions), moments };
}

export function writerFacts(ask: WriterAsk) {
  return { opening: openingOf(ask.state), clock: ask.state.clock, title: ask.state.scene?.title ?? null, place: ask.state.scene?.place ?? null, here: ask.state.scene?.here ?? [], beats: ask.state.scene && !ask.state.scene.closed ? ask.state.scene.beats : [], direction: ask.state.pendingDirection, choice: ask.choice };
}

/** The Moments a Beat Note put in play, for the Actor. */
export function inPlayFacts(state: State): Fact[] {
  const ids = new Set(state.scene?.inPlay ?? []);
  return state.facts.filter(fact => ids.has(fact.id));
}
