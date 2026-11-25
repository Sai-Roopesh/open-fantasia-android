import { Ajv2020 } from "ajv/dist/2020.js";
import { addMinutes, formatStoryTime, fromMinutes, minutesOf, parseAnyTime, parseStoryTime } from "../time.js";
import type { State } from "../story/state.js";
import { nameIndex, storyName } from "../story/names.js";
export { addMinutes, fromMinutes };

/**
 * Answer formats built for one Story (one-truth design decision 5): the Story's people as a fixed list, so a model
 * that keeps to its format cannot name anyone else. The names are still looked up in code, for a provider that does
 * not keep to formats; a name not in the Story is left out, never sent back.
 */
export const text = { type: "string", minLength: 1 } as const;

/**
 * The lists that are looked up in code: the provider is asked to keep to them, but an answer is never sent back for
 * a name or a label outside them (openspec living-world: Named with a title; long-run: Only the Story's people).
 */
const LOOKUPS = new WeakSet<object>();

function lookup(values: string[]): { type: "string"; enum: string[] } {
  const schema = { type: "string" as const, enum: values };
  LOOKUPS.add(schema);
  return schema;
}

/**
 * A Story person/group field in a JSON Schema. Small casts (<= 12) use an enum; larger casts use plain string so huge
 * enum arrays are not repeated across ~12 schema slots (slashing hidden schema tokens and preventing Gemini "too many
 * states for serving" 400s). `namer()` validates and fuzzy-matches every returned name in code either way.
 */
export function peopleEnum(state: State, withPlayer = false, extra: string[] = []): { type: "string"; enum?: string[] } {
  const names = Object.keys(state.people).filter(name => withPlayer || name !== state.playerCharacter);
  const values = [...new Set([...names, ...state.groups.map(group => group.name), ...extra])];
  return values.length > 0 && values.length <= 12 ? lookup(values) : { type: "string" };
}

export function oneOf(values: string[]): { type: "string"; enum: string[] } | { type: "string"; minLength: 1 } {
  return values.length ? lookup(values) : text;
}

export const nullable = <T extends object>(schema: T) => ({ anyOf: [schema, { type: "null" }] });

const ajv = new Ajv2020({ strict: false, allErrors: true });

/** [schema] with its looked-up lists loosened to any text: what an answer is checked against. */
function loosened(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(loosened);
  if (schema === null || typeof schema !== "object") return schema;
  if (LOOKUPS.has(schema)) return { type: "string" };
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, loosened(value)]));
}

/**
 * Whether [answer] keeps to [schema], and what is wrong when it does not. A name or label outside the lists is not
 * wrong here: each agent's check looks it up, and leaves out what it cannot find.
 */
export function matches<T>(schema: object, answer: unknown): { ok: true; value: T } | { ok: false; problems: string[] } {
  const validate = ajv.compile<T>(loosened(schema) as object);
  if (validate(answer)) return { ok: true, value: answer };
  return { ok: false, problems: (validate.errors ?? []).slice(0, 8).map(error => `${error.instancePath.replace(/^\//, "").replace(/\//g, ".") || "answer"}: ${error.message ?? "is not as the format says"}`) };
}

/** Looks names up in the Story, leaving out (and noting) any it does not have. */
export function namer(state: State, dropped: string[], where: string, extra: string[] = []) {
  const index = nameIndex(Object.values(state.people));
  const groups = new Map(state.groups.map(group => [group.name.toLocaleLowerCase(), group.name]));
  return (names: string[], withPlayer = false): string[] => [...new Set(names.flatMap(name => {
    const known = extra.find(other => other.toLocaleLowerCase() === name.trim().toLocaleLowerCase()) ?? groups.get(name.trim().toLocaleLowerCase()) ?? storyName(index, name);
    if (!known) return (dropped.push(`${where}: ${name.trim()} is not in the Story`), []);
    if (!withPlayer && known === state.playerCharacter) return [];
    return [known];
  }))];
}

/**
 * The Story time an agent wrote, as the Story keeps it ("Day N HH:MM"): agents write dates ("1991-09-14 20:00") when
 * the Story has a calendar ([dayOne]); null when [value] is not a time at all.
 */
export function storyTime(value: string, dayOne: string | null): string | null {
  const time = parseAnyTime(value, dayOne);
  return time ? formatStoryTime(time) : null;
}

/** [value] kept within [from] and [until], as the Story keeps it; null when it is not a time at all. */
export function clampTime(value: string, from: string, until: string, dayOne: string | null): string | null {
  const time = parseAnyTime(value, dayOne);
  const start = parseStoryTime(from);
  const end = parseStoryTime(until);
  if (!time || !start || !end) return null;
  return fromMinutes(Math.min(Math.max(minutesOf(time), minutesOf(start)), minutesOf(end)));
}

export const wordCount = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

/** How an agent writes a time in this Story: a date and time when it has a calendar. */
export function timeFormat(state: State, more = "") {
  return { type: "string", description: `${state.dayOne ? "A date and time, \"YYYY-MM-DD HH:MM\"" : "A story time, \"Day N HH:MM\""}${more}` } as const;
}
