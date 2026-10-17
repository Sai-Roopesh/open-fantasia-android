import { readFileSync } from "node:fs";
import type { Models } from "../models/model-call.js";
import type { Choice, Entry, Gathered } from "../story/entries.js";
import type { Beat, Fact, ModelChoice, SceneCall, State } from "../story/state.js";
import type { Beside } from "../story/beside.js";
import type { TasteScope } from "../store/beside.js";
import { minutesOf, parseStoryTime, sayDate, sayTime } from "../time.js";
import { asCall, layers, LIMITS, momentsPart, recallFacts, section, tokens } from "../context/lens.js";
import { decidesForPlayer, playerNames } from "./deciding.js";
import { addMinutes, matches, namer, nullable, oneOf, peopleEnum, text } from "./format.js";
import { nameIndex, namedIn } from "./names.js";
import { BUDGETS, runAgent, type Checked, type ToolKit } from "./step.js";

/**
 * The Writer: each Scene's author (docs/adr/0004). It reads every Move before the Actor answers it, and says what the
 * Scene is for, what happens next in it, and whether it is done. It reads the four layers as the author, with who
 * knows each thing (the-storys-mind design decision 7), and plans in steps: it may look things up in the Story and on
 * the web first (docs/adr/0018), and hands the Actor its plan and the passages it gathered, in their own words
 * (the-storys-mind design decision 6).
 */
const PROMPT = readFileSync(new URL("./WRITER.md", import.meta.url), "utf8");

/** A beat in play for this many Beat Notes is made to happen by the next one. */
export const BEAT_CAP = 4;
/** After this many Beat Notes in a row with no Arc moving, the next one moves the Scene on. */
export const STALL_AFTER = 3;
/** The most passages the Writer hands the Actor for one Reply. */
const GATHERED = 4;

/**
 * How long a Scene is carried word for word (the-storys-mind design decision 8): about thirty exchanges, or a little
 * under the Scene layer's limit, so nothing is cut before it is recorded.
 */
export const LONG_SCENE = { exchanges: 30, tokens: LIMITS.layers.scene - 2_000 } as const;

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
  arcMoved: boolean;
  clock: string;
  taste: string | null;
  /** Whose Taste the lesson is, as the Writer reads it: the Story's, or the player's own (docs/adr/0020). */
  tasteFor: TasteScope | null;
  inPlay: string[];
  movesTo: string | null;
  /** What it found in its lookups that the Reply needs, in the Story's own words. */
  gathered: Gathered[];
}

interface Raw {
  leaves_scene: boolean;
  frame: Frame | null;
  comes_in: string[];
  goes: string[];
  beats: Beat[];
  note: string;
  call: SceneCall;
  intensity: number;
  arc_moved: boolean;
  minutes: number;
  taste: string | null;
  /** Asked of every model; an answer without it is still a plan, whose lesson is placed by its words. */
  taste_for?: TasteScope | null;
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
 * Who the Writer reads where things stand for: whoever the choice at the Day View was with, or who is here, then the
 * Leads, whom it brings in where the Story allows.
 */
function presentFor(ask: WriterAsk): string[] {
  const here = openingOf(ask.state) === "day_view" ? ask.choice?.who ?? [] : ask.state.scene?.here ?? [];
  return [...new Set([...here, ...ask.state.leads])];
}

/** The Writer's answer for this Story: its people and remembered Moments as fixed lists. */
export function writerFormat(state: State, moments: Fact[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["leaves_scene", "frame", "comes_in", "goes", "beats", "note", "call", "intensity", "arc_moved", "minutes", "taste", "taste_for", "in_play", "moves_to", "gathered"],
    properties: {
      leaves_scene: { type: "boolean", description: "The Move leaves this Scene or skips well ahead, or the Scene has become another one, so the next Scene begins with this Move." },
      frame: { description: "The Scene's frame, when one opens or has no plan yet; otherwise null.", ...nullable({ type: "object", additionalProperties: false, required: ["title", "place", "purpose", "exit"], properties: { title: text, place: text, purpose: text, exit: text } }) },
      comes_in: { type: "array", items: peopleEnum(state), description: "Who comes into the Scene in the next Reply; when a Scene opens, everyone there besides the player's character." },
      goes: { type: "array", items: peopleEnum(state), description: "Who leaves the Scene in the next Reply." },
      beats: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "status"], properties: { text, status: { type: "string", enum: ["done", "in_play", "pending", "skipped"] } } } },
      note: { ...text, description: "The Beat Note for the Reply, about forty words." },
      call: { type: "string", enum: ["continue", "land"] },
      intensity: { type: "integer", minimum: 1, maximum: 5 },
      arc_moved: { type: "boolean" },
      minutes: { type: "integer", minimum: 0, description: "How many minutes after now the Reply begins: a few in an ordinary exchange, more when the Move passes time." },
      taste: { type: ["string", "null"] },
      taste_for: { type: ["string", "null"], enum: ["story", "player", null], description: "Whose lesson taste is: player when it is about how the player likes to read in any story, story when it is about this one; null when taste is." },
      in_play: { type: "array", items: oneOf(moments.map((_, index) => `M${index + 1}`)), description: "Up to two remembered Moments the Reply draws on; usually none." },
      moves_to: { type: ["string", "null"], description: "When the Move walks somewhere with the people here while the same thing goes on, the new place; otherwise null." },
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
  if (!state.scene || state.scene.closed || state.scene.recorded) return false;
  const words = scene.flatMap(entry => {
    const payload = entry.payload;
    return payload.kind === "move" || payload.kind === "reply" ? [payload.text] : payload.kind === "scene_opened" && payload.prose ? [payload.prose] : [];
  });
  return exchangesIn(scene) > LONG_SCENE.exchanges || tokens(words.join("\n\n")) > LONG_SCENE.tokens;
}

