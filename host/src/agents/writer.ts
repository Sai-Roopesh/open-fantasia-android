import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Models } from "../models/model-call.js";
import type { World } from "../story/world.js";
import type { Choice, DirectorPlan } from "../story/entries.js";
import { answerWithOneRepair } from "./repair.js";
import type { Entry } from "../story/entries.js";
import type { Beat, ModelChoice, PendingDirection, SceneCall, State } from "../story/state.js";
import { minutesOf, parseStoryTime, sayStoryTime } from "../time.js";
import { decidesForPlayer, playerNames } from "./deciding.js";
import { nameIndex, namedIn, names } from "./names.js";
import { sayBetween, sayWords, type Recall } from "./recall.js";

/**
 * The Writer: each Scene's author (docs/adr/0004). It reads every Move before the Actor answers it, and answers one
 * question: what is this Scene for, what happens next in it, and is it done? Its answer is checked here, repaired
 * once with what was wrong, and only then written to the Story as a Beat Note.
 *
 * What the Writer must not be trusted to count is counted by code and said to it outright: how long the beat in
 * play has been in play, and how long it has been since an Arc moved (openspec scenes: Only what matters earns time).
 */

const PROMPT = readFileSync(new URL("./WRITER.md", import.meta.url), "utf8");

/** A beat in play for this many Beat Notes is made to happen by the next one. */
export const BEAT_CAP = 4;
/** After this many Beat Notes in a row with no Arc moving, the next one moves the Scene on. */
export const STALL_AFTER = 3;

const MIN_BEATS = 3;
const MAX_BEATS = 5;
/**
 * The Writer is asked for a note of forty words at most and a Taste line of twenty-five, but no model counts words
 * exactly: on the phone a note of 41 words failed a turn twice. What is refused is a note too long to be one or two
 * moves, and a Taste line too long to be one lesson.
 */
const MAX_NOTE_WORDS = 60;
const MAX_TASTE_WORDS = 40;
/** The Writer names at most this many remembered Moments for a Reply to draw on. */
const MAX_IN_PLAY = 2;
/** How much of the Scene the Writer reads word for word. */
const WRITER_EXCHANGES = 12;

const text = { type: "string", minLength: 1 } as const;

/** The Writer's answer, as the provider is asked to give it. */
export const WRITER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["leaves_scene", "frame", "comes_in", "goes", "beats", "note", "call", "intensity", "arc_moved", "clock", "taste", "in_play"],
  properties: {
    leaves_scene: { type: "boolean", description: "The Move leaves this Scene or skips well ahead, so the next Scene begins with it." },
    frame: {
      description: "The Scene's frame, when one opens or has no plan yet; otherwise null.",
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["title", "place", "purpose", "exit"],
          properties: { title: text, place: text, purpose: text, exit: text }
        },
        { type: "null" }
      ]
    },
    comes_in: { type: "array", items: { type: "string" }, description: "Who comes into the Scene in the next Reply; when a Scene opens, everyone there besides the player's character. Usually nobody." },
    goes: { type: "array", items: { type: "string" }, description: "Who leaves the Scene in the next Reply. Usually nobody." },
    beats: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "status"],
        properties: { text, status: { type: "string", enum: ["done", "in_play", "pending", "skipped"] } }
      }
    },
    note: { ...text, description: "The Beat Note for the Reply: forty words or fewer." },
    call: { type: "string", enum: ["continue", "land", "end"] },
    intensity: { type: "integer", minimum: 1, maximum: 5 },
    arc_moved: { type: "boolean" },
    clock: { type: "string", description: "The story time the Reply begins, \"Day N HH:MM\"." },
    taste: { type: ["string", "null"] },
    in_play: { type: "array", items: { type: "string" }, description: "Up to two remembered Moments the Reply should draw on, by their ids (M1 …); usually none." }
  }
} as const;

