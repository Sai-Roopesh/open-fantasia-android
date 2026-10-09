import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { writeReply } from "../agents/actor.js";
import { writeChronicle } from "../agents/chronicler.js";
import { writeWeave } from "../agents/weaver.js";
import { recall } from "../agents/recall.js";
import { writeBeat, WriterFailed } from "../agents/writer.js";
import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import { actorOf, jobModels } from "../models/jobs.js";
import { nameIndex } from "../agents/names.js";
import { writePlan } from "../agents/director.js";
import { directionDue, planForWriter } from "./directing.js";
import { checkPerson, portraitExtension } from "./people.js";
import { arcsSet, clockSet, landmarkDropped, landmarkSet, placeSet, premiseSet, replyLengthSet, styleSet, tasteReworded, worldSet, worldStands } from "./story.js";
import type { Models } from "../models/model-call.js";
import type { Accepted, ChooseRequest, StoryEvent, TurnAccepted, TurnState } from "../protocol/generated/link.js";
import type { StoryPath } from "../store/tree.js";
import type { Entry, EntryKind, Payload } from "../story/entries.js";
import type { ModelChoice, Person, State } from "../story/state.js";
import { entryEvent, sceneEntries } from "../views/scene.js";
import { chronicleAsk, dueChronicle, endedScenesOn, gapsOn, markForRetry, RECORD_TRIES, STEPPED_AWAY_MS } from "./chronicling.js";
import { dueWeave, emptySpan, gapAsk, weaveAsk } from "./weaving.js";
import { chosen } from "./choosing.js";
import { clearable, rewind, tryAnotherWay } from "./paths.js";
import { editEarlier, editInPlace, isLatest, passageOnPath, wordsOf } from "./editing.js";
import { worldOn } from "../story/world.js";

/** A live event and its id on the stream: "<seq>" for an entry, "<seq>.<n>" for what a turn under way says. */
export interface OutgoingEvent {
  id: string;
  event: StoryEvent;
}

/**
 * A turn under way: the Move it answers, the Beat Note its Reply follows once the Writer has written one, and the
 * Reply's words so far, in the order they were sent.
 */
interface Turn {
  storyId: string;
  pathId: string;
  move: Entry;
  /** The model for each of its jobs, taken when it starts (models-screen design decision 6). */
  models: Record<TurnJob, ModelChoice>;
  /** The job working now: the one that failed, if the turn fails. */
  step: TurnJob;
  anchor: Entry | null;
  traceId: string;
  deltas: string[];
  done: Promise<void>;
  abort: AbortController;
}

/** Why the last turn on a Path failed, kept until it is retried: the head it stopped at, the reason, and whose it was. */
interface Failure {
  headId: string;
  reason: string;
  traceId: string;
  job: TurnJob;
}

/** The jobs a turn runs: the Weaver for a Gap, the Writer, then the Actor. */
type TurnJob = "weaver" | "writer" | "actor";

/** Heads that mean a Move is still waiting for its Reply: the Move, a Redo of it, or the Beat Note written for it. */
const WAITING: readonly EntryKind[] = ["move", "redo", "beat_note"];

/**
 * The story engine (docs/adr/0004): the only code that writes entries. A turn writes the Move, asks the Writer for
 * the Beat Note (opening a Scene when the Move does), asks the Actor for the Reply, streams its words out as they come,
 * and writes the Reply, closing the Scene when the Writer called it. The Path's head moves as each entry is written,
 * so whatever fails, everything already written stays and Retry carries on from there.
 *
 * One turn at a time per Story. Anything that changes the Story while a Reply is being written or a Move waits for
 * one, or against a head the Story has moved past, is refused with the reason.
 */
