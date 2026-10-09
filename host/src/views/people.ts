import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import type { PeopleView, PersonDetail } from "../protocol/generated/link.js";
import { bondsOn } from "../story/bonds.js";
import { knownOn } from "../story/known.js";
import { nameIndex } from "../agents/names.js";
import { portraitUrl } from "./scene.js";
import { betweenOf } from "./world.js";

function current(mac: Mac, storyId: string) {
  const path = mac.tree.currentPath(storyId);
  if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
  return { head: path.headEntryId, state: mac.states.at(path.headEntryId) };
}

/** Everyone in the Story, for editing (editing-people design decision 5): no one's description, the Leads first. */
export function peopleView(mac: Mac, storyId: string, traceId: string): PeopleView {
  const { state } = current(mac, storyId);
  const leads = state.leads.flatMap(name => state.people[name] ?? []);
  const others = Object.values(state.people).filter(person => !state.leads.includes(person.name)).sort((a, b) => a.name.localeCompare(b.name));
  return {
    story_id: storyId,
    people: [...leads, ...others].map(person => {
      const name = person.name;
      return { name, lead: state.leads.includes(name), group: person.group, portrait_url: person.portrait ? portraitUrl(storyId, person.portrait) : null, player_character: name === state.playerCharacter };
    }),
    groups: state.groups.map(group => ({ name: group.name, description: group.description })),
    trace_id: traceId
  };
}

/** A person as the Story keeps them, what nobody knows included: for the person editor only. */
export function personDetail(mac: Mac, storyId: string, person: string, traceId: string): PersonDetail {
  const { head, state } = current(mac, storyId);
  const name = nameIndex(Object.values(state.people)).get(person.trim().toLocaleLowerCase());
  const who = name ? state.people[name] : undefined;
  if (!name || !who) throw new LinkError("not_found", `${person.trim()} is not in the Story.`);
  return {
    story_id: storyId, name, aliases: who.aliases, who_they_are: who.whoTheyAre, known: knownOn(mac, head).get(name)?.text ?? null,
    appearance: who.appearance, wants: who.after, voice: who.voice, knows: who.knows, group: who.group,
    lead: state.leads.includes(name), portrait_url: who.portrait ? portraitUrl(storyId, who.portrait) : null, player_character: name === state.playerCharacter,
    groups: state.groups.map(group => ({ name: group.name, description: group.description })), trace_id: traceId,
    between: betweenOf(bondsOn(mac, head).get(name))
  };
}