interface RawAnswer {
  leaves_scene: boolean;
  frame: { title: string; place: string; purpose: string; exit: string } | null;
  comes_in: string[];
  goes: string[];
  beats: Beat[];
  note: string;
  call: SceneCall;
  intensity: number;
  arc_moved: boolean;
  clock: string;
  taste: string | null;
  in_play: string[];
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
const matchesSchema = ajv.compile<RawAnswer>(WRITER_SCHEMA);

/** What the Writer is asked about: the State, the Scene so far, the Move, and a Redo's Direction. */
export interface WriterAsk {
  /** The State before the Move. */
  state: State;
  /** The Scene's entries before the Move: the open Scene, or the last one when it has closed. */
  scene: Entry[];
  move: string;
  direction: PendingDirection | null;
  /** What is remembered from before this Scene by the people in it. */
  recall: Recall;
  /** The World off-screen, hidden things included: the Writer sees everything and passes on only what happens next. */
  world: World;
  /** What the player chose at the Day View, when the Move is a choice: the Scene opens on it. */
  choice?: Choice | null;
  /** The Director's plan for this stretch, and how many of its Scenes are left (openspec long-run), once there is one. */
  plan?: { plan: DirectorPlan; scenesLeft: number } | null;
}

/** A new Scene's frame. */
export interface Frame {
  title: string;
  place: string;
  purpose: string;
  exit: string;
}

/** The Writer's answer as the engine writes it: checked, with every name as the Story keeps it. */
export interface WriterPlan {
  /** The Scene this Move opens, from the Day View or by leaving the last one. */
  opens: Frame | null;
  /** The purpose and exit of the open Scene, which had no plan until now. */
  plans: { purpose: string; exit: string } | null;
  /** Who is in the Scene for the Reply: everyone already there, or nobody when a Scene opens, and whoever comes in. */
  here: string[];
  /** Who of them leaves in the Reply. */
  goes: string[];
  beats: Beat[];
  note: string;
  call: SceneCall;
  intensity: number;
  arcMoved: boolean;
  clock: string;
  taste: string | null;
  /** The ids of the remembered Moments the Reply draws on. */
  inPlay: string[];
}

export type Checked = { ok: true; plan: WriterPlan } | { ok: false; problems: string[] };

/** The Writer could not give an answer the Story can use, in words the player can read. */
export class WriterFailed extends Error {}

/** Why the Writer must frame a Scene whatever the Move does, if it must. */
type Opening = "day_view" | "unplanned" | null;

function openingOf(state: State): Opening {
  if (!state.scene || state.scene.closed) return "day_view";
  return state.scene.purpose === null ? "unplanned" : null;
}

const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const inPlayIndex = (beats: Beat[]) => beats.findIndex(beat => beat.status === "in_play");

/**
 * Checks the Writer's answer against the moment it was written for, and returns the plan the engine writes, or every
 * problem a repair could fix.
 */
export function checkWriterAnswer(ask: WriterAsk, raw: unknown): Checked {
  if (!matchesSchema(raw)) {
    return { ok: false, problems: (matchesSchema.errors ?? []).map(error => `${error.instancePath.replace(/^\//, "").replace(/\//g, ".") || "answer"}: ${error.message ?? "is not as the schema says"}`) };
  }
  const { state } = ask;
  const problems: string[] = [];
  const pc = state.playerCharacter;
  const pcNames = playerNames({ name: pc, aliases: state.people[pc]?.aliases ?? [] });
  const decides = (where: string, value: string) => {
    const phrase = decidesForPlayer(value, pcNames);
    if (phrase) problems.push(`${where} decides for the player's character ("${phrase}"); make it a circumstance or someone else's choice`);
  };
  const index = nameIndex(Object.values(state.people));
  const opening = openingOf(state);
  const scene = state.scene;
  const opensScene = opening === "day_view" || raw.leaves_scene;

  // The frame: required when a Scene opens or has no plan yet.
  let opens: Frame | null = null;
  let plans: WriterPlan["plans"] = null;
  if (opensScene || opening === "unplanned") {
    if (!raw.frame) {
      problems.push(opening === "day_view"
        ? "frame: the last Scene has closed, so this Move opens a new one; write its frame"
        : raw.leaves_scene
          ? "frame: this Move opens a new Scene (leaves_scene is true); write its frame"
          : "frame: this Scene opened without a plan; write its frame, keeping its title and place");
    } else {
      const frame = { title: raw.frame.title.trim(), place: raw.frame.place.trim(), purpose: raw.frame.purpose.trim(), exit: raw.frame.exit.trim() };
      for (const field of ["title", "purpose", "exit"] as const) decides(`frame: its ${field}`, frame[field]);
      if (opensScene) opens = frame;
      else plans = { purpose: frame.purpose, exit: frame.exit };
    }
  }

  // Who is here: the Writer names only who comes in and who goes, so nobody leaves a Scene by being left out. A new
  // Scene starts with nobody besides the player's character. Someone already here coming in, or someone not here
  // going, changes nothing.
  const story = (field: "comes_in" | "goes") => raw[field].flatMap(name => {
    const known = index.get(name.trim().toLocaleLowerCase());
    if (!known) return (problems.push(`${field}: ${name.trim() || "a blank name"} is not in the story; use a name from the people, and leave walk-ons unnamed`), []);
    if (known === pc) return (problems.push(`${field}: ${pc} is the player's character, who is always here; leave them out`), []);
    return [known];
  });
  const before = opensScene ? [] : scene?.here ?? [];
  const comesIn = story("comes_in").filter(name => !before.includes(name));
  const here = [...new Set([...before, ...comesIn])];
  const goes = [...new Set(story("goes"))].filter(name => here.includes(name));
  if (!opens && scene?.focus) {
    for (const name of comesIn) {
      const person = state.people[name];
      if (person && name !== scene.focus && !names(ask.move, person)) problems.push(`comes_in: Focus is on ${scene.focus}, and the Move does not bring in ${name}; leave them out`);
    }
  }

  // The beats.
  const beats = raw.beats.map(beat => ({ text: beat.text.trim(), status: beat.status }));
  if (beats.length < MIN_BEATS || beats.length > MAX_BEATS) problems.push(`beats: there are ${beats.length}; a Scene has three to five`);
  const inPlay = beats.filter(beat => beat.status === "in_play").length;
  const open = beats.some(beat => beat.status === "in_play" || beat.status === "pending");
  if (open && inPlay !== 1) problems.push(`beats: ${inPlay} are in play; exactly one is, the next to happen, until every beat is done or skipped`);
  beats.forEach((beat, position) => decides(`beats: beat ${position + 1}`, beat.text));

  // The note.
  const note = raw.note.trim();
  const words = wordCount(note);
  if (words > MAX_NOTE_WORDS) problems.push(`note: it is ${words} words; say one or two moves, in forty words or fewer`);
  decides("note: it", note);

  // Linger holds the moment, and a stalled Scene moves on.
  if (!opens && scene?.linger && raw.call !== "continue") {
    problems.push("call: Linger is on, so the Scene is not brought to its turn or closed; call continue");
  }
  if (!opens && scene && !scene.linger && scene.purpose !== null && scene.withoutArc >= STALL_AFTER && !raw.arc_moved) {
    const before = inPlayIndex(scene.beats);
    const after = inPlayIndex(beats);
    const advanced = after > before || (before >= 0 && after === -1) || raw.call !== "continue";
    if (!advanced) problems.push(`beats: no Arc has moved for ${scene.withoutArc} exchanges; move to the next beat, or call land or end`);
  }

  // A choice at the Day View opens the Scene it asked for: there, then, with them (openspec day-view).
  const choice = ask.choice ?? null;
  if (choice && opens) {
    if (choice.place && opens.place.toLocaleLowerCase() !== choice.place.toLocaleLowerCase()) {
      problems.push(`frame: the player chose ${choice.place}; the Scene opens there, so its place is "${choice.place}"`);
    }
    if (choice.at && raw.clock.trim() !== choice.at) problems.push(`clock: the Scene opens when the player chose, ${choice.at}`);
    for (const name of choice.who) {
      if (!here.includes(name)) problems.push(`comes_in: ${name} will be there (the player chose this); bring them in`);
    }
  }

  // The clock never goes back.
  const clock = raw.clock.trim();
  const at = parseStoryTime(clock);
  const now = parseStoryTime(state.clock);
  if (!at) problems.push(`clock: "${clock}" is not a time like "Day 3 21:30"`);
  else if (now && minutesOf(at) < minutesOf(now)) problems.push(`clock: ${clock} is before now (${state.clock}); the clock never goes back`);

  // Taste comes only from a Direction.
  const taste = raw.taste?.trim() || null;
  if (ask.direction?.remember && !taste) problems.push("taste: the player asked to remember the Direction; write it as one short line");
  if (taste && !ask.direction?.text) problems.push("taste: only a Direction becomes Taste; leave it null");
  if (taste && wordCount(taste) > MAX_TASTE_WORDS) problems.push(`taste: it is ${wordCount(taste)} words; say one lesson, in twenty-five words or fewer`);

  // The memories in play, by the labels the task gave them.
  if (raw.in_play.length > MAX_IN_PLAY) problems.push(`in_play: there are ${raw.in_play.length}; name at most two, the ones this Reply draws on`);
  const memoriesInPlay = raw.in_play.flatMap(label => {
    const shown = /^M(\d+)$/.exec(label.trim());
    const moment = shown ? ask.recall.moments[Number(shown[1]) - 1] : undefined;
    if (!moment) return (problems.push(`in_play: ${label} is not a remembered Moment you were shown`), []);
    return [moment.id];
  });

  if (problems.length) return { ok: false, problems };
  return { ok: true, plan: { opens, plans, here, goes, beats, note, call: raw.call, intensity: raw.intensity, arcMoved: raw.arc_moved, clock, taste, inPlay: memoriesInPlay } };
}

function section(tag: string, body: string): string | null {
  if (!body.trim()) return null;
  return `<${tag}>\n${body.trim()}\n</${tag.split(" ")[0]}>`;
}

function say(state: State, at: string): string {
  const time = parseStoryTime(at);
  return time ? `${at} (${sayStoryTime(time, state.dayOneWeekday)})` : at;
}

/** The Story the Writer writes for: the same for every call, so its prompt cache hits (docs/adr/0005). */
function storyPrompt(state: State): string {
  const pc = state.playerCharacter;
  const people = Object.values(state.people).filter(person => person.name !== pc).map(person =>
    `- ${person.name}${person.aliases.length ? ` (also ${person.aliases.join(", ")})` : ""}: ${person.whoTheyAre}${person.after ? ` After: ${person.after}` : ""}`);
  return [
    PROMPT,
    section("story", [
      `Title: ${state.title}`,
      `Premise: ${state.premise}`,
      state.arcs.length ? `Arcs:\n${state.arcs.map(arc => `- ${arc}`).join("\n")}` : "Arcs: none set.",
      state.landmarks.length ? `Landmarks:\n${state.landmarks.map(landmark => `- ${landmark.name}, ${say(state, landmark.at)}: ${landmark.what}`).join("\n")}` : "",
      `Style: ${state.style}`,
      state.world.summary ? `World: ${state.world.summary}` : ""
    ].filter(Boolean).join("\n")),
    // Where Scenes can be set and what runs the World, as the Story File or the player last set them.
    section("places", state.world.places.map(place => `- ${place.name}${place.description ? `: ${place.description}` : ""}`).join("\n")),
    section("institutions", state.world.institutions.map(place => `- ${place.name}${place.description ? `: ${place.description}` : ""}`).join("\n")),
    section(`player_character name="${pc}"`, state.people[pc]?.whoTheyAre ?? ""),
    section("people", people.join("\n")),
    // The people the player most wants to spend time with; theirs to choose (openspec stories: Leads).
    section("leads", state.leads.join(", "))
  ].filter(part => part !== null).join("\n\n");
}

/** The Scene so far as the Writer reads it: the opening, then each Move and Reply, the last twelve exchanges. */
function sceneSoFar(entries: Entry[], pc: string): string {
  const exchanges: string[][] = [];
  for (const entry of entries) {
    const payload = entry.payload;
    if (payload.kind === "scene_opened" && payload.prose) exchanges.push([`<reply>\n${payload.prose}\n</reply>`]);
    if (payload.kind === "move") exchanges.push([`<move by="${pc}">\n${payload.text}\n</move>`]);
    if (payload.kind === "reply") {
      const last = exchanges.at(-1);
      const reply = `<reply>\n${payload.text}\n</reply>`;
      if (last?.length === 1 && last[0]?.startsWith("<move")) last.push(reply);
      else exchanges.push([reply]);
    }
  }
  return exchanges.slice(-WRITER_EXCHANGES).map(exchange => exchange.join("\n")).join("\n\n");
}

/** What the player chose at the Day View, as the Writer's task says it. */
function choiceTask(choice: Choice): string {
  switch (choice.kind) {
    case "go":
    case "story":
      return `The player chose ${choice.kind === "story" ? "the Story's own pick" : "to go"}: ${choice.place}, at ${choice.at}, with ${choice.who.join(", ")}. Open the Scene there and then, with them in it.`;
    case "follow":
      return `The player follows ${choice.who.join(", ")}: open the Scene wherever their Life has them going next, with them in it.`;
    case "somewhere":
      return `The player goes to ${choice.place}: open the Scene there.`;
    case "skip":
      return `The player lets the time pass until ${choice.at}: open the Scene then.`;
  }
}

/**
 * The Scene that matters the player chose, as the plan has it (story-in-stretches design decision 5): when, where, who,
 * what it is for and the Leads' moves in it. The Writer frames the new Scene from it; the player may still turn it aside.
 */
function sceneThatMatters(ask: WriterAsk): string | null {
  const id = ask.choice?.scene;
  const planned = id ? ask.plan?.plan.scenes.find(scene => scene.id === id) : undefined;
  if (!planned || !ask.plan) return null;
  const at = parseStoryTime(planned.at);
  const when = at ? `${planned.at} (${sayStoryTime(at, ask.state.dayOneWeekday)})` : planned.at;
  const moves = ask.plan.plan.leads.filter(lead => lead.scene === planned.id).map(lead => `${lead.who}'s move: ${lead.move}`);
  return section(`scene_that_matters at="${when}" place="${planned.place}" with="${planned.who.join(", ") || "nobody else"}"`, [
    `For: ${planned.for}`,
    ...moves,
    "Frame the Scene from this: it is what the week has been building to. Its turn is the plan's; what anyone says or does in it, and what the player's character does, is the Scene's."
  ].join("\n"));
}

/** How far back the Writer is shown what happened off-screen. */
const LATELY_MINUTES = 24 * 60;

/**
 * The World as the Writer reads it: every Life and Thread, and what happened off-screen in the last day of Story time
 * with who knows each thing. Something known to nobody in a Scene reaches it only through the Writer's note.
 */
function worldPrompt(state: State, world: World): string {
  const now = parseStoryTime(state.clock);
  const lately = world.happened.filter(item => {
    const at = parseStoryTime(item.at);
    return at && now && minutesOf(now) - minutesOf(at) <= LATELY_MINUTES;
  });
  const moved = world.lives.filter(life => life.where || life.doing);
  return [
    moved.length ? `Lives:\n${moved.map(life => `- ${life.who}: ${life.where ?? "somewhere"}; ${life.doing ?? "about their day"}; after: ${life.after}`).join("\n")}` : "",
    world.threads.length ? `Threads:\n${world.threads.map(thread => `- ${thread.name}: ${thread.now}`).join("\n")}` : "",
    lately.length ? `Lately, off-screen:\n${lately.map(item => `- ${item.what} (${say(state, item.at)}, ${item.where}; known to: ${item.knownTo.join(", ") || "nobody"})`).join("\n")}` : ""
  ].filter(Boolean).join("\n\n");
}

/** What the Writer is sent: the Story in its system prompt, the moment in its task, and the facts both came from. */
/**
 * The people of the Story the last Reply names who are not in the Scene (lasting-records design decision 5): a hint for
 * the Writer, who reads the page and brings in those it shows there, never those it only mentions.
 */
function shownNotHere(ask: WriterAsk): string[] {
  const { state } = ask;
  const reply = ask.scene.findLast(entry => entry.payload.kind === "reply")?.payload;
  if (reply?.kind !== "reply" || !state.scene) return [];
  const here = state.scene.here;
  return namedIn(reply.text, nameIndex(Object.values(state.people))).filter(name => name !== state.playerCharacter && !here.includes(name));
}

export function writerPrompt(ask: WriterAsk): { system: string; prompt: string; facts: Record<string, unknown> } {
  const { state, move, direction } = ask;
  const pc = state.playerCharacter;
  const scene = state.scene;
  const opening = openingOf(state);

  const sceneLines = scene ? [
    `Title: ${scene.title}`,
    `Place: ${scene.place}`,
    `Here besides ${pc}: ${scene.here.join(", ") || "nobody"}`,
    scene.purpose ? `Purpose: ${scene.purpose}\nExit: ${scene.exit ?? ""}` : "Not planned yet.",
    scene.beats.length ? `Beats:\n${scene.beats.map((beat, position) => `${position + 1}. [${beat.status}] ${beat.text}`).join("\n")}` : ""
  ].filter(Boolean).join("\n") : "";

  const task: string[] = [];
  if (opening === "day_view") task.push(`The last Scene has closed, and ${pc} is between Scenes. This Move opens the next Scene: frame it, with its beats, and write the note for its first Reply.`);
  else if (opening === "unplanned") task.push("This Scene opened without a plan. Frame it, keeping its title and place, judge its beats against the Move, and write the note for the Reply that answers it. If the Move leaves the Scene, set leaves_scene and frame the next one instead.");
  else task.push("Judge the beats against this Move, re-plan around it, and write the note for the Reply that answers it. If the Move leaves this Scene, set leaves_scene and frame the next one instead; `frame` is otherwise null.");
  if (opening !== "day_view" && scene) {
    if (scene.focus) task.push(`Focus is on ${scene.focus}: stay close beside them; nobody new comes in unless the Move brings them.`);
    if (scene.linger) task.push("Linger is on: hold the beat in play however long it has been, force nothing, and call continue.");
    else if (scene.purpose !== null) {
      if (scene.beatInPlayFor >= BEAT_CAP) task.push(`The beat in play has been in play for ${scene.beatInPlayFor} exchanges. Unless this Move did it, the note makes it happen now.`);
      if (scene.withoutArc >= STALL_AFTER) task.push(`No Arc has moved for ${scene.withoutArc} exchanges. Unless this Move moved one, move the Scene to its next beat, or call land or end.`);
    }
  }
  if (ask.choice) task.push(choiceTask(ask.choice));
  if (direction) {
    task.push(direction.text
      ? "The player asked for the last Reply again, with the Direction above. Follow it in the beats and the note, and never quote it."
      : "The player asked for the last Reply again. Write a different note from the last one.");
    if (direction.remember) task.push("They asked you to remember the Direction: write taste.");
  }
  task.push("Return only the JSON object.");

  const prompt = [
    section("now", say(state, state.clock)),
    section(opening === "day_view" ? "last_scene" : "scene", sceneLines),
    section("earlier", ask.recall.earlier.join("\n")),
    section("last_scene_end", sayWords(ask.recall.lastSceneEnd)),
    section("remembered", ask.recall.moments.map((moment, position) => section(`moment id="M${position + 1}" scene="${moment.scene}" known_to="${moment.knownTo.join(", ")}"`, `${moment.what}\n${sayWords(moment.words)}`)).join("\n\n")),
    section("between_you", sayBetween([...ask.recall.between, ...ask.recall.leads.filter(lead => !ask.recall.between.some(bond => bond.who === lead.who))])),
    section("world", worldPrompt(state, ask.world)),
    section(opening === "day_view" ? "last_scene_so_far" : "scene_so_far", sceneSoFar(ask.scene, pc)),
    opening === "day_view" ? null : section("shown_not_here", shownNotHere(ask).join(", ")),
    section(`move by="${pc}"`, move),
    direction?.text ? section("direction", direction.text) : null,
    ask.plan ? section("long_run", longRun(ask.plan.plan, ask.plan.scenesLeft)) : null,
    sceneThatMatters(ask),
    section("taste", state.taste.map(line => `- ${line}`).join("\n")),
    direction?.text ? section("directions_before", state.directions.map(line => `- ${line}`).join("\n")) : null,
    section("task", task.join("\n"))
  ].filter(part => part !== null).join("\n\n");

  const facts = {
    now: state.clock,
    opening,
    title: scene?.title ?? null,
    place: scene?.place ?? null,
    here: scene?.here ?? [],
    beats: scene?.beats ?? [],
    focus: scene?.focus ?? null,
    linger: scene?.linger ?? false,
    beatInPlayFor: scene?.beatInPlayFor ?? 0,
    withoutArc: scene?.withoutArc ?? 0,
    move,
    direction,
    choice: ask.choice ?? null
  };
  return { system: storyPrompt(state), prompt, facts };
}

/** The Director's plan as the Writer reads it: the stretch, each Arc's step and what is not yet, and the Premise. */
function longRun(plan: DirectorPlan, scenesLeft: number): string {
  const left = `About ${scenesLeft} Scene${scenesLeft === 1 ? " is" : "s are"} left in it`;
  const stretch = plan.phase === "build" ? `This stretch builds toward ${plan.toward}. ${left}.`
    : plan.phase === "peak" ? `This stretch peaks: ${plan.toward}. ${left}.`
    : `This stretch rests. ${left}; then the Story builds toward ${plan.toward}.`;
  return [
    stretch,
    plan.landmark ? `It builds toward the Landmark ${plan.landmark}.` : "",
    plan.arcs.length ? `Arcs:\n${plan.arcs.map(arc => `- ${arc.arc}: now, ${arc.now}. In this stretch it may go as far as: ${arc.next}. Not yet: ${arc.not_yet}.`).join("\n")}` : "",
    `Premise: ${plan.premise}`
  ].filter(Boolean).join("\n");
}

/**
 * Runs the Writer for one Move: one call, checked, and repaired once with what was wrong. Throws WriterFailed with the
 * reasons when no usable answer comes back.
 */
export async function writeBeat(models: Models, model: ModelChoice, ask: WriterAsk, storyId: string, traceId: string, signal: AbortSignal): Promise<{ plan: WriterPlan; callId: string }> {
  const { system, prompt, facts } = writerPrompt(ask);
  const { value, callId } = await answerWithOneRepair(models,
    { agent: "writer", model, system, prompt, schema: WRITER_SCHEMA, facts, traceId, storyId },
    answer => {
      const checked = checkWriterAnswer(ask, answer);
      return checked.ok ? { ok: true, value: checked.plan } : checked;
    },
    reason => new WriterFailed(`The Writer's answer could not be used: ${reason}`),
    signal);
  return { plan: value, callId };
}
