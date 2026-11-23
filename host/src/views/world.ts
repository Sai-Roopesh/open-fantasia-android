import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import type { Between, CalendarItem, WorldPerson, WorldPlace, WorldView } from "../protocol/generated/link.js";
import { engagementsAhead } from "../story/day.js";
import type { Bond, State } from "../story/state.js";
import { samePlace } from "../story/places.js";
import { minutesOf, parseStoryTime } from "../time.js";
import { countdown, portraitUrl, say } from "./scene.js";

/** Between you, as the phone shows it (lasting-records design decision 7): where things stand, the newest turn first. */
export function betweenOf(bond: Bond | undefined): Between | null {
  if (!bond) return null;
  return { standing: bond.standing, turns: [...bond.turns].reverse().map(turn => ({ text: turn.text, scene_number: turn.scene?.number ?? null, scene_title: turn.scene?.title ?? null })) };
}

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
  const known = new Map(Object.entries(state.known));
  const heard = heardOf(state);
  const bonds = new Map(Object.entries(state.bonds));
  const pc = state.playerCharacter;

  const person = (name: string): WorldPerson | null => {
    const who = state.people[name];
    if (!who || name === pc) return null;
    const knowing = known.get(name) ?? null;
    return {
      name, aliases: who.aliases, portrait_url: who.portrait ? portraitUrl(storyId, who.portrait) : null,
      lead: state.leads.includes(name), group: who.group, is_group: false,
      known: knowing?.text ?? null, known_from: knowing?.from ?? null, heard: heard.get(name) ?? [], between: betweenOf(bonds.get(name))
    };
  };
  const knownOf = new Set([...known.keys(), ...heard.keys(), ...bonds.keys()]);
  const leads = state.leads.filter(name => knownOf.has(name)).flatMap(name => person(name) ?? []);
  const others = [...knownOf].filter(name => !state.leads.includes(name)).sort().flatMap(name => person(name) ?? []);
  // A Group's description is public, as a place's is: each is one entry, beside any member he knows on their own.
  const groups: WorldPerson[] = state.groups.map(group => ({
    name: group.name, aliases: [], portrait_url: null, lead: false, group: null, is_group: true,
    known: group.description || null, known_from: null, heard: heard.get(group.name) ?? [], between: null
  }));
  const people = [...leads, ...[...others, ...groups].sort((left, right) => left.name.localeCompare(right.name))];

  const scenePlaces = mac.tree.pathTo(head).flatMap(entry => {
    if (entry.payload.kind === "scene_opened") return [entry.payload.place];
    if (entry.payload.kind === "beat_note" && entry.payload.place) return [entry.payload.place];
    return [];
  });
  const places: WorldPlace[] = [...state.world.places, ...state.world.institutions].map(place => ({
    name: place.name, description: place.description,
    been: scenePlaces.some(where => samePlace(where, place.name))
  }));

  const now = parseStoryTime(state.clock);
  const ahead: (CalendarItem & { minutes: number })[] = [];
  if (now) {
    for (const landmark of state.landmarks) {
      const at = parseStoryTime(landmark.at);
      if (at && minutesOf(at) >= minutesOf(now)) ahead.push({ kind: "landmark", name: landmark.name, what: landmark.what, at_label: say(state, landmark.at), when: countdown(now, at, landmark.name).when, minutes: minutesOf(at) });
    }
    for (const { engagement, next } of engagementsAhead(state)) {
      const at = parseStoryTime(next);
      if (at) ahead.push({ kind: "happening", name: engagement.place, what: engagement.what, at_label: say(state, next), when: countdown(now, at, engagement.place).when, minutes: minutesOf(at) });
    }
  }
  const calendar: CalendarItem[] = ahead.sort((left, right) => left.minutes - right.minutes).map(({ minutes: _minutes, ...item }) => item);

  return { story_id: storyId, people, places, calendar, trace_id: traceId };
}

/** What he has heard of each person: every line of Meanwhile about them, newest first. */
function heardOf(state: State): Map<string, { text: string; how: "seen" | "told" | "rumour" }[]> {
  const heard = new Map<string, { text: string; how: "seen" | "told" | "rumour" }[]>();
  for (const line of [...state.meanwhile].reverse()) {
    for (const name of line.about) heard.set(name, [...(heard.get(name) ?? []), { text: line.text, how: line.how }]);
  }
  return heard;
}
