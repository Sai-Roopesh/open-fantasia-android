import type { Models } from "../models/model-call.js";
import { nothingBeside } from "../story/beside.js";
import type { ModelChoice, State, Told } from "../story/state.js";
import { join, layers, say, section, tokens, type Reader } from "../context/lens.js";
import { matches, text } from "./format.js";
import { nameIndex, namedIn } from "../story/names.js";
import { BUDGETS, runAgent, type Checked } from "./step.js";

/**
 * The current Act's Scenes are told a paragraph each; past this many tokens its oldest week folds into a recap
 * (the-storys-mind design decision 8). The Malfoy Problem's Year One, at nineteen Scenes, stays whole.
 */
export const ACT_TOKENS = 10_000;
/** The newest Scene paragraphs never fold into a week. */
export const KEEP_SCENES = 6;
/** A week is this many story days. */
const WEEK_DAYS = 7;
/** How long a finished Act's account runs, in words. */
export const ACCOUNT_WORDS = { least: 1_000, most: 2_000 } as const;

/** What is due a fold: the current Act's oldest week, or a finished Act, all its parts gathered into one account. */
export interface FoldDue {
  into: "week" | "act";
  parts: Told[];
}

/**
 * What the Folder folds next (openspec living-world: Every agent knows the Story So Far): an Act the Outline has moved
 * past, whole, into one account; or, once the current Act's telling is past its limit, its oldest week's Scenes into a
 * recap, never the newest few; or nothing.
 */
export function foldDue(state: State): FoldDue | null {
  const { weeks, scenes } = state.storySoFar;
  const telling = [...weeks, ...scenes];
  const current = state.outline?.current;
  const finished = current === undefined ? [] : scenes.flatMap(part => (part.act && part.act.number < current ? [part.act.number] : []));
  if (finished.length) {
    // The earliest finished Act, with everything told before its last Scene: its weeks, and any Scene before the Outline.
    const act = Math.min(...finished);
    return { into: "act", parts: telling.slice(0, telling.findLastIndex(part => part.act?.number === act) + 1) };
  }
  if (tokens(telling.map(part => part.text).join("\n")) <= ACT_TOKENS) return null;
  const older = scenes.length - KEEP_SCENES;
  const oldest = scenes[0];
  if (older <= 0 || !oldest) return null;
  const dayOf = (part: Told) => Number(/^Day (\d+)/.exec(part.from)?.[1] ?? 0);
  const after = scenes.findIndex(part => dayOf(part) >= dayOf(oldest) + WEEK_DAYS);
  return { into: "week", parts: scenes.slice(0, Math.min(after < 0 ? scenes.length : after, older)) };
}

/** The Act [due] gathers, as its paragraphs name it. */
function actOf(due: FoldDue): { number: number; title: string } | null {
  return due.parts.findLast(part => part.act)?.act ?? null;
}

/** What an Act's account must keep: the Scenes it covers, their turning points and names, and who was there. */
export interface Gathered {
  scenes: { first: number; last: number };
  turns: string[];
  names: string[];
  who: string[];
}

/** What the Scenes [due] gathers recorded: every turning point between any two people, every name given, who was there. */
export function gathered(state: State, due: FoldDue): Gathered {
  const numbers = due.parts.flatMap(part => (part.scene ? [part.scene.number] : []));
  const first = (state.storySoFar.acts.at(-1)?.scenes?.last ?? 0) + 1;
  const last = numbers.length ? Math.max(...numbers) : first;
  const within = (scene: number) => scene >= first && scene <= last;
  const pc = state.playerCharacter;
  const turns = [
    ...Object.values(state.truth.between).flatMap(between => between.turns.filter(turn => within(turn.scene)).map(turn => ({ scene: turn.scene, line: `Scene ${turn.scene}, ${between.people.join(" and ")}: ${turn.text}` }))),
    // Before the truth kept it, his side of each turn is in the Bonds.
    ...Object.entries(state.bonds).flatMap(([who, bond]) => bond.turns.filter(turn => turn.scene && within(turn.scene.number)).map(turn => ({ scene: turn.scene?.number ?? 0, line: `Scene ${turn.scene?.number}, ${who} and ${pc}: ${turn.text}` })))
  ].sort((left, right) => left.scene - right.scene).map(turn => turn.line);
  const names = Object.values(state.truth.names).filter(name => within(name.first)).sort((left, right) => left.first - right.first).map(name => name.name);
  return { scenes: { first, last }, turns: [...new Set(turns)], names, who: [...new Set(due.parts.flatMap(part => part.who))].filter(name => name !== pc) };
}