/** People of the Story the last Reply named who are not here: it may have shown them come in. */
function shownNotHere(ask: WriterAsk): string[] {
  const reply = ask.scene.findLast(entry => entry.payload.kind === "reply");
  if (reply?.payload.kind !== "reply" || !ask.state.scene) return [];
  const here = ask.state.scene.here;
  return namedIn(reply.payload.text, nameIndex(Object.values(ask.state.people))).filter(name => name !== ask.state.playerCharacter && !here.includes(name));
}

/**
 * The Writer's prompt in four layers (the-storys-mind design decision 7): the Story with its instructions; where
 * things stand for the people the Reply is with; the Scene so far; and this moment: the Stretch's plan and the Scene
 * that matters, the Moments the people here remember, who the last Reply named, the Move, and its task.
 */
export function writerPrompt(ask: WriterAsk, moments: Fact[]): { system: string; prompt: string } {
  const { state } = ask;
  const pc = state.playerCharacter;
  const scene = state.scene;
  const opening = openingOf(state);
  const tasks: string[] = [];
  if (opening === "day_view") tasks.push(ask.choice ? `The player chose at the Day View: ${describeChoice(state, ask.choice)}. Open the Scene it begins.` : "The last Scene has closed: the Move opens a new one. Frame it.");
  if (opening === "unplanned") tasks.push("This Scene opened without a plan: frame it as it stands, keeping its title and place.");
  // While the player Lingers, nothing pushes the Scene along (openspec scenes: Linger holds the moment).
  const pushing = scene && !scene.closed && !scene.linger;
  if (pushing && scene.beatInPlayFor >= BEAT_CAP) tasks.push(`The beat in play has been in play for ${scene.beatInPlayFor} Replies: make it happen now, or skip it.`);
  if (pushing && scene.withoutArc >= STALL_AFTER) tasks.push(`No Arc has moved for ${scene.withoutArc} Replies: move the Scene on toward its turn, or call land.`);
  // A long Scene is closed by the Writer once it has become another (openspec scenes: A long Scene is recorded as it goes).
  if (scene && !scene.closed && scene.recorded && !scene.linger) {
    tasks.push(`This Scene has run ${exchangesIn(ask.scene)} exchanges, and was recorded so far. If it has become another one (they are somewhere else and something else is happening between them, or another day or night has begun), close it: set leaves_scene and frame the Scene it has become, which begins with this Move. A Scene still about the same thing goes on, however long.`);
  }
  if (scene?.focus && !scene.closed) tasks.push(`Focus is on ${scene.focus}.`);
  if (scene?.linger && !scene.closed) tasks.push("Linger is on: hold the beat in play, force nothing, and call continue. Never set leaves_scene: wherever the Move goes and however long it takes, the Scene goes on; set moves_to when they go somewhere.");
  if (state.pendingDirection?.text) tasks.push(`The player redid the last Reply with this Direction: ${state.pendingDirection.text}${state.pendingDirection.remember ? " (they asked for it to be remembered: put it in taste)" : ""}`);
  const plan = state.plan ? section("long_run", [
    `Toward ${state.plan.toward}, a ${state.plan.phase} Stretch.`,
    ...state.plan.arcs.map(arc => `- ${arc.arc}: now ${arc.now}; may move to ${arc.next}; not yet ${arc.notYet}`),
    `Premise: ${state.plan.premise}`
  ].join("\n")) : null;
  const chosen = ask.choice?.scene ? state.plan?.scenes.find(item => item.id === ask.choice?.scene) : undefined;
  return asCall(layers(state, ask.beside, "writer", presentFor(ask), ask.scene, [
    plan,
    chosen ? section("scene_that_matters", [`${chosen.for}${chosen.lead ? ` It is about ${chosen.lead}.` : ""}`, ...(state.plan?.leads ?? []).filter(lead => lead.scene === chosen.id).map(lead => `${lead.who}'s move in it: ${lead.move}`)].join("\n")) : null,
    momentsPart(state, moments),
    section("shown_not_here", shownNotHere(ask).join(", ")),
    section(`move by="${pc}"`, ask.move),
    section("task", tasks.join("\n"))
  ], PROMPT));
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
  // A plan that says nothing of whose lesson it is, or gathers nothing, is still a plan.
  const format = matches<Raw>({ ...asked, required: asked.required.filter(key => key !== "taste_for" && key !== "gathered") }, answer);
  if (!format.ok) return format;
  const raw = format.value;
  const dropped: string[] = [];
  const problems: string[] = [];
  const pc = state.playerCharacter;
  const pcNames = playerNames({ name: pc, aliases: state.people[pc]?.aliases ?? [] });
  for (const [where, value] of [["note", raw.note], ...raw.beats.map((beat, index) => [`beats[${index}]`, beat.text]), ["frame.purpose", raw.frame?.purpose ?? ""]] as [string, string][]) {
    const phrase = decidesForPlayer(value, pcNames);
    if (phrase) problems.push(`${where} decides for the player's character ("${phrase}"); make it a circumstance or someone else's choice`);
  }
  const opening = openingOf(state);
  // Under Linger nothing leaves the Scene but the player's End scene: a Move that goes elsewhere moves the place.
  const held = opening !== "day_view" && state.scene?.linger === true && !state.scene.closed;
  if (held && raw.leaves_scene) dropped.push("leaves_scene: Linger is on, so the Scene goes on here, wherever the Move takes them");
  const opensScene = opening === "day_view" || (raw.leaves_scene && !held);
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
  const taste = raw.taste?.trim() || null;
  return {
    ok: true,
    dropped,
    value: {
      opens: opensScene && frame ? { ...frame, place: chosen?.place?.trim() || frame.place } : null,
      plans: !opensScene && opening === "unplanned" && frame ? { purpose: frame.purpose, exit: frame.exit } : null,
      here, goes: goes.filter(name => here.includes(name)), beats: raw.beats, note: raw.note.trim(), call,
      intensity: raw.intensity, arcMoved: raw.arc_moved, clock, taste, tasteFor: taste ? raw.taste_for ?? null : null, inPlay,
      movesTo: opensScene ? null : raw.moves_to?.trim() || (held && raw.leaves_scene ? raw.frame?.place.trim() || null : null),
      gathered
    }
  };
}

