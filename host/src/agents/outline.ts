import { readFileSync } from "node:fs";
import type { Models } from "../models/model-call.js";
import type { Beside, SteeringNote } from "../story/beside.js";
import type { OutlineSet } from "../story/entries.js";
import { currentAct, type Act, type Intention, type Outline, type Setup } from "../story/outline.js";
import { tiers } from "../story/relevance.js";
import type { ModelChoice, State } from "../story/state.js";
import { minutesOf, parseStoryTime, sayDate } from "../time.js";
import { asCall, layers, say, section } from "../context/lens.js";
import { matches, namer, peopleEnum, text } from "./format.js";
import { BUDGETS, runAgent, type Checked } from "./step.js";
import { tiersPart } from "./truth-record.js";

const PROMPT = readFileSync(new URL("./DIRECTOR.md", import.meta.url), "utf8");
const DEEP = readFileSync(new URL("./DIRECTOR-DEEP.md", import.meta.url), "utf8");

/**
 * Why the Director writes the Outline (openspec the-outline; the-storys-mind design decisions 2 and 5): the Story
 * starting; a focused revision after an ordinary Scene; a deep re-plan because the focused pass said the Scene turned
 * the Story, because the current Act ended, or because the player steered.
 */
export type OutlineWhy = "start" | "focused" | "deep" | "act-ended" | "steered";

export interface OutlineAsk {
  why: OutlineWhy;
  /** Why, in a sentence, for the Director's task and the entry. */
  reason: string;
}

/** Whether the Outline is worked through deeply, with research, or revised in a few steps. */
export const isDeep = (ask: OutlineAsk): boolean => ask.why !== "focused";

/** What the Director wrote: the Outline, the steering notes it answered, and whether a focused pass found the Story turned. */
export interface OutlineWritten {
  outline: Omit<Outline, "version">;
  /**
   * The steering notes the Outline answers, by id: every note waiting when a deep pass began, since a deep pass is
   * ordered to follow them all; none for a focused pass, which runs only when no note waits.
   */
  answered: string[];
  /** A focused pass's word that the Scene turned the Story, so the current Act is re-planned deeply; null when not. */
  turned: string | null;
}

/** How many lookups an Outline keeps, newest first: what the plan drew on, for Backstage. */
const LOOKED_UP = 40;

// ---------------------------------------------------------------- when

/** The steering notes the Director has not answered yet. */
export function waitingNotes(beside: Beside): SteeringNote[] {
  return beside.notes.filter(note => note.answeredBy === null);
}

/** The current Act, when it builds to a Landmark that has passed: it has ended, and the next is planned in detail. */
export function endedAct(state: State): Act | null {
  const act = currentAct(state.outline);
  const landmark = act ? state.landmarks.find(item => item.name.toLocaleLowerCase() === act.buildsTo.trim().toLocaleLowerCase()) : undefined;
  const at = landmark ? parseStoryTime(landmark.at) : null;
  const now = parseStoryTime(state.clock);
  return act && at && now && minutesOf(at) <= minutesOf(now) ? act : null;
}

/**
 * What the Director owes the Outline, or null (openspec the-outline: Every Story has an Outline to its end; The Outline
 * is reconsidered after every Scene; The player sees and steers the Outline). A Story with none is due its first, deep
 * and with research. Otherwise only at a Scene's end, never between exchanges, once per Scene: deep when the player
 * wrote a steering note or the current Act's Landmark has passed, focused otherwise. A focused pass that finds the
 * Scene turned the Story says so (`turned`), and the deep pass runs after it with the why "deep".
 */
export function outlineDue(state: State, beside: Beside): { depth: "focused" | "deep"; ask: OutlineAsk } | null {
  const outline = state.outline;
  if (!outline) return { depth: "deep", ask: { why: "start", reason: "The Story is starting: write its Outline, from now to its end." } };
  const scene = state.scene;
  if (!scene?.closed || scene.ended.includes("director") || outline.revisedAfter >= scene.number) return null;
  const act = currentAct(outline);
  const notes = waitingNotes(beside);
  if (notes.length) {
    const said = notes.map(note => `“${note.text}”`).join("; ");
    return { depth: "deep", ask: { why: "steered", reason: `The player steered the Story: ${said}. Re-plan ${act?.title ?? "the current Act"} deeply so it follows ${notes.length === 1 ? "the note" : "the notes"}, over your own reading of play.` } };
  }
  const ended = endedAct(state);
  if (ended) {
    const next = outline.acts.find(item => item.number > ended.number);
    return { depth: "deep", ask: { why: "act-ended", reason: `${ended.title} has ended with ${ended.buildsTo}: plan ${next?.title ?? "the next Act"} in detail.` } };
  }
  return { depth: "focused", ask: { why: "focused", reason: `Scene ${scene.number}, ${scene.title}, has ended: reconsider the Outline in the light of how it went.` } };
}