const told = (state: State, part: Told) => `${part.scene ? `Scene ${part.scene.number}, ${part.scene.title}` : `${say(state, part.from)} to ${say(state, part.until)}`}: ${part.text}`;

/**
 * Layer 1 of the four every agent reads (the-storys-mind design decision 7): [instructions], then the Story as [reader]
 * reads it, so an Act's account and its check know every person by every name they go by, the Rules and the names given
 * on the page. The rest of what they read is the Act's own parts.
 */
function storyLayer(state: State, reader: Reader, instructions: string): string {
  return layers(state, nothingBeside(), reader, [], [], [], instructions).story;
}

/** What an Act's account is written and checked against: the Act, its parts, and what it must keep. */
function actSections(state: State, due: FoldDue): string {
  const act = actOf(due);
  const planned = act ? state.outline?.acts.find(item => item.number === act.number) : undefined;
  const kept = gathered(state, due);
  return join([
    section("act", `${act ? `Act ${act.number}, ${act.title}` : "The Act"}, Scenes ${kept.scenes.first} to ${kept.scenes.last}, ${say(state, due.parts[0]?.from ?? state.clock)} to ${say(state, due.parts.at(-1)?.until ?? state.clock)}.${planned ? ` Its question was: ${planned.question}` : ""}`),
    section("parts", due.parts.map(part => told(state, part)).join("\n\n")),
    section("turning_points", kept.turns.map(line => `- ${line}`).join("\n")),
    section("names", kept.names.map(name => `- ${name}`).join("\n")),
    section("who_was_there", kept.who.join(", "))
  ]);
}

export function folderPrompt(state: State, due: FoldDue): { system: string; prompt: string } {
  if (due.into === "act") {
    const act = actOf(due);
    // The account is a record, read as the Chronicler reads the Story: who each person is, the Rules, the names.
    return {
      system: storyLayer(state, "chronicler", [
        "You keep The Story So Far of a long interactive story: the account every writer of the story reads before they work.",
        `${act ? `Act ${act.number}, ${act.title},` : "An Act"} has ended. Gather its parts below into one account of the Act, ${ACCOUNT_WORDS.least.toLocaleString("en-GB")} to ${ACCOUNT_WORDS.most.toLocaleString("en-GB")} words, in the past tense and in time order, so that whoever reads only the account knows the Act.`,
        "Keep every turning point between any two people, every name as it was given, and who was there. The turning points and names the Act's Scenes recorded are under `turning_points` and `names`: every one of them is in the account. The Story it belongs to follows these lines: its people by every name they go by, its Rules, and the names given on the page.",
        "Invent nothing: say only what the parts say, what was on the page or what happened while he was elsewhere. Tell each thing as the parts tell it: who did it, to whom, at what, on which day. Never sharpen it: a near miss stays a near miss, and what happened once did not happen twice.",
        "Return only the JSON object."
      ].join("\n")),
      prompt: actSections(state, due)
    };
  }
  return {
    system: [
      "You keep The Story So Far of a long interactive story: the account every writer of the story reads before they work.",
      "Fold the Scenes below into one recap of their week, about one hundred and twenty words, in the past tense.",
      "Keep what still matters: who wanted what, what changed between people, promises, secrets found or kept, debts, what was left hanging. Let go of what led nowhere. Keep names exact.",
      "Invent nothing. Tell each thing you keep as the parts tell it: who did it, to whom, at what, on which day. Never sharpen it: a near miss stays a near miss, something sent at the stands is not sent at him, what happened once did not happen twice. When you cannot say it exactly in fewer words, leave it out.",
      "Return only the JSON object."
    ].join("\n"),
    prompt: join([
      section("story", `${state.title}. ${state.premise}`),
      section("parts", due.parts.map(part => told(state, part)).join("\n\n"))
    ])
  };
}

const FORMAT = { type: "object", additionalProperties: false, required: ["text"], properties: { text } } as const;

export function checkFold(answer: unknown): Checked<string> {
  const format = matches<{ text: string }>(FORMAT, answer);
  return format.ok ? { ok: true, value: format.value.text.trim() } : format;
}

/** What the Editor finds an Act's account leaves out or changes, and what it says that its parts do not. */
export interface AccountCheck {
  missing: string[];
  invented: string[];
}

const CHECK_FORMAT = {
  type: "object", additionalProperties: false, required: ["missing", "invented"],
  properties: {
    missing: { type: "array", items: text, description: "Each turning point, name or person who was there that the account leaves out or changes: one line each, saying what and in which Scene." },
    invented: { type: "array", items: text, description: "Each thing the account says that its parts do not: one line each." }
  }
} as const;

