import { readFileSync } from "node:fs";
import type { Models } from "../models/model-call.js";
import type { Choice, Entry } from "../story/entries.js";
import type { Beat, Fact, ModelChoice, SceneCall, State } from "../story/state.js";
import { minutesOf, parseStoryTime } from "../time.js";
import { calendarPart, castPart, factsPart, join, momentsPart, nowPart, recallFacts, section, steeringPart, storyPart, storySoFarPart, threadsPart } from "../context/lens.js";
import { decidesForPlayer, playerNames } from "./deciding.js";
import { addMinutes, matches, namer, nullable, oneOf, peopleEnum, text } from "./format.js";
import { nameIndex, namedIn } from "./names.js";
import { runAgent, TIMEOUT_MS, type Checked } from "./step.js";

/**
 * The Writer: each Scene's author (docs/adr/0004). It reads every Move before the Actor answers it, and says what the
 * Scene is for, what happens next in it, and whether it is done. It sees the whole Story through the author lens:
 * everything, each thing marked with who knows it (one-truth design decision 3).
 */
const PROMPT = readFileSync(new URL("./WRITER.md", import.meta.url), "utf8");

/** A beat in play for this many Beat Notes is made to happen by the next one. */
export const BEAT_CAP = 4;
/** After this many Beat Notes in a row with no Arc moving, the next one moves the Scene on. */
export const STALL_AFTER = 3;
/** How much of the Scene the Writer reads word for word. */
const WRITER_EXCHANGES = 30;

export interface WriterAsk {
  state: State;
  /** The Scene's entries before the Move. */
  scene: Entry[];
  move: string;
  choice: Choice | null;
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
  inPlay: string[];
  movesTo: string | null;
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
  in_play: string[];
  moves_to: string | null;
}

type Opening = "day_view" | "unplanned" | null;

function openingOf(state: State): Opening {
  if (!state.scene || state.scene.closed) return "day_view";
  return state.scene.purpose === null ? "unplanned" : null;
}

/** The Writer's answer for this Story: its people and remembered Moments as fixed lists. */
export function writerFormat(state: State, moments: Fact[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["leaves_scene", "frame", "comes_in", "goes", "beats", "note", "call", "intensity", "arc_moved", "minutes", "taste", "in_play", "moves_to"],
    properties: {
      leaves_scene: { type: "boolean", description: "The Move leaves this Scene or skips well ahead, so the next Scene begins with it." },
      frame: { description: "The Scene's frame, when one opens or has no plan yet; otherwise null.", ...nullable({ type: "object", additionalProperties: false, required: ["title", "place", "purpose", "exit"], properties: { title: text, place: text, purpose: text, exit: text } }) },
      comes_in: { type: "array", items: peopleEnum(state), description: "Who comes into the Scene in the next Reply; when a Scene opens, everyone there besides the player's character." },
      goes: { type: "array", items: peopleEnum(state), description: "Who leaves the Scene in the next Reply." },
      beats: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "status"], properties: { text, status: { type: "string", enum: ["done", "in_play", "pending", "skipped"] } } } },
      note: { ...text, description: "The Beat Note for the Reply, about forty words." },
      call: { type: "string", enum: ["continue", "land", "end"] },
      intensity: { type: "integer", minimum: 1, maximum: 5 },
      arc_moved: { type: "boolean" },
      minutes: { type: "integer", minimum: 0, description: "How many minutes after now the Reply begins: a few in an ordinary exchange, more when the Move passes time." },
      taste: { type: ["string", "null"] },
      in_play: { type: "array", items: oneOf(moments.map((_, index) => `M${index + 1}`)), description: "Up to two remembered Moments the Reply draws on; usually none." },
      moves_to: { type: ["string", "null"], description: "When the Move walks somewhere with the people here while the same thing goes on, the new place; otherwise null." }
    }
  } as const;
}

/** The Scene so far, word for word, the last exchanges of a long one. */
function sceneSoFar(entries: Entry[], pc: string): string {
  const parts = entries.flatMap(entry => {
    switch (entry.payload.kind) {
      case "scene_opened": return entry.payload.prose ? [entry.payload.prose] : [];
      case "move": return [`<move by="${pc}">\n${entry.payload.text}\n</move>`];
      case "reply": return [entry.payload.text];
      default: return [];
    }
  });
  return parts.slice(-WRITER_EXCHANGES * 2).join("\n\n");
}

/** People of the Story the last Reply named who are not here: it may have shown them come in. */
function shownNotHere(ask: WriterAsk): string[] {
  const reply = ask.scene.findLast(entry => entry.payload.kind === "reply");
  if (reply?.payload.kind !== "reply" || !ask.state.scene) return [];
  const here = ask.state.scene.here;
  return namedIn(reply.payload.text, nameIndex(Object.values(ask.state.people))).filter(name => name !== ask.state.playerCharacter && !here.includes(name));
}