// ---------------------------------------------------------------- the prompt

/**
 * The Director's prompt in four layers, the same reading for the Outline and the Stretch (the-storys-mind design
 * decision 7; docs/research/design.md decision 14): its instructions and the Story, which the provider caches across
 * both; where things stand as of the last Scene's end, with the Lives of everyone who matters and the player's wishes;
 * the Scene; then this moment: whose Life is kept how, the steering notes it has answered, and [moment], what the job
 * brings, its task last.
 */
export function directorCall(state: State, beside: Beside, moment: (string | null)[]): { system: string; prompt: string } {
  const tiered = tiers(state);
  return asCall(layers(state, beside, "director", [...tiered.close, ...tiered.movers], [], [tiersPart(state, tiered), standingNotes(beside), ...moment], PROMPT));
}

/** The Landmarks from today on, soonest first. */
export function landmarksAhead(state: State) {
  const day = parseStoryTime(state.clock)?.day ?? 0;
  const minutes = (at: string) => minutesOf(parseStoryTime(at) ?? { day: 0, minuteOfDay: 0 });
  return state.landmarks.filter(landmark => (parseStoryTime(landmark.at)?.day ?? 0) >= day).sort((left, right) => minutes(left.at) - minutes(right.at));
}

/** The whole run, for the Outline: today, and every Landmark ahead to where the Story ends. */
function runPart(state: State): string | null {
  const now = parseStoryTime(state.clock);
  const ahead = landmarksAhead(state);
  return section("the_run", [
    now ? `Today is ${sayDate(now, state.dayOne, true)}.` : "",
    ahead.length ? `The Landmarks ahead, in order, to where the Story ends:\n${ahead.map(landmark => `- ${landmark.name}, ${say(state, landmark.at)}: ${landmark.what}`).join("\n")}` : "No Landmark is ahead: the Story ends where its Arcs and Lives take it."
  ].filter(Boolean).join("\n"));
}

/**
 * The steering notes the Director has answered: each still holds, and every Outline after keeps to it (openspec
 * the-outline: The player sees and steers the Outline). The notes waiting for an answer are with the player's wishes.
 */
function standingNotes(beside: Beside): string | null {
  const standing = beside.notes.filter(note => note.answeredBy !== null);
  return section("steering_notes", standing.length ? ["The player's steering notes answered before. Each still holds: every Outline keeps to it, over your own reading of play.", ...standing.map(note => `- ${note.text}`)].join("\n") : "");
}

/** The Stretch under way, with what it brought in, so the Outline is revised knowing it. */
function stretchPart(state: State): string | null {
  const plan = state.plan;
  if (!plan) return null;
  return section("this_stretch", [
    `Stretch ${plan.number}, toward ${plan.toward}:`,
    ...plan.scenes.map(scene => `- ${scene.id} ${say(state, scene.at)}, ${scene.headline}${state.played.includes(scene.id) ? " (played)" : ""}`),
    ...(plan.newThings.length ? [`It brought in: ${plan.newThings.map(thing => thing.what).join("; ")}`] : [])
  ].join("\n"));
}

