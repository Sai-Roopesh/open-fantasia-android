import { minutesOf, parseStoryTime, sayStoryTime, sayTime } from "../time.js";
import { engagementsAhead, plannedAhead } from "../story/day.js";
import type { Fact, Person, State, Told } from "../story/state.js";

/**
 * Who sees what (one-truth design decision 3): the Director and the Weaver see everything; the Writer sees everything
 * with who knows each thing; the Actor plays each person from what they know; the phone shows what he knows.
 */
export type Lens = "omniscient" | "author" | "character";

/** How much of each section an agent is given: the budgets that keep a long Story's context short. */
export const BUDGET = { facts: 14, moments: 5, calendar: 8, nearby: 12, perPerson: 6, recentScenes: 8 } as const;

/** [body] in a tag, closed by the tag's name alone; null when there is nothing in it. */
export function section(tag: string, body: string): string | null {
  return body.trim() ? `<${tag}>\n${body.trim()}\n</${tag.split(" ")[0]}>` : null;
}

export function join(parts: (string | null)[]): string {
  return parts.filter((part): part is string => part !== null).join("\n\n");
}

export function say(state: State, at: string): string {
  const time = parseStoryTime(at);
  return time ? `${at} (${sayStoryTime(time, state.dayOneWeekday)})` : at;
}

const minutesAt = (at: string) => {
  const time = parseStoryTime(at);
  return time ? minutesOf(time) : 0;
};

/**
 * The Story as it was set up and edited: the same on every call until the player edits it, so it is the part of the
 * prompt the provider caches (docs/adr/0005).
 */
export function storyPart(state: State): string {
  const pc = state.playerCharacter;
  const person = (who: Person) => `- ${who.name}${who.aliases.length ? ` (also ${who.aliases.join(", ")})` : ""}${who.group ? `, of ${who.group}` : ""}: ${who.whoTheyAre}${who.after ? ` After: ${who.after}` : ""}`;
  return join([
    section("story", [
      `Title: ${state.title}`,
      `Premise: ${state.premise}`,
      state.arcs.length ? `Arcs:\n${state.arcs.map(arc => `- ${arc}`).join("\n")}` : "",
      state.landmarks.length ? `Landmarks:\n${state.landmarks.map(landmark => `- ${landmark.name}, ${say(state, landmark.at)}: ${landmark.what}`).join("\n")}` : "",
      `Style: ${state.style}`,
      state.world.summary ? `World: ${state.world.summary}` : "",
      state.world.history ? `History: ${state.world.history}` : ""
    ].filter(Boolean).join("\n")),
    section("places", [...state.world.places, ...state.world.institutions].map(place => `- ${place.name}${place.description ? `: ${place.description}` : ""}`).join("\n")),
    section("groups", state.groups.map(group => `- ${group.name}: ${group.description}`).join("\n")),
    section(`player_character name="${pc}"`, state.people[pc]?.whoTheyAre ?? ""),
    section("people", Object.values(state.people).filter(who => who.name !== pc && who.broughtIn === null).map(person).join("\n")),
    section("leads", state.leads.join(", "))
  ]);
}

/** Who matters now: present, then the Leads, then people in the plan, the calendar or what happened lately. */
export function salience(state: State, present: string[]): { full: string[]; nearby: string[]; resting: number } {
  const pc = state.playerCharacter;
  const full = [...new Set([...present, ...state.leads])].filter(name => name !== pc && state.people[name]);
  const lately = state.facts.slice(-BUDGET.facts).flatMap(fact => fact.knownTo);
  const plan = plannedAhead(state).flatMap(scene => scene.who);
  const calendar = engagementsAhead(state).flatMap(item => item.engagement.who);
  const brought = Object.values(state.people).filter(who => who.broughtIn !== null).map(who => who.name);
  const nearby = [...new Set([...brought, ...plan, ...calendar, ...lately])]
    .filter(name => name !== pc && !full.includes(name) && state.people[name])
    .slice(0, BUDGET.nearby);
  return { full, nearby, resting: Object.keys(state.people).length - full.length - nearby.length - 1 };
}

/** Who someone the Director brought in is: they are not in the Story's cached part. */
function broughtIn(state: State, name: string): string {
  const who = state.people[name];
  return who && who.broughtIn !== null ? ` (new to the Story: ${who.whoTheyAre})` : "";
}

