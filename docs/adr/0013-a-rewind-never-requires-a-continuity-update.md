---
status: accepted
---

# A Rewind never requires a Continuity Update

Rewinding a branch no longer creates a Continuity Checkpoint. Continuity after a Rewind is whichever
Continuity Snapshot remains reachable from the new head, together with the exchanges retained after it.

Every Rewind used to mint a checkpoint and make the lineage read-only until a Continuity Engine had
produced a fresh snapshot — several minutes of model work, for an action that only ever removes prose.
Discarding a single failed reply did it. Rewinding one exchange past a checkpoint did it. The cost was
paid every time, and the reasoning behind it turns out not to hold.

The state a Rewind leaves behind is not a special state. `Baseline + retained exchanges` is what the app
is in for fourteen exchanges out of every fifteen, and a Rewind can only make that distance smaller: it
removes exchanges from the end, never adds them, so the gap to the Baseline can shrink or stay equal but
never grow. It therefore cannot outrun the Roleplay Transcript Window either.

What actually keeps continuity correct is the ancestor walk, and it always did. `getNearestSnapshot`
recurses backwards from the head through `parent_turn_id` and takes the shallowest snapshot on that
path, so a snapshot belonging to a discarded exchange is not merely deleted — it is unreachable, even in
the case where its turn row survives because a sibling branch still needs it. Rewinding thirty exchanges
cannot leave the latest snapshot in force, because the latest snapshot is not an ancestor of the new
head. Deleting the checkpoint trigger removes a cost, not a guarantee.

The Update still happens, at the same place in the story. The cadence counter is derived rather than
stored — fifteen minus the committed exchanges since the reachable Baseline — so a Rewind past a
checkpointed exchange leaves fourteen accumulated and the next reply checkpoints. Retreating is free;
only writing story costs a checkpoint. The consequence to live with is that rewinding off a checkpoint
means the very next reply reaches one again, which is arithmetically right and will still feel like
being chased.

Rewind stays unavailable while a Continuity Update is in flight, and becomes available once one has
failed. Blocking the in-flight case means no Rewind can strand a running Mac Host job, so nothing needs
superseding mid-run. Allowing the failed case ends a trap: a failed update locked the lineage, and the
disabled Rewind meant the only exits were retrying the thing that just failed or repairing data from
outside the app. Retreating out of a failure is not bypassing a checkpoint — the exchange that demanded
one is deleted, and the fifteen have to be earned again before another is due.

## Considered Options

- Triggering only when the Rewind lands before the Continuity Baseline is the narrower rule this
  decision started from. It is safe, but it keeps a concept the ancestor walk already makes unnecessary
  and still forces an Update in cases — discarding a failed reply, rewinding one exchange — where
  nothing about continuity has changed.
- Triggering at Rewind time rather than on the next exchange would make the lineage read-only for
  retreating, which is the behaviour being removed.
- Giving the cadence counter slack after a Rewind would soften the checkpoint-chasing effect, but it
  makes the counter stateful and lets continuity be dodged indefinitely by rewinding one exchange at a
  time.

## Consequences

`trigger_reason = "rewind"` loses its only producer, so `old_head_turn_id` and `discarded_exchange_count`
are always null and zero. The wire fields stay — they are protocol v2 surface on both sides and removing
them would cost a coordinated release for nothing — but the **## Rewind** section is deleted from the
engine prompt. It shipped in every request describing a condition that can no longer occur, and prompt
wording has measurably steered engine output.

Rewind stops depending on a Continuity Engine being selected at all, so the engine-choice prompt that
blocked it disappears. Checkpoints created under the old rule are superseded on upgrade, since leaving
them would keep lineages read-only under a rule that no longer exists.