/** The task, for how deep this pass goes. */
function taskText(state: State, ask: OutlineAsk): string {
  const act = currentAct(state.outline);
  const next = act ? state.outline?.acts.find(item => item.number > act.number) : undefined;
  const how: Record<OutlineWhy, string> = {
    start: "Give the first Act in detail, the next outlined, and the rest sketched to how the Story ends.",
    focused: "This is a focused revision, in a few steps at most: change the Outline where this Scene touched it and keep the rest as it was. If the Scene turned the Story, say what turned under `turned`, and the current Act is re-planned deeply after this; otherwise `turned` is null.",
    deep: `This Scene turned the Story. Re-plan ${act?.title ?? "the current Act"} in detail, and the Acts after it as far as they need, from where the Story now stands.`,
    "act-ended": `Make ${next?.title ?? "the next Act"} the current Act and plan it in detail; outline the one after it, and sketch the rest to the end.`,
    steered: `Follow every new steering note: ${act?.title ?? "the current Act"} builds toward what the player asked from now on.`
  };
  return [ask.reason, how[ask.why], isDeep(ask) ? `\`turned\` is null: you are already planning deeply.\n\n${DEEP.trim()}` : ""].filter(Boolean).join("\n\n");
}

/**
 * The Outline's prompt, in the Director's four layers: the Outline as it stands is where things stand; this moment
 * brings the Stretch under way, the whole run, and the task, with how deep this pass goes.
 */
export function outlinePrompt(state: State, beside: Beside, ask: OutlineAsk): { system: string; prompt: string } {
  return directorCall(state, beside, [stretchPart(state), runPart(state), section("task", taskText(state, ask))]);
}

// ---------------------------------------------------------------- the answer

const said = (value: string) => value.trim().replace(/[.;]$/, "");

interface RawAct {
  number: number;
  title: string;
  question: string;
  builds_to: string;
  turns: { id: string; when: string; what: string; serves: string[]; done: boolean }[];
  relationships: { people: string[]; by_end: string }[];
  movers: { who: string; doing: string }[];
  hands_on: string;
}

interface RawOutline {
  current: number;
  acts: RawAct[];
  ending: string;
  intentions: { who: string; pursues: string; feelings: string; heading: string }[];
  setups: { id: string; what: string; planted: number | null; payoff: string; turn: string | null; state: Setup["state"] }[];
  promoted: string[];
  turned: string | null;
}

export function outlineFormat(state: State) {
  const everyone = peopleEnum(state, true);
  const others = peopleEnum(state);
  return {
    type: "object",
    additionalProperties: false,
    required: ["current", "acts", "ending", "intentions", "setups", "promoted", "turned"],
    properties: {
      current: { type: "integer", minimum: 1, description: "The number of the Act being played." },
      acts: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["number", "title", "question", "builds_to", "turns", "relationships", "movers", "hands_on"], properties: {
        number: { type: "integer", minimum: 1 }, title: text, question: text, builds_to: text,
        turns: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "when", "what", "serves", "done"], properties: {
          id: text, when: text, what: text, serves: { type: "array", items: { type: "string" } }, done: { type: "boolean" }
        } } },
        relationships: { type: "array", items: { type: "object", additionalProperties: false, required: ["people", "by_end"], properties: { people: { type: "array", items: everyone, minItems: 2, maxItems: 2 }, by_end: text } } },
        movers: { type: "array", items: { type: "object", additionalProperties: false, required: ["who", "doing"], properties: { who: others, doing: text } } },
        hands_on: { type: "string" }
      } } },
      ending: text,
      intentions: { type: "array", items: { type: "object", additionalProperties: false, required: ["who", "pursues", "feelings", "heading"], properties: { who: others, pursues: text, feelings: text, heading: text } } },
      setups: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "what", "planted", "payoff", "turn", "state"], properties: {
        id: text, what: text, planted: { anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }] }, payoff: text, turn: { type: ["string", "null"] },
        state: { type: "string", enum: ["waiting", "paid", "dropped"] }
      } } },
      promoted: { type: "array", items: others },
      turned: { type: ["string", "null"] }
    }
  } as const;
}

/** The Scene the Outline is revised after: the one that has just closed, or none yet when the Story is starting. */
function afterScene(state: State): number {
  const scene = state.scene;
  return scene ? (scene.closed ? scene.number : scene.number - 1) : 0;
}

/**
 * Checks the Outline (openspec the-outline): what the code can work out it sets right, the detail of each Act by where
 * it stands, Landmarks by the Story's names for them, every setup kept until it is paid off or dropped; only an
 * Outline with no current Act, or a current Act with no turns, is sent back.
 */
