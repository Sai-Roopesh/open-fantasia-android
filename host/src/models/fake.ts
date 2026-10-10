import type { ModelRequest, ModelRunner } from "./model-call.js";
import { ScriptedRunner, type Script } from "./scripted.js";

/** What the Writer's prompt was written from, as the Writer agent records it with each call. */
interface WriterFacts {
  now: string;
  opening: "day_view" | "unplanned" | null;
  title: string | null;
  place: string | null;
  here: string[];
  beats: { text: string; status: string }[];
  direction: { text: string | null; remember: boolean } | null;
  choice: { place: string | null; at: string | null; who: string[] } | null;
}

/**
 * A Writer's answer that keeps every rule, made from the facts its prompt was written from: it frames a Scene when
 * one is needed, brings nobody in and sends nobody away, leaves the beats where they stand, and lets the Scene go on. Scripted models
 * answer the Writer with it unless a test says otherwise.
 */
export function fakeWriterAnswer(request: ModelRequest): Script {
  const facts = request.facts as WriterFacts;
  const beats = facts.beats.length >= 3 ? facts.beats : [
    { text: "Someone wants something from the Player Character.", status: "in_play" },
    { text: "It costs them something to ask.", status: "pending" },
    { text: "The answer changes what is between them.", status: "pending" }
  ];
  const frame = facts.opening === "day_view"
    ? { title: "The next Scene", place: facts.choice?.place ?? facts.place ?? "Somewhere new", purpose: "Something between two people turns.", exit: "It turns, or it does not." }
    : facts.opening === "unplanned"
      ? { title: facts.title ?? "", place: facts.place ?? "", purpose: "Something between two people turns.", exit: "It turns, or it does not." }
      : null;
  return {
    answer: JSON.stringify({
      leaves_scene: false,
      frame,
      // A choice at the Day View opens there, then, with them.
      comes_in: facts.choice?.who ?? [],
      goes: [],
      beats,
      note: "Someone answers the Move, and wants something back.",
      call: "continue",
      intensity: 2,
      arc_moved: true,
      clock: facts.choice?.at ?? facts.now,
      taste: facts.direction?.remember && facts.direction.text ? `Remember: ${facts.direction.text}` : null,
      in_play: []
    })
  };
}

/** What the Chronicler's prompt was written from, as the Chronicler agent records it with each call. */
interface ChroniclerFacts {
  sceneEnded: boolean;
  labels: { label: string; kind: string; text: string }[];
}

/**
 * A Chronicler's record that keeps every rule: the summary, of the Scene or of it so far, and the latest new Move as a
 * Moment in its own words, since only the player's words can be relied on to say what he did.
 */
export function fakeChronicleAnswer(request: ModelRequest): Script {
  const facts = request.facts as ChroniclerFacts;
  const move = facts.labels.filter(item => item.kind === "move").at(-1);
  return {
    answer: JSON.stringify({
      summary: facts.sceneEnded ? "The Scene was played to its end." : "The Scene so far.",
      moments: move ? [{ what: "What the player's character did.", quotes: [{ entry: move.label, text: move.text }], there: [], weight: 2 }] : [],
      told: []
    })
  };
}

/** A Reply that quotes the Move it answers, so the phone's end-to-end tests can see which Move a Reply answers. */
export function fakeReply(request: ModelRequest): Script {
  const move = /<move by="[^"]*">\n([\s\S]*?)\n<\/move>\n\n<this_reply>/.exec(request.prompt)?.[1] ?? "";
  return { answer: `(A scripted Reply.) They hear you say: ${move.slice(0, 80)}` };
}

/** What the Weaver's prompt was written from, as the Weaver agent records it with each call. */
interface WeaverFacts {
  from: string;
  until: string;
  landmarks: { name: string; at: string }[];
  afterPeak?: boolean;
  leads: string[];
  missed: { label: string; at: string; place: string; who: string[]; expected: boolean }[];
  next?: { id: string; at: string; place: string; who: string[] } | null;
  moves?: { who: string; move: string }[];
  movesDue?: boolean;
}

/**
 * A Weaver's record that keeps every rule: the World stays as it was, every Landmark in the span happens, the
 * player's character learns nothing, and the Story's pick is the Stretch's next Scene that matters, if any. In a Gap, what
 * he was expected at goes on without him, noticed.
 */
