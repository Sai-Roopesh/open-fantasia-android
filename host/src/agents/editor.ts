import { readFileSync } from "node:fs";
import type { Models } from "../models/model-call.js";
import type { Beside } from "../story/beside.js";
import type { Entry } from "../story/entries.js";
import type { ModelChoice, State } from "../story/state.js";
import { asCall, layers, section } from "../context/lens.js";
import { decidesForPlayer, playerNames, playersPartBreak } from "./deciding.js";
import { matches, namer, nullable, peopleEnum, text } from "./format.js";
import { BUDGETS, runAgent, type Checked } from "./step.js";

const PROMPT = readFileSync(new URL("./EDITOR.md", import.meta.url), "utf8");

/**
 * The Editor: reads every Reply before the player does (docs/adr/0019), against what the Story has established (its
 * Rules, what each person present knows and believes, what is true now, the clock, its Names) and what only the
 * player may decide. Small slips it sets right in place; what breaks the Reply it names, so the Reply can be written
 * again once. It is given layers 1 and 2, the Scene so far, whose clock only goes forward, and the Reply
 * (the-storys-mind design decision 6).
 */
export interface EditorAsk {
  /** The State the Reply was written in: its Scene open, the clock at the Reply. */
  state: State;
  beside: Beside;
  /** The Scene's entries, from its opening to the Move the Reply answers. */
  scene: Entry[];
  reply: string;
  /** Who is here besides the Player Character. */
  present: string[];
}

export type Verdict = "clean" | "fixed" | "rewrite";

/** A slip set right in place: the Reply's words, the words put in their place, and why. */
export interface Fix {
  wrong: string;
  right: string;
  why: string;
}

export interface Edit {
  /** Clean when nothing was wrong, fixed when only slips were, rewrite when something breaks it. */
  verdict: Verdict;
  /** The Reply with its slips set right. */
  text: string;
  fixed: Fix[];
  /** What breaks it and why, a line each: the Actor's note for its rewrite, and the Reply's own if it still breaks. */
  notes: string[];
}

type BreakKind = "leak" | "contradiction" | "decides_for_player";

interface Raw {
  fixes: Fix[];
  breaks: { kind: BreakKind; who: string | null; words: string; why: string }[];
}

const BREAK: Record<Exclude<BreakKind, "decides_for_player">, string> = { leak: "Leak", contradiction: "Contradiction" };

/** The Editor's answer for this Story: its people as a fixed list. */
export function editorFormat(state: State) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["fixes", "breaks"],
    properties: {
      fixes: {
        type: "array",
        description: "Slips set right in place: a date, a time, a name, a small settled fact.",
        items: { type: "object", additionalProperties: false, required: ["wrong", "right", "why"], properties: { wrong: { ...text, description: "The Reply's own words, exactly as they stand." }, right: { ...text, description: "The words to put in their place." }, why: text } }
      },
      breaks: {
        type: "array",
        description: "What a few words cannot mend: the Reply is written again.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "who", "words", "why"],
          properties: { kind: { type: "string", enum: ["leak", "contradiction", "decides_for_player"] }, who: nullable(peopleEnum(state, true)), words: { ...text, description: "The Reply's words where it breaks, exactly as they stand." }, why: text }
        }
      }
    }
  } as const;
}

