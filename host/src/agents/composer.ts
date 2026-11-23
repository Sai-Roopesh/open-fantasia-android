import { readFileSync } from "node:fs";
import type { Models } from "../models/model-call.js";
import type { ModelChoice } from "../story/state.js";
import { section, stripSceneState } from "../context/lens.js";
import { REPLY_LENGTH_GUIDE } from "./actor.js";
import { playersPart } from "./deciding.js";
import { addMinutes } from "./format.js";
import { checkWriter, writerCall, writerFacts, type WriterAsk, type WriterPlan } from "./writer.js";
import { BUDGETS, runAgent } from "./step.js";

const PROMPT = readFileSync(new URL("./COMPOSER.md", import.meta.url), "utf8");

/** Extracts the first balanced JSON object from [text] and parses it, or null. */
function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const tryParse = (candidate: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  };
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < cleaned.length; index++) {
    const ch = cleaned[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return tryParse(cleaned.slice(start, index + 1));
  }
  return null;
}

/**
 * Parses a free-text Reply with an optional trailing `<scene_state>` JSON block (closed or unclosed) or a legacy
 * pure-JSON `{ reply, ... }` answer. Raw `<scene_state>` markup is always stripped so it can never reach the player.
 */
export function parseComposedAnswer(rawText: string): { reply: string; meta: Record<string, unknown> | null } {
  const trimmed = rawText.trim();
  if (!trimmed) return { reply: "", meta: null };

  let meta: Record<string, unknown> | null = null;
  const closed = [...trimmed.matchAll(/<scene_state>\s*([\s\S]*?)\s*<\/scene_state>/gi)];
  for (const match of closed) {
    const parsed = parseJsonObject(match[1] ?? "");
    if (parsed) meta = parsed;
  }

  const withoutClosed = trimmed.replace(/<scene_state>[\s\S]*?<\/scene_state>/gi, "").trim();
  const unclosed = /<scene_state>([\s\S]*)$/i.exec(withoutClosed);
  if (unclosed) {
    const parsed = parseJsonObject(unclosed[1] ?? "");
    if (parsed) meta = parsed;
    const reply = stripSceneState(trimmed);
    return { reply, meta };
  }

  if (closed.length > 0) {
    return { reply: stripSceneState(trimmed), meta };
  }

  // Backwards compatibility with pure JSON `{ reply, ... }` answers from legacy fixtures or models.
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && typeof (parsed as { reply?: unknown }).reply === "string") {
        const { reply, ...rest } = parsed as Record<string, unknown> & { reply: string };
        return { reply: stripSceneState(reply), meta: rest };
      }
    } catch { /* Treat as plain prose below. */ }
  }

  return { reply: stripSceneState(trimmed), meta: null };
}

function defaultFrame(ask: WriterAsk): { title: string; place: string; purpose: string; exit: string } | null {
  const scene = ask.state.scene;
  const opening = !scene || scene.closed ? "day_view" : scene.purpose === null ? "unplanned" : null;
  if (!opening) return null;
  if (opening === "day_view") {
    return {
      title: ask.choice?.place ? `At ${ask.choice.place}` : `Scene ${(scene?.number ?? 0) + 1}`,
      place: ask.choice?.place?.trim() || scene?.place || "Here",
      purpose: "The scene unfolds from the player's move.",
      exit: "The player moves on."
    };
  }
  return {
    title: scene?.title ?? "Scene 1",
    place: scene?.place ?? "Here",
    purpose: "The scene unfolds from the player's move.",
    exit: "The player moves on."
  };
}

function fallbackPlan(ask: WriterAsk): WriterPlan {
  const { state } = ask;
  const scene = state.scene;
  const opening = !scene || scene.closed ? "day_view" : scene.purpose === null ? "unplanned" : null;
  const frame = defaultFrame(ask);
  const chosenWho = opening === "day_view" ? (ask.choice?.who ?? []).filter(name => name !== state.playerCharacter && state.people[name]) : [];
  return {
    opens: opening === "day_view" ? frame : null,
    plans: opening === "unplanned" && frame ? { purpose: frame.purpose, exit: frame.exit } : null,
    here: opening === "day_view" ? chosenWho : [...(scene?.here ?? [])],
    goes: [],
    beats: opening === "day_view" ? [] : [...(scene?.beats ?? [])],
    note: "",
    call: "continue",
    intensity: 2,
    clock: addMinutes(state.clock, 2),
    inPlay: [],
    movesTo: null,
    gathered: []
  };
}