export function fakeWeaveAnswer(request: ModelRequest): Script {
  const facts = request.facts as WeaverFacts;
  return {
    answer: JSON.stringify({
      lives: [],
      threads: [],
      happened: [
        ...facts.landmarks.map((landmark, index) => ({ id: `H${index + 1}`, what: `${landmark.name} happened.`, at: landmark.at, where: "where it was held", known_to: [], landmark: landmark.name })),
        ...facts.missed.filter(item => item.expected).map((item, index) => ({ id: `M${index + 1}`, what: `${item.place} went on without him, and they noticed.`, at: item.at, where: item.place, known_to: item.who, landmark: null, missed: item.label })),
        // The Leads' off-screen moves, made once they are due.
        ...(facts.movesDue ? facts.moves ?? [] : []).map((lead, index) => ({ id: `L${index + 1}`, what: `${lead.who}: ${lead.move}`, at: facts.until, where: "off-screen", known_to: [lead.who], landmark: null, move: lead.who }))
      ],
      meanwhile: [],
      // The Stretch's next Scene that matters is the pick, when there is one (docs/adr/0010).
      happenings: facts.next
        ? [{ id: "P1", at: facts.next.at, place: facts.next.place, what: "Something is going on there that matters to him.", who: facts.next.who, expected: false, pick: true, quiet: facts.afterPeak === true, scene: facts.next.id }]
        : facts.afterPeak
        ? [{ id: "P1", at: facts.until, place: "the Great Hall", what: "A late breakfast, with nothing to do after.", who: [], expected: false, pick: true, quiet: true }]
        : []
    })
  };
}

/** What the Director's prompt was written from, as the Director agent records it with each call. */
interface DirectorFacts {
  arcs: string[];
  afterPeak: boolean;
  clock: string;
  leads: string[];
  coming: string[];
}

/**
 * A Director's plan that keeps every rule: a Stretch of seven days from today, two Scenes that matter on the next two
 * days, a move for every Lead (the first on screen), a row for every Arc and every coming Landmark, and a rest after a
 * peak.
 */
export function fakeDirectorAnswer(request: ModelRequest): Script {
  const facts = request.facts as DirectorFacts;
  const today = /^Day (\d+)/.exec(facts.clock)?.[1] ?? "1";
  const day = (offset: number) => `Day ${Number(today) + offset}`;
  const lead = facts.leads[0] ?? null;
  return {
    answer: JSON.stringify({
      from: day(0), until: day(6),
      toward: facts.afterPeak ? "what comes after the rest" : "what comes next", landmark: null, phase: facts.afterPeak ? "rest" : "build",
      scenes: [
        { id: "S1", at: `${day(1)} 10:00`, place: "the Great Hall", who: lead ? [lead] : [], for: facts.afterPeak ? "A quiet morning after." : "A step for the Story.", lead, headline: "The Great Hall: a step for the Story" },
        { id: "S2", at: `${day(2)} 15:00`, place: "the library", who: [], for: "Something else in his life.", lead: null, headline: "The library: something else in his life" }
      ],
      arcs: facts.arcs.map(arc => ({ arc, now: "where it stands", next: "one step", not_yet: "anything more" })),
      leads: facts.leads.map((who, index) => ({ who, move: `${who} does something about him.`, scene: index === 0 ? "S1" : null })),
      roadmap: facts.arcs.flatMap(arc => facts.coming.map(by => ({ arc, by, stands: "a step further than now" }))),
      premise: "Some Scenes serve the Premise; the others leave it alone."
    })
  };
}

/**
 * Scripted models for every agent: each job has its own queue of answers, and answers by itself when its queue is
 * empty. Every scenario test runs on this, and `fantasia serve --fake-models` too.
 */
export class FakeModels implements ModelRunner {
  readonly writer: ScriptedRunner;
  readonly actor: ScriptedRunner;
  readonly chronicler: ScriptedRunner;
  readonly weaver: ScriptedRunner;
  readonly director: ScriptedRunner;
  /** Every request, in the order it was made. */
  readonly requests: ModelRequest[] = [];

  constructor(scripts: { writer?: Script[]; actor?: Script[]; chronicler?: Script[]; weaver?: Script[]; director?: Script[] } = {}, actorFallback: (request: ModelRequest) => Script = () => ({ answer: "She looks at you, and waits." })) {
    this.writer = new ScriptedRunner(scripts.writer ?? [], fakeWriterAnswer);
    this.actor = new ScriptedRunner(scripts.actor ?? [], actorFallback);
    this.chronicler = new ScriptedRunner(scripts.chronicler ?? [], fakeChronicleAnswer);
    this.weaver = new ScriptedRunner(scripts.weaver ?? [], fakeWeaveAnswer);
    this.director = new ScriptedRunner(scripts.director ?? [], fakeDirectorAnswer);
  }

  run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<string> {
    this.requests.push(request);
    const runner = request.agent === "writer" ? this.writer : request.agent === "chronicler" ? this.chronicler : request.agent === "weaver" ? this.weaver
      : request.agent === "director" ? this.director : this.actor;
    return runner.run(request, onText, signal);
  }
}
