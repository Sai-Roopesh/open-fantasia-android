import type { ModelRequest, ModelRunner } from "./model-call.js";
import { ScriptedRunner, type Script } from "./scripted.js";

interface WriterFacts {
  opening: "day_view" | "unplanned" | null;
  clock: string;
  title: string | null;
  place: string | null;
  here: string[];
  beats: { text: string; status: string }[];
  direction: { text: string | null; remember: boolean } | null;
  choice: { place: string | null; at: string | null; who: string[] } | null;
}

/**
 * A Writer's answer that keeps every rule: it frames a Scene when one is needed, brings in whoever the choice was with,
 * leaves the beats where they stand, and lets the Scene go on a few minutes later. Scripted models answer the Writer
 * with it unless a test says otherwise.
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
      leaves_scene: false, frame, comes_in: facts.choice?.who ?? [], goes: [], beats,
      note: "Someone answers the Move, and wants something back.", call: "continue", intensity: 2, arc_moved: true, minutes: 2,
      taste: facts.direction?.remember && facts.direction.text ? `Remember: ${facts.direction.text}` : null, in_play: [], moves_to: null
    })
  };
}

interface ChroniclerFacts {
  passages: { label: string; move: boolean; text: string }[];
}

/** A Chronicler's record that keeps every rule: a line, a paragraph, and the latest Move as a Moment in its own words. */
export function fakeChronicleAnswer(request: ModelRequest): Script {
  const facts = request.facts as ChroniclerFacts;
  const move = facts.passages.filter(item => item.move).at(-1);
  return {
    answer: JSON.stringify({
      summary: "The Scene was played to its end.",
      paragraph: "The Scene was played to its end, and something between them turned.",
      moments: move ? [{ what: "What the player's character did.", quotes: [{ entry: move.label, text: move.text }], there: [], weight: 2 }] : [],
      told: [], known: [], bonds: [], engagements: [], changed: []
    })
  };
}

/** A Reply that quotes the Move it answers, so the phone's end-to-end tests can see which Move a Reply answers. */
export function fakeReply(request: ModelRequest): Script {
  const move = /<move by="[^"]*">\n([\s\S]*?)\n<\/move>\n\n<this_reply>/.exec(request.prompt)?.[1] ?? "";
  return { answer: `(A scripted Reply.) They hear you say: ${move.slice(0, 80)}` };
}

interface WeaverFacts {
  from: string;
  until: string;
  gap: boolean;
  missed: { label: string; at: string; place: string; who: string[]; expected: boolean }[];
  moves: { who: string; move: string }[];
  landmarks: { name: string; at: string }[];
}

/**
 * A Weaver's record that keeps every rule: the World stays as it was, every Landmark in the span happens, what he was
 * expected at goes on without him, noticed, and the Leads' moves off-screen are made.
 */
export function fakeWeaveAnswer(request: ModelRequest): Script {
  const facts = request.facts as WeaverFacts;
  return {
    answer: JSON.stringify({
      lives: [], threads: [],
      happened: [
        ...facts.landmarks.map((landmark, index) => ({ id: `H${index + 1}`, what: `${landmark.name} happened.`, at: landmark.at, where: "where it was held", known_to: [], landmark: landmark.name, move: null, missed: null })),
        ...facts.missed.filter(item => item.expected).map((item, index) => ({ id: `M${index + 1}`, what: `${item.place} went on without him, and they noticed.`, at: item.at, where: item.place, known_to: item.who, landmark: null, move: null, missed: item.label })),
        ...facts.moves.map((lead, index) => ({ id: `L${index + 1}`, what: `${lead.who}: ${lead.move}`, at: facts.until, where: "off-screen", known_to: [lead.who], landmark: null, move: lead.who, missed: null }))
      ],
      meanwhile: [], on: []
    })
  };
}

interface DirectorFacts {
  clock: string;
  leads: string[];
  arcs: string[];
  coming: string[];
  afterPeak: boolean;
}

/**
 * A Director's plan that keeps every rule: five days from today, two Scenes that matter on the next two days (a quiet
 * one first after a peak), one new thing, a move for every Lead (the first on screen), and every Arc's step.
 */
export function fakeDirectorAnswer(request: ModelRequest): Script {
  const facts = request.facts as DirectorFacts;
  const lead = facts.leads[0] ?? null;
  return {
    answer: JSON.stringify({
      days: 5, toward: "what comes next", landmark: null, phase: "build",
      scenes: [
        { id: "S1", day: 1, time: "10:00", place: "the Great Hall", who: lead ? [lead] : [], for: facts.afterPeak ? "A quiet morning after." : "A step for the Story.", offer: "Something is going on there that matters to him.", headline: "The Great Hall: a step for the Story", lead, engagement: null, quiet: facts.afterPeak },
        { id: "S2", day: 2, time: "15:00", place: "the library", who: [], for: "Something else in his life.", offer: "The library is quiet, for once.", headline: "The library: something else in his life", lead: null, engagement: null, quiet: false }
      ],
      new: [{ kind: "mystery", what: "A locked door nobody admits to.", scene: "S2", person: null }],
      leads: facts.leads.map((who, index) => ({ who, move: `${who} does something about him.`, scene: index === 0 ? "S1" : null })),
      arcs: facts.arcs.map(arc => ({ arc, now: "where it stands", next: "one step", not_yet: "anything more" })),
      roadmap: facts.arcs.flatMap(arc => facts.coming.map(by => ({ arc, by, stands: "a step further than now" }))),
      premise: "Some Scenes serve the Premise; the others leave it alone."
    })
  };
}

/** A Folder's fold: the parts in a line. */
export function fakeFoldAnswer(): Script {
  return { answer: JSON.stringify({ text: "A week in which things turned." }) };
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
  readonly folder: ScriptedRunner;
  readonly requests: ModelRequest[] = [];

  constructor(scripts: { writer?: Script[]; actor?: Script[]; chronicler?: Script[]; weaver?: Script[]; director?: Script[]; folder?: Script[] } = {}, actorFallback: (request: ModelRequest) => Script = () => ({ answer: "She looks at you, and waits." })) {
    this.writer = new ScriptedRunner(scripts.writer ?? [], fakeWriterAnswer);
    this.actor = new ScriptedRunner(scripts.actor ?? [], actorFallback);
    this.chronicler = new ScriptedRunner(scripts.chronicler ?? [], fakeChronicleAnswer);
    this.weaver = new ScriptedRunner(scripts.weaver ?? [], fakeWeaveAnswer);
    this.director = new ScriptedRunner(scripts.director ?? [], fakeDirectorAnswer);
    this.folder = new ScriptedRunner(scripts.folder ?? [], fakeFoldAnswer);
  }

  run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<string> {
    this.requests.push(request);
    const runner = request.agent === "writer" ? this.writer : request.agent === "chronicler" ? this.chronicler : request.agent === "weaver" ? this.weaver
      : request.agent === "director" ? this.director : request.agent === "folder" ? this.folder : this.actor;
    return runner.run(request, onText, signal);
  }
}