function normalizedMeta(ask: WriterAsk, meta: Record<string, unknown>): Record<string, unknown> {
  const scene = ask.state.scene;
  const opening = !scene || scene.closed ? "day_view" : scene.purpose === null ? "unplanned" : null;
  // Support both the lean `<scene_state>` delta (`title`, `place`, `entered`, `left`, `minutes`, `intensity`) and full legacy fields.
  const place = typeof meta.moves_to === "string" ? meta.moves_to : typeof meta.place === "string" ? meta.place : null;
  const title = typeof meta.title === "string" && meta.title.trim() ? meta.title.trim() : null;
  const frame = meta.frame !== undefined
    ? meta.frame
    : opening
      ? {
          ...(defaultFrame(ask) ?? { title: "Scene", place: "Here", purpose: "The scene unfolds.", exit: "The player moves on." }),
          ...(opening === "day_view" && title ? { title } : {}),
          ...(opening === "day_view" && place ? { place } : {})
        }
      : null;
  const comesIn = Array.isArray(meta.comes_in) ? meta.comes_in : Array.isArray(meta.entered) ? meta.entered : [];
  const goes = Array.isArray(meta.goes) ? meta.goes : Array.isArray(meta.left) ? meta.left : [];
  let minutes: unknown = 2;
  if (typeof meta.minutes === "number" && Number.isFinite(meta.minutes)) {
    minutes = meta.minutes < 0 ? meta.minutes : Math.round(meta.minutes);
  } else if (typeof meta.minutes === "string" && /^-?\d+(?:\.\d+)?$/.test(meta.minutes.trim())) {
    const num = Number(meta.minutes.trim());
    minutes = num < 0 ? num : Math.round(num);
  }
  return {
    frame,
    comes_in: comesIn,
    goes,
    beats: Array.isArray(meta.beats) ? meta.beats : (scene && !scene.closed ? scene.beats : []),
    note: typeof meta.note === "string" && meta.note.trim() ? meta.note : "The scene continues.",
    call: meta.call === "land" || meta.call === "continue" ? meta.call : "continue",
    intensity: typeof meta.intensity === "number" && Number.isInteger(meta.intensity) && meta.intensity >= 1 && meta.intensity <= 5 ? meta.intensity : 2,
    minutes,
    in_play: Array.isArray(meta.in_play) ? meta.in_play : [],
    moves_to: opening === "day_view" ? null : place,
    gathered: Array.isArray(meta.gathered) ? meta.gathered : []
  };
}

/** The exact combined writing request, shared by the engine and CLI prompt inspection. */
export function composerCall(ask: WriterAsk, again?: { draft: string; notes: string[] }) {
  const instructions = [PROMPT.trim(), playersPart(ask.state.playerCharacter), REPLY_LENGTH_GUIDE[ask.state.replyLength]].join("\n\n");
  const call = writerCall(ask, instructions);
  const moveAt = ask.path?.findLastIndex(entry => entry.payload.kind === "move") ?? -1;
  const redo = ask.path?.slice(moveAt + 1).findLast(entry => entry.payload.kind === "redo");
  const rejected = ask.state.pendingDirection && redo?.payload.kind === "redo" ? redo.payload.rejected : undefined;
  const head = ask.path?.at(-1);
  const revision = rejected
    ? "\n\n" + section("revision", `The player is revising this rejected draft. It is not canon. Apply the current correction in context, preserving what fits. Without a new correction, try a different handling of the same Move while honoring active Directions.\n\n${rejected.text}`)
    : "";
  const sentBack = again
    ? "\n\n" + section("sent_back", [
        "Your Reply was read before the player saw it, and sent back to be written again. What breaks it:",
        ...again.notes.map(note => `- ${note}`),
        "",
        "Rewrite the Reply cleanly, mending what it was sent back for while keeping what worked.",
        "",
        "It read:",
        again.draft
      ].join("\n"))
    : "";
  const tail = revision + sentBack;
  const prompt = call.prompt + tail;
  const conversation = tail
    ? call.turns.map((turn, index, list) => (index === list.length - 1 ? { ...turn, text: turn.text + tail } : turn))
    : call.turns;
  return {
    system: call.system,
    prompt,
    conversation,
    facts: { ...writerFacts(ask), ...(again ? { rewriting: true } : { composing: true }) },
    // Keep Story lookup tools for memory callbacks; omit live web search from per-turn dialogue to cut hidden tool-prompt overhead and keep immersion.
    tools: { story: head ? { storyId: head.storyId, head: head.id } : null, web: false },
    moments: call.moments
  };
}

