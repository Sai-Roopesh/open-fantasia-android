---
status: accepted
---

# A Continuity Draft is durable and repaired in place

The Continuity Draft an engine authors is stored with the durable job and its typed Continuity Defects.
A corrective run repairs that draft rather than authoring a new state transition from nothing, and a
host restarted mid-checkpoint resumes from the draft it already paid for.

Before this, a validation failure discarded everything. The engine was told what went wrong and asked to
produce the whole transition again — the Story Summary it had written, the scene, every operation that
compiled — because one operation named a handle that did not exist. A Continuity Update costs between
ninety seconds and several minutes of real model work, so throwing away the correct nine tenths to fix
the incorrect tenth was the most expensive possible response to the smallest possible defect. It was
also the least likely to succeed: a stateless regeneration reaches a different draft with a different
set of mistakes, so the second attempt was not a second chance at the same problem.

Repair is section-scoped because the compiler already produces the information that makes it possible.
Every defect names its operation index, its code, and what the compiler could not do with it. Handing
the engine its own draft plus that list turns the corrective run into an edit: keep everything the
defects do not implicate, change only what they name. What survives is the part a person will actually
read.

Durability rather than memory is what makes this survive the failure it most needs to survive. A host
that restarts mid-checkpoint — for a contract change, a crash, or a machine going to sleep — used to
return the job to the queue and begin again from nothing. The draft now outlives the process, so the
work is resumed instead.

The draft holds story prose, so it lives under exactly the retention rules the request does: deleted on
acknowledgement, deleted when unacknowledged content expires, and never present in a diagnostic. A
repair input that would exceed the direct-delivery limit is refused and the run regenerates cleanly,
because a partially delivered draft is worse than no draft at all.

## Considered Options

- Keeping the draft in memory for the life of the run would make a corrective attempt cheaper without
  making a restarted host cheaper, and the restart case is the one that loses whole runs.
- Repairing by re-sending only the failed operations would be smaller still, but the engine needs the
  surrounding draft to judge whether a fix is coherent, and a draft assembled from fragments is a new
  consistency problem rather than a solved one.
- Retrying more times instead of repairing multiplies the cost of a systematic defect without changing
  its outcome, which is what the system already did.

## Consequences

A corrective run is cheaper and likelier to succeed, and a failure becomes explainable: the stored
draft and its defects say exactly what the engine wrote and what the compiler could not accept. Any
future engine gets this without adapter work, because the drafts hook is passed by the host rather than
implemented per adapter.

The spool now holds one more file containing story prose per in-flight Continuity job, under the same
deletion rules as the request. Nothing else about acceptance changes: the compiled snapshot still passes
`validateResponse` on the host and is still re-validated independently on Android.
