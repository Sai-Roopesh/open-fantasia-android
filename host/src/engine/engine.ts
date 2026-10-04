import { EventEmitter } from "node:events";
import { writeReply } from "../agents/actor.js";
import { LinkError } from "../link/errors.js";
import type { Mac } from "../mac.js";
import { ModelCallFailed, type Models } from "../models/model-call.js";
import type { StoryEvent, TurnAccepted, TurnState } from "../protocol/generated/link.js";
import type { Entry } from "../story/entries.js";
import { entryEvent, sceneEntries } from "../views/scene.js";

/** A live event and its id on the stream: "<seq>" for an entry, "<seq>.<n>" for what a turn under way says. */
export interface OutgoingEvent {
  id: string;
  event: StoryEvent;
}

/** A Reply being written: the Move it answers, and its words so far, in the order they were sent. */
interface Turn {
  storyId: string;
  pathId: string;
  move: Entry;
  traceId: string;
  deltas: string[];
  done: Promise<void>;
  abort: AbortController;
}

/** Why the last turn on a Path failed, kept until it is retried. */
interface Failure {
  moveId: string;
  reason: string;
  traceId: string;
}

/**
 * The story engine (docs/adr/0004): the only code that writes entries. A turn writes the Move, asks the Actor for
 * the Reply, streams its words out as they come, and writes the Reply. One turn at a time per Story's Path; a Move
 * that arrives while a Reply is being written, or against a head the Story has moved past, is refused with the
 * reason. A failed Reply leaves the Move as the head, so nothing the player wrote is lost and Retry needs no
 * clean-up.
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
    const path = this.mac.tree.currentPath(storyId);
    if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
    if (this.turns.has(storyId)) throw new LinkError("busy", "A Reply is still being written. Send your Move when it is done.");
    const head = this.mac.tree.entry(path.headEntryId);
    if (head?.payload.kind === "move") throw new LinkError("busy", "Your last Move is still waiting for its Reply. Retry it first.");
    if (path.headEntryId !== after) throw new LinkError("stale_head", "The Story has moved on since you last looked. Your Move was not sent.");
    if (!text.trim()) throw new LinkError("invalid", "A Move needs some words.");

    const move = this.mac.tree.append(storyId, path.headEntryId, { kind: "move", text });
    this.mac.tree.moveHead(path.id, path.headEntryId, move.id);
    this.publish(storyId, move);
    this.startReply(storyId, path.id, move, traceId);
    return { move_entry_id: move.id, trace_id: traceId };
  }

  retry(storyId: string, traceId: string): TurnAccepted {
    const path = this.mac.tree.currentPath(storyId);
    if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
    if (this.turns.has(storyId)) throw new LinkError("busy", "A Reply is already being written.");
    const move = this.mac.tree.entry(path.headEntryId);
    if (move?.payload.kind !== "move") throw new LinkError("invalid", "There is no Move waiting for a Reply.");
    this.failures.delete(storyId);
    this.startReply(storyId, path.id, move, traceId);
    return { move_entry_id: move.id, trace_id: traceId };
  }

  /** What the Story's current Path is doing: writing a Reply, failed to, or nothing. */
  turnState(storyId: string): TurnState {
    const turn = this.turns.get(storyId);
    if (turn) return { kind: "writing", text_so_far: turn.deltas.join(""), trace_id: turn.traceId };
    const path = this.mac.tree.currentPath(storyId);
    const head = path ? this.mac.tree.entry(path.headEntryId) : null;
    if (head?.payload.kind !== "move") return { kind: "idle" };
    const failure = this.failures.get(storyId);
    if (failure?.moveId === head.id) return { kind: "failed", reason: failure.reason, trace_id: failure.traceId };
    // The host stopped while this Move waited; the call that was writing its Reply says why, if it got that far.
    return { kind: "failed", reason: "The Reply was interrupted before it finished. Retry to write it.", trace_id: this.lastTraceFor(storyId) ?? "unknown" };
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
   * (openspec mac-link: A dropped connection loses nothing).
   */
  catchUp(storyId: string, lastEventId: string | null): OutgoingEvent[] {
    const path = this.mac.tree.currentPath(storyId);
    if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
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
      const resumeFrom = turn.move.seq === seenSeq && seenDeltas !== null ? seenDeltas : 0;
      if (resumeFrom === 0) missed.push(this.started(turn));
      turn.deltas.forEach((text, index) => {
        if (index + 1 > resumeFrom) missed.push(this.delta(turn, index + 1, text));
      });
    } else {
      const state = this.turnState(storyId);
      const head = this.mac.tree.entry(path.headEntryId);
      if (state.kind === "failed" && head) missed.push({ id: `${head.seq}.failed`, event: { kind: "reply_failed", seq: head.seq, reason: state.reason ?? "", trace_id: state.trace_id ?? "" } });
    }
    return missed;
  }

  private startReply(storyId: string, pathId: string, move: Entry, traceId: string): void {
    const abort = new AbortController();
    const turn: Turn = { storyId, pathId, move, traceId, deltas: [], abort, done: Promise.resolve() };
    this.turns.set(storyId, turn);
    if (this.turns.size === 1) this.onBusy(true);
    this.emit(storyId, this.started(turn));
    turn.done = this.writeReply(turn).finally(() => {
      this.turns.delete(storyId);
      if (this.turns.size === 0) this.onBusy(false);
    });
  }

  private async writeReply(turn: Turn): Promise<void> {
    try {
      const { state, entries } = sceneEntries(this.mac, turn.move.id);
      const answer = await writeReply(this.models, state, entries, turn.storyId, turn.traceId, text => {
        turn.deltas.push(text);
        this.emit(turn.storyId, this.delta(turn, turn.deltas.length, text));
      }, turn.abort.signal);
      const reply = this.mac.tree.append(turn.storyId, turn.move.id, { kind: "reply", text: answer.text, callId: answer.callId, model: state.actor });
      this.models.attach(answer.callId, reply.id);
      if (!this.mac.tree.moveHead(turn.pathId, turn.move.id, reply.id)) throw new Error("The Path moved while its Reply was being written");
      this.turns.delete(turn.storyId);
      this.publish(turn.storyId, reply);
    } catch (error) {
      const reason = error instanceof ModelCallFailed
        ? `The Reply could not be written: ${error.message}`
        : `The Reply could not be written: ${error instanceof Error ? error.message : String(error)}`;
      this.failures.set(turn.storyId, { moveId: turn.move.id, reason, traceId: turn.traceId });
      this.turns.delete(turn.storyId);
      this.emit(turn.storyId, { id: `${turn.move.seq}.failed`, event: { kind: "reply_failed", seq: turn.move.seq, reason, trace_id: turn.traceId } });
    }
  }

  private started(turn: Turn): OutgoingEvent {
    return { id: `${turn.move.seq}.0`, event: { kind: "reply_started", seq: turn.move.seq, trace_id: turn.traceId } };
  }

  private delta(turn: Turn, n: number, text: string): OutgoingEvent {
    return { id: `${turn.move.seq}.${n}`, event: { kind: "reply_delta", seq: turn.move.seq, text } };
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