function personNow(state: State, name: string, lens: Lens): string {
  const life = state.lives[name];
  const bond = state.bonds[name];
  const known = state.known[name];
  return [
    `${name}${broughtIn(state, name)}`,
    lens !== "character" && life ? `  Now: ${[life.where ? `at ${life.where}` : "", life.doing ?? ""].filter(Boolean).join(", ")}${life.after ? `; after ${life.after}` : ""}` : "",
    bond ? `  Between them and ${state.playerCharacter}: ${bond.standing}${bond.turns.length ? ` (latest: ${bond.turns.slice(-2).map(turn => `${turn.scene ? `Scene ${turn.scene.number}: ` : ""}${turn.text}`).join("; ")})` : ""}` : "",
    known ? `  What ${state.playerCharacter} knows of them: ${known.text}` : ""
  ].filter(Boolean).join("\n");
}

/** The cast now, by salience: who matters in full, who is nearby in a line, and how many rest. */
export function castPart(state: State, present: string[], lens: Lens): string | null {
  const { full, nearby, resting } = salience(state, present);
  const line = (name: string) => {
    const life = state.lives[name];
    return `- ${name}${broughtIn(state, name)}${life ? `: ${[life.where ? `at ${life.where}` : "", life.doing ?? ""].filter(Boolean).join(", ")}` : ""}`;
  };
  return section("cast_now", [
    full.map(name => personNow(state, name, lens)).join("\n"),
    nearby.length && lens !== "character" ? `Nearby:\n${nearby.map(line).join("\n")}` : "",
    resting > 0 ? `${resting} others are about their own lives.` : ""
  ].filter(Boolean).join("\n\n"));
}

/** The Story So Far, chapters to Scenes (openspec living-world: Every agent knows the Story So Far). */
export function storySoFarPart(state: State, framing = ""): string | null {
  const told = (part: Told) => `${part.scene ? `Scene ${part.scene.number}, ${part.scene.title} (${say(state, part.from)})` : `${say(state, part.from)} to ${say(state, part.until)}`}: ${part.text}`;
  const { chapters, weeks, scenes } = state.storySoFar;
  return section("story_so_far", [
    framing,
    chapters.length ? `Chapters:\n${chapters.map(told).join("\n")}` : "",
    weeks.length ? `Weeks:\n${weeks.map(told).join("\n")}` : "",
    scenes.length ? `Scenes:\n${scenes.map(told).join("\n")}` : ""
  ].filter(Boolean).join("\n\n"));
}

/** What he arranged and what is planned, as each lens may see it. */
export function calendarPart(state: State, lens: Lens): string | null {
  const engagements = engagementsAhead(state).slice(0, BUDGET.calendar).map(({ engagement, next }, index) =>
    `- E${index + 1} ${say(state, next)}${engagement.every === "week" ? ", every week" : ""}, ${engagement.place}: ${engagement.what}${engagement.who.length ? ` With ${engagement.who.join(", ")}.` : ""}${engagement.expected ? " He is expected." : ""}`);
  const landmarks = state.landmarks.filter(landmark => minutesAt(landmark.at) >= minutesAt(state.clock)).sort((left, right) => minutesAt(left.at) - minutesAt(right.at)).slice(0, 2).map(landmark => `- ${landmark.name}, ${say(state, landmark.at)}`);
  // What the World last had on, still ahead: the Weaver's `on` replaces it, so it carries forward what it keeps.
  const on = lens === "character" ? [] : state.on.filter(item => minutesAt(item.at) >= minutesAt(state.clock)).sort((left, right) => minutesAt(left.at) - minutesAt(right.at))
    .map(item => `- ${say(state, item.at)}, ${item.place}: ${item.what}${item.who.length ? ` (with ${item.who.join(", ")})` : ""}`);
  return section("calendar", [
    state.routine.length ? `Routine:\n${state.routine.map(line => `- ${line}`).join("\n")}` : "",
    engagements.length ? `What he has arranged:\n${engagements.join("\n")}` : "",
    on.length ? `What is on ahead:\n${on.join("\n")}` : "",
    landmarks.length ? `Landmarks next:\n${landmarks.join("\n")}` : "",
    lens !== "character" && plannedAhead(state).length ? `The plan's Scenes that matter ahead:\n${plannedAhead(state).map(scene => `- ${scene.id} ${say(state, scene.at)}, ${scene.place}, with ${scene.who.join(", ") || "nobody else"}: ${scene.for}`).join("\n")}` : ""
  ].filter(Boolean).join("\n\n"));
}

