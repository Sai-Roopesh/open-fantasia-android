import { EventEmitter } from "node:events";
import { writeReply } from "../agents/actor.js";
import { writeBeat, WriterFailed } from "../agents/writer.js";
import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import { jobModels } from "../models/jobs.js";
import type { Models } from "../models/model-call.js";
import type { Accepted, StoryEvent, TurnAccepted, TurnState } from "../protocol/generated/link.js";
import type { StoryPath } from "../store/tree.js";
import type { Entry, EntryKind } from "../story/entries.js";
import { entryEvent, sceneEntries } from "../views/scene.js";

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
  anchor: Entry | null;
  traceId: string;
  deltas: string[];
  done: Promise<void>;
  abort: AbortController;
}

/** Why the last turn on a Path failed, kept until it is retried: the head it stopped at, and the reason. */
interface Failure {
  headId: string;
  reason: string;
  traceId: string;
}

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

  retry(storyId: string, traceId: string): TurnAccepted {
    const path = this.path(storyId);
    if (this.turns.has(storyId)) throw new LinkError("busy", "A Reply is already being written.");
    const head = this.mac.tree.entry(path.headEntryId);
    if (!head || !WAITING.includes(head.payload.kind)) throw new LinkError("invalid", "There is no Move waiting for a Reply.");
    this.failures.delete(storyId);
    const move = this.lastMove(head.id);
    this.startTurn(storyId, path.id, move, traceId);
    return { move_entry_id: move.id, trace_id: traceId };
  }

  /** The player ends the Scene at the latest Reply, and the Day View opens (openspec scenes: The player ends a Scene). */
  endScene(storyId: string, after: string, traceId: string): Accepted {
    const { path } = this.idleHead(storyId, after);
    if (this.mac.states.at(path.headEntryId).scene?.closed) throw new LinkError("invalid", "This Scene has already ended.");
    const closed = this.write(storyId, path, { kind: "scene_closed", by: "player" });
    return { head_entry_id: closed.id, trace_id: traceId };
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
  redo(storyId: string, after: string, direction: string | null, remember: boolean, traceId: string): TurnAccepted {
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
      const written = this.mac.tree.append(storyId, parent.id, { kind: "redo", direction: text, remember });
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

  /** What the Story's current Path is doing: writing a Reply, failed to, or nothing. */
  turnState(storyId: string): TurnState {
    const turn = this.turns.get(storyId);
    if (turn) return { kind: "writing", text_so_far: turn.deltas.join(""), trace_id: turn.traceId };
    const path = this.mac.tree.currentPath(storyId);
    const head = path ? this.mac.tree.entry(path.headEntryId) : null;
    if (!head || !WAITING.includes(head.payload.kind)) return { kind: "idle" };
    const failure = this.failures.get(storyId);
    if (failure?.headId === head.id) return { kind: "failed", reason: failure.reason, trace_id: failure.traceId };
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
  catchUp(storyId: string, lastEventId: string | null): OutgoingEvent[] {
    const path = this.path(storyId);
    const [seqPart, deltaPart] = (lastEventId ?? "0").split(".");
    const seenSeq = Number(seqPart) || 0;
    const seenDeltas = deltaPart === undefined ? null : Number(deltaPart);
    const missed: OutgoingEvent[] = this.mac.tree.pathAfter(path.headEntryId, seenSeq)
      .flatMap(entry => {
        const event = entryEvent(this.mac, storyId, entry);
        return event ? [{ id: String(entry.seq), event }] : [];
      });

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

  private startTurn(storyId: string, pathId: string, move: Entry, traceId: string): void {
    const abort = new AbortController();
    const turn: Turn = { storyId, pathId, move, anchor: null, traceId, deltas: [], abort, done: Promise.resolve() };
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
      if (head.payload.kind !== "beat_note") head = await this.writerStep(turn, head);
      turn.anchor = head;
      await this.actorStep(turn, head);
    } catch (error) {
      const stoppedAt = this.mac.tree.entry(this.mac.tree.path(turn.pathId)?.headEntryId ?? "") ?? turn.move;
      const reason = error instanceof WriterFailed
        ? `The Reply could not be planned. ${error.message}`
        : `The Reply could not be written: ${error instanceof Error ? error.message : String(error)}`;
      this.failures.set(turn.storyId, { headId: stoppedAt.id, reason, traceId: turn.traceId });
      this.turns.delete(turn.storyId);
      this.emit(turn.storyId, this.failed(stoppedAt, reason, turn.traceId));
    }
  }

  /** The Writer reads the Move and plans the Reply; its Beat Note, and any Scene it opens, are written together. */
  private async writerStep(turn: Turn, head: Entry): Promise<Entry> {
    const state = this.mac.states.at(head.id);
    const { entries } = sceneEntries(this.mac, head.id);
    const moveAt = entries.findIndex(entry => entry.id === turn.move.id);
    const model = jobModels(this.mac.home).writer;
    const text = turn.move.payload.kind === "move" ? turn.move.payload.text : "";
    const { plan, callId } = await writeBeat(this.models, model,
      { state, scene: moveAt >= 0 ? entries.slice(0, moveAt) : entries, move: text, direction: state.pendingDirection },
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
        kind: "beat_note", plan: plan.plans, here: plan.here, beats: plan.beats, note: plan.note, call: plan.call, intensity: plan.intensity,
        arcMoved: plan.arcMoved, clock: plan.clock, taste: plan.taste, callId, model
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
    this.emit(turn.storyId, this.started(turn, note));
    const { state, entries } = sceneEntries(this.mac, note.id);
    const answer = await writeReply(this.models, state, entries, turn.storyId, turn.traceId, text => {
      turn.deltas.push(text);
      this.emit(turn.storyId, this.delta(note, turn.deltas.length, text, turn.traceId));
    }, turn.abort.signal);
    const written = this.mac.db.transaction(() => {
      const reply = this.mac.tree.append(turn.storyId, note.id, { kind: "reply", text: answer.text, callId: answer.callId, model: state.actor });
      const closed = state.scene?.call === "end" ? this.mac.tree.append(turn.storyId, reply.id, { kind: "scene_closed", by: "story" }) : null;
      if (!this.mac.tree.moveHead(turn.pathId, note.id, (closed ?? reply).id)) throw new Error("The Path moved while its Reply was being written");
      return { reply, closed };
    })();
    this.models.attach(answer.callId, written.reply.id);
    this.turns.delete(turn.storyId);
    this.publish(turn.storyId, written.reply);
    if (written.closed) this.publish(turn.storyId, written.closed);
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
