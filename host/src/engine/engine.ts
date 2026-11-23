import { mkdirSync, writeFileSync } from "node:fs";
import { emptyUpdate } from "../story/truth.js";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { writeReply } from "../agents/actor.js";
import { composeReply } from "../agents/composer.js";
import { Drafts, type Draft } from "../store/drafts.js";
import { writeChronicle } from "../agents/chronicler.js";
import { directionDue, writePlan } from "../agents/director.js";
import { outlineDue, outlineSet, writeOutline, type OutlineAsk } from "../agents/outline.js";
import { foldDue, writeFold } from "../agents/folder.js";
import { writeWeave } from "../agents/weaver.js";
import { editReply, playerPartIn } from "../agents/editor.js";
import { playersPartBreak } from "../agents/deciding.js";
import { recordDue } from "../agents/writer.js";
import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import { actorOf, backupModels, editsEveryReply, jobModels, secondModel, type Job } from "../models/jobs.js";
import { nameIndex, storyName } from "../agents/names.js";
import { checkPerson, portraitExtension } from "./people.js";
import { arcsSet, clockSet, landmarkDropped, landmarkSet, placeSet, premiseSet, replyLengthSet, styleSet, worldSet, worldStands } from "./story.js";
import type { Models } from "../models/model-call.js";
import type { Accepted, ChooseRequest, SceneEnd, StoryEvent, TurnAccepted, TurnState } from "../protocol/generated/link.js";
import { answerNotes, besideOf, forgetLesson, rewordLesson, setBrief, setReaction, tasteOf, writeNote, type TasteScope } from "../store/beside.js";
import type { StoryPath } from "../store/tree.js";
import { SCENE_END_KINDS, type Entry, type EntryKind, type OutlineSet, type Payload, type WorldMoved } from "../story/entries.js";
import type { Beside } from "../story/beside.js";
import type { ModelChoice, Person, SceneEndStep, State } from "../story/state.js";
import { entryEvent, sceneEntries } from "../views/scene.js";
import { chosen } from "./choosing.js";
import { clearable, rewind, tryAnotherWay } from "./paths.js";
import { editEarlier, editInPlace, isLatest, passageOnPath, wordsOf } from "./editing.js";
import { emptySpan, endedScene, gapWeave, lookedUpBoth, nextStep, owedStep, planFollowsAt, rethinkingOf, sceneEndWeave, turnedAsk } from "./scene-end.js";

/** A live event and its id on the stream: "<seq>" for an entry, "<seq>.<n>" for what a turn under way says. */
export interface OutgoingEvent {
  id: string;
  event: StoryEvent;
}

interface Turn {
  storyId: string;
  pathId: string;
  move: Entry;
  /** A model chosen for one try of a job, by Retry or a Redo. */
  once: Partial<Record<TurnJob, ModelChoice>>;
  /** The job at work: what a failure says, and what Retry runs again. */
  step: TurnJob;
  /** What the one line says the Reply under way is doing (openspec presence: A Reply arrives checked and whole). */
  line: TurnLine;
  /** The line the phone was last told, and how many lines it has been told in this turn. */
  said: TurnLine | null;
  told: number;
  traceId: string;
  done: Promise<void>;
  abort: AbortController;
}

interface Failure {
  headId: string;
  reason: string;
  traceId: string;
  job: TurnJob;
}

/**
 * A Scene's end under way in the Story's queue: the step it is on; the Act the Director is rethinking, while a deep
 * pass re-plans one; and whether it is preparing the Story, writing its first Outline while a Scene is still open.
 */
interface SceneEndRun {
  pathId: string;
  done: Promise<void>;
  step: SceneEndStep | null;
  rethinking: string | null;
  preparing: boolean;
}

/** Why a Scene's end stopped, and where (docs/adr/0016). */
interface Stopped {
  step: SceneEndStep;
  reason: string;
  traceId: string;
  seq: number;
}

type TurnJob = "weaver" | "chronicler" | "writer" | "actor" | "editor";

/**
 * What a Reply under way is doing: looking something up (the Writer, or a long Scene being recorded so far), being
 * written, or being checked by the Editor (docs/adr/0019). Until the Writer looks something up or the Actor starts,
 * nothing is said to be written: the Story is looking back.
 */
type TurnLine = "looking_back" | "writing" | "checking";

/** What a turn could not do, by the job that failed it. */
const TURN_FAILED: Record<TurnJob, string> = {
  weaver: "The time until then could not be moved on",
  chronicler: "The Scene so far could not be recorded",
  writer: "The Reply could not be planned",
  actor: "The Reply could not be written",
  editor: "The Reply could not be checked"
};

/** Heads that mean a Move is still waiting for its Reply. */
const WAITING: readonly EntryKind[] = ["move", "redo", "scene_recorded", "beat_note"];

/** What a rebuild writes afresh, and so does not copy from the old Path. */
const DERIVED: ReadonlySet<string> = new Set(["chronicle", "outline_set", "director_plan", "world_moved", "story_folded", "scene_recorded"]);
/** What a rebuild copies as played: the player's words, the Story's Replies, and every edit; nothing kept beside the Story. */
const KINDS: ReadonlySet<string> = new Set([
  "scene_opened", "move", "redo", "beat_note", "reply", "scene_closed", "focus_set", "linger_set",
  "known_set", "person_set", "lead_set", "group_set", "portrait_set", "premise_set", "style_set", "reply_length_set", "arcs_set",
  "landmark_set", "landmark_dropped", "place_set", "world_set", "clock_set", "routine_set"
]);

/** What a rebuild made. */
export interface Rebuilt {
  pathId: string;
  scenes: number;
  /** Off-page events of the old Path the new one no longer has, with the Scenes whose Replies seem to speak of them. */
  replaced: { what: string; mentionedIn: number[] }[];
}

const COMMON = new Set(["about", "after", "again", "their", "there", "these", "where", "which", "while", "would", "could", "should", "before", "being", "every", "other", "still", "through", "because", "under", "roopesh"]);