export function checkAccountAnswer(answer: unknown): Checked<AccountCheck> {
  const format = matches<AccountCheck>(CHECK_FORMAT, answer);
  return format.ok ? { ok: true, value: { missing: format.value.missing.map(line => line.trim()), invented: format.value.invented.map(line => line.trim()) } } : format;
}

/** The Editor's check of an Act's account against the parts it gathers (the-storys-mind design decision 5). */
export function accountCheckPrompt(state: State, due: FoldDue, account: string): { system: string; prompt: string } {
  return {
    system: storyLayer(state, "editor", [
      "You are the Editor of a long interactive story. You check one account of an Act of it against the parts it gathers, before every writer of the story reads the account in their place.",
      "Under `missing`, list every turning point, every name and everyone who was there that the account leaves out or changes, one line each, saying what and in which Scene. Every turning point and name under `turning_points` and `names` must be in the account, in substance and by name; someone named by another name they go by, as the Story after these lines gives them, is named.",
      "Under `invented`, list anything the account says that the parts do not.",
      "Leave both empty when the account holds. Return only the JSON object."
    ].join("\n")),
    prompt: join([actSections(state, due), section("account", account)])
  };
}

/**
 * The names an Act's account must keep and does not: every name given on the page in its Scenes, and everyone who was
 * there, by their name or one of their others. Checked in code, so a name is never left to a model to notice.
 */
export function missingNames(state: State, due: FoldDue, account: string): string[] {
  const kept = gathered(state, due);
  const named = new Set(namedIn(account, nameIndex(Object.values(state.people))));
  const says = (name: string) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(account);
  return [...new Set([...kept.names, ...kept.who])].filter(name => !named.has(name) && !says(name)).map(name => `${name} is not named in it`);
}

/**
 * The Editor's check of an Act's account: the names it must keep, in code, and every turning point and anything
 * invented, by the Editor's model. Empty when the account holds.
 */
export async function checkAccount(models: Models, choices: ModelChoice[], state: State, due: FoldDue, account: string, storyId: string, traceId: string, signal: AbortSignal): Promise<string[]> {
  const { system, prompt } = accountCheckPrompt(state, due, account);
  const act = actOf(due);
  const { value } = await runAgent(models, choices, { agent: "editor", system, prompt, schema: CHECK_FORMAT, facts: { check: "act", act: act?.number ?? null, parts: due.parts.length }, traceId, storyId }, checkAccountAnswer, BUDGETS.editor, signal);
  return [...new Set([...missingNames(state, due, account), ...value.missing, ...value.invented.map(line => `it invents: ${line}`)])];
}

/** How many times an Act's account may be sent back before the best of its drafts is kept. */
export const SEND_BACKS = 2;

/**
 * Writes a fold. A week's recap is written once. An Act's account is checked by the Editor (on [editor], the Editor
 * job's models) against the Scenes it gathers, and sent back with what it left out or invented; each draft that comes
 * back is checked again, since setting one thing right can lose another. It is sent back at most [SEND_BACKS] times;
 * the first draft that holds is the account, or, when none does, the one with the fewest problems, the latest of equals.
 */
export async function writeFold(models: Models, choices: ModelChoice[], state: State, due: FoldDue, storyId: string, traceId: string, signal: AbortSignal, editor: ModelChoice[] = choices): Promise<{ value: string; callId: string; model: ModelChoice }> {
  const { system, prompt } = folderPrompt(state, due);
  const request = { agent: "folder" as const, system, prompt, schema: FORMAT, facts: { into: due.into, parts: due.parts.length }, traceId, storyId };
  const written = await runAgent(models, choices, request, checkFold, BUDGETS.folder, signal);
  if (due.into === "week") return written;
  let best = { draft: written, problems: await checkAccount(models, editor, state, due, written.value, storyId, traceId, signal) };
  for (let round = 0; best.problems.length && round < SEND_BACKS; round++) {
    const sentBack = join([prompt, section("sent_back", [
      "Your account of the Act was sent back. Write it again, whole, keeping everything it had right (every turning point, every name, everyone who was there), with this set right:",
      ...best.problems.map(problem => `- ${problem}`),
      "",
      "<previous_account>",
      best.draft.value,
      "</previous_account>"
    ].join("\n"))]);
    const draft = await runAgent(models, choices, { ...request, prompt: sentBack, facts: { ...request.facts, sentBack: best.problems } }, checkFold, BUDGETS.folder, signal);
    const problems = await checkAccount(models, editor, state, due, draft.value, storyId, traceId, signal);
    if (problems.length <= best.problems.length) best = { draft, problems };
  }
  return best.draft;
}
