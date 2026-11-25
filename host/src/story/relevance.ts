import { nameIndex, storyName } from "../story/names.js";
import { currentAct } from "./outline.js";
import type { Person, State } from "./state.js";
import { betweenKey } from "./truth.js";

/**
 * Lives in tiers by how much each person matters (openspec living-world: Everyone has a Life; the-storys-mind design
 * decision 3). How much someone matters is worked out from play after each Scene: time on the page with the Player
 * Character, the turning points between them, and how often play mentions them when they are not there. The Leads
 * and the top band are Close; the people the Outline says drive the World this Act, and whoever the Director brought
 * forward, are Movers; everyone else keeps a line, a Group as one, until play lifts them. Anyone can rise.
 */

/** What each kind of play counts toward how much someone matters. */
const WEIGHT = { scene: 1, turn: 1, mention: 0.25 } as const;

/** Someone is Close by play from this: three Scenes with him, or fewer that turned something between them. */
export const CLOSE_AT = 3;

/** The top band: at most this many are Close by play, besides the Leads. */
export const CLOSE_BAND = 8;

export interface Relevance {
  /** A person, or a Group, which lives as one. */
  who: string;
  /** The Scenes they were on the page with him. */
  scenes: number;
  /** The turning points between them and him. */
  turns: number;
  /** The times play spoke of them when they were not there. */
  mentions: number;
  score: number;
}

export interface Tiers {
  /** The Leads, then the top band by play: a full Life, kept by the Chronicler after every Scene they touch. */
  close: string[];
  /** Who drives the World this Act, and whoever the Director promoted: a full Life, kept by the Weaver. */
  movers: string[];
  /** Everyone else, a Group as one: a line, until something touches them. Most relevant first. */
  others: string[];
}

/** Who a name is lived as: a Lead as themselves, a member of a Group as the Group, anyone else as themselves. */
export function livedAs(state: State, name: string): string {
  const group = state.people[name]?.group;
  return !state.leads.includes(name) && group && state.groups.some(item => item.name === group) ? group : name;
}

/** Everyone who has a Life, each once: people one by one, and each Group for its members. */
function lives(state: State): { who: string; members: Person[] }[] {
  const pc = state.playerCharacter;
  const found = new Map<string, Person[]>();
  for (const group of state.groups) found.set(group.name, []);
  for (const person of Object.values(state.people)) {
    if (person.name === pc) continue;
    const who = livedAs(state, person.name);
    found.set(who, [...(found.get(who) ?? []), person]);
  }
  return [...found].map(([who, members]) => ({ who, members }));
}

const escaped = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whether a text speaks of [who]: any of its members by any name that is theirs alone (a surname two people share,
 * "Malfoy", is neither's), or a Group by its own.
 */
function speaksOf(state: State, who: string, members: Person[], index: Map<string, string>): (text: string) => boolean {
  const theirs = new Set(members.map(member => member.name));
  const words = [
    ...[...index].filter(([, name]) => theirs.has(name)).map(([alias]) => alias),
    ...(state.groups.some(group => group.name === who) ? [who] : [])
  ];
  if (!words.length) return () => false;
  const pattern = new RegExp(`\\b(?:${[...new Set(words)].map(escaped).join("|")})\\b`, "i");
  return text => pattern.test(text);
}

/** How much each person and Group matters, from play: most first, the Story's own order between equals. */
export function relevance(state: State): Relevance[] {
  const pc = state.playerCharacter;
  // Every part of The Story So Far, however it is folded: a Scene's paragraph says who was there.
  const told = Object.values(state.storySoFar).flat();
  const page = state.facts.filter(fact => fact.source === "page");
  const scene = state.scene;
  const index = nameIndex(Object.values(state.people));
  const scored = lives(state).map(({ who, members }, order) => {
    const named = members.map(member => member.name);
    const isThem = (name: string) => name === who || named.includes(name);
    const spoken = speaksOf(state, who, members, index);
    const together = new Set<number>();
    for (const part of told) if (part.scene && part.who.some(isThem)) together.add(part.scene.number);
    for (const fact of page) if (fact.knownTo.some(isThem)) together.add(fact.scene);
    // The Scene that has just ended counts from its end, before the Chronicler has recorded it.
    if (scene?.closed && scene.met.some(isThem)) together.add(scene.number);
    let turns = 0;
    for (const name of named) {
      const between = state.truth.between[betweenKey(pc, name)]?.turns ?? [];
      const bond = state.bonds[name]?.turns ?? [];
      for (const turn of between) together.add(turn.scene);
      for (const turn of bond) if (turn.scene) together.add(turn.scene.number);
      // The Bond and the between-record may both tell one turn: the longer list counts.
      turns += Math.max(between.length, bond.length);
    }
    const elsewhere = [
      ...told.filter(part => !part.scene || !together.has(part.scene.number)).map(part => part.text),
      ...page.filter(fact => !together.has(fact.scene)).map(fact => fact.what)
    ];
    const mentions = elsewhere.filter(spoken).length + state.meanwhile.filter(line => line.about.some(isThem)).length;
    const score = together.size * WEIGHT.scene + turns * WEIGHT.turn + mentions * WEIGHT.mention;
    return { item: { who, scenes: together.size, turns, mentions, score }, order };
  });
  return scored.sort((left, right) => right.item.score - left.item.score || left.order - right.order).map(({ item }) => item);
}

/** The Lives in tiers: Close, Movers and everyone else, each name once and never the Player Character. */
export function tiers(state: State): Tiers {
  const pc = state.playerCharacter;
  const scored = relevance(state);
  const leads = state.leads.filter(name => name !== pc && state.people[name]);
  const band = scored.filter(item => item.score >= CLOSE_AT && !leads.includes(item.who)).slice(0, CLOSE_BAND).map(item => item.who);
  const close = [...leads, ...band];
  const index = nameIndex(Object.values(state.people));
  const story = (name: string) => state.groups.find(group => group.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())?.name ?? storyName(index, name);
  const named = [...(currentAct(state.outline)?.movers.map(mover => mover.who) ?? []), ...(state.outline?.promoted ?? [])]
    .flatMap(name => {
      const known = story(name);
      return known && known !== pc ? [livedAs(state, known)] : [];
    });
  const movers = [...new Set(named)].filter(name => !close.includes(name));
  const others = scored.map(item => item.who).filter(name => !close.includes(name) && !movers.includes(name));
  return { close, movers, others };
}

/** Which tier someone is lived in, by their name or their Group's. */
export function tierOf(state: State, who: string, of: Tiers = tiers(state)): "close" | "mover" | "other" {
  const as = livedAs(state, who);
  return of.close.includes(as) ? "close" : of.movers.includes(as) ? "mover" : "other";
}
