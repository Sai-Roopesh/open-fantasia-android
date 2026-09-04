---
status: accepted
---

# An edit owes a Continuity Update only when it moves the Baseline

Rewriting a committed assistant reply creates a Continuity Checkpoint only when the edit moves the
Continuity Baseline. Editing prose the Baseline never saw leaves continuity already correct, and the
lineage stays open.

Every edit used to demand a Continuity Update. Fixing a typo in the newest reply cost the same minutes
of model work as rewriting the exchange a Snapshot was built from, and it made the lineage read-only in
between. Most of those Updates rebuilt a Snapshot that had not changed.

Editing already does the right thing with identity. It clones the edited exchange and everything after
it under fresh identifiers, so the originals stop being ancestors of the new head and the Baseline
becomes the last Snapshot strictly before the edit. When that is the Snapshot the branch was already
using, the edit changed nothing the Baseline had recorded. Continuity is `Baseline + retained exchanges`,
which is the ordinary state between checkpoints, and the same ancestor walk that makes ADR-0013 safe
makes this safe.

An edit is not a Rewind, and the difference decides the rule. A Rewind only removes exchanges, so the
distance from Baseline to head can only shrink; that is why it never owes an Update. An edit keeps every
descendant and can move the Baseline backwards, so the distance can grow. Once it passes fifteen,
exchanges sit outside the Roleplay Transcript Window and inside no Snapshot, and that prose is simply
lost to the model. Worse, a Baseline built from text that has since been rewritten holds facts the story
no longer supports.

So the test is whether the Baseline moves, which covers both harms at once. Editing an exchange after
the Baseline leaves it in place and owes nothing. Editing the checkpointed exchange itself, or anything
before it, drops the Baseline to an older Snapshot and owes an Update. The narrower rule of watching
only the checkpointed reply would miss the more damaging case, where a Snapshot keeps asserting
consequences of prose that no longer exists.

Because most edits owe nothing, an edit no longer requires a Continuity Engine to have been chosen. The
choice is requested only when the Baseline actually moves.

## Considered Options

- Triggering on every edit is what the code did. It is safe and it is wrong most of the time, since the
  Baseline usually does not move.
- Triggering only when the edited exchange is the one that reached the checkpoint is narrower and easier
  to describe, but it ignores every earlier exchange the Snapshot was also built from.
- Never triggering would match the Rewind rule, but an edit can move the Baseline backwards past the
  transcript window, which a Rewind cannot, and it can leave a Snapshot describing prose that is gone.

## Consequences

Editing prose after the Baseline is now immediate and free, which is where most edits land. Editing at
or before the Baseline behaves as it always has.

Timeline rows generated for the cloned exchanges disappear with their original identifiers whether or
not an Update runs. When one runs it rebuilds them. When none runs they are rebuilt at the next cadence
checkpoint, which covers those exchanges anyway, and the beats themselves stay in the transcript
throughout.

The predicate is exposed so the interface can ask before acting, and the same walk backs both it and the
edit itself, so the answer cannot differ between them.