export function writerPrompt(ask: WriterAsk, moments: Fact[]): { system: string; prompt: string } {
  const { state } = ask;
  const pc = state.playerCharacter;
  const scene = state.scene;
  const opening = openingOf(state);
  const present = opening === "day_view" ? ask.choice?.who ?? [] : scene?.here ?? [];
  const tasks: string[] = [];
  if (opening === "day_view") tasks.push(ask.choice ? `The player chose at the Day View: ${describeChoice(ask.choice)}. Open the Scene it begins.` : "The last Scene has closed: the Move opens a new one. Frame it.");
  if (opening === "unplanned") tasks.push("This Scene opened without a plan: frame it as it stands, keeping its title and place.");
  // While the player Lingers, nothing pushes the Scene along (openspec scenes: Linger holds the moment).
  const pushing = scene && !scene.closed && !scene.linger;
  if (pushing && scene.beatInPlayFor >= BEAT_CAP) tasks.push(`The beat in play has been in play for ${scene.beatInPlayFor} Replies: make it happen now, or skip it.`);
  if (pushing && scene.withoutArc >= STALL_AFTER) tasks.push(`No Arc has moved for ${scene.withoutArc} Replies: move the Scene on toward its turn, or call land.`);
  if (scene?.focus) tasks.push(`Focus is on ${scene.focus}.`);
  if (scene?.linger && !scene.closed) tasks.push("Linger is on: hold the beat in play, force nothing, and call continue.");
  if (state.pendingDirection?.text) tasks.push(`The player redid the last Reply with this Direction: ${state.pendingDirection.text}${state.pendingDirection.remember ? " (they asked for it to be remembered: put it in taste)" : ""}`);
  const plan = state.plan ? section("long_run", [
    `Toward ${state.plan.toward}, a ${state.plan.phase} Stretch.`,
    ...state.plan.arcs.map(arc => `- ${arc.arc}: now ${arc.now}; may move to ${arc.next}; not yet ${arc.notYet}`),
    `Premise: ${state.plan.premise}`
  ].join("\n")) : null;
  const chosen = ask.choice?.scene ? state.plan?.scenes.find(item => item.id === ask.choice?.scene) : undefined;
  return {
    system: join([PROMPT, storyPart(state)]),
    prompt: join([
      nowPart(state),
      steeringPart(state),
      plan,
      chosen ? section("scene_that_matters", [`${chosen.for}${chosen.lead ? ` It is about ${chosen.lead}.` : ""}`, ...(state.plan?.leads ?? []).filter(lead => lead.scene === chosen.id).map(lead => `${lead.who}'s move in it: ${lead.move}`)].join("\n")) : null,
      calendarPart(state, "author"),
      storySoFarPart(state),
      castPart(state, present, "author"),
      threadsPart(state),
      factsPart(state, "author", present),
      momentsPart(state, moments),
      scene && !scene.closed ? section("scene", `${scene.title}. ${scene.place}. Here besides ${pc}: ${scene.here.join(", ") || "nobody"}.${scene.purpose ? `\nPurpose: ${scene.purpose}\nExit: ${scene.exit}` : ""}${scene.beats.length ? `\nBeats:\n${scene.beats.map(beat => `- [${beat.status}] ${beat.text}`).join("\n")}` : ""}`) : null,
      section("scene_so_far", sceneSoFar(ask.scene, pc)),
      section("shown_not_here", shownNotHere(ask).join(", ")),
      section(`move by="${pc}"`, ask.move),
      section("task", tasks.join("\n"))
    ])
  };
}

function describeChoice(choice: Choice): string {
  const parts = [choice.kind === "follow" ? `follow ${choice.who.join(", ")}` : choice.kind === "somewhere" ? `go to ${choice.place}` : choice.kind === "skip" ? "skip ahead" : `go to ${choice.place ?? "what is on"}`];
  if (choice.at) parts.push(`at ${choice.at}`);
  if (choice.who.length && choice.kind !== "follow") parts.push(`with ${choice.who.join(", ")}`);
  return parts.join(" ");
}

/** Checks the Writer's answer: only what makes it unusable is sent back (one-truth design decision 5). */
export function checkWriter(ask: WriterAsk, moments: Fact[], answer: unknown): Checked<WriterPlan> {
  const { state } = ask;
  const format = matches<Raw>(writerFormat(state, moments), answer);
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
  const opensScene = opening === "day_view" || raw.leaves_scene;
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
      plans: !opensScene && opening === "unplanned" && frame ? { purpose: frame.purpose, exit: frame.exit } : null,
      here, goes: goes.filter(name => here.includes(name)), beats: raw.beats, note: raw.note.trim(), call,
      intensity: raw.intensity, arcMoved: raw.arc_moved, clock, taste: raw.taste?.trim() || null, inPlay,
      movesTo: !opensScene && raw.moves_to?.trim() ? raw.moves_to.trim() : null
    }
  };
}

/** Asks the Writer for the next Beat Note; its second model steps in when its own fails. */
export async function writeBeat(models: Models, choices: ModelChoice[], ask: WriterAsk, storyId: string, traceId: string, signal: AbortSignal): Promise<{ plan: WriterPlan; callId: string; model: ModelChoice }> {
  const present = openingOf(ask.state) === "day_view" ? ask.choice?.who ?? [] : ask.state.scene?.here ?? [];
  const moments = recallFacts(ask.state, present);
  const { system, prompt } = writerPrompt(ask, moments);
  const { value, callId, model } = await runAgent(models, choices, { agent: "writer", system, prompt, schema: writerFormat(ask.state, moments), facts: { opening: openingOf(ask.state), clock: ask.state.clock, title: ask.state.scene?.title ?? null, place: ask.state.scene?.place ?? null, here: ask.state.scene?.here ?? [], beats: ask.state.scene && !ask.state.scene.closed ? ask.state.scene.beats : [], direction: ask.state.pendingDirection, choice: ask.choice }, traceId, storyId }, answer => checkWriter(ask, moments, answer), TIMEOUT_MS.quick, signal);
  return { plan: value, callId, model };
}

/** The Moments a Beat Note put in play, for the Actor. */
export function inPlayFacts(state: State): Fact[] {
  const ids = new Set(state.scene?.inPlay ?? []);
  return state.facts.filter(fact => ids.has(fact.id));
}

void text;
