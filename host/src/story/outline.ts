/**
 * The Outline (openspec the-outline): where the whole Story is going, in Acts, woven from everyone's Lives. The
 * Director keeps it and reconsiders it after every Scene; it lives on the Path like everything else (docs/adr/0015).
 */

/** One turn of an Act: a step it builds through, roughly when. */
export interface ActTurn {
  id: string;
  /** Roughly when, as people say it: "the week before Christmas". */
  when: string;
  what: string;
  /** The people and Arcs it moves. */
  serves: string[];
  state: "ahead" | "done";
}

export interface Act {
  number: number;
  title: string;
  /** The question the Act asks. */
  question: string;
  /** What it builds to: a Landmark's name, or the event it ends on. */
  buildsTo: string;
  /** The current Act in detail, the next outlined, the rest sketched. */
  detail: "detailed" | "outlined" | "sketched";
  turns: ActTurn[];
  /** Where each main relationship should stand by the Act's end. */
  relationships: { people: string[]; byEnd: string }[];
  /** What each person who drives the World is doing this Act. */
  movers: { who: string; doing: string }[];
  /** How it hands on to the next Act. */
  handsOn: string;
}

/** A person's own direction for the current Act, for their own sake (openspec the-outline: woven from Lives). */
export interface Intention {
  who: string;
  pursues: string;
  feelings: string;
  heading: string;
}

/** Something planted that the Outline means to pay off (openspec the-outline: Nothing enters without a payoff). */
export interface Setup {
  id: string;
  what: string;
  /** The Scene it was planted in, once it has reached the page or the World. */
  planted: number | null;
  payoff: string;
  /** The turn of the Act it pays off in. */
  turn: string | null;
  state: "waiting" | "paid" | "dropped";
  /** The Scene after which it was paid off or dropped. */
  settled: number | null;
}

export interface Outline {
  /** How many times it has been written on this Path. */
  version: number;
  /** The current Act's number. */
  current: number;
  acts: Act[];
  /** How the Story ends, as far as it can be seen. */
  ending: string;
  intentions: Intention[];
  setups: Setup[];
  /** People the Director has brought forward, whatever play says. */
  promoted: string[];
  /** The Scene after which it was last revised; 0 when the Story started. */
  revisedAfter: number;
  /** Whether the last revision was deep. */
  deep: boolean;
  /** What the Director looked up for it, in a line each. */
  lookedUp: string[];
}

/** The Act being played. */
export function currentAct(outline: Outline | null): Act | null {
  return outline?.acts.find(act => act.number === outline.current) ?? null;
}

/** Setups not yet paid off or dropped. */
export function waiting(outline: Outline | null): Setup[] {
  return outline?.setups.filter(setup => setup.state === "waiting") ?? [];
}