/**
 * One unconstrained free-text generation owns the prose first and appends compact `<scene_state>` bookkeeping at the
 * tail (no strict JSON schema constraint choking creative prose); the Editor / code check remains independent.
 */
export async function composeReply(models: Models, choices: ModelChoice[], ask: WriterAsk, storyId: string, traceId: string, signal: AbortSignal, onLookup?: (line: string) => void) {
  const { moments, ...call } = composerCall(ask);
  return runAgent<{ plan: WriterPlan; reply: string }>(models, choices, {
    ...call, agent: "actor", traceId, storyId
  }, answer => {
    if (typeof answer !== "string" || !answer.trim()) return { ok: false, problems: ["reply: write the complete Reply"] };
    const { reply, meta } = parseComposedAnswer(answer);
    if (!reply) return { ok: false, problems: ["reply: write the complete Reply"] };
    if (!meta) return { ok: true, value: { plan: fallbackPlan(ask), reply }, dropped: ["scene_state: omitted or unreadable, kept prose with default scene state"] };
    const checked = checkWriter(ask, moments, normalizedMeta(ask, meta));
    if (checked.ok) return { ...checked, value: { plan: checked.value, reply } };
    // Refuse only when active planning explicitly returned by the model violates the player boundary or moves the clock backward;
    // never discard good prose over inherited legacy beats or minor metadata glitches.
    const fatal = checked.problems.filter(problem =>
      problem.includes("minutes")
      || (problem.includes("decides for the player's character") && (Array.isArray(meta.beats) || !problem.startsWith("beats[")))
    );
    if (fatal.length) return { ok: false, problems: fatal };
    return { ok: true, value: { plan: fallbackPlan(ask), reply }, dropped: checked.problems };
  }, { turns: 6, ms: 240_000 }, signal, onLookup);
}

/**
 * Rewrites a draft that failed the code or Editor check using the exact same cached system prompt, tools, and
 * multi-turn prefix as `composeReply`, preserving any one-shot Redo direction and stripping `<scene_state>`.
 */
export async function rewriteComposedReply(
  models: Models,
  choices: ModelChoice[],
  ask: WriterAsk,
  again: { draft: string; notes: string[] },
  storyId: string,
  traceId: string,
  signal: AbortSignal
): Promise<{ text: string; callId: string; model: ModelChoice }> {
  const call = composerCall(ask, again);
  const { value, callId, model } = await runAgent<string>(models, choices, {
    system: call.system, prompt: call.prompt, conversation: call.conversation, facts: call.facts, tools: call.tools, agent: "actor", traceId, storyId
  }, answer => {
    if (typeof answer !== "string" || !answer.trim()) return { ok: false, problems: ["reply: write the complete Reply"] };
    const { reply } = parseComposedAnswer(answer);
    return reply ? { ok: true, value: reply } : { ok: false, problems: ["reply: write the complete Reply"] };
  }, { turns: 2, ms: BUDGETS.actor.ms }, signal);
  return { text: value, callId, model };
}
