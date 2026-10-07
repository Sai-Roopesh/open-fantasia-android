import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import type { CalendarItem, WorldPerson, WorldPlace, WorldView } from "../protocol/generated/link.js";
import { onAhead } from "../story/day.js";
import { heardOn, knownOn } from "../story/known.js";
import { minutesOf, parseStoryTime } from "../time.js";
import { countdown, portraitUrl, say } from "./scene.js";

/**
 * The World screen (openspec outside-the-scene: The World screen shows what the Player Character knows): People as he
 * knows them, Places as anyone there would, and the Calendar of what is ahead that he knows of. Nobody's backstory is
 * read here: what nobody knows never reaches it (the-world-screen design decisions 1 to 5).
 */
export function worldView(mac: Mac, storyId: string, traceId: string): WorldView {
  const path = mac.tree.currentPath(storyId);
  if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
  const head = path.headEntryId;
  const state = mac.states.at(head);
  const known = knownOn(mac, head);
  const heard = heardOn(mac, head);
  const pc = state.playerCharacter;

  const person = (name: string): WorldPerson | null => {
    const who = state.people[name];
    if (!who || name === pc) return null;
    const knowing = known.get(name) ?? null;
    return {
      name, aliases: who.aliases, portrait_url: who.portrait ? portraitUrl(storyId, who.portrait) : null,
      lead: state.leads.includes(name), group: who.group, is_group: false,
      known: knowing?.text ?? null, known_from: knowing?.from ?? null, heard: heard.get(name) ?? []
    };
  };
  const knownOf = new Set([...known.keys(), ...heard.keys()]);
  const leads = state.leads.filter(name => knownOf.has(name)).flatMap(name => person(name) ?? []);
  const others = [...knownOf].filter(name => !state.leads.includes(name)).sort().flatMap(name => person(name) ?? []);
  // A Group's description is public, as a place's is: each is one entry, beside any member he knows on their own.
  const groups: WorldPerson[] = state.groups.map(group => ({
    name: group.name, aliases: [], portrait_url: null, lead: false, group: null, is_group: true,
    known: group.description || null, known_from: null, heard: heard.get(group.name) ?? []
  }));
  const people = [...leads, ...[...others, ...groups].sort((left, right) => left.name.localeCompare(right.name))];

  const scenePlaces = mac.tree.pathTo(head).flatMap(entry => entry.payload.kind === "scene_opened" ? [entry.payload.place.toLocaleLowerCase()] : []);
  const places: WorldPlace[] = [...state.world.places, ...state.world.institutions].map(place => ({
    name: place.name, description: place.description,
    been: scenePlaces.some(where => where.includes(place.name.toLocaleLowerCase()) || place.name.toLocaleLowerCase().includes(where))
  }));

  const now = parseStoryTime(state.clock);
  const ahead: (CalendarItem & { minutes: number })[] = [];
  if (now) {
    for (const landmark of state.landmarks) {
      const at = parseStoryTime(landmark.at);
      if (at && minutesOf(at) >= minutesOf(now)) ahead.push({ kind: "landmark", name: landmark.name, what: landmark.what, at_label: say(state, landmark.at), when: countdown(now, at, landmark.name).when, minutes: minutesOf(at) });
    }
    for (const happening of onAhead(mac, head, state.clock)) {
      const at = parseStoryTime(happening.at);
      if (at) ahead.push({ kind: "happening", name: happening.place, what: happening.what, at_label: say(state, happening.at), when: countdown(now, at, happening.place).when, minutes: minutesOf(at) });
    }
  }
  const calendar: CalendarItem[] = ahead.sort((left, right) => left.minutes - right.minutes).map(({ minutes: _minutes, ...item }) => item);

  return { story_id: storyId, people, places, calendar, trace_id: traceId };
}
