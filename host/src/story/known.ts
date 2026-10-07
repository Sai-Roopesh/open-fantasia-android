import { names } from "../agents/names.js";
import type { Mac } from "../mac.js";
import type { Chronicle, Entry, MeanwhileItem, SceneOpened, WorldMoved } from "./entries.js";

/** What the Player Character knows of someone, and where it came from. */
export interface Knowing {
  text: string;
  /** The Scene whose Chronicle last added to it; null for the Story File's line or one set with `fantasia known`. */
  from: { number: number; title: string } | null;
}

/**
 * What the Player Character knows of each person on the Path at [head] (openspec outside-the-scene: The World screen
 * shows what the Player Character knows): the newest of the Story File's line, a `known_set`, or a line the Chronicler
 * wrote after a Scene they were in (the-world-screen design decision 1). Someone he knows nothing of is absent.
 */
export function knownOn(mac: Mac, head: string): Map<string, Knowing> {
  const path = mac.tree.pathTo(head);
  // Each line in the order it was written: an edit's line counts only where it changed what he knew.
  const lines: { seq: number; who: string; knowing: Knowing; ifChanged?: boolean }[] = [];
  const scenes = new Map<string, SceneOpened>();
  for (const entry of path) {
    const payload = entry.payload;
    if (payload.kind === "story_set_up") {
      for (const person of payload.storyFile.people) if (person.known) lines.push({ seq: entry.seq, who: person.name, knowing: { text: person.known, from: null } });
    } else if (payload.kind === "known_set") lines.push({ seq: entry.seq, who: payload.person, knowing: { text: payload.text, from: null } });
    else if (payload.kind === "person_set" && payload.person.known) lines.push({ seq: entry.seq, who: payload.person.name, knowing: { text: payload.person.known, from: null }, ifChanged: true });
    else if (payload.kind === "scene_opened") scenes.set(entry.id, payload);
  }
  for (const record of mac.tree.recordsOn(head, "chronicle") as Entry<Chronicle>[]) {
    const scene = scenes.get(record.payload.scene);
    for (const row of record.payload.known ?? []) {
      lines.push({ seq: record.seq, who: row.who, knowing: { text: row.now, from: scene ? { number: scene.number, title: scene.title } : null } });
    }
  }
  const known = new Map<string, Knowing>();
  for (const line of lines.sort((left, right) => left.seq - right.seq)) {
    if (line.ifChanged && known.get(line.who)?.text === line.knowing.text) continue;
    known.set(line.who, line.knowing);
  }
  return known;
}

/** One line of what he has heard of someone, and how. */
export interface Heard {
  text: string;
  how: MeanwhileItem["how"];
}

/**
 * What the Player Character has heard of each person on the Path at [head]: every line of Meanwhile about them, newest
 * first (the-world-screen design decision 3). A line woven before Meanwhile said who it is about counts as about
 * everyone it names, besides him.
 */
export function heardOn(mac: Mac, head: string): Map<string, Heard[]> {
  const state = mac.states.at(head);
  const people = Object.values(state.people).filter(person => person.name !== state.playerCharacter);
  const heard = new Map<string, Heard[]>();
  for (const record of [...mac.tree.recordsOn(head, "world_moved")].reverse() as Entry<WorldMoved>[]) {
    for (const item of record.payload.meanwhile) {
      const about = item.about ?? people.filter(person => names(item.text, person)).map(person => person.name);
      for (const name of about) heard.set(name, [...(heard.get(name) ?? []), { text: item.text, how: item.how }]);
    }
  }
  return heard;
}
