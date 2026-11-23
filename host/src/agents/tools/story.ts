import type { ToolSpec } from "../../models/model-call.js";
import type { Db } from "../../store/db.js";
import { States } from "../../store/states.js";
import { Tree } from "../../store/tree.js";
import type { Entry, Payload } from "../../story/entries.js";
import type { Person, Quote, State } from "../../story/state.js";
import { betweenKey, type Belief, type Held, type Truth, type TruthUpdate } from "../../story/truth.js";
import { parseAnyTime, sayFull } from "../../time.js";
import { nameIndex, storyName } from "../names.js";

/**
 * The Story's tools (docs/adr/0018): what an agent can look up in the Story on one Path, as of its head, while it
 * works. Each answers in prose, never as data, and within a bound, so a lookup never floods the step; a long Scene
 * is read in parts. Nothing here changes the Story.
 */
export interface StoryTool extends ToolSpec {
  /** The answer, and the lookup said in a line for the call's record. */
  run(args: Record<string, unknown>): { answer: string; line: string };
}

/** The most an answer may say; a Scene is read in parts of this size. */
const MOST = 8_000;
const PART = 12_000;
/** How many passages a search answers with. */
const HITS = 8;
/** How many items of one kind a person's history lists, newest kept. */
const ITEMS = 12;