/** The Writer's prompt for [ask], with the Moments it recalls for the people present. */
export function writerCall(ask: WriterAsk): { system: string; prompt: string; moments: Fact[] } {
  const moments = recallFacts(ask.state, presentFor(ask));
  return { ...writerPrompt(ask, moments), moments };
}

/**
 * Asks the Writer for the next Beat Note, in steps: it may look things up in the Story on its Path and on the web
 * first, within its budget, and [onLookup] hears each lookup as it is made. Its second model steps in when its own
 * fails.
 */
export async function writeBeat(models: Models, choices: ModelChoice[], ask: WriterAsk, storyId: string, traceId: string, signal: AbortSignal, onLookup: (line: string) => void = () => {}): Promise<{ plan: WriterPlan; callId: string; model: ModelChoice; lookups: string[] }> {
  const { system, prompt, moments } = writerCall(ask);
  const head = ask.path?.at(-1)?.id;
  const tools: ToolKit = { story: head ? { storyId, head } : null, web: true };
  const facts = { opening: openingOf(ask.state), clock: ask.state.clock, title: ask.state.scene?.title ?? null, place: ask.state.scene?.place ?? null, here: ask.state.scene?.here ?? [], beats: ask.state.scene && !ask.state.scene.closed ? ask.state.scene.beats : [], direction: ask.state.pendingDirection, choice: ask.choice };
  const { value, callId, model, lookups } = await runAgent(models, choices, { agent: "writer", system, prompt, schema: writerFormat(ask.state, moments), tools, facts, traceId, storyId }, answer => checkWriter(ask, moments, answer), BUDGETS.writer, signal, onLookup);
  return { plan: value, callId, model, lookups };
}

/** The Moments a Beat Note put in play, for the Actor. */
export function inPlayFacts(state: State): Fact[] {
  const ids = new Set(state.scene?.inPlay ?? []);
  return state.facts.filter(fact => ids.has(fact.id));
}
