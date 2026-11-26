import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, join, normalize, sep } from "node:path";
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import { parse } from "yaml";
import schema from "../../../protocol/schemas/story-file.schema.json" with { type: "json" };
import type { StoryFile } from "../protocol/generated/story-file.js";
/** Where things stand between him and someone is said in forty words or fewer. */
const MAX_STANDING_WORDS = 40;
import { isDate, parseStoryTime } from "../time.js";

/** The Story File formats this app understands. */
export const FORMATS = [1];

/** One thing wrong with a Story File, and where in its document it is. */
export interface Problem {
  where: string;
  message: string;
}

export type Checked = { ok: true; storyFile: StoryFile } | { ok: false; problems: Problem[] };

const PORTRAIT_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

/**
 * Checks a whole Story File before anything is created (openspec story-file): every problem is found and named
 * with where it is, not only the first, so one round of fixes is enough.
 */
export function checkStoryFile(folder: string): Checked {
  const document = join(folder, "story.yaml");
  if (!existsSync(document)) return refuse("story.yaml", `A Story File is a folder with a story.yaml in it; ${folder} has none`);
  let parsed: unknown;
  try {
    parsed = parse(readFileSync(document, "utf8"));
  } catch (error) {
    return refuse("story.yaml", `story.yaml is not readable YAML: ${(error as Error).message}`);
  }
  const format = (parsed as { format?: unknown } | null)?.format;
  if (!FORMATS.includes(format as number)) {
    return refuse("format", `This Story File is written for format ${String(format)}; this app understands format ${FORMATS.join(", ")}`);
  }
  if (!validate(parsed)) return { ok: false, problems: (validate.errors ?? []).map(schemaProblem) };
  // The schema has just checked every field, which is what this cast stands on.
  const storyFile = parsed as unknown as StoryFile;
  const problems = [...nameProblems(storyFile), ...referenceProblems(storyFile), ...portraitProblems(storyFile, folder), ...bondProblems(storyFile), ...timeProblems(storyFile)];
  return problems.length ? { ok: false, problems } : { ok: true, storyFile };
}

function refuse(where: string, message: string): Checked {
  return { ok: false, problems: [{ where, message }] };
}

/** "/people/1/portrait" read as "people[1].portrait", the way a person reading the document would point at it. */
function where(pointer: string): string {
  return pointer.split("/").filter(Boolean).reduce((path, part) => (/^\d+$/.test(part) ? `${path}[${part}]` : path ? `${path}.${part}` : part), "") || "story.yaml";
}

function schemaProblem(error: ErrorObject): Problem {
  const at = where(error.instancePath);
  if (error.keyword === "required") return { where: at, message: `${at === "story.yaml" ? "The document" : at} needs "${String(error.params.missingProperty)}"` };
  if (error.keyword === "additionalProperties") return { where: at, message: `"${String(error.params.additionalProperty)}" is not part of a Story File` };
  return { where: at, message: `${at} ${error.message ?? "is not valid"}` };
}

/** Every name a Story File uses belongs to exactly one person. */
function nameProblems(story: StoryFile): Problem[] {
  const problems: Problem[] = [];
  const owner = new Map<string, number>();
  story.people.forEach((person, index) => {
    for (const [name, at] of [[person.name, `people[${index}].name`], ...(person.aliases ?? []).map((alias, a) => [alias, `people[${index}].aliases[${a}]`])] as [string, string][]) {
      const key = name.trim().toLowerCase();
      const first = owner.get(key);
      if (first === undefined) owner.set(key, index);
      else problems.push({ where: at, message: `"${name}" names two people: ${story.people[first]?.name} and ${person.name === name ? "another person" : person.name}; every name belongs to one person` });
    }
  });
  return problems;
}

function referenceProblems(story: StoryFile): Problem[] {
  const people = new Set(story.people.map(person => person.name));
  const groups = new Set((story.groups ?? []).map(group => group.name));
  const problems: Problem[] = [];
  if (!people.has(story.player_character)) {
    problems.push({ where: "player_character", message: `"${story.player_character}" is the Player Character but not one of the people` });
  }
  (story.leads ?? []).forEach((lead, index) => {
    if (!people.has(lead)) problems.push({ where: `leads[${index}]`, message: `"${lead}" is a Lead but not one of the people` });
    else if (lead === story.player_character) problems.push({ where: `leads[${index}]`, message: `"${lead}" is the Player Character, who is never a Lead` });
  });
  story.people.forEach((person, index) => {
    if (person.group && !groups.has(person.group)) problems.push({ where: `people[${index}].group`, message: `${person.name} is in "${person.group}", which is not one of the groups` });
  });
  story.opening.who.forEach((name, index) => {
    if (!people.has(name)) problems.push({ where: `opening.who[${index}]`, message: `"${name}" is in the opening Scene but not one of the people` });
    else if (name === story.player_character) problems.push({ where: `opening.who[${index}]`, message: `"${name}" is the Player Character; the opening lists only who else is there` });
  });
  return problems;
}

function portraitProblems(story: StoryFile, folder: string): Problem[] {
  const problems: Problem[] = [];
  story.people.forEach((person, index) => {
    if (!person.portrait) return;
    const at = `people[${index}].portrait`;
    const relative = normalize(person.portrait);
    if (isAbsolute(relative) || relative.startsWith(`..${sep}`) || relative === "..") {
      problems.push({ where: at, message: `${person.name}'s Portrait "${person.portrait}" is outside the Story File's folder` });
    } else if (!PORTRAIT_TYPES.has(extname(relative).toLowerCase())) {
      problems.push({ where: at, message: `${person.name}'s Portrait "${person.portrait}" is not a PNG, JPEG or WebP image` });
    } else if (!existsSync(join(folder, relative)) || !statSync(join(folder, relative)).isFile()) {
      problems.push({ where: at, message: `${person.name}'s Portrait "${person.portrait}" is not in the Story File's folder` });
    } else if (statSync(join(folder, relative)).size > 10 * 1024 * 1024) {
      problems.push({ where: at, message: `${person.name}'s Portrait "${person.portrait}" is larger than 10 MB` });
    }
  });
  return problems;
}

/** A Bond is where things stand between him and someone else, in forty words or fewer (lasting-records design decision 1). */
function bondProblems(story: StoryFile): Problem[] {
  const problems: Problem[] = [];
  story.people.forEach((person, index) => {
    if (!person.bond) return;
    const at = `people[${index}].bond`;
    const words = person.bond.trim().split(/\s+/).length;
    if (person.name === story.player_character) problems.push({ where: at, message: `${person.name} is the Player Character; a Bond is between him and someone else` });
    else if (words > MAX_STANDING_WORDS) problems.push({ where: at, message: `${person.name}'s Bond is ${words} words; say where things stand in forty or fewer` });
  });
  return problems;
}

function timeProblems(story: StoryFile): Problem[] {
  const dayOne = story.clock?.day_one;
  const calendar: Problem[] = dayOne && !isDate(dayOne) ? [{ where: "clock.day_one", message: `"${dayOne}" is not a date on the calendar` }] : [];
  const starts = story.clock?.starts ? parseStoryTime(story.clock.starts) : null;
  const opens = parseStoryTime(story.opening.at);
  if (!starts || !opens) return calendar;
  const before = opens.day < starts.day || (opens.day === starts.day && opens.minuteOfDay < starts.minuteOfDay);
  return before ? [...calendar, { where: "opening.at", message: `The opening Scene is at ${story.opening.at}, before the clock starts at ${story.clock?.starts}` }] : calendar;
}
