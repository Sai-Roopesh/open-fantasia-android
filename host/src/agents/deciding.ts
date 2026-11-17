// The line every agent that writes for a Story must keep (openspec scenes: The Reply never writes the Player
// Character; docs/adr/0024): nothing an agent writes may decide what the Player Character says, chooses, thinks or
// feels. What other people do to him is theirs, and lands. This module is the one place the line is stated: the words
// every prompt gives it, and the check that holds a Reply to it. Carried over from the first Open Fantasia's host.

/**
 * The Player Character's part, as every prompt that writes or checks the story gives it. Stated once, here, so the
 * writer and the Editor cannot drift apart on where the line is.
 */
export function playersPart(pc: string): string {
  return `${pc} is the player's: only the player writes what ${pc} says, what he chooses to do, and what he thinks and feels. ` +
    `Everything else can happen to him, as to anyone here. Someone can take his hand, pull him close, push him, slap him or walk him somewhere, and it lands: ` +
    `write where it leaves him, the stumble, the sting, the wall at his back, then stop where his next word or choice is his.`;
}

/** The same line, as the Editor checks a Reply against it. */
export function playersPartBreak(pc: string): string {
  return `The Reply writes ${pc}'s part: words he says, a choice he makes, or what he thinks or feels, however small. ` +
    `Something done to him and where it leaves him (he is pushed into the wall, pulled along, his cheek stings) is not a break, ` +
    `and nor is how he looks to others, or what they ask, accuse or guess of him.`;
}

/** A reaction someone chooses to go or stay in: "goes quiet", "stays silent". */
const REACTION = "(?:quiet|silent|calm)";

/**
 * The verbs that decide for the Player Character, each as [the form after a subject, the form after "makes", and
 * what has to follow it when only some of its uses decide]. A null "makes" form means the verb decides only when he
 * is its subject: "Ishaan pulls away" is his choice, where "she forces Ishaan back" is hers, done to him.
 *
 * Narrow on purpose: "Ishaan is offered a seat" is a circumstance landing on him and passes; "Ishaan tells her",
 * "Ishaan agrees" and "makes Ishaan cry" decide for him and do not. A few verbs decide only with the words given:
 * "Ishaan goes quiet" is his reaction where "Ishaan goes to Pune" is a trip and "Ishaan goes pale" is his body,
 * "Ishaan leaves her" is a choice toward someone where "Ishaan leaves for Pune on Day 4" is a plan, and "Ishaan gives
 * in" decides where "Ishaan gives a talk" is an event. A question ("will Ishaan tell her?") uses the bare verb, and
 * passes.
 */
const DECIDING_VERBS: readonly (readonly [string, string | null, string?])[] = [
  ["tells", "tell"], ["says", "say"], ["asks", "ask"], ["answers", "answer"], ["decides", "decide"], ["agrees", "agree"],
  ["refuses", "refuse"], ["chooses", "choose"], ["realises", "realise"], ["realizes", "realize"], ["resists", "resist"],
  ["reacts", "react"], ["admits", "admit"], ["confesses", "confess"], ["breaks", "break"], ["cries", "cry"],
  ["feels", "feel"], ["wants", "want"], ["kisses", "kiss"], ["forgives", "forgive"], ["accepts", "accept"],
  ["rejects", "reject"], ["promises", "promise"], ["snaps", "snap"], ["softens", "soften"], ["apologises", "apologise"],
  ["apologizes", "apologize"], ["explains", "explain"], ["insists", "insist"], ["shouts", "shout"], ["whispers", "whisper"],
  ["laughs", "laugh"], ["smiles", "smile"], ["pulls", null], ["pushes", null], ["backs", null], ["lets", null],
  ["goes", "go", REACTION],
  ["stays", "stay", `(?:${REACTION}|with\\s+(?:her|him|them))`],
  ["leaves", "leave", "(?:her|him|them|the\\s+room)"],
  ["gives", "give", "in"],
  ["lies", "lie", "(?:to|about)"],
  ["holds", null, "(?:her|him|them|back)"]
];

const alternation = (form: 0 | 1) => DECIDING_VERBS
  .flatMap(([subject, made, complement]) => {
    const verb = form === 0 ? subject : made;
    return verb === null ? [] : [verb + (complement ? `\\s+${complement}` : "")];
  })
  .join("|");
const AFTER_SUBJECT = alternation(0);
const AFTER_MAKES = alternation(1);

/** The names the Player Character answers to, longest first: full name, first name and aliases. */
export function playerNames(person: { name: string; aliases: string[] }): string[] {
  const first = person.name.trim().split(/\s+/)[0] ?? "";
  return [...new Set([person.name.trim(), first, ...person.aliases.map(alias => alias.trim())])]
    .filter(name => name.length > 1)
    .sort((left, right) => right.length - left.length);
}

/** The phrase in [text] that decides something for the Player Character, or null. */
export function decidesForPlayer(text: string, names: string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const subject = new RegExp(`\\b${escaped}\\s+(?:${AFTER_SUBJECT})\\b[^.;]{0,60}`, "i");
    const made = new RegExp(`\\b(?:makes?|forces?)\\s+${escaped}\\s+(?:${AFTER_MAKES})\\b[^.;]{0,40}`, "i");
    const found = subject.exec(text) ?? made.exec(text);
    if (found) return found[0].trim();
  }
  return null;
}

/**
 * What someone in a Reply claims the Player Character said, did or feels: "you told me", "you promised", "you hate
 * flying", "Ishaan said". A Reply's words about him are prose, never something that happened (openspec living-world:
 * Only the player makes facts about the Player Character), so a record of the Story never keeps them as his; it quotes
 * his own Move instead. Narrow on purpose: "doesn't look at you" and "you look tired" are how others see him, and pass.
 */
const CLAIMED = "(?:told|said|promised|swore|admitted|confessed|agreed|decided|chose|refused|lied|kissed|wanted|hated|loved|hate|love|never)";

export function claimsAboutPlayer(text: string, names: string[]): string | null {
  for (const subject of ["you", ...names]) {
    const escaped = subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = new RegExp(`\\b${escaped}\\s+${CLAIMED}\\b[^.;"]{0,60}`, "i").exec(text);
    if (found) return found[0].trim();
  }
  return null;
}