export function checkOutline(state: State, beside: Beside, ask: OutlineAsk, answer: unknown): Checked<OutlineWritten> {
  const format = matches<RawOutline>(outlineFormat(state), answer);
  if (!format.ok) return format;
  const raw = format.value;
  const dropped: string[] = [];
  const before = state.outline;
  const landmark = (name: string) => state.landmarks.find(item => item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())?.name ?? name.trim();
  const acts = [...new Map([...raw.acts].reverse().map(act => [act.number, act])).values()].sort((left, right) => left.number - right.number);

  // An Act whose Landmark has passed is over: the current one is the next.
  let current = raw.current;
  const ended = endedAct(state);
  if (ended && current <= ended.number) {
    const next = acts.find(act => act.number > ended.number);
    if (!next) return { ok: false, problems: [`acts: ${ended.title} has ended with ${ended.buildsTo}; outline the Act after it, and make it the current one`] };
    current = next.number;
  }
  const kept = acts.filter(act => act.number >= current);
  const now = kept.find(act => act.number === current);
  if (!now) return { ok: false, problems: [`current: Act ${current} is not among the acts; give the current Act in detail, and every Act after it to the end`] };
  if (now.turns.length === 0) return { ok: false, problems: [`acts: Act ${now.number}, ${now.title}, is the current Act and needs its turns, roughly week by week, to its end`] };

  const everyone = namer(state, dropped, "acts.relationships");
  const movers = namer(state, dropped, "acts.movers");
  const outlineActs: Act[] = kept.map((act, index) => {
    const detail = index === 0 ? "detailed" : index === 1 ? "outlined" : "sketched";
    const sketched = detail === "sketched";
    return {
      number: act.number, title: act.title.trim(), question: act.question.trim(), buildsTo: landmark(act.builds_to), detail,
      turns: sketched ? [] : act.turns.map(turn => ({ id: turn.id.trim(), when: turn.when.trim(), what: turn.what.trim(), serves: turn.serves.map(item => item.trim()).filter(Boolean), state: turn.done ? "done" : "ahead" })),
      relationships: sketched ? [] : act.relationships.flatMap(item => {
        const people = everyone(item.people, true);
        return people.length === 2 ? [{ people, byEnd: item.by_end.trim() }] : [];
      }),
      movers: sketched ? [] : act.movers.flatMap(item => movers([item.who]).map(who => ({ who, doing: item.doing.trim() }))),
      handsOn: act.hands_on.trim()
    };
  });
  const act = outlineActs[0] as Act;
  for (const lead of state.leads.filter(name => name !== state.playerCharacter)) {
    if (!act.relationships.some(item => item.people.includes(lead))) dropped.push(`acts: ${act.title} does not say where things should stand with ${lead} by its end`);
  }

  const promoted = namer(state, dropped, "promoted")(raw.promoted);
  const intended = namer(state, dropped, "intentions");
  const intentions: Intention[] = [...new Map(raw.intentions.flatMap(item => intended([item.who]).map(who => [who, { who, pursues: item.pursues.trim(), feelings: item.feelings.trim(), heading: item.heading.trim() }] as const))).values()];
  const owed = [...new Set([...tiers(state).close, ...promoted, ...act.movers.map(item => item.who)])].filter(name => name !== state.playerCharacter && state.people[name]);
  for (const who of owed) if (!intentions.some(item => item.who === who)) dropped.push(`intentions: none for ${who}; what they pursue this Act is not in the Outline`);

  const setups = settle(state, raw.setups, outlineActs, dropped);

  const answered = isDeep(ask) ? waitingNotes(beside).map(note => note.id) : [];

  // A focused pass that moved the Outline on to the next Act has found the Act over: the next is planned deeply.
  const previous = currentAct(before);
  const movedOn = ask.why === "focused" && previous !== null && current > previous.number ? `${previous.title} has ended.` : null;
  const turned = ask.why === "focused" ? raw.turned?.trim() || movedOn : null;

  return {
    ok: true, dropped,
    value: {
      outline: {
        current, acts: outlineActs, ending: raw.ending.trim(), intentions, setups, promoted,
        revisedAfter: afterScene(state), deep: isDeep(ask), lookedUp: before?.lookedUp ?? []
      },
      answered, turned
    }
  };
}

