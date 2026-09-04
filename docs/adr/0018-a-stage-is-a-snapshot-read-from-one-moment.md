---
status: accepted
---

# A Stage is a Snapshot read from one moment

A Continuity Snapshot is an archive: independently valid, complete, permanent. A Roleplay Generation
Request needs a working set: current, small, about this beat. These are different obligations, and the
Snapshot was serving both by being rendered whole into every prompt.

Measured on one thread, that cost 96,500 tokens per reply. 88% of it was accumulated state and 2.3%
described how to write. Four of its 304 entity records were in the room.

The Stage is the missing half. It is a deterministic projection of the Snapshot taken for one reply, and
it decides resolution rather than membership: every entity and every Cast Member appears at some tier,
so the archive stays wholly reachable while prose detail goes to the people in the scene. It carries no
model, for the reason the Continuity Compiler carries none — a lossy judgment in this position would be
a new way to lose continuity.

| Tier | Who | What reaches the model |
|---|---|---|
| On stage | Present in the Snapshot, or placed in the current location | The complete record |
| In the wings | The rest of the Cast Roster, anyone related to someone present, anyone an open thread names | Name, aliases, kind |
| Index | Everyone else the story knows | Name |

Salience never decides membership, only order. A record cannot leave a tier for having been away a
while; it leaves only for being the least recently used record in a section that has run out of room,
and Cast Members are exempt even from that. Nothing is ever dropped silently: a budget that bites
reports what it moved.

## What this supersedes in ADR-0014, and what it does not

ADR-0014 holds that the Roleplay Context is total. Its argument is about *schema* completeness — a field
must not vanish because a serializer dropped it or a call site forgot it — and that guarantee is
untouched. The prompt types still declare no defaults, and the completeness tests still fail when a
field is carried and never rendered.

What changes is that a *record* now has a resolution. ADR-0014 also required the full Cast Roster on
every call, because hand-authored Cast Seeds were reaching the model as bare names for a thread's first
fifteen exchanges. That concern is met more cheaply than by sending twenty complete profiles to describe
a room holding four people: roster *membership* stays complete on every call, with a line naming each
member and stating they are real and speakable, while roster *profiles* follow the scene.

Three safeguards keep the original defect from returning by another door.

- **No scene, no tiering.** A thread before its first Continuity Update has no presence to read, and a
  Snapshot may say nobody is anywhere. When nothing is on stage, everything is.
- **A small roster is sent whole.** Tiering twenty profiles saved 15,829 tokens; tiering four saves
  nothing and costs the model the ensemble it is about to write. The floor is a size, not a count.
- **The Active Speaker is not an input to the projection.** Selecting a different speaker must leave the
  system prompt byte-identical or the provider prompt cache is lost on every speaker change, which
  ADR-0007 depends on. A speaker the scene does not hold is described in full in the per-turn reply
  control, where volatile things belong.

## Budgets

ADR-0007 already holds that a request too large to deliver fails visibly and no adapter may quietly
truncate it. That protected the whole request and nothing inside it, so the share of the prompt
describing how to write slid from meaningful to 2.3% with nothing positioned to notice. Each section now
has a ceiling and an owner. Exceeding one demotes the least salient records a tier and says so, which is
a bounded loss of detail rather than an unbounded loss of instruction.

The timeline section is capped by recency rather than importance, and its heading changed to say so. It
had promised "recent high-importance beats" while shipping every reachable event, and the engine had
rated 85 of 139 at 5/5, so importance had stopped ranking anything.

## Consequences

Measured on the same thread, after the identity repair of ADR-0010's fifth rule and with this projection:

| Section | Before | After |
|---|---|---|
| `durable_state` | 203,222 | 83,883 |
| `cast_roster` | 63,318 | 31,793 |
| `off_stage` | — | 1,450 |
| System prompt | 342,992 | ~162,700 |

Roughly 53% of the system prompt, and the instruction share rises from 2.3% to about 5%. The remaining
`cast_roster` is three hand-authored profiles of people actually in the scene, which is the shape that
was wanted.