export class Engine {
  private readonly turns = new Map<string, Turn>();
  private readonly failures = new Map<string, Failure>();
  private readonly chronicling = new Map<string, Promise<void>>();
  private readonly weaving = new Map<string, Promise<void>>();
  private readonly directing = new Map<string, Promise<void>>();
  /** Per Story, the Scene end the Director failed to plan after: a plan is due again at the next one (openspec long-run). */
  private readonly directionFailedAt = new Map<string, string>();
  /** Per Story, the Scene end the Weaver could not move the World on from, until Retry (openspec presence). */
  private readonly worldFailures = new Map<string, { scene: string; reason: string; traceId: string; seq: number }>();
  /** Per Story, the model Retry World chose for the Weaver's next try, and only that one (openspec presence). */
  private readonly weaveOnce = new Map<string, ModelChoice>();
  /** Per Story, the Chronicler's call for when the player steps away, restarted by everything the Path gains. */
  private readonly steppingAway = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly bus = new EventEmitter();

  /**
   * [onBusy] hears when the engine starts and stops having work under way, so the Mac can be kept awake while a
   * Reply is being written with the phone locked (openspec presence: The Mac keeps working while the phone is
   * locked).
   */
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
   * Writes the failed Reply again. With a model, the job that failed runs on it for this one try and no setting
   * changes (openspec presence: Nothing fails silently); after an interruption, it is the job that was next.
   */
  retry(storyId: string, traceId: string, model: ModelChoice | null = null): TurnAccepted {
    const path = this.path(storyId);
    if (this.turns.has(storyId)) throw new LinkError("busy", "A Reply is already being written.");
    const head = this.mac.tree.entry(path.headEntryId);
    if (!head || !WAITING.includes(head.payload.kind)) throw new LinkError("invalid", "There is no Move waiting for a Reply.");
    const failure = this.failures.get(storyId);
    this.failures.delete(storyId);
    const move = this.lastMove(head.id);
    const job: TurnJob = failure?.headId === head.id ? failure.job : head.payload.kind === "beat_note" ? "actor" : "writer";
    this.startTurn(storyId, path.id, move, traceId, model ? { [job]: model } : {});
    return { move_entry_id: move.id, trace_id: traceId };
  }

  /**
   * A choice at the Day View (openspec day-view: The player chooses where to be): written as the player's Move, the
   * Gap first, with the choice beside it for the Writer, and the turn runs as for any Move.
   */
  choose(storyId: string, request: ChooseRequest, traceId: string): TurnAccepted {
    const { path } = this.idleHead(storyId, request.after);
    const { choice, text } = chosen(this.mac, path.headEntryId, request);
    const move = this.write(storyId, path, { kind: "move", text, choice });
    this.startTurn(storyId, path.id, move, traceId);
    return { move_entry_id: move.id, trace_id: traceId };
  }

