import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { writeReply } from "../agents/actor.js";
import { writeChronicle } from "../agents/chronicler.js";
import { directionDue, writePlan } from "../agents/director.js";
import { foldDue, writeFold } from "../agents/folder.js";
import { writeWeave } from "../agents/weaver.js";
import { writeBeat } from "../agents/writer.js";
import { AgentFailed } from "../agents/step.js";
import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import { actorOf, backupModels, jobModels, type Job } from "../models/jobs.js";
import { nameIndex, storyName } from "../agents/names.js";
import { checkPerson, portraitExtension } from "./people.js";
import { arcsSet, clockSet, landmarkDropped, landmarkSet, placeSet, premiseSet, replyLengthSet, styleSet, tasteReworded, worldSet, worldStands } from "./story.js";
import type { Models } from "../models/model-call.js";
import type { Accepted, ChooseRequest, SceneEnd, StoryEvent, TurnAccepted, TurnState } from "../protocol/generated/link.js";
import type { StoryPath } from "../store/tree.js";
import { SCENE_END_KINDS, type Entry, type EntryKind, type Payload } from "../story/entries.js";
import type { ModelChoice, Person, SceneEndStep, State } from "../story/state.js";
import { entryEvent, sceneEntries } from "../views/scene.js";
import { chosen } from "./choosing.js";
import { clearable, rewind, tryAnotherWay } from "./paths.js";
import { editEarlier, editInPlace, isLatest, passageOnPath, wordsOf } from "./editing.js";
import { emptySpan, endedScene, gapWeave, nextStep, sceneEndWeave } from "./scene-end.js";

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
  step: TurnJob;
  anchor: Entry | null;
  traceId: string;
  deltas: string[];
  done: Promise<void>;
  abort: AbortController;
}

interface Failure {
  headId: string;
  reason: string;
  traceId: string;
  job: TurnJob;
}

/** Why a Scene's end stopped, and where (docs/adr/0016). */
interface Stopped {
  step: SceneEndStep;
  reason: string;
  traceId: string;
  seq: number;
}

type TurnJob = "weaver" | "writer" | "actor";

/** Heads that mean a Move is still waiting for its Reply. */
const WAITING: readonly EntryKind[] = ["move", "redo", "beat_note"];

/** What a step of the end of a Scene a Move left could not do, as the turn's failure says it. */
const LEFT_STEP: Record<SceneEndStep, string> = {
  chronicler: "The Scene you left could not be recorded",
  director: "The days ahead could not be planned",
  weaver: "The World could not move on",
  folder: "The Story So Far could not be folded"
};

/** The end of a Scene a Move left stopped: the turn waits for Retry without a failure of its own. */
class SceneEndStopped extends Error {}

/**
 * The story engine (docs/adr/0004): the only code that writes entries. Everything a Story does runs in one queue, one
 * step at a time (docs/adr/0016): a turn is the Weaver over a Gap, the Writer, then the Actor; a Scene's end is the
 * Chronicler, the Director when a plan is due, the Weaver, then the Folder when due. Each step reads what the one
 * before wrote. A step that fails on its model and its second model stops where it is, and Retry goes on from there.
 */
export class Engine {
  private readonly turns = new Map<string, Turn>();
  private readonly failures = new Map<string, Failure>();
  /** Per Story, the Scene end under way and the step it is on. */
  private readonly sceneEnds = new Map<string, { done: Promise<void>; step: SceneEndStep | null }>();
  private readonly stopped = new Map<string, Stopped>();
  /** Per Story, the model Retry chose for the Scene end's failed step, for that one try. */
  private readonly onceStep = new Map<string, { step: SceneEndStep; model: ModelChoice }>();
  private readonly bus = new EventEmitter();

