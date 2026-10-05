import type { Person } from "../story/state.js";

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

/** The Story's name for [name], or null. */
export function storyName(index: Map<string, string>, name: string): string | null {
  return index.get(name.trim().toLocaleLowerCase()) ?? null;
}

/** Whether [text] names [person]: by full name, an alias, or any word of their name. */
export function names(text: string, person: Person): boolean {
  const words = [person.name, ...person.aliases, ...person.name.split(/\s+/).filter(word => word.length >= 3)];
  return words.some(word => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}