/** The Story's tools over the Path at [head]. The Path and its State are read once, when a tool first needs them. */
export function storyTools(db: Db, storyId: string, head: string): StoryTool[] {
  const story = new StoryAt(db, storyId, head);
  return [
    {
      name: "search_story",
      description: "Search everything played and recorded in this Story so far for words: the player's Moves, the Replies, each Scene's record and what happened off the page. Answers with the best passages, each with its Scene, so you can read the Scene in full.",
      params: { words: { type: "string", description: "The words to look for, such as a name, a thing or a phrase someone said." } },
      run: args => story.search(text(args.words))
    },
    {
      name: "read_scene",
      description: "Read a played Scene in full, word for word, by its number: the opening, every Move and Reply, and its record. A long Scene comes in parts.",
      params: {
        number: { type: "integer", description: "The Scene's number." },
        part: { type: "integer", description: "Which part of a long Scene to read; the first when not given.", optional: true }
      },
      run: args => story.scene(whole(args.number), whole(args.part) || 1)
    },
    {
      name: "read_person",
      description: "Read a person's history: who they are now and who they were before, what they know and believe (and whether it is true), what they know happened, what is true that they are part of, and where things stand with others.",
      params: { name: { type: "string", description: "The person's name, as the Story names them." } },
      run: args => story.person(text(args.name))
    },
    {
      name: "read_between",
      description: "Read where things stand between two people: how it stands now, the turning points that brought it there, and the keepsakes they would remember, in their own words.",
      params: {
        first: { type: "string", description: "One person's name." },
        second: { type: "string", description: "The other person's name." }
      },
      run: args => story.between(text(args.first), text(args.second))
    },
    {
      name: "read_rules",
      description: "Read the Rules of how this World works: the ones that hold, and the ones that ended and why. Give words to find the Rules about something.",
      params: { about: { type: "string", description: "What the Rules should be about; every Rule when not given.", optional: true } },
      run: args => story.rules(text(args.about))
    },
    {
      name: "read_name",
      description: "Look up a name: who or what it is, and where it was first named in the Story.",
      params: { name: { type: "string", description: "The name, or part of it." } },
      run: args => story.name(text(args.name))
    }
  ];
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");
const whole = (value: unknown): number => (typeof value === "number" ? Math.trunc(value) : typeof value === "string" && /^\d+$/.test(value.trim()) ? Number(value) : 0);
const quoted = (words: string) => `“${words}”`;

/** [answer] within the bound, said to be cut short when it was. */
function bounded(answer: string, most = MOST): string {
  return answer.length <= most ? answer : `${answer.slice(0, most).replace(/\s+\S*$/, "")} … (cut short here)`;
}

/** The newest [count] of [items], with a line saying how many earlier ones were left out. */
function newest(items: string[], count = ITEMS): string[] {
  return items.length <= count ? items : [`- (${items.length - count} earlier left out)`, ...items.slice(-count)];
}

/** Where an item came from, in the words of its first source. */
function from(sources: Quote[]): string {
  const first = sources[0]?.text.trim();
  return first ? ` From: ${quoted(first.length > 200 ? `${first.slice(0, 200)}…` : first)}` : "";
}

/** When an item held: since a Scene, or from one Scene to another and why it ended. */
function held(item: Held): string {
  const opened = item.opened === 0 ? "the Story's start" : `Scene ${item.opened}`;
  return item.closed === null ? `since ${opened}` : `from ${opened} to Scene ${item.closed} (ended: ${(item.closedBy ?? "no longer true").replace(/\.$/, "")})`;
}

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** One Scene on the Path: its opening, and the entries played and recorded in it. */
interface SceneSpan {
  number: number;
  title: string;
  place: string;
  at: string;
  who: string[];
  entries: Entry[];
}

/** The search's own index: built and brought up to date when searched (entries never change, so it only grows). */
const INDEX_SHAPE = 1;

/** The Story on one Path at one head, read lazily. */
class StoryAt {
  private path: Entry[] | null = null;
  private folded: State | null = null;
  private spans: SceneSpan[] | null = null;

  constructor(private readonly db: Db, private readonly storyId: string, private readonly head: string) {}

  private entries(): Entry[] {
    this.path ??= new Tree(this.db).pathTo(this.head);
    return this.path;
  }

  private state(): State {
    this.folded ??= new States(this.db, new Tree(this.db)).at(this.head);
    return this.folded;
  }

  /** The Scenes on the Path, in order. A Scene a Move went straight into starts at that Move. */
  private scenes(): SceneSpan[] {
    if (this.spans) return this.spans;
    const path = this.entries();
    const index = new Map(path.map((entry, at) => [entry.id, at]));
    const starts = path.flatMap((entry, at) => {
      if (entry.payload.kind !== "scene_opened") return [];
      const begins = entry.payload.startsAt ? index.get(entry.payload.startsAt) : undefined;
      return [{ at: begins !== undefined && begins < at ? begins : at, opening: entry.payload }];
    });
    this.spans = starts.map(({ at, opening }, number) => ({
      number: opening.number, title: opening.title, place: opening.place, at: opening.at, who: opening.who,
      entries: path.slice(at, starts[number + 1]?.at ?? path.length)
    }));
    return this.spans;
  }

  private when(at: string): string {
    const time = parseAnyTime(at, this.state().dayOne);
    return time ? sayFull(time, this.state().dayOne) : at;
  }

  /** The Story's name for a person, by any name they answer to. */
  private who(name: string): string | null {
    return storyName(nameIndex(Object.values(this.state().people)), name);
  }

  private nobody(name: string): string {
    const people = Object.keys(this.state().people);
    return `Nobody called ${quoted(name)} is in this Story. Its people: ${people.slice(0, 40).join(", ")}${people.length > 40 ? ", and others" : ""}.`;
  }

  search(words: string): { answer: string; line: string } {
    const terms = words.match(/[\p{L}\p{N}]+/gu) ?? [];
    if (terms.length === 0) return { answer: "Give some words to search for.", line: "searched the Story for nothing" };
    this.index();
    const onPath = new Set(this.entries().map(entry => entry.id));
    const sceneOf = new Map(this.scenes().flatMap(scene => scene.entries.map(entry => [entry.id, scene] as const)));
    const ask = this.db.prepare("SELECT entry_id, kind, snippet(story_search, 0, '', '', '…', 40) AS words FROM story_search WHERE story_search MATCH ? AND story_id = ? ORDER BY rank");
    const run = (match: string) => {
      const hits: { entry: string; kind: string; words: string }[] = [];
      for (const row of ask.iterate(match, this.storyId) as Iterable<{ entry_id: string; kind: string; words: string }>) {
        if (!onPath.has(row.entry_id) || hits.some(hit => hit.words === row.words)) continue;
        hits.push({ entry: row.entry_id, kind: row.kind, words: row.words });
        if (hits.length === HITS) break;
      }
      return hits;
    };
    const phrases = terms.map(term => `"${term}"`);
    // Every word first; when no passage has them all, any of them, best first.
    let hits = run(phrases.join(" "));
    if (hits.length === 0 && phrases.length > 1) hits = run(phrases.join(" OR "));
    if (hits.length === 0) return { answer: `Nothing in this Story so far mentions ${quoted(words)}.`, line: `searched the Story for ${quoted(words)}: nothing found` };
    const pc = this.state().playerCharacter;
    const label = (hit: { entry: string; kind: string }) => {
      const scene = sceneOf.get(hit.entry);
      const where = scene ? `Scene ${scene.number}, ${quoted(scene.title)}` : "Before the first Scene";
      const record = this.entries().find(entry => entry.id === hit.entry)?.payload;
      const after = record && "scene" in record && typeof record.scene === "number" ? record.scene : scene?.number;
      switch (hit.kind) {
        case "move": return `${where}, ${pc}'s Move`;
        case "reply": return `${where}, a Reply`;
        case "opening": return `${where}, its opening`;
        case "offpage": return `Off the page, after Scene ${after}`;
        default: return `The record of Scene ${after}`;
      }
    };
    const lines = hits.map((hit, at) => `${at + 1}. ${label(hit)}: ${hit.words}`);
    return {
      answer: bounded([`What this Story says about ${quoted(words)}, best first:`, "", ...lines].join("\n")),
      line: `searched the Story for ${quoted(words)}: ${hits.length} passage${hits.length === 1 ? "" : "s"}`
    };
  }

  scene(number: number, part: number): { answer: string; line: string } {
    const scenes = this.scenes();
    const scene = scenes.find(item => item.number === number);
    if (!scene) {
      return {
        answer: scenes.length ? `There is no Scene ${number} on this Path; Scenes 1 to ${scenes.at(-1)?.number ?? 1} have been played.` : "No Scene has been played yet.",
        line: `read Scene ${number}: there is none`
      };
    }
    const pc = this.state().playerCharacter;
    const said = scene.entries.flatMap(entry => {
      const payload = entry.payload;
      if (payload.kind === "scene_opened") return payload.prose ? [payload.prose] : [];
      if (payload.kind === "move") return [`${pc} (the player's Move): ${payload.text}`];
      if (payload.kind === "reply") return [payload.text];
      if (payload.kind === "scene_closed") return ["(The Scene ended.)"];
      if (payload.kind === "chronicle" && payload.scene === number) return [`The Scene's record: ${payload.paragraph}`];
      return [];
    });
    const header = `Scene ${scene.number}, ${quoted(scene.title)}: ${scene.place}, ${this.when(scene.at)}.${scene.who.length ? ` With ${scene.who.join(", ")}.` : ""}`;
    const parts = inParts(said, PART);
    const which = Math.min(Math.max(part, 1), parts.length);
    const more = parts.length > 1 ? `\n\n(Part ${which} of ${parts.length}.${which < parts.length ? ` Read on with part ${which + 1}.` : ""})` : "";
    return {
      answer: `${header}\n\n${parts[which - 1] ?? ""}${more}`,
      line: `read Scene ${scene.number}, ${quoted(scene.title)}${parts.length > 1 ? `, part ${which} of ${parts.length}` : ""}`
    };
  }

  person(asked: string): { answer: string; line: string } {
    const name = this.who(asked);
    if (!name) return { answer: this.nobody(asked), line: `read ${asked}'s history: nobody by that name` };
    const state = this.state();
    const truth = state.truth;
    const person = state.people[name] as Person;
    const out = [`${name}: ${person.whoTheyAre}`];
    const life = state.lives[name];
    if (life) out.push(`Where they are: ${[life.where, life.doing].filter(Boolean).join(", ") || "not known"}; what they are after: ${life.after}.`);
    const now = truth.now[name];
    if (now) {
      out.push("", `Who they are now, as of Scene ${now.scene}: ${now.now}`);
      if (now.feelings.length) out.push(`How they feel: ${now.feelings.map(feeling => `about ${feeling.about}, ${feeling.feels}`).join("; ")}.`);
      if (now.wants) out.push(`What they want: ${now.wants}`);
      if (now.hides) out.push(`What they hide: ${now.hides}`);
    }
    const before = truth.past.filter(item => item.who === name).map(item => `- As of Scene ${item.scene}: ${item.now}`);
    if (before.length) out.push("", "Who they were before, oldest first:", ...newest(before, 4));
    const beliefs = Object.values(truth.beliefs).filter(belief => belief.holder === name).sort(byOpening).map(belief => `- ${believes(belief)}, ${held(belief)}: ${belief.what}${from(belief.sources)}`);
    if (beliefs.length) out.push("", "What they know and believe:", ...newest(beliefs));
    const happened = state.facts.filter(fact => fact.knownTo.includes(name)).map(fact => `- Scene ${fact.scene}${fact.source === "world" ? ", off the page" : ""}: ${fact.what}`);
    if (happened.length) out.push("", "What they know happened:", ...newest(happened));
    const truths = Object.values(truth.truths).filter(item => item.who.includes(name) || item.knownTo.includes(name)).sort(byOpening).map(item => `- ${truthLine(item)}`);
    if (truths.length) out.push("", "What is true that they are part of or know:", ...newest(truths));
    const between = Object.values(truth.between).filter(item => item.people.includes(name)).map(item => `- With ${item.people.find(other => other !== name) ?? name}: ${item.stands || "nothing settled yet"}`);
    if (between.length) out.push("", "Where things stand with others (read_between for the turning points and keepsakes):", ...newest(between));
    return { answer: bounded(out.join("\n")), line: `read ${name}'s history` };
  }

  between(first: string, second: string): { answer: string; line: string } {
    const one = this.who(first);
    const other = this.who(second);
    if (!one || !other) return { answer: this.nobody(one ? second : first), line: `read between ${first} and ${second}: nobody by that name` };
    const state = this.state();
    const kept = state.truth.between[betweenKey(one, other)];
    const out = [`Between ${one} and ${other}.`];
    if (kept) {
      out.push(`Where it stands: ${kept.stands || "nothing settled yet"}`);
      if (kept.turns.length) out.push("", "The turning points, oldest first:", ...newest(kept.turns.map(turn => `- Scene ${turn.scene}: ${turn.text}`)));
      if (kept.keepsakes.length) out.push("", "Keepsakes, in their own words:", ...kept.keepsakes.map(keepsake => `- Scene ${keepsake.scene}: ${keepsake.what}${keepsake.words.length ? ` ${keepsake.words.map(words => quoted(words.text)).join(" ")}` : ""}`));
    }
    // The Bond is how the Player Character has seen it, which may not be the whole of it.
    const pc = state.playerCharacter;
    const bond = one === pc ? state.bonds[other] : other === pc ? state.bonds[one] : undefined;
    if (bond) out.push("", `As ${pc} has seen it: ${bond.standing}`, ...newest(bond.turns.map(turn => `- ${turn.scene ? `Scene ${turn.scene.number}` : "Before the Story"}: ${turn.text}`), 6));
    if (!kept && !bond) out.push("Nothing is kept between them yet.");
    return { answer: bounded(out.join("\n")), line: `read between ${one} and ${other}` };
  }

  rules(about: string): { answer: string; line: string } {
    const all = Object.values(this.state().truth.rules).sort(byOpening);
    const words = (about.match(/[\p{L}\p{N}]{3,}/gu) ?? []).map(word => word.toLocaleLowerCase());
    const matching = words.length ? all.filter(rule => words.some(word => rule.what.toLocaleLowerCase().includes(word))) : all;
    const line = about ? `read the Rules about ${quoted(about)}` : "read the Rules";
    if (all.length === 0) return { answer: "No Rules have been set down in this Story yet.", line };
    const listed = (rules: typeof all) => {
      const holding = rules.filter(rule => rule.closed === null).map(rule => `- ${capital(held(rule))}: ${rule.what}${from(rule.sources)}`);
      const ended = rules.filter(rule => rule.closed !== null).map(rule => `- ${capital(held(rule))}: ${rule.what}`);
      return [...(holding.length ? ["The Rules that hold:", ...holding] : []), ...(holding.length && ended.length ? [""] : []), ...(ended.length ? ["Rules that no longer hold:", ...ended] : [])];
    };
    if (matching.length === 0) return { answer: bounded([`No Rule is about ${quoted(about)}.`, "", ...listed(all)].join("\n")), line: `${line}: none` };
    return { answer: bounded(listed(matching).join("\n")), line };
  }

  name(asked: string): { answer: string; line: string } {
    const state = this.state();
    const key = asked.toLocaleLowerCase();
    const like = (name: string) => name.toLocaleLowerCase() === key || (key.length >= 3 && (name.toLocaleLowerCase().includes(key) || key.includes(name.toLocaleLowerCase())));
    const found: string[] = [];
    for (const name of Object.values(state.truth.names).filter(item => like(item.name))) {
      found.push(`- ${name.name} (a ${name.kind}), first named in ${name.first === 0 ? "the Story File" : `Scene ${name.first}`}: ${name.what}${from(name.sources)}`);
    }
    const person = this.who(asked);
    const people = person ? [state.people[person] as Person] : Object.values(state.people).filter(item => like(item.name));
    for (const item of people) found.push(`- ${item.name}, a person in the Story: ${item.whoTheyAre}`);
    for (const place of [...state.world.places, ...state.world.institutions].filter(item => like(item.name))) found.push(`- ${place.name}, a place in the World: ${place.description}`);
    for (const group of state.groups.filter(item => like(item.name))) found.push(`- ${group.name}, a group: ${group.description}`);
    if (found.length === 0) return { answer: `Nothing called ${quoted(asked)} has been named in this Story.`, line: `looked up the name ${quoted(asked)}: not named` };
    return { answer: bounded(found.slice(0, 8).join("\n")), line: `looked up the name ${quoted(asked)}` };
  }

  /** Brings the search index up to the Story's newest entry. */
  private index(): void {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS story_search USING fts5(text, entry_id UNINDEXED, story_id UNINDEXED, kind UNINDEXED, tokenize = 'porter unicode61');
      CREATE TABLE IF NOT EXISTS story_search_done (story_id TEXT PRIMARY KEY, seq INTEGER NOT NULL, shape INTEGER NOT NULL);
    `);
    const done = this.db.prepare("SELECT seq, shape FROM story_search_done WHERE story_id = ?").get(this.storyId) as { seq: number; shape: number } | undefined;
    const after = done?.shape === INDEX_SHAPE ? done.seq : 0;
    const newer = this.db.prepare("SELECT seq, id, payload FROM entries WHERE story_id = ? AND seq > ? ORDER BY seq").all(this.storyId, after) as { seq: number; id: string; payload: string }[];
    if (newer.length === 0 && done) return;
    const add = this.db.prepare("INSERT INTO story_search (text, entry_id, story_id, kind) VALUES (?, ?, ?, ?)");
    this.db.transaction(() => {
      if (after === 0) this.db.prepare("DELETE FROM story_search WHERE story_id = ?").run(this.storyId);
      for (const row of newer) for (const [kind, words] of searchable(JSON.parse(row.payload) as Payload)) if (words.trim()) add.run(words, row.id, this.storyId, kind);
      this.db.prepare("INSERT OR REPLACE INTO story_search_done (story_id, seq, shape) VALUES (?, ?, ?)").run(this.storyId, newer.at(-1)?.seq ?? after, INDEX_SHAPE);
    })();
  }
}

/** What of an entry can be searched, each with the kind of passage it is. */
function searchable(payload: Payload): [string, string][] {
  switch (payload.kind) {
    case "move": return [["move", payload.text]];
    case "reply": return [["reply", payload.text]];
    case "scene_opened": return payload.prose ? [["opening", payload.prose]] : [];
    case "chronicle":
    case "scene_recorded":
      return [
        ["record", payload.paragraph],
        ...payload.moments.map((moment): [string, string] => ["record", [moment.what, ...moment.quotes.map(quote => quote.text)].join(" ")]),
        ...truthWords(payload.truth).map((words): [string, string] => ["record", words])
      ];
    case "world_moved":
      return [
        ...payload.happened.map((item): [string, string] => ["offpage", item.what]),
        ...payload.meanwhile.map((line): [string, string] => ["offpage", line.text]),
        ...truthWords(payload.truth).map((words): [string, string] => ["offpage", words])
      ];
    default:
      return [];
  }
}

/** A record's truth in words, for the search. A record from before the truth was has none. */
function truthWords(update: TruthUpdate | undefined): string[] {
  if (!update) return [];
  return [
    ...update.now.map(person => `${person.who}: ${person.now} ${person.wants} ${person.hides}`),
    ...update.beliefs.open.map(belief => `${belief.holder} ${belief.true ? "knows" : "believes, wrongly,"} ${belief.what}`),
    ...update.between.flatMap(change => [change.stands, change.turn?.text, ...change.keepsakes.map(keepsake => `${keepsake.what} ${keepsake.words.map(words => words.text).join(" ")}`)]
      .filter((words): words is string => Boolean(words)).map(words => `${change.people.join(" and ")}: ${words}`)),
    ...update.truths.open.map(item => [item.what, ...item.terms].join(" ")),
    ...update.rules.open.map(rule => rule.what),
    ...update.names.map(name => `${name.name}: ${name.what}`)
  ];
}

const byOpening = (left: Held, right: Held) => left.opened - right.opened;

function believes(belief: Belief): string {
  const now = belief.closed === null;
  return belief.true ? (now ? "Knows" : "Knew") : (now ? "Believes, wrongly" : "Believed, wrongly");
}

function truthLine(item: Truth): string {
  const kind = capital(item.kind);
  const terms = item.terms.length ? ` Its terms: ${item.terms.join("; ")}.` : "";
  const due = item.due ? ` Due ${item.due}.` : "";
  const known = item.kind === "secret" && item.knownTo.length ? ` Known to ${item.knownTo.join(", ")}.` : "";
  return `${kind}, ${held(item)}: ${item.what}${terms}${due}${known}${from(item.sources)}`;
}

/** Paragraphs gathered into parts of at most [size], a paragraph longer than that split at a sentence. */
function inParts(paragraphs: string[], size: number): string[] {
  const pieces = paragraphs.flatMap(paragraph => paragraph.length <= size ? [paragraph] : paragraph.match(new RegExp(`[\\s\\S]{1,${size}}(?=\\s|$)`, "g")) ?? [paragraph]);
  const parts: string[] = [];
  let part = "";
  for (const piece of pieces) {
    if (part && part.length + piece.length + 2 > size) {
      parts.push(part);
      part = "";
    }
    part = part ? `${part}\n\n${piece}` : piece;
  }
  if (part || parts.length === 0) parts.push(part);
  return parts;
}