  constructor(private readonly mac: Mac, private readonly models: Models, private readonly onBusy: (busy: boolean) => void = () => {}) {
    this.bus.setMaxListeners(0);
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
    this.startTurn(storyId, path.id, move, traceId, model ? { [job]: model } : {});
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

  /** The player's brief, from this moment on the Path (openspec long-run: The player steers with a brief and reactions). */
  setBrief(storyId: string, more: string[], less: string[], after: string, traceId: string): Accepted {
    const path = this.pathHead(storyId, after);
    const clean = (lines: string[]) => lines.map(line => line.trim()).filter(Boolean);
    const entry = this.write(storyId, path, { kind: "brief_set", more: clean(more), less: clean(less) });
    return { head_entry_id: entry.id, trace_id: traceId };
  }

  /** The player's reaction to a played Scene, or its clearing. */
  setReaction(storyId: string, scene: number, reaction: "more" | "less" | null, note: string | null, after: string, traceId: string): Accepted {
    const path = this.pathHead(storyId, after);
    const state = this.mac.states.at(path.headEntryId);
    if (!state.curve.some(item => item.scene === scene)) throw new LinkError("invalid", `Scene ${scene} has not been played on this Path.`);
    const entry = this.write(storyId, path, { kind: "reaction_set", scene, reaction, note: note?.trim() || null });
    return { head_entry_id: entry.id, trace_id: traceId };
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

  /** Delete a lesson from Taste on the Path the player is on (openspec long-run: Taste is short, readable and the player's). */
  removeTaste(storyId: string, line: string, after: string, traceId: string): Accepted {
    const path = this.pathHead(storyId, after);
    const taste = this.mac.states.at(path.headEntryId).taste;
    if (!taste.includes(line)) throw new LinkError("invalid", "That is not a line of Taste on this Path.");
    const entry = this.write(storyId, path, { kind: "taste_set", lines: taste.filter(lesson => lesson !== line) });
    return { head_entry_id: entry.id, trace_id: traceId };
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
  setClock(storyId: string, at: string, weekday: string | null | undefined, after: string, traceId: string): Accepted {
    return this.edited(storyId, after, traceId, state => clockSet(state, at, weekday));
  }

  rewordTaste(storyId: string, line: string, text: string, after: string, traceId: string): Accepted {
    return this.edited(storyId, after, traceId, state => tasteReworded(state, line, text));
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
    const now = this.mac.states.at(head.id).scene;
    const before = this.mac.states.at(move.id).scene;
    const redo = this.mac.db.transaction(() => {
      let parent = move;
      if (now && now.focus !== before?.focus) parent = this.mac.tree.append(storyId, parent.id, { kind: "focus_set", on: now.focus });
      if (now && now.linger !== before?.linger) parent = this.mac.tree.append(storyId, parent.id, { kind: "linger_set", on: now.linger });
      const written = this.mac.tree.append(storyId, parent.id, { kind: "redo", direction: text, remember, ...(model ? { model } : {}) });
      if (!this.mac.tree.moveHead(path.id, head.id, written.id)) throw new LinkError("stale_head", "The Story has moved on since you last looked.");
      return written;
    })();
    this.publish(storyId, redo);
    this.startTurn(storyId, path.id, move, traceId);
    return { move_entry_id: move.id, trace_id: traceId };
  }

  /**
   * The latest Reply, if the head is it or comes only after it: Focus and Linger set since, or the Story closing the
   * Scene and that Scene's end (docs/adr/0015), which a Redo takes off the Path with the Reply.
   */
  private latestReply(head: Entry): Entry | null {
    let entry: Entry | null = head;
    while (entry && SCENE_END_KINDS.has(entry.payload.kind) && entry.parentId) entry = this.mac.tree.entry(entry.parentId);
    while (entry && (entry.payload.kind === "focus_set" || entry.payload.kind === "linger_set") && entry.parentId) entry = this.mac.tree.entry(entry.parentId);
    if (entry?.payload.kind === "scene_closed" && entry.payload.by === "story" && entry.parentId) entry = this.mac.tree.entry(entry.parentId);
    return entry?.payload.kind === "reply" ? entry : null;
  }

  // ---------------------------------------------------------------- a Scene's end (docs/adr/0016)

  /** Queues the end of the Scene the Story's Path has closed: every step it still owes, in order. */
  private endOfScene(storyId: string): void {
    const previous = this.sceneEnds.get(storyId)?.done ?? Promise.resolve();
    const run = { done: Promise.resolve(), step: null as SceneEndStep | null };
    run.done = previous.then(() => this.runSceneEnd(storyId, run)).catch(() => {}).finally(() => {
      if (this.sceneEnds.get(storyId) === run) this.sceneEnds.delete(storyId);
      if (this.sceneEnds.size === 0 && this.turns.size === 0) this.onBusy(false);
    });
    this.sceneEnds.set(storyId, run);
    this.onBusy(true);
  }

  private async runSceneEnd(storyId: string, run: { step: SceneEndStep | null }): Promise<void> {
    if (this.stopped.has(storyId)) return;
    for (;;) {
      const path = this.mac.tree.currentPath(storyId);
      if (!path) return;
      const state = this.mac.states.at(path.headEntryId);
      const step = nextStep(state);
      run.step = step;
      const seq = this.newestSeq(storyId);
      this.emit(storyId, { id: `${seq}.step.${step ?? "done"}`, event: { kind: "scene_end_step", seq, step } });
      if (!step) return this.goOnFromLeaving(storyId);
      const traceId = `${step}-${randomUUID().slice(0, 8)}`;
      try {
        const payload = await this.sceneEndStep(storyId, path.headEntryId, state, step, traceId);
        const entry = this.mac.tree.append(storyId, path.headEntryId, payload);
        if (!this.mac.tree.moveHead(path.id, path.headEntryId, entry.id)) return;
        if ("callId" in payload && payload.callId) this.models.attach(payload.callId, entry.id);
        this.publish(storyId, entry);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const at = this.newestSeq(storyId);
        this.stopped.set(storyId, { step, reason, traceId, seq: at });
        this.emit(storyId, this.sceneEndFailed(storyId));
        return;
      }
    }
  }

  /** One step of a Scene's end: its agent's call, and the entry it writes. */
  private async sceneEndStep(storyId: string, head: string, state: State, step: SceneEndStep, traceId: string): Promise<Payload> {
    const scene = state.scene;
    if (!scene) throw new Error("No Scene has ended");
    const signal = new AbortController().signal;
    const once = this.onceStep.get(storyId);
    if (once?.step === step) this.onceStep.delete(storyId);
    const choices = (job: Job) => (once?.step === step ? [once.model] : this.choices(job));
    switch (step) {
      case "chronicler": {
        const { value, callId, model, dropped } = await writeChronicle(this.models, choices("chronicler"), { state, scene: endedScene(this.mac, head, state) }, storyId, traceId, signal);
        return { kind: "chronicle", scene: scene.number, ...value, dropped, callId, model };
      }
      case "director": {
        const reason = directionDue(state) ?? "A plan is due.";
        const { value, callId, model, dropped } = await writePlan(this.models, choices("director"), state, reason, storyId, traceId, signal);
        return { kind: "director_plan", ...value, reason, afterScene: scene.number, dropped, callId, model };
      }
      case "weaver": {
        const ask = sceneEndWeave(this.mac, head, state);
        if (emptySpan(ask)) return { kind: "world_moved", scene: scene.number, gap: false, from: ask.from, until: ask.until, lives: [], threads: [], happened: [], meanwhile: [], on: state.on, dropped: [], callId: null, model: null };
        const { value, callId, model, dropped } = await writeWeave(this.models, choices("weaver"), ask, storyId, traceId, signal);
        return { kind: "world_moved", scene: scene.number, gap: false, from: ask.from, until: ask.until, ...value, dropped, callId, model };
      }
      case "folder": {
        const due = foldDue(state);
        if (!due) throw new Error("Nothing to fold");
        const { value, callId, model } = await writeFold(this.models, choices("folder"), state, due, storyId, traceId, signal);
        return { kind: "story_folded", into: due.into, count: due.parts.length, from: due.parts[0]?.from ?? state.clock, until: due.parts.at(-1)?.until ?? state.clock, text: value, callId, model };
      }
    }
  }

  /** A job's model and its second model (openspec presence: Nothing fails silently). */
  private choices(job: Job | "actor", storyId?: string): ModelChoice[] {
    const backup = backupModels(this.mac.home)[job];
    if (job === "actor") {
      const own = (storyId ? actorOf(this.mac, storyId) : null) ?? (storyId ? this.mac.states.at(this.path(storyId).headEntryId).actor : null);
      return own ? [own, backup] : [backup];
    }
    return [jobModels(this.mac.home)[job], backup];
  }

  /** Every Story whose Path has a Scene end still owed runs it: for `fantasia serve` when it starts. */
  resumeAll(): void {
    const stories = this.mac.db.prepare("SELECT id FROM stories WHERE before_ledger = 0").all() as { id: string }[];
    for (const story of stories) this.resume(story.id);
  }

  private resume(storyId: string): void {
    const path = this.mac.tree.currentPath(storyId);
    if (!path) return;
    if (nextStep(this.mac.states.at(path.headEntryId))) this.endOfScene(storyId);
    else this.goOnFromLeaving(storyId);
  }

  /** Once the end of a Scene a Move left is done, with no turn waiting on it, that Move opens the next Scene. */
  private goOnFromLeaving(storyId: string): void {
    const path = this.mac.tree.currentPath(storyId);
    const head = path ? this.mac.tree.entry(path.headEntryId) : null;
    if (!path || !head || this.turns.has(storyId) || !this.leftAndEnded(head)) return;
    this.startTurn(storyId, path.id, this.lastMove(head.id), `move-${randomUUID().slice(0, 8)}`);
  }

  /** How the Scene's end stands, for the Day View: the step under way or owed, or where it stopped. */
  sceneEndOf(storyId: string): SceneEnd {
    const stopped = this.stopped.get(storyId);
    if (stopped) return { step: null, failed: { step: stopped.step, reason: stopped.reason, trace_id: stopped.traceId } };
    const running = this.sceneEnds.get(storyId)?.step;
    if (running) return { step: running, failed: null };
    const path = this.mac.tree.currentPath(storyId);
    return { step: path ? nextStep(this.mac.states.at(path.headEntryId)) : null, failed: null };
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
    if (turn) return { kind: "writing", text_so_far: turn.deltas.join(""), trace_id: turn.traceId };
    const path = this.mac.tree.currentPath(storyId);
    const head = path ? this.mac.tree.entry(path.headEntryId) : null;
    // The end of a Scene a Move left is part of that Move's turn: it is written, or stopped, as the turn.
    if (head && this.mac.states.at(head.id).scene?.closed === "move") {
      const stopped = this.stopped.get(storyId);
      if (stopped) return { kind: "failed", reason: `${LEFT_STEP[stopped.step]}: ${stopped.reason}`, trace_id: stopped.traceId, job: stopped.step };
      if (this.sceneEnds.has(storyId)) return { kind: "writing", text_so_far: "", trace_id: this.lastTraceFor(storyId) ?? "scene-end" };
    }
    if (!head || !this.waiting(head)) return { kind: "idle" };
    const failure = this.failures.get(storyId);
    if (failure?.headId === head.id) return { kind: "failed", reason: failure.reason, trace_id: failure.traceId, job: failure.job };
    return { kind: "failed", reason: "The Reply was interrupted before it finished. Retry to write it.", trace_id: this.lastTraceFor(storyId) ?? "unknown" };
  }

  position(storyId: string): string {
    const turn = this.turns.get(storyId);
    if (turn?.anchor && turn.deltas.length > 0) return `${turn.anchor.seq}.${turn.deltas.length}`;
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
   * moved since the last look, says path_changed so the phone reads the Scene again. Returns the way to stop.
   */
  watchStore(everyMs = 1000): () => void {
    const version = () => this.mac.db.pragma("data_version", { simple: true }) as number;
    let seen = version();
    const heads = new Map<string, string>();
    const look = () => {
      const now = version();
      const written = now !== seen;
      seen = now;
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
    const [seqPart, deltaPart] = (lastEventId ?? "0").split(".");
    const seenSeq = Number(seqPart) || 0;
    const seenDeltas = deltaPart === undefined || Number.isNaN(Number(deltaPart)) ? null : Number(deltaPart);
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
      const anchor = turn.anchor;
      if (!anchor) return missed;
      const resumeFrom = anchor.seq === seenSeq && seenDeltas !== null ? seenDeltas : 0;
      if (resumeFrom === 0) missed.push(this.started(turn, anchor));
      turn.deltas.forEach((text, index) => {
        if (index + 1 > resumeFrom) missed.push(this.delta(anchor, index + 1, text, turn.traceId));
      });
    } else {
      const state = this.turnState(storyId);
      const head = this.mac.tree.entry(path.headEntryId);
      if (state.kind === "failed" && head) missed.push(this.failed(head, state.reason ?? "", state.trace_id ?? ""));
    }
    return missed;
  }

  private path(storyId: string): StoryPath {
    const path = this.mac.tree.currentPath(storyId);
    if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
    return path;
  }

  /** Refuses with the reason while a Reply is being written or a Scene's end runs (openspec paths). */
  private notWriting(storyId: string): void {
    if (this.turns.has(storyId)) throw new LinkError("busy", "A Reply is still being written. Wait until it is done.");
    if (this.sceneEnds.has(storyId)) throw new LinkError("busy", "The Scene's end is still being worked out. Wait until the Day View is ready.");
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
    const seq = this.newestSeq(storyId);
    this.emit(storyId, { id: String(seq), event: { kind: "path_changed", seq } });
    this.resume(storyId);
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
    const turn: Turn = { storyId, pathId, move, once: { ...(redoModel ? { actor: redoModel } : {}), ...once }, step: "writer", anchor: null, traceId, deltas: [], abort, done: Promise.resolve() };
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
      if (head.payload.kind !== "beat_note") head = await this.writerStep(turn, head);
      turn.anchor = head;
      await this.actorStep(turn, head);
    } catch (error) {
      if (error instanceof SceneEndStopped) {
        this.turns.delete(turn.storyId);
        return;
      }
      const stoppedAt = this.mac.tree.entry(this.mac.tree.path(turn.pathId)?.headEntryId ?? "") ?? turn.move;
      const what = turn.step === "writer" ? "The Reply could not be planned" : turn.step === "weaver" ? "The time until then could not be moved on" : "The Reply could not be written";
      const reason = `${what}: ${error instanceof Error ? error.message : String(error)}`;
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
    const record = emptySpan(ask)
      ? { value: { lives: [], threads: [], happened: [], meanwhile: [], on: [] }, callId: null, model: null, dropped: [] }
      : await writeWeave(this.models, this.turnChoices(turn, "weaver"), ask, turn.storyId, turn.traceId, turn.abort.signal);
    const entry = this.mac.tree.append(turn.storyId, move.id, { kind: "world_moved", scene: state.scene.number, gap: true, from: ask.from, until: ask.until, ...record.value, dropped: record.dropped, callId: record.callId, model: record.model });
    if (!this.mac.tree.moveHead(turn.pathId, move.id, entry.id)) throw new Error("The Path moved while the World moved on");
    if (record.callId) this.models.attach(record.callId, entry.id);
    this.publish(turn.storyId, entry);
    return entry;
  }

  private async writerStep(turn: Turn, head: Entry): Promise<Entry> {
    const state = this.mac.states.at(head.id);
    const { entries } = sceneEntries(this.mac, head.id);
    const moveAt = entries.findIndex(entry => entry.id === turn.move.id);
    turn.step = "writer";
    const text = turn.move.payload.kind === "move" ? turn.move.payload.text : "";
    const choice = turn.move.payload.kind === "move" ? turn.move.payload.choice ?? null : null;
    const { plan, callId, model } = await writeBeat(this.models, this.turnChoices(turn, "writer"), { state, scene: moveAt >= 0 ? entries.slice(0, moveAt) : entries, move: text, choice }, turn.storyId, turn.traceId, turn.abort.signal);
    if (plan.opens && state.scene && !state.scene.closed) head = await this.leave(turn, head);
    const written = this.mac.db.transaction(() => {
      let parent = head;
      const opened = plan.opens
        ? (parent = this.mac.tree.append(turn.storyId, head.id, { kind: "scene_opened", number: (state.scene?.number ?? 0) + 1, title: plan.opens.title, place: plan.opens.place, at: plan.clock, who: plan.here, prose: null, startsAt: turn.move.id, purpose: plan.opens.purpose, exit: plan.opens.exit }))
        : null;
      const note = this.mac.tree.append(turn.storyId, parent.id, {
        kind: "beat_note", plan: plan.plans, here: plan.here, goes: plan.goes, beats: plan.beats, note: plan.note, call: plan.call, intensity: plan.intensity,
        arcMoved: plan.arcMoved, clock: plan.clock, taste: plan.taste, inPlay: plan.inPlay, ...(plan.movesTo ? { place: plan.movesTo } : {}), callId, model
      });
      if (!this.mac.tree.moveHead(turn.pathId, head.id, note.id)) throw new Error("The Path moved while the Writer planned its Reply");
      return { opened, note };
    })();
    this.models.attach(callId, written.note.id);
    if (written.opened) this.publish(turn.storyId, written.opened);
    return written.note;
  }

  /**
   * The player's Move left the Scene for something else (openspec scenes: Walking out of a Scene): it closes there, and
   * its end runs in turn before the next Scene opens, so that Scene is recorded like any other. A step that stops
   * stops the turn; Retry goes on from it, and the Move then opens the next Scene.
   */
  private async leave(turn: Turn, move: Entry): Promise<Entry> {
    const closed = this.mac.tree.append(turn.storyId, move.id, { kind: "scene_closed", by: "move" });
    if (!this.mac.tree.moveHead(turn.pathId, move.id, closed.id)) throw new Error("The Path moved while the Scene was left");
    this.publish(turn.storyId, closed);
    this.endOfScene(turn.storyId);
    await this.sceneEnds.get(turn.storyId)?.done;
    if (this.stopped.has(turn.storyId)) throw new SceneEndStopped();
    const head = this.mac.tree.entry(this.mac.tree.path(turn.pathId)?.headEntryId ?? "");
    if (!head) throw new Error("The Path is gone");
    return head;
  }

  /**
   * The Actor writes the Reply, streaming it; its second model steps in only when its own failed before writing a
   * word, so a Reply is never two models' words. The Scene closes after it when the Writer said so, and its end runs.
   */
  private async actorStep(turn: Turn, note: Entry): Promise<void> {
    turn.step = "actor";
    this.emit(turn.storyId, this.started(turn, note));
    const { state, entries } = sceneEntries(this.mac, note.id);
    let answer: { text: string; callId: string } | null = null;
    let model: ModelChoice | null = null;
    let reason = "";
    for (const choice of this.turnChoices(turn, "actor")) {
      try {
        answer = await writeReply(this.models, choice, state, entries, turn.storyId, turn.traceId, text => {
          turn.deltas.push(text);
          this.emit(turn.storyId, this.delta(note, turn.deltas.length, text, turn.traceId));
        }, turn.abort.signal);
        model = choice;
        break;
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
        if (turn.deltas.length > 0 || turn.abort.signal.aborted) break;
      }
    }
    if (!answer || !model) throw new AgentFailed(reason);
    const writtenBy = model;
    const written = this.mac.db.transaction(() => {
      const reply = this.mac.tree.append(turn.storyId, note.id, { kind: "reply", text: answer.text, callId: answer.callId, model: writtenBy });
      const closed = state.scene?.call === "end" ? this.mac.tree.append(turn.storyId, reply.id, { kind: "scene_closed", by: "story" }) : null;
      if (!this.mac.tree.moveHead(turn.pathId, note.id, (closed ?? reply).id)) throw new Error("The Path moved while its Reply was being written");
      return { reply, closed };
    })();
    this.models.attach(answer.callId, written.reply.id);
    this.turns.delete(turn.storyId);
    this.publish(turn.storyId, written.reply);
    if (written.closed) {
      this.publish(turn.storyId, written.closed);
      this.endOfScene(turn.storyId);
    }
  }

  private started(turn: Turn, anchor: Entry): OutgoingEvent {
    return { id: `${anchor.seq}.0`, event: { kind: "reply_started", seq: anchor.seq, trace_id: turn.traceId } };
  }

  private delta(anchor: Entry, n: number, text: string, traceId: string): OutgoingEvent {
    return { id: `${anchor.seq}.${n}`, event: { kind: "reply_delta", seq: anchor.seq, text, trace_id: traceId } };
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
