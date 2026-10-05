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
    ? { title: "The next Scene", place: facts.place ?? "Somewhere new", purpose: "Something between two people turns.", exit: "It turns, or it does not." }
    : facts.opening === "unplanned"
      ? { title: facts.title ?? "", place: facts.place ?? "", purpose: "Something between two people turns.", exit: "It turns, or it does not." }
      : null;
  return {
    answer: JSON.stringify({
      leaves_scene: false,
      frame,
      comes_in: [],
      goes: [],
      beats,
      note: "Someone answers the Move, and wants something back.",
      call: "continue",
      intensity: 2,
      arc_moved: true,
      clock: facts.now,
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
 * A Chronicler's record that keeps every rule: the summary when the Scene has ended, and the latest new Move as a
 * Moment in its own words, since only the player's words can be relied on to say what he did.
 */
export function fakeChronicleAnswer(request: ModelRequest): Script {
  const facts = request.facts as ChroniclerFacts;
  const move = facts.labels.filter(item => item.kind === "move").at(-1);
  return {
    answer: JSON.stringify({
      summary: facts.sceneEnded ? "The Scene was played to its end." : null,
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

/**
 * Scripted models for every agent: each job has its own queue of answers, and answers by itself when its queue is
 * empty. Every scenario test runs on this, and `fantasia serve --fake-models` too.
 */
export class FakeModels implements ModelRunner {
  readonly writer: ScriptedRunner;
  readonly actor: ScriptedRunner;
  readonly chronicler: ScriptedRunner;
  /** Every request, in the order it was made. */
  readonly requests: ModelRequest[] = [];

  constructor(scripts: { writer?: Script[]; actor?: Script[]; chronicler?: Script[] } = {}, actorFallback: (request: ModelRequest) => Script = () => ({ answer: "She looks at you, and waits." })) {
    this.writer = new ScriptedRunner(scripts.writer ?? [], fakeWriterAnswer);
    this.actor = new ScriptedRunner(scripts.actor ?? [], actorFallback);
    this.chronicler = new ScriptedRunner(scripts.chronicler ?? [], fakeChronicleAnswer);
  }

  run(request: ModelRequest, onText: (delta: string) => void, signal: AbortSignal): Promise<string> {
    this.requests.push(request);
    const runner = request.agent === "writer" ? this.writer : request.agent === "chronicler" ? this.chronicler : this.actor;
    return runner.run(request, onText, signal);
  }
}
