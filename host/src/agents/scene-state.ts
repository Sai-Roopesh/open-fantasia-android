import type { Beside } from "../story/beside.js";
import type { Choice, Entry, Gathered } from "../story/entries.js";
import type { Beat, SceneCall, State } from "../story/state.js";
import { LIMITS, stripSceneState, tokens } from "../context/lens.js";
import { addMinutes, minutesOf, parseAnyTime, parseStoryTime } from "../time.js";
import { namer } from "./format.js";

/**
 * How long a Scene is carried before the Chronicler records it incrementally: eighteen exchanges (or approaching the
 * Scene layer's token budget), so long open scenes keep `truth`, bonds, moments, and `world` state alive.
 */
export const LONG_SCENE = { exchanges: 18, tokens: LIMITS.layers.scene - 2_000 } as const;

export interface ComposerAsk {
  state: State;
  /** The Scene's entries before the Move. */
  scene: Entry[];
  move: string;
  choice: Choice | null;
  /** What the Story has learned from the player, kept beside it. */
  beside: Beside;
  /** The Path up to the Move: used for Story lookup tools. */
  path?: Entry[];
}

export interface Frame {
  title: string;
  place: string;
  purpose: string;
  exit: string;
}

export interface ScenePlan {
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
  gathered: Gathered[];
}

export type Opening = "day_view" | "unplanned" | null;

export function openingOf(state: State): Opening {
  if (!state.scene || state.scene.closed) return "day_view";
  return state.scene.purpose === null ? "unplanned" : null;
}

/** Whether the open Scene has run past what is carried word for word and needs an incremental Chronicler record. */
export function recordDue(state: State, scene: Entry[]): boolean {
  if (!state.scene || state.scene.closed) return false;
  const recorded = state.scene.recorded;
  const through = recorded ? scene.findIndex(entry => entry.id === recorded.through) : -1;
  const delta = through >= 0 ? scene.slice(through + 1) : scene;
  const exchanges = delta.filter(entry => entry.payload.kind === "move").length;
  const words = delta.flatMap(entry => {
    const payload = entry.payload;
    return payload.kind === "move" || payload.kind === "reply" ? [payload.text] : payload.kind === "scene_opened" && payload.prose ? [payload.prose] : [];
  });
  return exchanges > LONG_SCENE.exchanges || tokens(words.join("\n\n")) > LONG_SCENE.tokens;
}

/** Strips a stray leading markdown heading or bold date/place banner (`**Friday, 27 Nov — ...**`) from prose. */
function cleanProse(text: string): string {
  const stripped = stripSceneState(text);
  const withoutBanner = stripped.replace(/^(?:#{1,3}\s+[^\n]+|\*\*[^*\n]{4,140}\*\*)\s*\n+/, "");
  return withoutBanner.trim() || stripped;
}

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
 * Parses a free-text Reply with an optional trailing `<scene_state>` JSON block (closed or unclosed).
 * Raw `<scene_state>` markup is always stripped so it can never reach the player.
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
    return { reply: cleanProse(trimmed), meta };
  }

  if (closed.length > 0) return { reply: cleanProse(trimmed), meta };
  return { reply: cleanProse(trimmed), meta: null };
}