const sentence = (line: string) => (/[.!?…"”]$/.test(line.trim()) ? line.trim() : `${line.trim()}.`);

/**
 * The Editor's prompt in four layers, slowest-changing first (the-storys-mind design decision 7), through the editor
 * lens: the Story with its Rules and Names, the same for every Reply in a Scene; where things stand for the people
 * here; the Scene so far, whose clock only goes forward; and this moment, the time now with the Move and the Reply.
 */
export function editorPrompt(ask: EditorAsk): { system: string; prompt: string } {
  const pc = ask.state.playerCharacter;
  const at = ask.scene.findLastIndex(entry => entry.payload.kind === "move");
  const move = ask.scene[at];
  return asCall(layers(ask.state, ask.beside, "editor", ask.present, at < 0 ? ask.scene : ask.scene.slice(0, at), [
    move?.payload.kind === "move" ? section(`move by="${pc}"`, move.payload.text) : null,
    section("reply", ask.reply),
    section("task", `Check the Reply against what the story has established. ${pc} is the player's character. Set its slips right in fixes; name what breaks it in breaks.`)
  ], PROMPT.replace("{{players_part}}", `${playersPartBreak(pc)} Someone remembering something ${pc} said or did that the story never showed breaks it too.`)));
}

/** [words] as a pattern that finds them whatever their quote marks and spacing, which models tidy as they copy. */
function wordsIn(words: string): RegExp | null {
  const parts = words.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return new RegExp(parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/["“”]/g, "[\"“”]").replace(/['‘’]/g, "['‘’]")).join("\\s+"), "g");
}

const found = (words: string, text: string) => {
  const pattern = wordsIn(words);
  return pattern !== null && text.search(pattern) >= 0;
};

/**
 * The Reply as told, for the check in code: without what is said aloud in it, which is the speaker's to say of him, and
 * with him as "he" where a clause only waits on him ("before Roopesh says a word"), which decides nothing.
 */
function narration(reply: string, names: string[]): string {
  const told = reply.replace(/"[^"]*"|“[^”]*”|‘[^’]*’/g, " ");
  const his = names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return told.replace(new RegExp(`\\b(before|until|unless|if|whether)\\s+(?:${his})\\b`, "gi"), "$1 he");
}

/**
 * The check in code alone: the phrase of [reply] that writes the Player Character's part, or null. It costs nothing,
 * so it reads every Reply, where a model Editor no longer does (docs/adr/0024).
 */
export function playerPartIn(state: State, reply: string): string | null {
  const pc = state.playerCharacter;
  const names = playerNames({ name: pc, aliases: state.people[pc]?.aliases ?? [] });
  return decidesForPlayer(narration(reply, names), names)?.replace(/\s+/g, " ") ?? null;
}

/**
 * Checks the Editor's answer for truth only (docs/adr/0012): a fix whose words are not in the Reply is left out; a
 * break is kept, its words only when they are in the Reply, since what breaks is the Editor's to judge. The Reply is
 * also checked in code for deciding for the Player Character, whatever the answer says.
 */
export function checkEdit(ask: EditorAsk, answer: unknown): Checked<Edit> {
  const { state } = ask;
  const format = matches<Raw>(editorFormat(state), answer);
  if (!format.ok) return format;
  const raw = format.value;
  const dropped: string[] = [];
  const pc = state.playerCharacter;

  let text = ask.reply;
  const fixed: Fix[] = [];
  for (const [index, fix] of raw.fixes.entries()) {
    const wrong = fix.wrong.trim();
    const right = fix.right.trim();
    const pattern = wordsIn(wrong);
    if (wrong === right) dropped.push(`fixes[${index}]: it changes nothing`);
    else if (!pattern || text.search(pattern) < 0) dropped.push(`fixes[${index}]: "${wrong}" is not in the Reply`);
    else {
      text = text.replace(pattern, () => right);
      fixed.push({ wrong, right, why: fix.why.trim() });
    }
  }

  const notes = raw.breaks.map((item, index) => {
    const who = item.who === null ? null : namer(state, dropped, `breaks[${index}]`)([item.who], true)[0] ?? null;
    const words = found(item.words, ask.reply) ? item.words.trim() : (dropped.push(`breaks[${index}]: "${item.words.trim()}" is not in the Reply`), null);
    const label = item.kind === "decides_for_player" ? `Decides for ${pc}` : `${BREAK[item.kind]}${who ? ` (${who})` : ""}`;
    return `${label}: ${words ? `"${words}". ` : ""}${sentence(item.why)}`;
  });

  // Deciding for him is caught in code too (openspec scenes: The Reply never writes the Player Character).
  const phrase = playerPartIn(state, text);
  const seen = (words: string) => phrase !== null && (words.toLowerCase().includes(phrase.toLowerCase()) || phrase.toLowerCase().includes(words.trim().toLowerCase()));
  if (phrase && !raw.breaks.some(item => item.kind === "decides_for_player" && seen(item.words))) {
    notes.push(`Decides for ${pc}: "${phrase}". ${playersPartBreak(pc)}`);
  }

  const verdict: Verdict = notes.length ? "rewrite" : fixed.length ? "fixed" : "clean";
  return { ok: true, dropped, value: { verdict, text, fixed, notes } };
}

/** Reads a Reply before the player does; its second model steps in when its own fails. */
export async function editReply(models: Models, choices: ModelChoice[], ask: EditorAsk, storyId: string, traceId: string, signal: AbortSignal): Promise<Edit & { callId: string; model: ModelChoice; dropped: string[] }> {
  const { system, prompt } = editorPrompt(ask);
  const { value, callId, model, dropped } = await runAgent(models, choices, { agent: "editor", system, prompt, schema: editorFormat(ask.state), facts: { reply: ask.reply, present: ask.present, clock: ask.state.clock }, traceId, storyId }, answer => checkEdit(ask, answer), BUDGETS.editor, signal);
  return { ...value, callId, model, dropped };
}