/** The Threads, for the lenses that see the World. */
export function threadsPart(state: State): string | null {
  return section("threads", state.threads.map(thread => `- ${thread.name}: ${thread.now}`).join("\n"));
}

/**
 * What happened lately, each with who knows it; the character lens sees only what someone present knows, and not what
 * only the Player Character knows until he tells them on the page.
 */
export function factsPart(state: State, lens: Lens, present: string[]): string | null {
  const pc = state.playerCharacter;
  const visible = (fact: Fact) => lens !== "character" || fact.knownTo.some(name => name !== pc && present.includes(name));
  const lately = state.facts.filter(fact => fact.source === "world" && visible(fact)).slice(-BUDGET.facts);
  return section("lately", lately.map(fact => `- ${fact.id} ${say(state, fact.at)}${fact.where ? `, ${fact.where}` : ""}: ${fact.what} Known to: ${fact.knownTo.join(", ") || "nobody"}.`).join("\n"));
}

/**
 * The Moments the people present remember, in their own words, labelled M1 …: by who was there, then weight, then
 * how recent. Each says who knows it, so nobody acts on one they do not.
 */
export function recallFacts(state: State, present: string[]): Fact[] {
  const pc = state.playerCharacter;
  const people = new Set([pc, ...present]);
  const score = (fact: Fact) => fact.knownTo.filter(name => name !== pc && people.has(name)).length * 3 + fact.weight + fact.scene / 1000;
  return state.facts
    .filter(fact => fact.source === "page" && fact.scene !== state.scene?.number && fact.knownTo.some(name => name !== pc && people.has(name)))
    .sort((left, right) => score(right) - score(left))
    .slice(0, BUDGET.moments);
}

export function momentsPart(state: State, moments: Fact[]): string | null {
  return section("remembered", moments.map((fact, index) => [
    `M${index + 1} (Scene ${fact.scene}; known to ${fact.knownTo.join(", ")}): ${fact.what}`,
    ...fact.quotes.map(quote => `  "${quote.text}"`)
  ].join("\n")).join("\n"));
}

/** What each person present knows, for the Actor (the character lens). */
export function knowsPart(state: State, present: string[]): string | null {
  return section("what_each_knows", present.filter(name => state.people[name]).map(name => {
    const who = state.people[name];
    const theirs = state.facts.filter(fact => fact.knownTo.includes(name)).slice(-BUDGET.perPerson);
    return [`${name}:`, ...(who?.knows ?? []).map(line => `- ${line}`), ...theirs.map(fact => `- ${fact.what}${fact.quotes[0] ? ` ("${fact.quotes[0].text}")` : ""}`)].join("\n");
  }).join("\n\n"));
}

/** The player's brief, reactions and Taste: what the Director and the Writer serve. */
export function steeringPart(state: State): string | null {
  const reactions = state.reactions.slice(-6);
  return section("the_players_wishes", [
    state.brief.more.length ? `More of:\n${state.brief.more.map(line => `- ${line}`).join("\n")}` : "",
    state.brief.less.length ? `Less of:\n${state.brief.less.map(line => `- ${line}`).join("\n")}` : "",
    reactions.length ? `Reactions to recent Scenes:\n${reactions.map(item => `- Scene ${item.scene}, ${item.title}: ${item.reaction === "more" ? "more like this" : "less like this"}${item.note ? ` (${item.note})` : ""}`).join("\n")}` : "",
    state.taste.length ? `Taste:\n${state.taste.map(line => `- ${line}`).join("\n")}` : ""
  ].filter(Boolean).join("\n\n"));
}

/** Now, as people say it. */
export function nowPart(state: State): string {
  const time = parseStoryTime(state.clock);
  return section("now", `It is ${say(state, state.clock)}.${time ? ` (${sayTime(time)})` : ""}`) ?? "";
}
