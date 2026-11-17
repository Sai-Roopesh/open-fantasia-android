import type { ModelRequest, ModelRunner, Tools } from "./model-call.js";
import { nothingTrue } from "../agents/truth-record.js";
import { ScriptedRunner, type Script } from "./scripted.js";
import { addMinutes } from "../agents/format.js";

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

/**
 * A Chronicler's record that keeps every rule: a line, a paragraph, the latest Move as a Moment in its own words, and
 * nothing changed in the truth.
 */
export function fakeChronicleAnswer(request: ModelRequest): Script {
  const facts = request.facts as ChroniclerFacts;
  const move = facts.passages.filter(item => item.move).at(-1);
  return {
    answer: JSON.stringify({
      summary: "The Scene was played to its end.",
      paragraph: "The Scene was played to its end, and something between them turned.",
      moments: move ? [{ what: "What the player's character did.", quotes: [{ entry: move.label, text: move.text }], there: [], weight: 2 }] : [],
      told: [], known: [], bonds: [], engagements: [], changed: [], truth: nothingTrue()
    })
  };
}

/**
 * A Reply that quotes the Move it answers, so the phone's end-to-end tests can see which Move a Reply answers: the
 * last Move in the Actor's prompt, the one in this moment's layer.
 */
export function fakeReply(request: ModelRequest): Script {
  const move = [...request.prompt.matchAll(/<move by="[^"]*">\n([\s\S]*?)\n<\/move>/g)].at(-1)?.[1] ?? "";
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
 * A Weaver's record that keeps every rule: the World and its truth stay as they were, every Landmark in the span
 * happens, what he was expected at goes on without him, noticed, and the Leads' moves off-screen are made.
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
      meanwhile: [], on: [], truth: nothingTrue()
    })
  };
}

interface DirectorFacts {
  job: "stretch";
  clock: string;
  /** The dates the Stretch may use, today first. */
  dates: string[];
  leads: string[];
  arcs: string[];
  coming: string[];
  afterPeak: boolean;
  /** The current Act's turns still ahead, by id. */
  turns: string[];
  /** Who matters most, whose Lives a Scene can serve. */
  lives: string[];
  /** The Outline's setups still to bring in. */
  setups: { id: string; what: string }[];
}

/** Whether a Director's call is for the Outline, not a Stretch plan. */
const isOutline = (request: ModelRequest) => (request.facts as { job?: string } | undefined)?.job === "outline";

interface OutlineFacts {
  job: "outline";
  why: string;
  current: number;
  pc: string;
  lives: string[];
  landmarks: string[];
  setups: { id: string; what: string; planted: number | null; payoff: string; turn: string | null; state: string }[];
}

/**
 * A Director's plan that keeps every rule: five days from today, two Scenes that matter on the next two days (a quiet
 * one first after a peak), each serving the current Act's next turns or a Life, the first setup the Outline has to
 * bring in, a move for every Lead (the first on screen), and every Arc's step. Asked for the Outline, it answers with
 * [fakeOutlineAnswer].
 */
export function fakeDirectorAnswer(request: ModelRequest): Script {
  if (isOutline(request)) return fakeOutlineAnswer(request);
  const facts = request.facts as DirectorFacts;
  const lead = facts.leads[0] ?? null;
  const life = (index: number) => facts.lives[index] ?? facts.lives[0];
  const serves = (index: number, who: string | null) => ({ turn: facts.turns[index] ?? facts.turns[0] ?? null, lives: who ? [who] : life(index) ? [life(index)] : [] });
  const setup = facts.setups[0];
  return {
    answer: JSON.stringify({
      days: 5, toward: "what comes next", landmark: null, phase: "build",
      scenes: [
        { id: "S1", date: facts.dates[1] ?? "", time: "10:00", place: "the Great Hall", who: lead ? [lead] : [], serves: serves(0, lead), for: facts.afterPeak ? "A quiet morning after." : "A step for the Story.", offer: "Something is going on there that matters to him.", headline: "The Great Hall: a step for the Story", lead, engagement: null, quiet: facts.afterPeak },
        { id: "S2", date: facts.dates[2] ?? "", time: "15:00", place: "the library", who: [], serves: serves(1, null), for: "Something else in his life.", offer: "The library is quiet, for once.", headline: "The library: something else in his life", lead: null, engagement: null, quiet: false }
      ],
      new: setup ? [{ setup: setup.id, kind: "mystery", scene: "S2", person: null }] : [],
      leads: facts.leads.map((who, index) => ({ who, move: `${who} does something about him.`, scene: index === 0 ? "S1" : null })),
      arcs: facts.arcs.map(arc => ({ arc, now: "where it stands", next: "one step", not_yet: "anything more" })),
      roadmap: facts.arcs.flatMap(arc => facts.coming.map(by => ({ arc, by, stands: "a step further than now" }))),
      premise: "Some Scenes serve the Premise; the others leave it alone."
    })
  };
}

/**
 * A Director's Outline that keeps every rule: the current Act in detail with two turns building to the next Landmark,
 * where the first person who matters stands with him by its end, the next Act outlined, an ending, an intention for
 * everyone who matters, every setup as it was (or a locked door nobody admits to, waiting), and nothing turned. When
 * the current Act has ended, the next is the current one, in detail.
 */