/**
 * Every setup, as the answer leaves it (openspec the-outline: Nothing enters without a payoff): its payoff's turn
 * found among the Acts, the Scene it was planted in no later than the latest, and the Scene it was settled after once
 * it is paid off or dropped. A setup the answer leaves out is kept as it was: only the Director pays one off or drops it.
 */
function settle(state: State, raw: RawOutline["setups"], acts: Act[], dropped: string[]): Setup[] {
  const before = new Map((state.outline?.setups ?? []).map(setup => [setup.id, setup]));
  const turns = new Map(acts.flatMap(act => act.turns).map(turn => [turn.id.toLocaleLowerCase(), turn.id]));
  const latest = state.scene?.number ?? 0;
  const scene = afterScene(state);
  const written = new Map<string, Setup>();
  for (const item of raw) {
    const id = item.id.trim();
    const old = before.get(id);
    const turn = item.turn ? turns.get(item.turn.trim().toLocaleLowerCase()) ?? null : null;
    if (item.turn && !turn) dropped.push(`setups: ${id} pays off in "${item.turn}", which is not a turn of the Outline; it pays off in a later Act`);
    let planted = item.planted ?? old?.planted ?? null;
    if (planted !== null && planted > latest) {
      dropped.push(`setups: ${id} cannot have been planted in Scene ${planted}; there is no such Scene yet`);
      planted = old?.planted ?? null;
    }
    const settled = item.state === "waiting" ? null : old && old.state === item.state ? old.settled : scene;
    written.set(id, { id, what: item.what.trim(), planted, payoff: item.payoff.trim(), turn, state: item.state, settled });
  }
  for (const [id, old] of before) {
    if (written.has(id)) continue;
    if (old.state === "waiting") dropped.push(`setups: ${id}, ${said(old.what)}, was left out; it is kept, still waiting, until it is paid off or dropped`);
    written.set(id, old);
  }
  return [...written.values()];
}

/** The Director's facts for a scripted model: why it is asked, and what its answer must name. */
function outlineFacts(state: State, ask: OutlineAsk) {
  const { close, movers } = tiers(state);
  return {
    job: "outline", why: ask.why, current: currentAct(state.outline)?.number ?? 1, pc: state.playerCharacter,
    lives: [...close, ...movers].filter(name => state.people[name]),
    landmarks: landmarksAhead(state).map(landmark => landmark.name),
    setups: state.outline?.setups ?? []
  };
}

/**
 * Writes the Outline (openspec the-outline; docs/adr/0018): deep, with the Story's tools and the web and the budget
 * of about twenty steps, when the Story starts, an Act ends, the player steered or a focused pass found the Story
 * turned; focused, in a few steps, after an ordinary Scene. What it looked up is kept with the Outline.
 */
export async function writeOutline(models: Models, choices: ModelChoice[], state: State, beside: Beside, ask: OutlineAsk, story: { storyId: string; head: string }, traceId: string, signal: AbortSignal): Promise<{ value: OutlineWritten; callId: string; model: ModelChoice; dropped: string[]; lookups: string[] }> {
  const { system, prompt } = outlinePrompt(state, beside, ask);
  const deep = isDeep(ask);
  const written = await runAgent(models, choices, {
    agent: "director", system, prompt, schema: outlineFormat(state), facts: outlineFacts(state, ask),
    tools: { story, web: deep }, traceId, storyId: story.storyId
  }, answer => checkOutline(state, beside, ask, answer), deep ? BUDGETS.directorDeep : BUDGETS.directorFocused, signal);
  const outline = written.value.outline;
  const lookedUp = [...new Set([...written.lookups, ...outline.lookedUp])].slice(0, LOOKED_UP);
  return { ...written, value: { ...written.value, outline: { ...outline, lookedUp } } };
}

/**
 * The entry the Director's Outline is kept as. [planFollows] when a Stretch plan follows it in the same step; a focused
 * Outline whose pass found the Story turned is not kept: the deep pass after it is.
 */
export function outlineSet(written: { value: OutlineWritten; callId: string; model: ModelChoice; dropped: string[] }, ask: OutlineAsk, planFollows: boolean): OutlineSet {
  return { kind: "outline_set", outline: written.value.outline, reason: ask.reason, planFollows, dropped: written.dropped, callId: written.callId, model: written.model };
}
