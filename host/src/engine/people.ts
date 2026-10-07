import { nameIndex } from "../agents/names.js";
import type { Person, State } from "../story/state.js";

type Edited = Omit<Person, "portrait">;

/**
 * Checks a person the player or Claude wrote before it lands on the Path (editing-people design decision 2): a name
 * and who they are, no name or other name that is already someone else's, a Group the Story has, and the Player
 * Character in no Group. Returns the person tidied, or the reason in words the phone shows.
 */
export function checkPerson(state: State, person: Edited, creating: boolean): { ok: true; person: Edited } | { ok: false; reason: string } {
  const name = person.name.trim();
  if (!name) return { ok: false, reason: "Give them a name." };
  const exists = state.people[name] !== undefined;
  if (creating && exists) return { ok: false, reason: `${name} is already in the Story.` };
  if (!creating && !exists) return { ok: false, reason: `${name} is not in the Story.` };
  if (!person.whoTheyAre.trim()) return { ok: false, reason: `Say who ${name} is.` };
  const others = nameIndex(Object.values(state.people).filter(other => other.name !== name));
  const aliases = [...new Set(person.aliases.map(alias => alias.trim()).filter(Boolean))];
  for (const called of [name, ...aliases]) {
    const taken = others.get(called.toLocaleLowerCase());
    if (taken) return { ok: false, reason: called === name ? `${name} is already in the Story.` : `"${called}" is already ${taken}'s name.` };
  }
  const group = person.group?.trim() || null;
  if (group && name === state.playerCharacter) return { ok: false, reason: `${name} is the Player Character, and is in no Group.` };
  if (group && !state.groups.some(each => each.name === group)) return { ok: false, reason: `The Story has no Group called ${group}.` };
  return {
    ok: true,
    person: {
      name, aliases, whoTheyAre: person.whoTheyAre.trim(), known: person.known?.trim() || null,
      appearance: person.appearance.trim(), after: person.after.trim(), knows: person.knows.map(line => line.trim()).filter(Boolean),
      voice: person.voice.map(line => line.trim()).filter(Boolean), group
    }
  };
}
