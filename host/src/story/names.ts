import type { Person } from "./state.js";

/**
 * Every name a person answers to, mapped to the name the Story keeps: full names, aliases, first names and surnames.
 * A model writing "Meera" means Meera Kulkarni, and "Hagrid" means Rubeus Hagrid. A full name always wins; a shorter
 * name two people share ("Malfoy") is nobody's.
 */
export function nameIndex(people: Person[]): Map<string, string> {
  const key = (name: string) => name.trim().toLocaleLowerCase();
  const full = new Map(people.map(person => [key(person.name), person.name]));
  const shorter = new Map<string, string>();
  const shared = new Set<string>();
  for (const person of people) {
    const words = person.name.trim().split(/\s+/);
    const surname = words.length > 1 ? (words.at(-1) ?? "") : "";
    for (const alias of [...person.aliases, words[0] ?? "", surname]) {
      const id = key(alias);
      if (!id || full.has(id)) continue;
      if (shorter.has(id) && shorter.get(id) !== person.name) shared.add(id);
      else shorter.set(id, person.name);
    }
  }
  for (const alias of shared) shorter.delete(alias);
  return new Map([...shorter, ...full]);
}

/** A title a model puts before a name ("Madam Hooch", "Professor McGonagall"), with or without a full stop. */
const TITLE = /^(professor|prof|madam|madame|mr|mrs|ms|miss|mister|dr|doctor|sir|dame|lord|lady|master)\.?\s+/i;

/**
 * The Story's name for [name], or null: as written, or without one title before it (play-check-fixes design decision
 * 3). A title before a surname two people share is still nobody's.
 */
export function storyName(index: Map<string, string>, name: string): string | null {
  const key = name.trim().toLocaleLowerCase();
  return index.get(key) ?? index.get(key.replace(TITLE, "")) ?? null;
}

/**
 * The Story's names for everyone [text] names, by any name the index gives them (lasting-records design decision 5): a
 * shorter name two people share ("Malfoy") names neither, and "Father" names nobody.
 */
export function namedIn(text: string, index: Map<string, string>): string[] {
  // Each person once, in the order the text first names them.
  const first = new Map<string, number>();
  for (const [alias, name] of index) {
    const at = text.search(new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
    if (at >= 0 && at < (first.get(name) ?? Infinity)) first.set(name, at);
  }
  return [...first].sort((left, right) => left[1] - right[1]).map(([name]) => name);
}