  /** The player ends the Scene at the latest Reply, and the Day View opens (openspec scenes: The player ends a Scene). */
  endScene(storyId: string, after: string, traceId: string): Accepted {
    const { path } = this.idleHead(storyId, after);
    if (this.mac.states.at(path.headEntryId).scene?.closed) throw new LinkError("invalid", "This Scene has already ended.");
    const closed = this.write(storyId, path, { kind: "scene_closed", by: "player" });
    this.chronicle(storyId);
    this.direct(storyId);
    this.weave(storyId);
    return { head_entry_id: closed.id, trace_id: traceId };
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
    const name = nameIndex(Object.values(state.people)).get(person.trim().toLocaleLowerCase());
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
  setPerson(storyId: string, person: Omit<Person, "portrait">, after: string, traceId: string, creating: boolean): Accepted {
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
    const name = nameIndex(Object.values(state.people)).get(person.trim().toLocaleLowerCase());
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
    const name = nameIndex(Object.values(state.people)).get(person.trim().toLocaleLowerCase());
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
    return this.edited(storyId, after, traceId, (state, head) => landmarkSet(state, worldStands(state, worldOn(this.mac, head).until), landmark, creating));
  }

  dropLandmark(storyId: string, name: string, after: string, traceId: string): Accepted {
    return this.edited(storyId, after, traceId, (state, head) => landmarkDropped(state, worldStands(state, worldOn(this.mac, head).until), name));
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

  /** The latest Reply, if the head is it or comes only after it: Focus and Linger set since, or the Story closing the Scene. */
  private latestReply(head: Entry): Entry | null {
    let entry: Entry | null = head;
    while (entry && (entry.payload.kind === "focus_set" || entry.payload.kind === "linger_set") && entry.parentId) entry = this.mac.tree.entry(entry.parentId);
    if (entry?.payload.kind === "scene_closed" && entry.payload.by === "story" && entry.parentId) entry = this.mac.tree.entry(entry.parentId);
    return entry?.payload.kind === "reply" ? entry : null;
  }

  /**
   * Queues the Chronicler for whatever the Story's current Path owes it (docs/adr/0004): a Scene that ended, or twelve
   * exchanges of an open one. It runs in the background, one run at a time per Story, and never holds up a turn; its
   * records hang off the Path (docs/adr/0007). A run that fails is kept in its call and is due again next time.
   */
  chronicle(storyId: string, retryNow = false): void {
    const previous = this.chronicling.get(storyId) ?? Promise.resolve();
    this.chronicling.set(storyId, previous.then(() => this.chronicleDue(storyId, retryNow)).catch(() => {}));
  }

  /** Queues the Chronicler for every Story, for `fantasia serve` when it starts. */
  chronicleAll(): void {
    const stories = this.mac.db.prepare("SELECT id FROM stories").all() as { id: string }[];
    // Starting again is a fresh chance for a Scene that failed while the Mac or a model could not be reached.
    for (const story of stories) this.chronicle(story.id, true);
  }

  /**
   * Queues the Weaver for the Scene end the Story's current Path owes it (docs/adr/0010): after the Director, so the
   * World moves on toward the plan, and the Day View waits for it. One run at a time per Story; a failure is kept,
   * shown on the Day View, and run again only when the player asks (retryWorld) or the Mac starts again.
   */
  weave(storyId: string): void {
    const previous = this.weaving.get(storyId) ?? Promise.resolve();
    this.weaving.set(storyId, previous.then(async () => {
      await this.directed(storyId);
      await this.weaveDue(storyId);
    }).catch(() => {}));
  }

  /**
   * Queues the Director for the Scene end the Story's current Path is at (docs/adr/0010: after the Chronicler, before
   * the Weaver). It plans only when a plan is due (engine/directing.ts); its plan hangs off the Scene's end
   * (docs/adr/0007). A failure is kept in its call, the last plan stays in force, and a plan is due again next time.
   */
  direct(storyId: string): void {
    const previous = this.directing.get(storyId) ?? Promise.resolve();
    this.directing.set(storyId, previous.then(() => this.directDue(storyId)).catch(() => {}));
  }

  /** Queues the Director for every Story, for `fantasia serve` when it starts. */
  directAll(): void {
    const stories = this.mac.db.prepare("SELECT id FROM stories").all() as { id: string }[];
    for (const story of stories) this.direct(story.id);
  }

  /** Resolves when the Story's Director queue is empty: for tests and for shutting down cleanly. */
  async directed(storyId: string): Promise<void> {
    let waitingOn: Promise<void> | undefined;
    do {
      waitingOn = this.directing.get(storyId);
      await waitingOn;
    } while (waitingOn !== this.directing.get(storyId));
  }

  private async directDue(storyId: string): Promise<void> {
    const dueNow = () => {
      const path = this.mac.tree.currentPath(storyId);
      return path ? directionDue(this.mac, path.headEntryId, this.directionFailedAt.get(storyId) ?? null) : null;
    };
    // Nothing due: the Weaver goes ahead at once, without waiting for the record.
    if (!dueNow()) return;
    // The Director plans from the newest record of what happened and the Bonds, so it waits for the Chronicler, then
    // looks again: a Scene may have ended since this run was queued.
    await this.chronicled(storyId);
    const due = dueNow();
    if (!due) return;
    const traceId = `direct-${randomUUID().slice(0, 8)}`;
    const model = jobModels(this.mac.home).director;
    try {
      const { value, callId, dropped } = await writePlan(this.models, model, due.ask, storyId, traceId, new AbortController().signal);
      const record = this.mac.tree.append(storyId, due.closing.id, { kind: "director_plan", ...value, dropped, callId, model });
      this.models.attach(callId, record.id);
      this.directionFailedAt.delete(storyId);
    } catch {
      // The call and why it failed are kept with it; the Writer goes on with the last plan until the next Scene's end.
      this.directionFailedAt.set(storyId, due.closing.id);
    }
  }

  /** Queues the Weaver for every Story, for `fantasia serve` when it starts. */
  weaveAll(): void {
    const stories = this.mac.db.prepare("SELECT id FROM stories").all() as { id: string }[];
    for (const story of stories) this.weave(story.id);
  }

  /** Resolves when the Story's Weaver queue is empty: for tests and for shutting down cleanly. */
  async woven(storyId: string): Promise<void> {
    let waitingOn: Promise<void> | undefined;
    do {
      waitingOn = this.weaving.get(storyId);
      await waitingOn;
    } while (waitingOn !== this.weaving.get(storyId));
  }

  /** The player asks the Weaver to try again after it failed (openspec presence: Nothing fails silently). */
  /** Moves the World on again; with a model, the Weaver runs on it for this one try and no setting changes. */
  retryWorld(storyId: string, traceId: string, model: ModelChoice | null = null): Accepted {
    const path = this.path(storyId);
    if (!this.worldFailures.has(storyId)) throw new LinkError("invalid", "The World is not waiting on anything.");
    this.worldFailures.delete(storyId);
    if (model) this.weaveOnce.set(storyId, model);
    this.weave(storyId);
    return { head_entry_id: path.headEntryId, trace_id: traceId };
  }

  /** Why the World could not move on from the end of the Scene [scene] opened, if it could not. */
  worldFailure(storyId: string, scene: string): { reason: string; traceId: string } | null {
    const failure = this.worldFailures.get(storyId);
    return failure?.scene === scene ? { reason: failure.reason, traceId: failure.traceId } : null;
  }

  private async weaveDue(storyId: string): Promise<void> {
    const path = this.mac.tree.currentPath(storyId);
    const due = path ? dueWeave(this.mac, path.headEntryId) : null;
    if (!due || this.worldFailures.get(storyId)?.scene === due.scene.id) return;
    const traceId = `weave-${randomUUID().slice(0, 8)}`;
    const model = this.weaveOnce.get(storyId) ?? jobModels(this.mac.home).weaver;
    this.weaveOnce.delete(storyId);
    const ask = weaveAsk(this.mac, due);
    // A short span with nothing in it moves nothing, and needs no call (docs/adr/0010).
    if (emptySpan(ask)) {
      const record = this.mac.tree.append(storyId, due.through.id, { kind: "world_moved", scene: due.scene.id, from: due.from, until: due.until, lives: [], threads: [], happened: [], meanwhile: [], happenings: [], callId: null, model: null });
      this.emit(storyId, { id: String(record.seq), event: { kind: "world_moved", seq: record.seq } });
      return;
    }
    try {
      const { value, callId, dropped } = await writeWeave(this.models, model, ask, storyId, traceId, new AbortController().signal);
      const record = this.mac.tree.append(storyId, due.through.id, { kind: "world_moved", scene: due.scene.id, from: due.from, until: due.until, ...value, dropped, callId, model });
      this.models.attach(callId, record.id);
      this.emit(storyId, { id: String(record.seq), event: { kind: "world_moved", seq: record.seq } });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const seq = this.newestSeq(storyId);
      this.worldFailures.set(storyId, { scene: due.scene.id, reason, traceId, seq });
      this.emit(storyId, this.worldFailed(seq, reason, traceId));
    }
  }

  private worldFailed(seq: number, reason: string, traceId: string): OutgoingEvent {
    return { id: `${seq}.world_failed`, event: { kind: "world_failed", seq, reason, trace_id: traceId } };
  }

  /** Resolves when the Story's Chronicler queue is empty: for tests and for shutting down cleanly. */
  async chronicled(storyId: string): Promise<void> {
    let waitingOn: Promise<void> | undefined;
    do {
      waitingOn = this.chronicling.get(storyId);
      await waitingOn;
    } while (waitingOn !== this.chronicling.get(storyId));
  }

  private async chronicleDue(storyId: string, retryNow: boolean): Promise<void> {
    const traceId = `chronicle-${randomUUID().slice(0, 8)}`;
    const tried = new Set<string>();
    for (;;) {
      const path = this.mac.tree.currentPath(storyId);
      const due = path ? dueChronicle(this.mac, path.headEntryId, new Date(), retryNow) : null;
      // On a start, each waiting Scene gets one fresh try, not three in a row.
      if (!due || tried.has(due.scene.id + due.through.id)) return;
      tried.add(due.scene.id + due.through.id);
      const model = jobModels(this.mac.home).chronicler;
      try {
        const { value, callId, dropped } = await writeChronicle(this.models, model, chronicleAsk(this.mac, due), storyId, traceId, new AbortController().signal);
        const record = this.mac.tree.append(storyId, due.through.id, { kind: "chronicle", scene: due.scene.id, summary: value.summary, sceneEnded: due.sceneEnded, moments: value.moments, told: value.told, known: value.known, bonds: value.bonds, dropped, callId, model });
        this.models.attach(callId, record.id);
      } catch (error) {
        // A record that could not be made is noted and holds up nothing: the next due Scene is recorded, and this one is
        // tried again once another Scene has ended, until it is given up (lasting-records design decision 4).
        const head = this.mac.tree.currentPath(storyId)?.headEntryId ?? due.through.id;
        const attempts = (gapsOn(this.mac, head).get(due.scene.id)?.attempts ?? 0) + 1;
        const reason = error instanceof Error ? error.message : String(error);
        this.mac.tree.append(storyId, due.through.id, { kind: "record_gap", scene: due.scene.id, attempts, reason, endedScenes: endedScenesOn(this.mac, head), givenUp: attempts >= RECORD_TRIES });
      }
    }
  }

  /**
   * The player asks for a Scene's record to be tried again (openspec outside-the-scene: A gap in the record): a fresh
   * gap with no tries makes it due at once, and it gets three more tries (lasting-records design decision 4).
   */
  retryRecord(storyId: string, after: string, sceneNumber: number, traceId: string): Accepted {
    const path = this.path(storyId);
    if (path.headEntryId !== after) throw new LinkError("stale_head", "The Story has moved on since you last looked. Nothing was changed.");
    markForRetry(this.mac, storyId, after, sceneNumber);
    this.chronicle(storyId);
    return { head_entry_id: after, trace_id: traceId };
  }

  /** What the Story's current Path is doing: writing a Reply, failed to, or nothing. */
  turnState(storyId: string): TurnState {
    const turn = this.turns.get(storyId);
    if (turn) return { kind: "writing", text_so_far: turn.deltas.join(""), trace_id: turn.traceId };
    const path = this.mac.tree.currentPath(storyId);
    const head = path ? this.mac.tree.entry(path.headEntryId) : null;
    if (!head || !WAITING.includes(head.payload.kind)) return { kind: "idle" };
    const failure = this.failures.get(storyId);
    if (failure?.headId === head.id) return { kind: "failed", reason: failure.reason, trace_id: failure.traceId, job: failure.job };
    // The host stopped while this Move waited; the call that was answering it says why, if it got that far.
    return { kind: "failed", reason: "The Reply was interrupted before it finished. Retry to write it.", trace_id: this.lastTraceFor(storyId) ?? "unknown" };
  }

  /** The newest event a phone reading the Story now has seen: the newest entry, or the Reply's words so far. */
  position(storyId: string): string {
    const turn = this.turns.get(storyId);
    if (turn?.anchor && turn.deltas.length > 0) return `${turn.anchor.seq}.${turn.deltas.length}`;
    return String(this.newestSeq(storyId));
  }

  /** The newest entry written in the Story, on any Path. */
  newestSeq(storyId: string): number {
    const row = this.mac.db.prepare("SELECT MAX(seq) AS seq FROM entries WHERE story_id = ?").get(storyId) as { seq: number | null };
    return row.seq ?? 0;
  }

  isIdle(storyId: string): boolean {
    return !this.turns.has(storyId);
  }

  /** Resolves when the Story has no turn under way: for tests and for shutting down cleanly. */
  async settled(storyId: string): Promise<void> {
    while (this.turns.has(storyId)) await this.turns.get(storyId)?.done;
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

  /**
   * What a phone that last saw [lastEventId] missed, in order: the entries written after it on the current Path,
   * then the turn under way from where that phone left it. Nothing is missing and nothing is repeated
   * (openspec mac-link: A dropped connection loses nothing). Every change to a Path is an entry with a newer seq,
   * so a phone that missed a Redo is sent the Redo, and reads the Scene again.
   */
  catchUp(storyId: string, lastEventId: string | null, seenPath: string | null = null, seenHead: string | null = null): OutgoingEvent[] {
    const path = this.path(storyId);
    // A phone showing another Path, or a head no longer on this one (edited away, rewound past), reads the Scene
    // again before anything else: the entries after its last event are not a continuation of what it shows.
    const headGone = seenHead !== null && !this.mac.tree.pathTo(path.headEntryId).some(entry => entry.id === seenHead);
    if ((seenPath !== null && seenPath !== path.id) || headGone) {
      const seq = this.newestSeq(storyId);
      return [{ id: String(seq), event: { kind: "path_changed", seq } }];
    }
    const [seqPart, deltaPart] = (lastEventId ?? "0").split(".");
    const seenSeq = Number(seqPart) || 0;
    const seenDeltas = deltaPart === undefined ? null : Number(deltaPart);
    const missed: OutgoingEvent[] = this.mac.tree.pathAfter(path.headEntryId, seenSeq)
      .flatMap(entry => {
        const event = entryEvent(this.mac, storyId, entry);
        return event ? [{ id: String(entry.seq), event }] : [];
      });
    // The World moving on is a record beside the Path, so it is not among the entries: say it too.
    const moved = this.mac.tree.recordsOn(path.headEntryId, "world_moved").filter(entry => entry.seq > seenSeq).at(-1);
    if (moved) missed.push({ id: String(moved.seq), event: { kind: "world_moved", seq: moved.seq } });
    const stuck = this.worldFailures.get(storyId);
    if (stuck && stuck.seq >= seenSeq) missed.push(this.worldFailed(stuck.seq, stuck.reason, stuck.traceId));

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

  /** Refuses with the reason while a Reply is being written (openspec paths: A Path changes only between Replies). */
  private notWriting(storyId: string): void {
    if (this.turns.has(storyId)) throw new LinkError("busy", "A Reply is still being written. Wait until it is done.");
  }

  /** The Path the player is on, for a change of Path: refused mid-Reply or when the phone has not seen the latest. */
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

  /** Tells every phone the Story is on another Path, or its Path moved back; anything due on it runs. */
  private pathChanged(storyId: string, head: string, traceId: string): Accepted {
    const seq = this.newestSeq(storyId);
    this.emit(storyId, { id: String(seq), event: { kind: "path_changed", seq } });
    this.chronicle(storyId);
    this.direct(storyId);
    this.weave(storyId);
    return { head_entry_id: head, trace_id: traceId };
  }

  /** The Path and its head, refusing with the reason when the Story cannot take a change now. */
  private idleHead(storyId: string, after: string): { path: StoryPath; head: Entry } {
    const path = this.path(storyId);
    if (this.turns.has(storyId)) throw new LinkError("busy", "A Reply is still being written. Wait until it is done.");
    const head = this.mac.tree.entry(path.headEntryId);
    if (!head) throw new LinkError("internal", "The Story's head is missing.");
    if (WAITING.includes(head.payload.kind)) throw new LinkError("busy", "Your last Move is still waiting for its Reply. Retry it first.");
    if (path.headEntryId !== after) throw new LinkError("stale_head", "The Story has moved on since you last looked. Nothing was changed.");
    return { path, head };
  }

  /** Writes [payload] after the Path's head, moves the head to it, and sends it to every phone. */
  private write(storyId: string, path: StoryPath, payload: Entry["payload"]): Entry {
    const entry = this.mac.tree.append(storyId, path.headEntryId, payload);
    if (!this.mac.tree.moveHead(path.id, path.headEntryId, entry.id)) throw new LinkError("stale_head", "The Story has moved on since you last looked.");
    this.publish(storyId, entry);
    return entry;
  }

  /** The Move the Reply at or after [entryId] answers: the latest Move on the Path up to it. */
  private lastMove(entryId: string): Entry {
    const move = this.mac.tree.pathTo(entryId).findLast(entry => entry.payload.kind === "move");
    if (!move) throw new LinkError("invalid", "There is no Move to answer.");
    return move;
  }

  /**
   * Starts a turn with the models it runs on: the settings, the Story's own Actor, a Redo's model for its Reply, and
   * [once], what a Retry chose for the job that failed.
   */
  private startTurn(storyId: string, pathId: string, move: Entry, traceId: string, once: Partial<Record<TurnJob, ModelChoice>> = {}): void {
    const abort = new AbortController();
    const settings = jobModels(this.mac.home);
    const path = this.mac.tree.path(pathId);
    const redone = path ? this.mac.tree.pathTo(path.headEntryId).slice(this.mac.tree.pathTo(move.id).length).findLast(entry => entry.payload.kind === "redo") : undefined;
    const redoModel = redone?.payload.kind === "redo" ? redone.payload.model : undefined;
    const actor = redoModel ?? actorOf(this.mac, storyId) ?? this.mac.states.at(move.id).actor;
    const models: Record<TurnJob, ModelChoice> = { weaver: settings.weaver, writer: settings.writer, actor, ...once };
    const turn: Turn = { storyId, pathId, move, models, step: "writer", anchor: null, traceId, deltas: [], abort, done: Promise.resolve() };
    this.turns.set(storyId, turn);
    if (this.turns.size === 1) this.onBusy(true);
    turn.done = this.runTurn(turn).finally(() => {
      this.turns.delete(storyId);
      if (this.turns.size === 0) this.onBusy(false);
    });
  }

  private async runTurn(turn: Turn): Promise<void> {
    const path = this.mac.tree.path(turn.pathId);
    let head = path ? this.mac.tree.entry(path.headEntryId) : null;
    try {
      if (!head) throw new Error("The Path is gone");
      if (head.payload.kind === "move") await this.gapStep(turn, head);
      if (head.payload.kind !== "beat_note") head = await this.writerStep(turn, head);
      turn.anchor = head;
      await this.actorStep(turn, head);
    } catch (error) {
      const stoppedAt = this.mac.tree.entry(this.mac.tree.path(turn.pathId)?.headEntryId ?? "") ?? turn.move;
      const reason = error instanceof WriterFailed
        ? `The Reply could not be planned. ${error.message}`
        : `The Reply could not be written: ${error instanceof Error ? error.message : String(error)}`;
      this.failures.set(turn.storyId, { headId: stoppedAt.id, reason, traceId: turn.traceId, job: turn.step });
      this.turns.delete(turn.storyId);
      this.emit(turn.storyId, this.failed(stoppedAt, reason, turn.traceId));
    }
  }

  /**
   * A choice later than now leaves a Gap: the World moves on over it before the Writer plans the Scene, so what he
   * missed has happened and the people involved know (openspec day-view: Missing something has consequences). Its
   * record hangs off the Move; a Retry after a failure weaves it again only if it is not there.
   */
  private async gapStep(turn: Turn, move: Entry): Promise<void> {
    if (this.mac.tree.recordsOn(move.id, "world_moved").some(record => record.parentId === move.id)) return;
    const ask = gapAsk(this.mac, move);
    const scene = ask?.state.scene;
    if (!ask || !scene) return;
    turn.step = "weaver";
    const model = turn.models.weaver;
    const { value, callId, dropped } = await writeWeave(this.models, model, ask, turn.storyId, turn.traceId, new AbortController().signal);
    const record = this.mac.tree.append(turn.storyId, move.id, { kind: "world_moved", scene: scene.openedBy, from: ask.from, until: ask.until, ...value, dropped, callId, model });
    this.models.attach(callId, record.id);
  }

  /** The Writer reads the Move and plans the Reply; its Beat Note, and any Scene it opens, are written together. */
  private async writerStep(turn: Turn, head: Entry): Promise<Entry> {
    const state = this.mac.states.at(head.id);
    const { entries } = sceneEntries(this.mac, head.id);
    const moveAt = entries.findIndex(entry => entry.id === turn.move.id);
    turn.step = "writer";
    const model = turn.models.writer;
    const text = turn.move.payload.kind === "move" ? turn.move.payload.text : "";
    const { plan, callId } = await writeBeat(this.models, model,
      { state, scene: moveAt >= 0 ? entries.slice(0, moveAt) : entries, move: text, direction: state.pendingDirection, recall: recall(this.mac, head.id, state.scene?.here ?? []), world: worldOn(this.mac, head.id), choice: turn.move.payload.kind === "move" ? turn.move.payload.choice ?? null : null, plan: planForWriter(this.mac, head.id) },
      turn.storyId, turn.traceId, turn.abort.signal);

    const written = this.mac.db.transaction(() => {
      let parent = head;
      const opened = plan.opens
        ? (parent = this.mac.tree.append(turn.storyId, head.id, {
          kind: "scene_opened", number: (state.scene?.number ?? 0) + 1, title: plan.opens.title, place: plan.opens.place, at: plan.clock,
          who: plan.here, prose: null, startsAt: turn.move.id, purpose: plan.opens.purpose, exit: plan.opens.exit
        }))
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

  /** The Actor writes the Reply to the Beat Note's Move, streaming it; the Scene closes after it when the Writer said so. */
  private async actorStep(turn: Turn, note: Entry): Promise<void> {
    turn.step = "actor";
    this.emit(turn.storyId, this.started(turn, note));
    const { state, entries } = sceneEntries(this.mac, note.id);
    const answer = await writeReply(this.models, state, entries, recall(this.mac, note.id, state.scene?.here ?? []), worldOn(this.mac, note.id), turn.storyId, turn.traceId, text => {
      turn.deltas.push(text);
      this.emit(turn.storyId, this.delta(note, turn.deltas.length, text, turn.traceId));
    }, turn.abort.signal, turn.models.actor);
    const written = this.mac.db.transaction(() => {
      const reply = this.mac.tree.append(turn.storyId, note.id, { kind: "reply", text: answer.text, callId: answer.callId, model: turn.models.actor });
      const closed = state.scene?.call === "end" ? this.mac.tree.append(turn.storyId, reply.id, { kind: "scene_closed", by: "story" }) : null;
      if (!this.mac.tree.moveHead(turn.pathId, note.id, (closed ?? reply).id)) throw new Error("The Path moved while its Reply was being written");
      return { reply, closed };
    })();
    this.models.attach(answer.callId, written.reply.id);
    this.turns.delete(turn.storyId);
    this.publish(turn.storyId, written.reply);
    if (written.closed) this.publish(turn.storyId, written.closed);
    this.chronicle(turn.storyId);
    this.direct(turn.storyId);
    this.weave(turn.storyId);
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
    this.untilSteppedAway(storyId);
  }

  /**
   * Queues the Chronicler for a little after the player could have stepped away: by then it records the open Scene,
   * if nothing has been played since (dueChronicle). It never keeps the Mac's process running.
   */
  private untilSteppedAway(storyId: string): void {
    clearTimeout(this.steppingAway.get(storyId));
    const timer = setTimeout(() => this.chronicle(storyId), STEPPED_AWAY_MS + 60_000);
    timer.unref?.();
    this.steppingAway.set(storyId, timer);
  }

  private emit(storyId: string, event: OutgoingEvent): void {
    this.bus.emit(storyId, event);
  }

  private lastTraceFor(storyId: string): string | null {
    const row = this.mac.db.prepare("SELECT trace_id FROM calls WHERE story_id = ? ORDER BY started_at DESC LIMIT 1").get(storyId) as { trace_id: string } | undefined;
    return row?.trace_id ?? null;
  }
}