/** Off-page events the old Path had over a span the rebuild lived again, and the later Replies that share their words. */
function replacedEvents(old: Entry[], rebuilt: Entry[]): Rebuilt["replaced"] {
  const now = new Set(rebuilt.flatMap(entry => (entry.payload.kind === "world_moved" ? entry.payload.happened.map(item => item.what) : [])));
  const words = (text: string) => new Set(text.split(/[^A-Za-z']+/).map(word => word.toLowerCase()).filter(word => word.length > 4 && !COMMON.has(word)));
  const replies: { scene: number; words: Set<string> }[] = [];
  let scene = 0;
  for (const entry of rebuilt) {
    if (entry.payload.kind === "scene_opened") scene = entry.payload.number;
    if (entry.payload.kind === "reply") replies.push({ scene, words: words(entry.payload.text) });
  }
  return old.flatMap(entry => (entry.payload.kind === "world_moved" && entry.payload.gap ? entry.payload.happened : []))
    .filter(item => !now.has(item.what))
    .map(item => {
      const own = [...words(item.what)];
      const mentionedIn = [...new Set(replies.filter(reply => own.filter(word => reply.words.has(word)).length >= 3).map(reply => reply.scene))];
      return { what: item.what, mentionedIn };
    });
}

/** What a step of the end of a Scene a Move left could not do, as the turn's failure says it. */
const LEFT_STEP: Record<SceneEndStep, string> = {
  chronicler: "The Scene you left could not be recorded",
  director: "The days ahead could not be planned",
  weaver: "The World could not move on",
  folder: "The Story So Far could not be folded"
};

/**
 * The story engine (docs/adr/0004): the only code that writes entries. Everything a Story does runs in one queue, one
 * step at a time (docs/adr/0016): a turn is the Weaver over a Gap, the Chronicler once a long Scene needs recording so
 * far, the Writer, then the Actor and the Editor, who reads the Reply before the player does; a Scene's end is the
 * Chronicler, the Director (the Outline reconsidered, then a Stretch when one is due), the Weaver, then the Folder
 * when due; a Story's first Outline runs in it too, before its first Scene's end. Each step reads what the one
 * before wrote. A step that fails on its model and its second model stops where it is, and Retry goes on from there.
 */
export class Engine {
  private readonly turns = new Map<string, Turn>();
  private readonly failures = new Map<string, Failure>();
  /** Per Story, the Scene end under way and the step it is on. */
  private readonly sceneEnds = new Map<string, SceneEndRun>();
  private readonly stopped = new Map<string, Stopped>();
  /** Stories being rebuilt from their own text: nothing goes on from a Scene a Move left while their Path is replayed. */
  private readonly rebuilding = new Set<string>();
  /** Per Story, the model Retry chose for the Scene end's failed step, for that one try. */
  private readonly onceStep = new Map<string, { step: SceneEndStep; model: ModelChoice }>();
  /** Per Story, a focused pass's word that the Scene at [head] turned the Story, so Retry goes straight to the deep pass. */
  private readonly turned = new Map<string, { head: string; ask: OutlineAsk; lookups: string[] }>();
  /** Once `resumeAll` runs (live server), fresh Paths without an Outline automatically run the Director at the start. */
  private autoPrepare = false;
  private readonly bus = new EventEmitter();
  private readonly drafts: Drafts;

  constructor(private readonly mac: Mac, private readonly models: Models, private readonly onBusy: (busy: boolean) => void = () => {}) {
    this.bus.setMaxListeners(0);
    this.drafts = new Drafts(mac.db);
  }

  move(storyId: string, text: string, after: string, traceId: string): TurnAccepted {
    const { path } = this.idleHead(storyId, after);
    if (!text.trim()) throw new LinkError("invalid", "A Move needs some words.");
    const move = this.write(storyId, path, { kind: "move", text });
    this.startTurn(storyId, path.id, move, traceId);
    return { move_entry_id: move.id, trace_id: traceId };
  }

  /**
   * Retry (openspec presence: Nothing fails silently): a Scene's end goes on from the step it stopped at; a turn writes
   * its Reply again. With a model, the failed job runs on it for this one try and no setting changes.
   */
  retry(storyId: string, traceId: string, model: ModelChoice | null = null): TurnAccepted {
    const path = this.path(storyId);
    const stopped = this.stopped.get(storyId);
    if (stopped) {
      this.stopped.delete(storyId);
      if (model) this.onceStep.set(storyId, { step: stopped.step, model });
      this.endOfScene(storyId);
      return { move_entry_id: path.headEntryId, trace_id: traceId };
    }
    if (this.turns.has(storyId)) throw new LinkError("busy", "A Reply is already being written.");
    const head = this.mac.tree.entry(path.headEntryId);
    if (!head || !this.waiting(head)) throw new LinkError("invalid", "There is nothing waiting to be tried again.");
    const failure = this.failures.get(storyId);
    this.failures.delete(storyId);
    const move = this.lastMove(head.id);
    const job: TurnJob = failure?.headId === head.id ? failure.job : head.payload.kind === "beat_note" ? "actor" : "writer";
    this.startTurn(storyId, path.id, move, traceId, model ? { [job === "writer" ? "actor" : job]: model } : {});
    return { move_entry_id: move.id, trace_id: traceId };
  }

  choose(storyId: string, request: ChooseRequest, traceId: string): TurnAccepted {
    const { path } = this.idleHead(storyId, request.after);
    const { choice, text } = chosen(this.mac, path.headEntryId, request);
    const move = this.write(storyId, path, { kind: "move", text, choice });
    this.startTurn(storyId, path.id, move, traceId);
    return { move_entry_id: move.id, trace_id: traceId };
  }

  /** The player ends the Scene at the latest Reply; its end runs, and the Day View opens when it is done. */
  endScene(storyId: string, after: string, traceId: string): Accepted {
    const { path } = this.idleHead(storyId, after);
    if (this.mac.states.at(path.headEntryId).scene?.closed) throw new LinkError("invalid", "This Scene has already ended.");
    const closed = this.write(storyId, path, { kind: "scene_closed", by: "player" });
    this.endOfScene(storyId);
    return { head_entry_id: closed.id, trace_id: traceId };
  }

  /**
   * The player's brief, kept beside the Story (openspec long-run: The player steers with a brief and reactions;
   * docs/adr/0020): every Path, and every Redo, keeps it.
   */
  setBrief(storyId: string, more: string[], less: string[], traceId: string): Accepted {
    const path = this.path(storyId);
    const clean = (lines: string[]) => lines.map(line => line.trim()).filter(Boolean);
    setBrief(this.mac, storyId, { more: clean(more), less: clean(less) });
    return { head_entry_id: path.headEntryId, trace_id: traceId };
  }

  /** The player's reaction to a Scene played on the Path they are on, or its clearing, kept scoped to that Scene's close entry. */
  setReaction(storyId: string, scene: number, reaction: "more" | "less" | null, note: string | null, traceId: string): Accepted {
    const path = this.path(storyId);
    const played = this.mac.states.at(path.headEntryId).curve.find(item => item.scene === scene);
    if (!played) throw new LinkError("invalid", `Scene ${scene} has not been played on this Path.`);
    const entries = this.mac.tree.pathTo(path.headEntryId);
    let currentScene = 0;
    let closedId: string | null = null;
    for (const entry of entries) {
      if (entry.payload.kind === "scene_opened") currentScene = entry.payload.number;
      else if (entry.payload.kind === "scene_closed" && currentScene === scene) closedId = entry.id;
    }
    setReaction(this.mac, storyId, scene, reaction ? { title: played.title, reaction, note: note?.trim() || null } : null, closedId);
    return { head_entry_id: path.headEntryId, trace_id: traceId };
  }

  /** Try another way from a Reply, or start again from the beginning when [from] is null (openspec paths). */
  tryAnotherWay(storyId: string, from: string | null, after: string, traceId: string): Accepted {
    const started = tryAnotherWay(this.mac, this.pathHead(storyId, after), from);
    return this.pathChanged(storyId, started.headEntryId, traceId);
  }

  /** Rewind the Path the player is on to a Reply, setting what came after aside as a Path of its own (openspec paths). */
  rewind(storyId: string, to: string, after: string, traceId: string): Accepted {
    rewind(this.mac, this.pathHead(storyId, after), to);
    return this.pathChanged(storyId, to, traceId);
  }

  /** Puts the player on [pathId] at its latest moment (openspec paths: Returning by the Paths screen). */
  openPath(storyId: string, pathId: string, traceId: string): Accepted {
    const path = this.pathOf(storyId, pathId);
    this.notWriting(storyId);
    if (!path.isCurrent) this.mac.tree.openPath(storyId, path.id);
    return this.pathChanged(storyId, path.headEntryId, traceId);
  }

  /** Names a Path, or with an empty name calls it by its newest Scene again. */
  renamePath(storyId: string, pathId: string, name: string, traceId: string): Accepted {
    this.mac.tree.renamePath(this.pathOf(storyId, pathId).id, name.trim());
    return { head_entry_id: this.path(storyId).headEntryId, trace_id: traceId };
  }

  /** Deletes a Path the player is not on. */
  deletePath(storyId: string, pathId: string, traceId: string): Accepted {
    const path = this.pathOf(storyId, pathId);
    this.notWriting(storyId);
    if (path.isCurrent) throw new LinkError("invalid", "You are on this Path, so it cannot be deleted.");
    this.mac.tree.deletePath(path.id);
    return { head_entry_id: this.path(storyId).headEntryId, trace_id: traceId };
  }

  /** Clears the Paths Rewind set aside that the player never opened (openspec paths: Rewind sets aside, never destroys). */
  clearPaths(storyId: string, traceId: string): Accepted {
    const current = this.path(storyId);
    this.notWriting(storyId);
    for (const path of clearable(this.mac, storyId)) this.mac.tree.deletePath(path.id);
    return { head_entry_id: current.headEntryId, trace_id: traceId };
  }

  /**
   * Edit a Move or a Reply (openspec scenes: Editing): the latest in place, anything earlier on a new Path. An edited
   * Move left waiting for its Reply gets one, as any Move does.
   */
  edit(storyId: string, entryId: string, text: string, after: string, traceId: string): Accepted {
    const path = this.pathHead(storyId, after);
    const entry = passageOnPath(this.mac, path, entryId);
    const words = text.trim();
    if (!words) throw new LinkError("invalid", "An edit needs the words it should read.");
    if (words === wordsOf(entry).trim()) throw new LinkError("invalid", "That is what it already says. Nothing was changed.");
    const head = isLatest(this.mac, path, entry)
      ? editInPlace(this.mac, path, entry, words)
      : this.mac.tree.entry(editEarlier(this.mac, path, entry, words).headEntryId);
    if (!head) throw new LinkError("internal", "The edit was written but cannot be found.");
    const accepted = this.pathChanged(storyId, head.id, traceId);
    if (head.payload.kind === "move") this.startTurn(storyId, this.path(storyId).id, head, traceId);
    return accepted;
  }

  /**
   * Deletes a lesson from the Story's Taste or the player's own (openspec long-run: Taste is short, readable and the
   * player's). Taste is kept beside the Story (docs/adr/0020), so every Path loses it, and the next call reads it gone.
   */
  removeTaste(storyId: string, line: string, scope: TasteScope, traceId: string): Accepted {
    const path = this.path(storyId);
    if (!forgetLesson(this.mac, storyId, scope, line)) throw new LinkError("invalid", scope === "player" ? "That is not a line of your own Taste." : "That is not a line of Taste.");
    return { head_entry_id: path.headEntryId, trace_id: traceId };
  }

  /**
   * Sets what the Player Character knows of someone on a Story being played (`fantasia known`), between Replies, on the
   * Path; the World screen shows it from then on (openspec outside-the-scene).
   */
  setKnown(storyId: string, person: string, text: string, after: string, traceId: string): Accepted {
    const path = this.pathHead(storyId, after);
    const state = this.mac.states.at(path.headEntryId);
    const name = storyName(nameIndex(Object.values(state.people)), person);
    if (!name) throw new LinkError("invalid", `${person.trim()} is not in this Story.`);
    if (name === state.playerCharacter) throw new LinkError("invalid", `${name} is the Player Character; what he knows of himself is not kept.`);
    if (!text.trim()) throw new LinkError("invalid", `Say what he knows of ${name}.`);
    const entry = this.write(storyId, path, { kind: "known_set", person: name, text: text.trim() });
    return { head_entry_id: entry.id, trace_id: traceId };
  }

  /**
   * Creates someone, or changes them whole, from this moment onward on the current Path (openspec stories: Anything
   * can be edited or created in the app), between Replies, against the head the phone saw.
   */
  setPerson(storyId: string, person: Omit<Person, "portrait" | "broughtIn">, after: string, traceId: string, creating: boolean): Accepted {
    const path = this.pathHead(storyId, after);
    const checked = checkPerson(this.mac.states.at(path.headEntryId), person, creating);
    if (!checked.ok) throw new LinkError("invalid", checked.reason);
    const entry = this.write(storyId, path, { kind: "person_set", person: checked.person });
    return { head_entry_id: entry.id, trace_id: traceId };
  }

  /** Makes someone a Lead or stops them being one: only the player or Claude ever does (openspec stories: Leads). */
  setLead(storyId: string, person: string, lead: boolean, after: string, traceId: string): Accepted {
    const path = this.pathHead(storyId, after);
    const state = this.mac.states.at(path.headEntryId);
    const name = storyName(nameIndex(Object.values(state.people)), person);
    if (!name) throw new LinkError("invalid", `${person.trim()} is not in the Story.`);
    if (name === state.playerCharacter) throw new LinkError("invalid", `${name} is the Player Character, not a Lead.`);
    const entry = this.write(storyId, path, { kind: "lead_set", person: name, lead });
    return { head_entry_id: entry.id, trace_id: traceId };
  }

  /**
   * Replaces someone's Portrait with an uploaded image, from this moment onward on the current Path (openspec stories:
   * Portraits are real images). The file is kept beside the Story's other Portraits; earlier ones stay, since
   * earlier moments and other Paths still show them.
   */
  setPortrait(storyId: string, person: string, image: Buffer, type: string, after: string, traceId: string): Accepted {
    const path = this.pathHead(storyId, after);
    const state = this.mac.states.at(path.headEntryId);
    const name = storyName(nameIndex(Object.values(state.people)), person);
    if (!name) throw new LinkError("invalid", `${person.trim()} is not in the Story.`);
    const extension = portraitExtension(image, type);
    const file = `${randomUUID()}${extension}`;
    const folder = join(this.mac.home, "portraits", storyId);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, file), image);
    const entry = this.write(storyId, path, { kind: "portrait_set", person: name, file });
    return { head_entry_id: entry.id, trace_id: traceId };
  }

  /** Creates a Group, or changes its description (openspec stories: Groups are the player's to arrange). */
  setGroup(storyId: string, group: string, description: string, after: string, traceId: string): Accepted {
    const path = this.pathHead(storyId, after);
    if (!group.trim()) throw new LinkError("invalid", "Give the Group a name.");
    const entry = this.write(storyId, path, { kind: "group_set", group: group.trim(), description: description.trim() });
    return { head_entry_id: entry.id, trace_id: traceId };
  }

  // The rest of the Story (editing-the-story): each edit lands from this moment onward on the current Path, between
  // Replies, against the head the phone saw, once engine/story.ts has checked it.

  setPremise(storyId: string, premise: string, after: string, traceId: string): Accepted {
    return this.edited(storyId, after, traceId, () => premiseSet(premise));
  }

  setStyle(storyId: string, style: string, after: string, traceId: string): Accepted {
    return this.edited(storyId, after, traceId, () => styleSet(style));
  }

  setReplyLength(storyId: string, length: string, after: string, traceId: string): Accepted {
    return this.edited(storyId, after, traceId, () => replyLengthSet(length));
  }

  setArcs(storyId: string, arcs: string[], after: string, traceId: string): Accepted {
    return this.edited(storyId, after, traceId, () => arcsSet(arcs));
  }

  /** Creates, moves or rewrites a Landmark; one the World has passed on this Path stays as it was. */
  setLandmark(storyId: string, landmark: { name: string; at: string; what: string }, creating: boolean, after: string, traceId: string): Accepted {
    return this.edited(storyId, after, traceId, state => landmarkSet(state, worldStands(state, state.clock), landmark, creating));
  }

  dropLandmark(storyId: string, name: string, after: string, traceId: string): Accepted {
    return this.edited(storyId, after, traceId, state => landmarkDropped(state, worldStands(state, state.clock), name));
  }

  setPlace(storyId: string, place: { name: string; description: string }, institution: boolean, creating: boolean, after: string, traceId: string): Accepted {
    return this.edited(storyId, after, traceId, state => placeSet(state, place, institution, creating));
  }

  setWorld(storyId: string, summary: string, history: string, after: string, traceId: string): Accepted {
    return this.edited(storyId, after, traceId, () => worldSet(summary, history));
  }

  /** Moves the clock on, never back; the World catches up over the time passed when it next moves, as over a Gap. */
  setClock(storyId: string, at: string, dayOne: string | null | undefined, after: string, traceId: string): Accepted {
    return this.edited(storyId, after, traceId, state => clockSet(state, at, dayOne));
  }

  /** Rewords a lesson in its place, in the Story's Taste or the player's own. */
  rewordTaste(storyId: string, line: string, text: string, scope: TasteScope, traceId: string): Accepted {
    const path = this.path(storyId);
    if (!tasteOf(this.mac, storyId, scope).includes(line)) throw new LinkError("invalid", "Taste has no such line.");
    const words = text.trim();
    if (!words) throw new LinkError("invalid", "Say the lesson, or delete it.");
    rewordLesson(this.mac, storyId, scope, line, words);
    return { head_entry_id: path.headEntryId, trace_id: traceId };
  }

  private edited(storyId: string, after: string, traceId: string, edit: (state: State, head: string) => Payload): Accepted {
    const path = this.pathHead(storyId, after);
    const entry = this.write(storyId, path, edit(this.mac.states.at(path.headEntryId), path.headEntryId));
    return { head_entry_id: entry.id, trace_id: traceId };
  }

  /** Focus on someone in the Scene, or clear it with null (openspec scenes: Focus keeps a Scene close to one person). */
  setFocus(storyId: string, after: string, on: string | null, traceId: string): Accepted {
    const { path } = this.idleHead(storyId, after);
    const scene = this.mac.states.at(path.headEntryId).scene;
    if (!scene || scene.closed) throw new LinkError("invalid", "There is no Scene open to focus.");
    if (on !== null && !scene.here.includes(on)) throw new LinkError("invalid", `${on} is not in this Scene.`);
    const entry = this.write(storyId, path, { kind: "focus_set", on });
    return { head_entry_id: entry.id, trace_id: traceId };
  }

  /** Turn Linger on or off (openspec scenes: Linger holds the moment). */
  setLinger(storyId: string, after: string, on: boolean, traceId: string): Accepted {
    const { path } = this.idleHead(storyId, after);
    const scene = this.mac.states.at(path.headEntryId).scene;
    if (!scene || scene.closed) throw new LinkError("invalid", "There is no Scene open to linger in.");
    const entry = this.write(storyId, path, { kind: "linger_set", on });
    return { head_entry_id: entry.id, trace_id: traceId };
  }

  /**
   * Writes the latest Reply again (openspec scenes: Redo). The Redo is written under the Move that Reply answered and
   * becomes the head at once, so the old Reply, and any Scene it opened or closed, leave the Path; the turn then runs
   * from it with the Direction for the Writer. Focus and Linger set since the old Reply are written again before the
   * Redo, so the new Reply keeps them.
   */
  redo(storyId: string, after: string, direction: string | null, remember: boolean, traceId: string, model: ModelChoice | null = null): TurnAccepted {
    const { path, head } = this.idleHead(storyId, after);
    const reply = this.latestReply(head);
    if (!reply) throw new LinkError("invalid", "Only the latest Reply can be redone.");
    const text = direction?.trim() || null;
    if (remember && !text) throw new LinkError("invalid", "Write the Direction to remember.");
    const move = this.lastMove(reply.id);
    const from = this.redoneFrom(reply, move);
    const now = this.mac.states.at(head.id).scene;
    const before = this.mac.states.at(from.id).scene;
    const redo = this.mac.db.transaction(() => {
      let parent = from;
      if (now && now.focus !== before?.focus) parent = this.mac.tree.append(storyId, parent.id, { kind: "focus_set", on: now.focus });
      if (now && now.linger !== before?.linger) parent = this.mac.tree.append(storyId, parent.id, { kind: "linger_set", on: now.linger });
      const written = this.mac.tree.append(storyId, parent.id, { kind: "redo", direction: text, remember, ...(model ? { model } : {}), ...(reply.payload.kind === "reply" ? { rejected: { id: reply.id, text: reply.payload.text } } : {}) });
      if (text) writeNote(this.mac, storyId, text, new Date(), written.id, remember);
      if (!this.mac.tree.moveHead(path.id, head.id, written.id)) throw new LinkError("stale_head", "The Story has moved on since you last looked.");
      return written;
    })();
    this.publish(storyId, redo);
    this.startTurn(storyId, path.id, move, traceId);
    return { move_entry_id: move.id, trace_id: traceId };
  }

  /**
   * Where a Redo of [reply] goes back to: the Writer's plan for it is made again, and nothing before. When [move]
   * walked out of a Scene into the one the Reply opens, that Scene's end stays: it does not turn on the Reply.
   */
  private redoneFrom(reply: Entry, move: Entry): Entry {
    const note = reply.parentId ? this.mac.tree.entry(reply.parentId) : null;
    let from = note?.payload.kind === "beat_note" && note.parentId ? this.mac.tree.entry(note.parentId) : null;
    // Back past an earlier Redo of it (with the Focus and Linger it set again), and the Scene the Move walked into.
    while (from && from.id !== move.id && from.parentId
      && (["redo", "focus_set", "linger_set"].includes(from.payload.kind) || (from.payload.kind === "scene_opened" && from.payload.startsAt === move.id))) {
      from = this.mac.tree.entry(from.parentId);
    }
    return from ?? move;
  }

  /**
   * The latest Reply, if the head is it or comes only after it: Focus and Linger set since.
   */
  private latestReply(head: Entry): Entry | null {
    let entry: Entry | null = head;
    while (entry && (entry.payload.kind === "focus_set" || entry.payload.kind === "linger_set") && entry.parentId) entry = this.mac.tree.entry(entry.parentId);
    return entry?.payload.kind === "reply" ? entry : null;
  }

  // ---------------------------------------------------------------- a Scene's end (docs/adr/0016)

  /**
   * Queues the end of the Scene the Story's Path has closed: every step it still owes, in order; or, on a Story with no
   * Outline yet, the Director's first, so no Scene's end runs before it.
   */
  private endOfScene(storyId: string): void {
    const current = this.mac.tree.currentPath(storyId);
    if (!current) return;
    const previous = this.sceneEnds.get(storyId)?.done ?? Promise.resolve();
    const run: SceneEndRun = { pathId: current.id, done: Promise.resolve(), step: null, rethinking: null, preparing: false };
    run.done = previous.then(() => this.runSceneEnd(storyId, run)).catch(() => {}).finally(() => {
      if (this.sceneEnds.get(storyId) === run) this.sceneEnds.delete(storyId);
      if (this.sceneEnds.size === 0 && this.turns.size === 0) this.onBusy(false);
    });
    this.sceneEnds.set(storyId, run);
    this.onBusy(true);
  }

  private async runSceneEnd(storyId: string, run: SceneEndRun): Promise<void> {
    if (this.stopped.has(storyId)) return;
    let said: SceneEndStep | null | undefined;
    // The World moves on side by side with the Director (quicker-scene-ends design decision 3) when no new Stretch is
    // due: the Weaver's call starts with the Director's step, from the record, and its entry is written once the
    // Director's are. A Stretch the Director plans after all is lived out by the World: the Weaver is asked again.
    let weaving: { traceId: string; plan: number; result: Promise<{ payload: Payload; answered: boolean }> } | null = null;
    for (;;) {
      const path = this.mac.tree.path(run.pathId);
      if (!path) return;
      const isCurrent = this.mac.tree.currentPath(storyId)?.id === run.pathId;
      const state = this.mac.states.at(path.headEntryId);
      const step = owedStep(state);
      run.step = step;
      run.preparing = step !== null && !state.scene?.closed;
      if (step === "director" && !weaving && state.scene?.closed && !state.scene.ended.includes("weaver") && directionDue(state) === null) {
        const traceId = `weaver-${randomUUID().slice(0, 8)}`;
        weaving = { traceId, plan: state.plan?.number ?? 0, result: this.sceneEndStep(storyId, path.headEntryId, state, "weaver", traceId, run) };
        // A failure is reported when the World's turn to be written comes, if the Director's step gets that far.
        weaving.result.catch(() => {});
      }
      // The Act being rethought stays on the line through the Director's step, until the World moves on.
      if (step !== "director") run.rethinking = null;
      // The Director's step may write the Outline and then the Stretch: the line says it once.
      if (isCurrent && step !== said) this.sayStep(storyId, step);
      said = step;
      if (!step) return isCurrent ? this.goOnFromLeaving(storyId) : undefined;
      const woven = step === "weaver" && weaving?.plan === (state.plan?.number ?? 0) ? weaving : null;
      const traceId = woven?.traceId ?? `${step}-${randomUUID().slice(0, 8)}`;
      try {
        const { payload, answered } = await (woven?.result ?? this.sceneEndStep(storyId, path.headEntryId, state, step, traceId, run));
        const entry = this.mac.tree.append(storyId, path.headEntryId, payload);
        if (!this.mac.tree.moveHead(path.id, path.headEntryId, entry.id)) return;
        // The steering notes the Outline follows are answered by it (openspec the-outline: The player sees and steers the Outline).
        if (answered) answerNotes(this.mac, storyId, this.mac.states.at(entry.id).outline?.version ?? 0);
        if ("callId" in payload && payload.callId) this.models.attach(payload.callId, entry.id);
        if (this.mac.tree.currentPath(storyId)?.id === run.pathId) this.publish(storyId, entry);
      } catch (error) {
        run.rethinking = null;
        const reason = error instanceof Error ? error.message : String(error);
        // The first Outline, written while a Scene is still open, stops nothing: log why it failed so it is visible,
        // and let the Director try again at that Scene's end, where a step that fails stops with Retry.
        if (run.preparing) {
          console.warn(`[open-fantasia] Initial Outline preparation failed for story ${storyId} on path ${run.pathId}: ${reason}`);
          if (this.mac.tree.currentPath(storyId)?.id === run.pathId) this.sayStep(storyId, null);
          return;
        }
        const at = this.newestSeq(storyId);
        this.stopped.set(storyId, { step, reason, traceId, seq: at });
        if (this.mac.tree.currentPath(storyId)?.id === run.pathId) this.emit(storyId, this.sceneEndFailed(storyId));
        return;
      }
    }
  }

  /** Tells the phones which step of the Scene's end is under way, or with null that it is done. */
  private sayStep(storyId: string, step: SceneEndStep | null, also = ""): void {
    const seq = this.newestSeq(storyId);
    this.emit(storyId, { id: `${seq}.step.${step ?? "done"}${also}`, event: { kind: "scene_end_step", seq, step } });
  }

  /**
   * One step of a Scene's end: its agent's call, and the entry it writes; for the Director's Outline, whether it
   * answers the player's steering notes.
   */
  private async sceneEndStep(storyId: string, head: string, state: State, step: SceneEndStep, traceId: string, run: SceneEndRun): Promise<{ payload: Payload; answered: boolean }> {
    const scene = state.scene;
    if (!scene) throw new Error("No Scene has ended");
    const signal = new AbortController().signal;
    const once = this.onceStep.get(storyId);
    if (once?.step === step) this.onceStep.delete(storyId);
    const choices = (job: Job) => (once?.step === step ? [once.model] : this.choices(job));
    switch (step) {
      case "chronicler": {
        const { value, callId, model, dropped } = await writeChronicle(this.models, choices("chronicler"), { state, scene: endedScene(this.mac, head, state) }, storyId, traceId, signal);
        return { payload: { kind: "chronicle", scene: scene.number, ...value, dropped, callId, model }, answered: false };
      }
      case "director": {
        // The Outline first, reconsidered after every Scene; then the next Stretch, when one is due, as the next step of it.
        const beside = besideOf(this.mac, storyId, head);
        const due = outlineDue(state, beside);
        if (due) {
          const outlined = await this.outline(storyId, head, state, beside, due, choices("director"), traceId, signal, run);
          return { payload: outlined.payload, answered: outlined.answered.length > 0 };
        }
        const reason = directionDue(state) ?? "A plan is due.";
        const { value, callId, model, dropped } = await writePlan(this.models, choices("director"), state, beside, reason, { storyId, head }, traceId, signal);
        return { payload: { kind: "director_plan", ...value, reason, afterScene: scene.number, dropped, callId, model }, answered: false };
      }
      case "weaver": {
        const ask = sceneEndWeave(this.mac, head, state);
        if (emptySpan(ask)) return { payload: { kind: "world_moved", scene: scene.number, gap: false, from: ask.from, until: ask.until, lives: [], threads: [], happened: [], meanwhile: [], on: state.on, truth: emptyUpdate(), dropped: [], callId: null, model: null }, answered: false };
        const { value, callId, model, dropped } = await writeWeave(this.models, choices("weaver"), ask, storyId, traceId, signal);
        return { payload: { kind: "world_moved", scene: scene.number, gap: false, from: ask.from, until: ask.until, ...value, dropped, callId, model }, answered: false };
      }
      case "folder": {
        // An Act's account is checked by the Editor against the Scenes it gathers.
        const due = foldDue(state);
        if (!due) throw new Error("Nothing to fold");
        const { value, callId, model } = await writeFold(this.models, choices("folder"), state, due, storyId, traceId, signal, this.choices("editor"));
        return { payload: { kind: "story_folded", into: due.into, count: due.parts.length, from: due.parts[0]?.from ?? state.clock, until: due.parts.at(-1)?.until ?? state.clock, text: value, callId, model }, answered: false };
      }
    }
  }

  /**
   * The Director's Outline (the-storys-mind design decisions 2 and 5): the first, deep, when the Story has none; after a
   * Scene, a focused revision, or a deep re-plan when the player steered or an Act ended. A focused pass that finds the
   * Scene turned the Story gives way to a deep re-plan of the current Act, which alone is kept, with what both passes
   * looked up; a Retry after a deep pass that failed goes straight to it. While a deep pass re-plans an Act, the Scene's
   * end says the Director is rethinking it. The Outline says whether a Stretch plan follows it in the same step.
   */
  private async outline(storyId: string, head: string, state: State, beside: Beside, due: { depth: "focused" | "deep"; ask: OutlineAsk }, choices: ModelChoice[], traceId: string, signal: AbortSignal, run: SceneEndRun): Promise<{ payload: OutlineSet; answered: string[] }> {
    const story = { storyId, head };
    let ask = due.ask;
    let looked: string[] = [];
    const turned = this.turned.get(storyId);
    if (due.depth === "focused" && turned?.head === head) {
      ask = turned.ask;
      looked = turned.lookups;
    } else if (due.depth === "focused") {
      const focused = await writeOutline(this.models, choices, state, beside, ask, story, traceId, signal);
      if (!focused.value.turned) return { payload: outlineSet(focused, ask, planFollowsAt(state, focused.value.outline)), answered: focused.value.answered };
      ask = turnedAsk(state, focused.value.turned);
      looked = focused.lookups;
      this.turned.set(storyId, { head, ask, lookups: looked });
    }
    run.rethinking = rethinkingOf(state, ask);
    if (run.rethinking) this.sayStep(storyId, "director", ".rethinking");
    const deep = await writeOutline(this.models, choices, state, beside, ask, story, traceId, signal);
    this.turned.delete(storyId);
    const outline = { ...deep.value.outline, lookedUp: lookedUpBoth(deep.value.outline.lookedUp, deep.lookups, looked) };
    return { payload: outlineSet({ ...deep, value: { ...deep.value, outline } }, ask, planFollowsAt(state, outline)), answered: deep.value.answered };
  }

  /** A job's model and its second model (openspec presence: Nothing fails silently). */
  private choices(job: Job | "actor", storyId?: string): ModelChoice[] {
    const backup = backupModels(this.mac.home)[job];
    if (job === "actor") {
      const own = (storyId ? actorOf(this.mac, storyId) : null) ?? (storyId ? this.mac.states.at(this.path(storyId).headEntryId).actor : null);
      return own ? [own, secondModel(own, backup, job)] : [backup];
    }
    const own = jobModels(this.mac.home)[job];
    return [own, secondModel(own, backup, job)];
  }

  /**
   * Every Story whose Path has a Scene end still owed runs it, and every Story with no Outline yet has its first
   * written: for `fantasia serve` when it starts.
   */
  resumeAll(): void {
    this.autoPrepare = true;
    for (const storyId of this.storyIds()) this.resume(storyId, true);
  }

  /** The Stories that can be played. */
  private storyIds(): string[] {
    return (this.mac.db.prepare("SELECT id FROM stories WHERE before_ledger = 0").all() as { id: string }[]).map(story => story.id);
  }

  /**
   * Runs the Scene's end the Story's Path still owes, or goes on into the Scene a Move left once it is done. When
   * [prepare], a Story with no Outline has its first written, in its queue, before anything else runs there; but never
   * under a Move still waiting for its Reply, which Retry writes first.
   */
  private resume(storyId: string, prepare = false): void {
    const path = this.mac.tree.currentPath(storyId);
    const head = path ? this.mac.tree.entry(path.headEntryId) : null;
    if (!path || !head) return;
    const state = this.mac.states.at(head.id);
    if (prepare && !this.waiting(head) ? owedStep(state) : nextStep(state)) this.endOfScene(storyId);
    else this.goOnFromLeaving(storyId);
  }

  /**
   * Stories imported by the Mac's commands since the last look, and any other with no Outline yet, have their first
   * written while nothing else runs there (openspec the-outline: Every Story has an Outline to its end).
   */
  private prepareStories(): void {
    for (const storyId of this.storyIds()) {
      const path = this.mac.tree.currentPath(storyId);
      if (!path || !this.isIdle(storyId) || this.stopped.has(storyId) || this.mac.states.at(path.headEntryId).outline) continue;
      this.resume(storyId, true);
    }
  }

  /** Once the end of a Scene a Move left is done, with no turn waiting on it, that Move opens the next Scene. */
  private goOnFromLeaving(storyId: string): void {
    if (this.rebuilding.has(storyId)) return;
    const path = this.mac.tree.currentPath(storyId);
    const head = path ? this.mac.tree.entry(path.headEntryId) : null;
    if (!path || !head || this.turns.has(storyId) || !this.leftAndEnded(head)) return;
    this.startTurn(storyId, path.id, this.lastMove(head.id), `move-${randomUUID().slice(0, 8)}`);
  }

  /**
   * How the Scene's end stands, for the Day View: the step under way or owed, and the Act the Director is rethinking
   * while a deep pass runs; or where it stopped.
   */
  sceneEndOf(storyId: string): SceneEnd {
    const stopped = this.stopped.get(storyId);
    if (stopped) return { step: null, failed: { step: stopped.step, reason: stopped.reason, trace_id: stopped.traceId }, rethinking: null };
    const running = this.sceneEnds.get(storyId);
    if (running?.step) return { step: running.step, failed: null, rethinking: running.rethinking };
    const path = this.mac.tree.currentPath(storyId);
    return { step: path ? owedStep(this.mac.states.at(path.headEntryId)) : null, failed: null, rethinking: null };
  }

  /** Resolves when the Story's Scene end is done or stopped: for tests and for shutting down cleanly. */
  async ended(storyId: string): Promise<void> {
    for (;;) {
      const run = this.sceneEnds.get(storyId);
      if (!run) return;
      await run.done;
    }
  }

  private sceneEndFailed(storyId: string): OutgoingEvent {
    const stopped = this.stopped.get(storyId);
    const seq = stopped?.seq ?? this.newestSeq(storyId);
    return { id: `${seq}.failed.${stopped?.step ?? ""}`, event: { kind: "scene_end_failed", seq, step: stopped?.step ?? null, reason: stopped?.reason ?? "", trace_id: stopped?.traceId ?? "" } };
  }

  // ---------------------------------------------------------------- what the phone reads

  turnState(storyId: string): TurnState {
    const turn = this.turns.get(storyId);
    if (turn) return { kind: turn.line, trace_id: turn.traceId };
    const path = this.mac.tree.currentPath(storyId);
    const head = path ? this.mac.tree.entry(path.headEntryId) : null;
    // The end of a Scene a Move left is part of that Move's turn: it is written, or stopped, as the turn.
    if (head && this.mac.states.at(head.id).scene?.closed === "move") {
      const stopped = this.stopped.get(storyId);
      if (stopped) return { kind: "failed", reason: `${LEFT_STEP[stopped.step]}: ${stopped.reason}`, trace_id: stopped.traceId, job: stopped.step };
      if (this.sceneEnds.has(storyId)) return { kind: "writing", trace_id: this.lastTraceFor(storyId) ?? "scene-end" };
    }
    if (!head || !this.waiting(head)) return { kind: "idle" };
    const failure = this.failures.get(storyId);
    if (failure?.headId === head.id) return { kind: "failed", reason: failure.reason, trace_id: failure.traceId, job: failure.job };
    return { kind: "failed", reason: "The Reply was interrupted before it finished. Retry to write it.", trace_id: this.lastTraceFor(storyId) ?? "unknown" };
  }

  /** The newest event a view reflects: a Reply's words arrive whole (docs/adr/0019), so it is always the newest entry. */
  position(storyId: string): string {
    return String(this.newestSeq(storyId));
  }

  newestSeq(storyId: string): number {
    const row = this.mac.db.prepare("SELECT MAX(seq) AS seq FROM entries WHERE story_id = ?").get(storyId) as { seq: number | null };
    return row.seq ?? 0;
  }

  isIdle(storyId: string): boolean {
    return !this.turns.has(storyId) && !this.sceneEnds.has(storyId);
  }

  /** Resolves when the Story has no turn under way, nor a Scene end: for tests and for shutting down cleanly. */
  async settled(storyId: string): Promise<void> {
    for (;;) {
      const turn = this.turns.get(storyId);
      if (turn) {
        await turn.done;
        continue;
      }
      const run = this.sceneEnds.get(storyId);
      if (run) {
        await run.done;
        continue;
      }
      return;
    }
  }

  /**
   * Edits through the Mac's commands reach watching phones (openspec stories: Claude can edit a Story as the player
   * can). A command writes the store from its own process; every [everyMs] this reads SQLite's data_version, which
   * changes only when another connection has written, and for each Story a phone is watching whose current head
   * moved since the last look, says path_changed so the phone reads the Scene again; a Story imported since has its
   * first Outline written. Returns the way to stop.
   */
  watchStore(everyMs = 1000): () => void {
    const version = () => this.mac.db.pragma("data_version", { simple: true }) as number;
    let seen = version();
    const heads = new Map<string, string>();
    const look = () => {
      const now = version();
      const written = now !== seen;
      seen = now;
      // A Story imported since, by `fantasia import`, has its first Outline written before it is played.
      if (written) this.prepareStories();
      for (const storyId of this.bus.eventNames().filter((name): name is string => typeof name === "string" && this.bus.listenerCount(name) > 0)) {
        const head = this.mac.tree.currentPath(storyId)?.headEntryId;
        if (!head) continue;
        const before = heads.get(storyId);
        heads.set(storyId, head);
        if (written && before !== undefined && before !== head) {
          const seq = this.newestSeq(storyId);
          this.emit(storyId, { id: String(seq), event: { kind: "path_changed", seq } });
        }
      }
    };
    const timer = setInterval(look, everyMs);
    return () => clearInterval(timer);
  }

  subscribe(storyId: string, listener: (event: OutgoingEvent) => void): () => void {
    this.bus.on(storyId, listener);
    return () => this.bus.off(storyId, listener);
  }

  /** What a phone that last saw [lastEventId] missed, in order (openspec mac-link: A dropped connection loses nothing). */
  catchUp(storyId: string, lastEventId: string | null, seenPath: string | null = null, seenHead: string | null = null): OutgoingEvent[] {
    const path = this.path(storyId);
    const headGone = seenHead !== null && !this.mac.tree.pathTo(path.headEntryId).some(entry => entry.id === seenHead);
    if ((seenPath !== null && seenPath !== path.id) || headGone) {
      const seq = this.newestSeq(storyId);
      return [{ id: String(seq), event: { kind: "path_changed", seq } }];
    }
    const seenSeq = Number((lastEventId ?? "0").split(".")[0]) || 0;
    const missed: OutgoingEvent[] = this.mac.tree.pathAfter(path.headEntryId, seenSeq).flatMap(entry => {
      const event = entryEvent(this.mac, storyId, entry);
      return event ? [{ id: String(entry.seq), event }] : [];
    });
    const running = this.sceneEnds.get(storyId);
    if (running?.step) {
      const seq = this.newestSeq(storyId);
      missed.push({ id: `${seq}.step.${running.step}`, event: { kind: "scene_end_step", seq, step: running.step } });
    }
    const stopped = this.stopped.get(storyId);
    if (stopped && stopped.seq >= seenSeq) missed.push(this.sceneEndFailed(storyId));
    const turn = this.turns.get(storyId);
    if (turn) {
      // A Reply's words arrive whole (docs/adr/0019): a phone that comes back mid-turn learns what it is doing.
      missed.push(this.started(turn));
    } else {
      const state = this.turnState(storyId);
      const head = this.mac.tree.entry(path.headEntryId);
      if (state.kind === "failed" && head) missed.push(this.failed(head, state.reason ?? "", state.trace_id ?? ""));
    }
    return missed;
  }

  /**
   * Rebuilds the Story's truth from its own text (openspec the-truth: A Story's truth can be rebuilt from its own text):
   * a new Path from the opening keeps every Move, Reply and edit as played, in order; after each Scene the new Scene's
   * end runs, a span the player skipped is lived again from their Move, and the Story's first Outline is written
   * before anything else. The old Path stays as it was. Off-page events of the old Path that the new one no longer has
   * are listed with the later Scenes whose Replies seem to speak of them, for the player to look at.
   *
   * A rebuild that stopped (a model at its limit, the Mac restarted) goes on when given [from], the Path it was
   * rebuilding from: on the Story's current Path, the one that stopped, from the step it owes, copying only what that
   * Path does not have yet.
   */
  async rebuild(storyId: string, progress: (line: string) => void = () => {}, from: string | null = null): Promise<Rebuilt> {
    if (!this.isIdle(storyId) || this.stopped.has(storyId)) throw new LinkError("busy", "The Story is busy; rebuild it when nothing is being written.");
    const source = from ? this.mac.tree.path(from) : this.path(storyId);
    if (!source || source.storyId !== storyId) throw new LinkError("not_found", "That Path is not this Story's.");
    if (from && this.path(storyId).id === source.id) throw new LinkError("invalid", "The Story is on the Path it would be rebuilt from: open the Path that stopped to go on with it.");
    const played = this.mac.tree.pathTo(source.headEntryId);
    const opening = played.findIndex(entry => entry.payload.kind === "scene_opened");
    const first = played[opening];
    if (!first) throw new LinkError("invalid", "The Story has no opening Scene.");
    const copied = (entries: Entry[]) => {
      const at = entries.findIndex(entry => entry.payload.kind === "scene_opened");
      return entries.flatMap((entry, index) => (index > at && !DERIVED.has(entry.payload.kind) && KINDS.has(entry.payload.kind) ? [{ entry, index }] : []));
    };
    const toCopy = copied(played);
    let path: StoryPath;
    if (from) {
      path = this.path(storyId);
    } else {
      path = this.mac.tree.startPath(storyId, first.id, "edited", first.id);
      this.mac.tree.renamePath(path.id, "Rebuilt");
    }
    this.rebuilding.add(storyId);
    let head = path.headEntryId;
    const already = copied(this.mac.tree.pathTo(head));
    const done = already.length;
    // Each entry copied, by its id on the old Path: a Scene a Move opened starts at that Move's copy.
    const ids = new Map(already.map(({ entry }, index) => [toCopy[index]?.entry.id ?? "", entry.id]));
    const settle = async (what: string): Promise<void> => {
      await this.ended(storyId);
      const stopped = this.stopped.get(storyId);
      if (stopped) throw new Error(`${what} stopped at the ${stopped.step}: ${stopped.reason}`);
      head = this.path(storyId).headEntryId;
    };
    const put = (payload: Payload): Entry => {
      const entry = this.mac.tree.append(storyId, head, payload);
      if (!this.mac.tree.moveHead(path.id, head, entry.id)) throw new Error("The Path moved while it was being rebuilt");
      head = entry.id;
      return entry;
    };
    /** A skipped span after the Move [written], lived again as the player's Move asked, when the old Path had one there. */
    const liveSpan = async (written: Entry, index: number): Promise<void> => {
      const next = played[index + 1]?.payload;
      if (written.payload.kind !== "move" || next?.kind !== "world_moved" || !(next as WorldMoved).gap) return;
      const state = this.mac.states.at(written.id);
      const ask = gapWeave(state, written, besideOf(this.mac, storyId, written.id));
      if (!ask || !state.scene) return;
      progress(`Living the span to ${ask.until} again`);
      const record = emptySpan(ask)
        ? { value: { lives: [], threads: [], happened: [], meanwhile: [], on: [], truth: emptyUpdate() }, callId: null, model: null, dropped: [] }
        : await writeWeave(this.models, this.choices("weaver"), { ...ask, beside: besideOf(this.mac, storyId, written.id) }, storyId, `rebuild-${randomUUID().slice(0, 8)}`, new AbortController().signal);
      const woven = put({ kind: "world_moved", scene: state.scene.number, gap: true, from: ask.from, until: ask.until, ...record.value, dropped: record.dropped, callId: record.callId, model: record.model });
      if (record.callId) this.models.attach(record.callId, woven.id);
    };
    try {
      if (!from) {
        progress("Writing the Story's first Outline");
      } else {
        const owed = this.mac.states.at(head);
        const step = owedStep(owed);
        progress(`Going on with the rebuild, from ${!owed.outline ? "the Story's first Outline" : step ? `Scene ${owed.scene?.number ?? ""}'s end` : `entry ${done + 1} of ${toCopy.length}`}`);
      }
      // The first Outline, or the end of the Scene a stopped rebuild owes.
      this.resume(storyId, true);
      await settle(from ? "The rebuild" : "The first Outline");
      if (!this.mac.states.at(head).outline) throw new Error("The Director could not write the Story's first Outline");
      // A Move the stopped rebuild copied, whose skipped span it had not lived yet.
      const last = toCopy[done - 1];
      const stoppedAt = this.mac.tree.entry(head);
      if (last && stoppedAt?.payload.kind === "move") await liveSpan(stoppedAt, last.index);
      for (const { entry, index } of toCopy.slice(done)) {
        const copy = { ...entry.payload } as Record<string, unknown>;
        if (copy.kind === "beat_note") delete copy.taste;
        if (copy.kind === "scene_opened" && typeof copy.startsAt === "string") copy.startsAt = ids.get(copy.startsAt) ?? copy.startsAt;
        const written = put(copy as unknown as Payload);
        ids.set(entry.id, written.id);
        await liveSpan(written, index);
        if (written.payload.kind === "scene_closed") {
          const number = this.mac.states.at(written.id).scene?.number;
          progress(`Ending Scene ${number ?? ""} again`);
          this.endOfScene(storyId);
          await settle(`Scene ${number ?? ""}'s end`);
        }
      }
    } finally {
      this.rebuilding.delete(storyId);
    }
    const rebuilt = this.mac.tree.pathTo(head);
    return { pathId: path.id, scenes: copied(rebuilt).filter(({ entry }) => entry.payload.kind === "scene_closed").length, replaced: replacedEvents(played, rebuilt) };
  }

  /** The head of the Story's current Path. */
  headOf(storyId: string): string {
    return this.path(storyId).headEntryId;
  }

  private path(storyId: string): StoryPath {
    const path = this.mac.tree.currentPath(storyId);
    if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
    return path;
  }

  /** Refuses with the reason while a Reply is being written or a Scene's end runs (openspec paths). */
  private notWriting(storyId: string): void {
    if (this.turns.has(storyId)) throw new LinkError("busy", "A Reply is still being written. Wait until it is done.");
    const run = this.sceneEnds.get(storyId);
    if (run?.preparing) throw new LinkError("busy", "The Story is being prepared: the Director is writing its Outline. Wait until it is ready.");
    if (run) throw new LinkError("busy", "The Scene's end is still being worked out. Wait until the Day View is ready.");
  }

  private pathHead(storyId: string, after: string): StoryPath {
    const path = this.path(storyId);
    this.notWriting(storyId);
    if (path.headEntryId !== after) throw new LinkError("stale_head", "The Story has moved on since you last looked. Nothing was changed.");
    return path;
  }

  private pathOf(storyId: string, pathId: string): StoryPath {
    const path = this.mac.tree.path(pathId);
    if (!path || path.storyId !== storyId) throw new LinkError("not_found", "That Path is not in this Story.");
    return path;
  }

  /** Tells every phone the Story is on another Path, or its Path moved back; a Scene end it owes runs. */
  private pathChanged(storyId: string, head: string, traceId: string): Accepted {
    this.stopped.delete(storyId);
    this.failures.delete(storyId);
    this.turned.delete(storyId);
    this.onceStep.delete(storyId);
    const seq = this.newestSeq(storyId);
    this.emit(storyId, { id: String(seq), event: { kind: "path_changed", seq } });
    this.resume(storyId, this.autoPrepare);
    return { head_entry_id: head, trace_id: traceId };
  }

  /** Whether [head] is a Move still waiting for its Reply: the Move, a Redo, the Gap's World, or the Beat Note. */
  private waiting(head: Entry): boolean {
    if (WAITING.includes(head.payload.kind) || (head.payload.kind === "world_moved" && head.payload.gap)) return true;
    return this.leftAndEnded(head);
  }

  /** A Scene the player's Move left, whose end is done, and whose next Scene that Move opens has still to be written. */
  private leftAndEnded(head: Entry): boolean {
    if (!SCENE_END_KINDS.has(head.payload.kind) && head.payload.kind !== "scene_closed") return false;
    const state = this.mac.states.at(head.id);
    return state.scene?.closed === "move" && nextStep(state) === null;
  }

  private idleHead(storyId: string, after: string): { path: StoryPath; head: Entry } {
    const path = this.path(storyId);
    this.notWriting(storyId);
    const head = this.mac.tree.entry(path.headEntryId);
    if (!head) throw new LinkError("internal", "The Story's head is missing.");
    if (this.waiting(head)) throw new LinkError("busy", "Your last Move is still waiting for its Reply. Retry it first.");
    if (this.stopped.has(storyId)) throw new LinkError("busy", "The Scene's end stopped. Retry it first.");
    if (path.headEntryId !== after) throw new LinkError("stale_head", "The Story has moved on since you last looked. Nothing was changed.");
    return { path, head };
  }

  private write(storyId: string, path: StoryPath, payload: Entry["payload"]): Entry {
    const entry = this.mac.tree.append(storyId, path.headEntryId, payload);
    if (!this.mac.tree.moveHead(path.id, path.headEntryId, entry.id)) throw new LinkError("stale_head", "The Story has moved on since you last looked.");
    this.publish(storyId, entry);
    return entry;
  }

  private lastMove(entryId: string): Entry {
    const move = this.mac.tree.pathTo(entryId).findLast(entry => entry.payload.kind === "move");
    if (!move) throw new LinkError("invalid", "There is no Move to answer.");
    return move;
  }

  // ---------------------------------------------------------------- a turn

  private startTurn(storyId: string, pathId: string, move: Entry, traceId: string, once: Partial<Record<TurnJob, ModelChoice>> = {}): void {
    const abort = new AbortController();
    const path = this.mac.tree.path(pathId);
    const redone = path ? this.mac.tree.pathTo(path.headEntryId).slice(this.mac.tree.pathTo(move.id).length).findLast(entry => entry.payload.kind === "redo") : undefined;
    const redoModel = redone?.payload.kind === "redo" ? redone.payload.model : undefined;
    const turn: Turn = { storyId, pathId, move, once: { ...(redoModel ? { actor: redoModel } : {}), ...once }, step: "writer", line: "looking_back", said: null, told: 0, traceId, abort, done: Promise.resolve() };
    this.turns.set(storyId, turn);
    this.onBusy(true);
    turn.done = this.runTurn(turn).finally(() => {
      this.turns.delete(storyId);
      if (this.turns.size === 0 && this.sceneEnds.size === 0) this.onBusy(false);
    });
  }

  private turnChoices(turn: Turn, job: TurnJob): ModelChoice[] {
    const once = turn.once[job];
    return once ? [once] : this.choices(job, turn.storyId);
  }

  private async runTurn(turn: Turn): Promise<void> {
    const path = this.mac.tree.path(turn.pathId);
    let head = path ? this.mac.tree.entry(path.headEntryId) : null;
    try {
      if (!head) throw new Error("The Path is gone");
      if (head.payload.kind === "move") head = await this.gapStep(turn, head);
      if (head.payload.kind !== "beat_note") {
        head = await this.recordStep(turn, head);
        head = await this.writerStep(turn, head);
      }
      await this.actorStep(turn, head);
    } catch (error) {
      const stoppedAt = this.mac.tree.entry(this.mac.tree.path(turn.pathId)?.headEntryId ?? "") ?? turn.move;
      const reason = `${TURN_FAILED[turn.step]}: ${error instanceof Error ? error.message : String(error)}`;
      this.failures.set(turn.storyId, { headId: stoppedAt.id, reason, traceId: turn.traceId, job: turn.step });
      this.turns.delete(turn.storyId);
      this.emit(turn.storyId, this.failed(stoppedAt, reason, turn.traceId));
    }
  }

  /** A choice later than now leaves a Gap: the World moves on over it before the Writer plans the Scene. */
  private async gapStep(turn: Turn, move: Entry): Promise<Entry> {
    const state = this.mac.states.at(move.id);
    const ask = gapWeave(state, move);
    if (!ask || !state.scene) return move;
    turn.step = "weaver";
    // The Weaver lives the Gap out as the player wants the Story told (docs/adr/0020).
    const record = emptySpan(ask)
      ? { value: { lives: [], threads: [], happened: [], meanwhile: [], on: [], truth: emptyUpdate() }, callId: null, model: null, dropped: [] }
      : await writeWeave(this.models, this.turnChoices(turn, "weaver"), { ...ask, beside: besideOf(this.mac, turn.storyId, move.id) }, turn.storyId, turn.traceId, turn.abort.signal);
    const entry = this.mac.tree.append(turn.storyId, move.id, { kind: "world_moved", scene: state.scene.number, gap: true, from: ask.from, until: ask.until, ...record.value, dropped: record.dropped, callId: record.callId, model: record.model });
    if (!this.mac.tree.moveHead(turn.pathId, move.id, entry.id)) throw new Error("The Path moved while the World moved on");
    if (record.callId) this.models.attach(record.callId, entry.id);
    this.publish(turn.storyId, entry);
    return entry;
  }

  /**
   * A Scene that has run past what is carried word for word is recorded so far by the Chronicler, once, before the
   * Writer plans the next Reply (openspec scenes: A long Scene is recorded as it goes): the player is told the Story is
   * looking back, and from then on the prompts carry the record and the Scene's latest exchanges.
   */
  private async recordStep(turn: Turn, head: Entry): Promise<Entry> {
    const { state, entries } = sceneEntries(this.mac, head.id);
    const moveAt = entries.findIndex(entry => entry.id === turn.move.id);
    const before = moveAt >= 0 ? entries.slice(0, moveAt) : [];
    const through = before.findLast(entry => entry.payload.kind === "reply" || entry.payload.kind === "move" || entry.payload.kind === "scene_opened");
    if (!state.scene || !through || !recordDue(state, before)) return head;
    turn.step = "chronicler";
    this.say(turn, "looking_back");
    const { value, callId, model, dropped } = await writeChronicle(this.models, this.turnChoices(turn, "chronicler"), { state, scene: before, soFar: true }, turn.storyId, turn.traceId, turn.abort.signal);
    const entry = this.mac.tree.append(turn.storyId, head.id, {
      kind: "scene_recorded", scene: state.scene.number, through: through.id, paragraph: value.paragraph, moments: value.moments, told: value.told, known: value.known,
      bonds: value.bonds, engagements: value.engagements, changed: value.changed, truth: value.truth, dropped, callId, model
    });
    if (!this.mac.tree.moveHead(turn.pathId, head.id, entry.id)) throw new Error("The Path moved while the Scene was recorded");
    this.models.attach(callId, entry.id);
    return entry;
  }

  private async writerStep(turn: Turn, head: Entry): Promise<Entry> {
    const state = this.mac.states.at(head.id);
    const { entries } = sceneEntries(this.mac, head.id);
    const moveAt = entries.findIndex(entry => entry.id === turn.move.id);
    turn.step = "actor";
    this.say(turn, "writing");
    const text = turn.move.payload.kind === "move" ? turn.move.payload.text : "";
    const choice = turn.move.payload.kind === "move" ? turn.move.payload.choice ?? null : null;
    const beside = besideOf(this.mac, turn.storyId, head.id);
    const ask = { state, scene: moveAt >= 0 ? entries.slice(0, moveAt) : entries, move: text, choice, beside, path: this.mac.tree.pathTo(head.id) };
    // The Writer may look things up before it plans; the player is told the Story is looking back (openspec presence).
    const { value: { plan, reply }, callId, model } = await composeReply(this.models, this.turnChoices(turn, "actor"), ask, turn.storyId, turn.traceId, turn.abort.signal, () => this.say(turn, "looking_back"));
    const written = this.mac.db.transaction(() => {
      let parent = head;
      const opened = plan.opens
        ? (parent = this.mac.tree.append(turn.storyId, head.id, { kind: "scene_opened", number: (state.scene?.number ?? 0) + 1, title: plan.opens.title, place: plan.opens.place, at: plan.clock, who: plan.here, prose: null, startsAt: turn.move.id, purpose: plan.opens.purpose, exit: plan.opens.exit }))
        : null;
      const note = this.mac.tree.append(turn.storyId, parent.id, {
        kind: "beat_note", plan: plan.plans, here: plan.here, goes: plan.goes, beats: plan.beats, note: plan.note, call: plan.call, intensity: plan.intensity,
        clock: plan.clock, inPlay: plan.inPlay, ...(plan.movesTo ? { place: plan.movesTo } : {}), ...(plan.gathered.length ? { gathered: plan.gathered } : {}), callId, model
      });
      if (!this.mac.tree.moveHead(turn.pathId, head.id, note.id)) throw new Error("The Path moved while the Writer planned its Reply");
      this.drafts.save(note.id, { text: reply, callId, model, beside, rewrites: 0 });
      return { opened, note };
    })();
    // Exact Directions already live beside the Story; generation never invents a second, global instruction.
    this.models.attach(callId, written.note.id);
    if (written.opened) this.publish(turn.storyId, written.opened);
    return written.note;
  }

  /**
   * The Reply is the draft the writing call made (docs/adr/0024). When the Mac is set to have every Reply edited, a
   * model Editor reads it before the player can (docs/adr/0019): slips are set right in place, and a Reply that breaks
   * what is established goes back once with its notes. Otherwise no second model reads it: the player reads every
   * Reply anyway, and Redo is theirs. Either way the one line a Reply must keep is checked in code, for nothing, and a
   * draft that writes the Player Character's part goes back once; one that still breaks is kept with the note.
   */
  private async actorStep(turn: Turn, note: Entry): Promise<void> {
    const { state, entries } = sceneEntries(this.mac, note.id);
    const checkpoint = this.drafts.get(note.id);
    const beside = checkpoint?.beside ?? besideOf(this.mac, turn.storyId, note.id);
    const gathered = note.payload.kind === "beat_note" ? note.payload.gathered ?? [] : [];
    const write = (again?: { draft: string; notes: string[] }) => {
      turn.step = "actor";
      this.say(turn, "writing");
      return writeReply(this.models, this.turnChoices(turn, "actor"), { state, beside, scene: entries, gathered, ...(again ? { again } : {}) }, turn.storyId, turn.traceId, turn.abort.signal);
    };
    const pc = state.playerCharacter;
    const editing = editsEveryReply(this.mac.home);
    const check = async (reply: string): Promise<{ text: string; notes: string[]; callId: string | null }> => {
      if (!editing) {
        const phrase = playerPartIn(state, reply);
        return { text: reply, notes: phrase ? [`Decides for ${pc}: "${phrase}". ${playersPartBreak(pc)}`] : [], callId: null };
      }
      turn.step = "editor";
      this.say(turn, "checking");
      const edit = await editReply(this.models, this.turnChoices(turn, "editor"), { state, beside, scene: entries, reply, present: state.scene?.here ?? [] }, turn.storyId, turn.traceId, turn.abort.signal);
      return { text: edit.text, notes: edit.verdict === "rewrite" ? edit.notes : [], callId: edit.callId };
    };
    let reply: Draft = checkpoint ?? { ...await write(), beside, rewrites: 0 };
    this.drafts.save(note.id, reply);
    let edit = await check(reply.text);
    if (edit.notes.length && reply.rewrites < 1) {
      reply = { ...await write({ draft: reply.text, notes: edit.notes }), beside, rewrites: reply.rewrites + 1 };
      this.drafts.save(note.id, reply);
      edit = await check(reply.text);
    }
    const breaks = edit.notes.length ? edit.notes.join("\n") : null;
    const kept = this.mac.tree.append(turn.storyId, note.id, { kind: "reply", text: edit.text, callId: reply.callId, model: reply.model, ...(breaks ? { note: breaks } : {}) });
    if (!this.mac.tree.moveHead(turn.pathId, note.id, kept.id)) throw new Error("The Path moved while its Reply was being written");
    this.models.attach(reply.callId, kept.id);
    if (edit.callId) this.models.attach(edit.callId, kept.id);
    this.turns.delete(turn.storyId);
    this.publish(turn.storyId, kept);
  }

  /** The turn's line moves on to [line], and the phone is told each time it changes (openspec mac-link). */
  private say(turn: Turn, line: TurnLine): void {
    turn.line = line;
    if (turn.said === line) return;
    turn.said = line;
    const seq = this.newestSeq(turn.storyId);
    this.emit(turn.storyId, { id: `${seq}.step.${++turn.told}`, event: { kind: "turn_step", seq, trace_id: turn.traceId, turn_step: line } });
  }

  /** What a phone that comes back while a Reply is under way is told: a Reply is coming, and what it is doing. */
  private started(turn: Turn): OutgoingEvent {
    const seq = this.newestSeq(turn.storyId);
    return { id: `${seq}.0`, event: { kind: "reply_started", seq, trace_id: turn.traceId, turn_step: turn.line } };
  }

  private failed(head: Entry, reason: string, traceId: string): OutgoingEvent {
    return { id: `${head.seq}.failed`, event: { kind: "reply_failed", seq: head.seq, reason, trace_id: traceId } };
  }

  private publish(storyId: string, entry: Entry): void {
    const event = entryEvent(this.mac, storyId, entry);
    if (event) this.emit(storyId, { id: String(entry.seq), event });
  }

  private emit(storyId: string, event: OutgoingEvent): void {
    this.bus.emit(storyId, event);
  }

  private lastTraceFor(storyId: string): string | null {
    const row = this.mac.db.prepare("SELECT trace_id FROM calls WHERE story_id = ? ORDER BY started_at DESC LIMIT 1").get(storyId) as { trace_id: string } | undefined;
    return row?.trace_id ?? null;
  }
}
