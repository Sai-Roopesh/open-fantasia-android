// The line every agent that writes for a Story must keep (openspec scenes: The Reply never writes the Player
// Character; docs/adr/0024): nothing an agent writes may decide what the Player Character says, chooses, thinks or
// feels. What other people do to him is theirs, and lands. This module is the one place the line is stated: the words
// every prompt gives it, and the check that holds a Reply to it. Carried over from the first Open Fantasia's host.

/**
 * The Player Character's part, as every prompt that writes or checks the story gives it. Stated once, here, so the
 * writer and the Editor cannot drift apart on where the line is.
 */
export function playersPart(pc: string): string {
  return `${pc} is the player's: only the player writes what ${pc} says, chooses to do, thinks, or feels. ` +
    `Everything else can happen to you, as to anyone here. Someone can take your hand, pull you close, push you, slap you, or walk you somewhere, and it lands: ` +
    `write where it leaves you — the stumble, the sting, the wall at your back — then stop where the player's next word or choice belongs to them.`;
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

/**
 * The names the Player Character answers to, longest first: full name, unambiguous tokens of their name (so
 * "Sai Roopesh" includes "Roopesh" as well as "Sai" unless another person shares that token), and aliases.
 */
export function playerNames(person: { name: string; aliases: string[] }, others: readonly { name: string; aliases?: string[] }[] = []): string[] {
  const full = person.name.trim();
  const shared = new Set(
    others
      .filter(other => other.name.trim().toLocaleLowerCase() !== full.toLocaleLowerCase())
      .flatMap(other => [other.name, ...(other.aliases ?? []), ...other.name.trim().split(/\s+/)])
      .map(token => token.trim().toLocaleLowerCase())
      .filter(Boolean)
  );
  const tokens = full.split(/\s+/).filter((token, index) => token.length > 1 && (index === 0 || !shared.has(token.toLocaleLowerCase())));
  return [...new Set([full, ...tokens, ...person.aliases.map(alias => alias.trim())])]
    .filter(name => name.length > 1)
    .sort((left, right) => right.length - left.length);
}

const OPT_ADVERB = "(?:(?:don't|do\\s+not|can't|cannot|won't|will\\s+not|quietly|softly|slowly|finally|barely|hoarsely|flatly|just|still|only|almost|merely|simply)\\s+)?";

const SPEECH_VERBS = [
  "say", "says", "said", "tell", "tells", "told", "ask", "asks", "asked",
  "answer", "answers", "answered", "reply", "replies", "replied",
  "whisper", "whispers", "whispered", "mutter", "mutters", "muttered",
  "murmur", "murmurs", "murmured", "breathe", "breathes", "breathed",
  "snap", "snaps", "snapped", "shout", "shouts", "shouted", "yell", "yells", "yelled",
  "manage", "manages", "managed", "choke\\s+out", "chokes\\s+out", "choked\\s+out",
  "stammer", "stammers", "stammered", "add", "adds", "added",
  "finish", "finishes", "finished", "repeat", "repeats", "repeated",
  "admit", "admits", "admitted", "confess", "confesses", "confessed",
  "insist", "insists", "insisted", "promise", "promises", "promised",
  "hiss", "hisses", "hissed", "blurt\\s+out", "blurts\\s+out", "blurted\\s+out",
  "call\\s+out", "calls\\s+out", "called\\s+out"
].join("|");

/**
 * Catches quoted dialogue attributed to the player (`"Leave," you mutter`, `You quietly say, "No"`, `"Stop," Roopesh
 * whispers`). Operates on text where quoted spans are replaced by `«Q»`, so character dialogue talking about `you`
 * never triggers false positives.
 */
export function decidesPlayerDialogue(quotedPlaceholderText: string, names: string[]): string | null {
  const subjects = ["you", ...names].map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const afterQuote = new RegExp(`«Q»\\s*,?\\s*(?:and\\s+)?(?:${subjects})\\s+${OPT_ADVERB}(?:${SPEECH_VERBS})\\b[^.\\n]{0,40}`, "i");
  const beforeQuote = new RegExp(`(?:^|[.!?;,\\n]\\s*(?:and\\s+|but\\s+)?)(?:${subjects})\\s+${OPT_ADVERB}(?:${SPEECH_VERBS})\\b[^.\\n]{0,40}«Q»`, "i");
  const found = afterQuote.exec(quotedPlaceholderText) ?? beforeQuote.exec(quotedPlaceholderText);
  return found ? found[0].replace(/^[.!?;,\n\s]+/, "").replace(/«Q»/g, '"…"').trim() : null;
}

/**
 * Narrow second-person narrator check: catches clear present-tense narrator hijacking of the player's dialogue,
 * decisions, actions, or feelings ("You say...", "You quietly whisper", ", and you nod", "You pull away",
 * "You feel...") — never past-tense or subordinate references to the player's own Move ("when you asked",
 * "what you told her", "before you say a word").
 */
const YOU_DECIDING_VERBS = [
  "say", "tell", "ask", "answer", "reply", "decide", "agree", "refuse", "choose",
  "admit", "confess", "cry", "sob", "feel", "want", "think", "wonder", "realise", "realize",
  "wish", "hope", "regret", "kiss", "hug", "embrace", "forgive", "accept", "reject",
  "promise", "snap", "apologise", "apologize", "explain", "insist", "shout", "yell",
  "whisper", "mutter", "murmur", "breathe", "stammer", "manage", "choke\\s+out", "sigh",
  "laugh", "smile", "grin", "nod", "shake\\s+your\\s+head", "shrug",
  "pull\\s+(?:away|back|free|her|him|them)", "push\\s+(?:her|him|them|away|back)",
  "back\\s+away", "step\\s+(?:back|away|forward|closer|out|inside)",
  "turn\\s+(?:away|around|back|toward|to\\s+(?:her|him|them|the\\s+door))",
  "walk\\s+(?:away|out|over|back|toward)", "leave\\s+(?:her|him|them|the\\s+room)",
  "reach\\s+(?:out|for|toward)", "take\\s+(?:her|his|their)\\s+hand",
  "give\\s+in", `go\\s+${REACTION}`, `stay\\s+(?:${REACTION}|with\\s+(?:her|him|them))`
].join("|");

const YOU_SUBJECT = new RegExp(`(?:^|[.!?\\n]\\s*|,\\s*(?:and|but|so)\\s+|;\\s*)you\\s+${OPT_ADVERB}(?:${YOU_DECIDING_VERBS})\\b[^.;\\n]{0,60}`, "i");
const MAKES_YOU = new RegExp(`\\b(?:makes?|forces?)\\s+you\\s+(?:${AFTER_MAKES})\\b[^.;\\n]{0,40}`, "i");

/** Catches unambiguous second-person narrator control of `you` outside dialogue without false-positiving on references. */
export function decidesForYou(text: string): string | null {
  const found = YOU_SUBJECT.exec(text) ?? MAKES_YOU.exec(text);
  return found ? found[0].replace(/^[.!?;,\n\s]+/, "").trim() : null;
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
