// The line every agent that writes for a Story must keep (openspec scenes: The Reply never writes the Player
// Character): nothing an agent plans or notes may decide what the Player Character says, chooses, does on purpose,
// thinks or feels. Carried over from the first Open Fantasia's host, where it was tested against real answers.

/** A reaction someone goes or stays: "goes quiet", "stays silent". */
const REACTION = "(?:quiet|silent|still|cold|pale|red|white|numb|calm)";

/**
 * The verbs that decide for the Player Character, each as [the form after a subject, the form after "makes", and
 * what has to follow it when only some of its uses decide].
 *
 * Narrow on purpose: "Ishaan is offered a seat" is a circumstance landing on him and passes; "Ishaan tells her",
 * "Ishaan agrees" and "makes Ishaan cry" decide for him and do not. A few verbs decide only with the words given:
 * "Ishaan goes quiet" is his reaction where "Ishaan goes to Pune" is a trip, "Ishaan leaves her" is a choice
 * toward someone where "Ishaan leaves for Pune on Day 4" is a plan, and "Ishaan gives in" decides where "Ishaan
 * gives a talk" is an event. A question ("will Ishaan tell her?") uses the bare verb, and passes.
 */
const DECIDING_VERBS: readonly (readonly [string, string, string?])[] = [
  ["tells", "tell"], ["says", "say"], ["asks", "ask"], ["answers", "answer"], ["decides", "decide"], ["agrees", "agree"],
  ["refuses", "refuse"], ["chooses", "choose"], ["realises", "realise"], ["realizes", "realize"], ["resists", "resist"],
  ["reacts", "react"], ["admits", "admit"], ["confesses", "confess"], ["breaks", "break"], ["cries", "cry"],
  ["feels", "feel"], ["wants", "want"], ["kisses", "kiss"], ["forgives", "forgive"], ["accepts", "accept"],
  ["rejects", "reject"], ["promises", "promise"], ["snaps", "snap"], ["softens", "soften"], ["apologises", "apologise"],
  ["apologizes", "apologize"], ["explains", "explain"], ["insists", "insist"], ["shouts", "shout"], ["whispers", "whisper"],
  ["laughs", "laugh"], ["smiles", "smile"], ["pulls", "pull"], ["pushes", "push"], ["backs", "back"], ["lets", "let"],
  ["goes", "go", REACTION],
  ["stays", "stay", `(?:${REACTION}|with\\s+(?:her|him|them))`],
  ["leaves", "leave", "(?:her|him|them|the\\s+room)"],
  ["gives", "give", "in"],
  ["lies", "lie", "(?:to|about)"],
  ["holds", "hold", "(?:her|him|them|back)"]
];

const alternation = (form: 0 | 1) => DECIDING_VERBS
  .map(([subject, made, complement]) => (form === 0 ? subject : made) + (complement ? `\\s+${complement}` : ""))
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