export function fakeOutlineAnswer(request: ModelRequest): Script {
  const facts = request.facts as OutlineFacts;
  // A focused revision after an ordinary Scene changes nothing it does not list: here, nothing.
  if (facts.why === "focused") return { answer: JSON.stringify({ turned: null, turns: [], turns_done: [], relationships: [], movers: [], intentions: [], setups: [], promoted: [] }) };
  const first = facts.lives[0];
  const current = facts.current + (facts.why === "act-ended" ? 1 : 0);
  return {
    answer: JSON.stringify({
      current,
      acts: [
        { number: current, title: `Act ${current}`, question: "What does he change for the people around him?", builds_to: facts.landmarks[0] ?? "the end of the Act", turns: [
          { id: "T1", when: "this week", what: "Someone wants something from him.", serves: facts.lives.slice(0, 1), done: false },
          { id: "T2", when: "the week after", what: "What they want costs them something.", serves: facts.lives.slice(1, 2), done: false }
        ], relationships: first ? [{ people: [first, facts.pc], by_end: "Further on than now." }] : [], movers: [], hands_on: "What turned hands on to the next Act." },
        { number: current + 1, title: `Act ${current + 1}`, question: "What comes of it?", builds_to: facts.landmarks[1] ?? "the end", turns: [], relationships: [], movers: [], hands_on: "" }
      ],
      ending: "Where everyone's Lives lead.",
      intentions: facts.lives.map(who => ({ who, pursues: "their own life", feelings: "their feelings move as the Story earns it", heading: "a step further on" })),
      setups: facts.setups.length
        ? facts.setups.map(({ id, what, planted, payoff, turn, state }) => ({ id, what, planted, payoff, turn, state }))
        : [{ id: "U1", what: "A locked door nobody admits to.", planted: null, payoff: "What is behind it turns the Act.", turn: "T2", state: "waiting" }],
      promoted: []
    })
  };
}

/** A Folder's fold: the parts in a line. */
export function fakeFoldAnswer(): Script {
  return { answer: JSON.stringify({ text: "A week in which things turned." }) };
}

/**
 * An Editor's answer that finds nothing to set right and nothing that breaks: a Reply reads as the Actor wrote it, and
 * an Act's account (agents/folder.ts) leaves nothing out.
 */
export function fakeEditorAnswer(request?: ModelRequest): Script {
  if ((request?.facts as { check?: string } | undefined)?.check === "act") return { answer: JSON.stringify({ missing: [], invented: [] }) };
  return { answer: JSON.stringify({ fixes: [], breaks: [] }) };
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
  /** The Director's Outline calls, apart from its Stretch plans, so a test can script either. */
  readonly outline: ScriptedRunner;
  readonly folder: ScriptedRunner;
  readonly editor: ScriptedRunner;
  readonly requests: ModelRequest[] = [];

  constructor(scripts: { writer?: Script[]; actor?: Script[]; chronicler?: Script[]; weaver?: Script[]; director?: Script[]; outline?: Script[]; folder?: Script[]; editor?: Script[] } = {}, actorFallback: (request: ModelRequest) => Script = () => ({ answer: "She looks at you, and waits." })) {
    this.writer = new ScriptedRunner(scripts.writer ?? [], fakeWriterAnswer);
    this.actor = new ScriptedRunner(scripts.actor ?? [], actorFallback);
    this.chronicler = new ScriptedRunner(scripts.chronicler ?? [], fakeChronicleAnswer);
    this.weaver = new ScriptedRunner(scripts.weaver ?? [], fakeWeaveAnswer);
    this.director = new ScriptedRunner(scripts.director ?? [], fakeDirectorAnswer);
    this.outline = new ScriptedRunner(scripts.outline ?? [], fakeOutlineAnswer);
    this.folder = new ScriptedRunner(scripts.folder ?? [], fakeFoldAnswer);
    this.editor = new ScriptedRunner(scripts.editor ?? [], fakeEditorAnswer);
  }

  /** Scripted models can use every tool, so a job's lookups can be scripted (docs/adr/0018). */
  readonly canLookUp = { story: true, web: true };

  async run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal, tools?: Tools): Promise<string> {
    this.requests.push(request);
    if ((request.facts as { composing?: boolean } | undefined)?.composing) {
      // Scenario fixtures describe metadata and prose independently, but assemble ONE provider answer.
      // `requests` above is the actual call ledger; writer/actor.requests below are fixture evaluations.
      const raw = JSON.parse(await this.writer.run({ ...request, agent: "writer" }, () => {}, signal, tools)) as Record<string, unknown>;
      const clock = addMinutes((request.facts as WriterFacts).clock, Number(raw.minutes ?? 0));
      const proseRequest = { ...request, prompt: request.prompt + `\n\n<this_reply>\nWhat happens next: ${String(raw.note ?? "")}\nReply clock: ${clock}\n</this_reply>` };
      const reply = await this.actor.run(proseRequest, () => {}, signal, tools);
      const answer = JSON.stringify({ ...raw, reply });
      onText(answer);
      return answer;
    }
    const director = isOutline(request) ? this.outline : this.director;
    const runner = request.agent === "writer" ? this.writer : request.agent === "chronicler" ? this.chronicler : request.agent === "weaver" ? this.weaver
      : request.agent === "director" ? director : request.agent === "folder" ? this.folder : request.agent === "editor" ? this.editor : this.actor;
    return runner.run(request, onText, signal, tools);
  }
}