function defaultFrame(ask: ComposerAsk): Frame | null {
  const scene = ask.state.scene;
  const opening = openingOf(ask.state);
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

/**
 * Forgiving per-field `<scene_state>` planner: validates and applies each optional field (`minutes`, `days`/`time`,
 * `at`, `place`, `title`, `entered`, `left`, `intensity`) independently so a single bad field is cleanly sanitized
 * instead of silently wiping all other valid updates. Only an explicit negative `minutes` value is refused.
 */
export function planFromMeta(
  ask: ComposerAsk,
  meta: Record<string, unknown> | null
): { ok: true; plan: ScenePlan; dropped: string[] } | { ok: false; problems: string[] } {
  const { state } = ask;
  const scene = state.scene;
  const opening = openingOf(state);
  const opensScene = opening === "day_view";
  const dropped: string[] = [];
  const raw = meta ?? {};
  if (!meta) dropped.push("scene_state: omitted or unreadable, kept prose with default scene state");

  // 1. Time advance (`at` > `days` + optional `time` > `minutes`, default 2)
  const now = parseStoryTime(state.clock);
  let minutes = 2;
  if (typeof raw.at === "string" && now) {
    const target = parseAnyTime(raw.at, state.dayOne);
    if (target && minutesOf(target) >= minutesOf(now)) minutes = minutesOf(target) - minutesOf(now);
    else dropped.push(`scene_state.at: ignored invalid or past time "${raw.at}"`);
  } else if (typeof raw.days === "number" && Number.isFinite(raw.days) && raw.days > 0 && now) {
    const timeMatch = typeof raw.time === "string" ? /^(\d{1,2}):(\d{2})$/.exec(raw.time.trim()) : null;
    const targetMinute = timeMatch ? Math.min(23, Number(timeMatch[1])) * 60 + Math.min(59, Number(timeMatch[2])) : now.minuteOfDay;
    const delta = minutesOf({ day: now.day + Math.round(raw.days), minuteOfDay: targetMinute }) - minutesOf(now);
    if (delta > 0) minutes = delta;
  } else if (raw.minutes !== undefined) {
    const parsed = typeof raw.minutes === "number" ? raw.minutes : typeof raw.minutes === "string" && /^-?\d+(?:\.\d+)?$/.test(raw.minutes.trim()) ? Number(raw.minutes.trim()) : NaN;
    if (!Number.isFinite(parsed)) dropped.push(`scene_state.minutes: ignored non-numeric value`);
    else if (parsed < 0) return { ok: false, problems: ["minutes: must be >= 0 (clock cannot move backward)"] };
    else minutes = Math.round(parsed);
  }
  let clock = addMinutes(state.clock, minutes);
  const choiceAt = ask.choice?.at ? parseStoryTime(ask.choice.at) : null;
  if (opensScene && choiceAt && now && minutesOf(choiceAt) > minutesOf(parseStoryTime(clock) ?? now)) {
    clock = ask.choice?.at ?? clock;
  }

  // 2. Place & opening frame (supports both compact `<scene_state>` `title`/`place` and structured `frame` objects)
  const rawFrame = raw.frame && typeof raw.frame === "object" && !Array.isArray(raw.frame) ? raw.frame as Record<string, unknown> : null;
  const rawPlace = typeof raw.place === "string" ? raw.place.trim() : typeof raw.moves_to === "string" ? raw.moves_to.trim() : "";
  const rawTitle = typeof raw.title === "string" ? raw.title.trim() : typeof rawFrame?.title === "string" ? rawFrame.title.trim() : "";
  const framePlace = typeof rawFrame?.place === "string" ? rawFrame.place.trim() : "";
  const framePurpose = typeof rawFrame?.purpose === "string" && rawFrame.purpose.trim() ? rawFrame.purpose.trim() : null;
  const frameExit = typeof rawFrame?.exit === "string" && rawFrame.exit.trim() ? rawFrame.exit.trim() : null;
  const baseFrame = defaultFrame(ask);
  const opens: Frame | null = opensScene && baseFrame
    ? {
        title: rawTitle || baseFrame.title,
        place: ask.choice?.place?.trim() || framePlace || rawPlace || baseFrame.place,
        purpose: framePurpose ?? baseFrame.purpose,
        exit: frameExit ?? baseFrame.exit
      }
    : null;
  const plans = opening === "unplanned" && baseFrame
    ? { purpose: framePurpose ?? baseFrame.purpose, exit: frameExit ?? baseFrame.exit }
    : null;

  // 3. Cast changes (`entered` / `left`)
  const named = namer(state, dropped, "scene_state");
  const rawEntered = Array.isArray(raw.entered) ? raw.entered : Array.isArray(raw.comes_in) ? raw.comes_in : [];
  const rawLeft = Array.isArray(raw.left) ? raw.left : Array.isArray(raw.goes) ? raw.goes : [];
  const entered = named(rawEntered.filter((v): v is string => typeof v === "string"));
  const left = named(rawLeft.filter((v): v is string => typeof v === "string"));
  const pc = state.playerCharacter;
  const before = opensScene ? [] : scene?.here ?? [];
  const chosenWho = opensScene ? (ask.choice?.who ?? []).filter(name => name !== pc && Boolean(state.people[name])) : [];
  const here = [...new Set([...before, ...chosenWho, ...entered])];
  const goes = left.filter(name => here.includes(name));

  // 4. Intensity (1..5, default 2) and optional note/beats
  const rawIntensity = typeof raw.intensity === "number" && Number.isInteger(raw.intensity) && raw.intensity >= 1 && raw.intensity <= 5
    ? raw.intensity
    : 2;
  const note = typeof raw.note === "string" ? raw.note.trim() : "";
  const beats = Array.isArray(raw.beats) ? raw.beats as Beat[] : (opensScene ? [] : [...(scene?.beats ?? [])]);

  return {
    ok: true,
    dropped,
    plan: {
      opens,
      plans,
      here,
      goes,
      beats,
      note,
      call: "continue",
      intensity: rawIntensity,
      clock,
      inPlay: [],
      movesTo: opensScene ? null : rawPlace || null,
      gathered: []
    }
  };
}
