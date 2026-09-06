# Memory Hierarchy Plan

## Outcome

A Continuity Snapshot reaches a stable size and stays there, however long a story runs. Nothing is
lost when it does.

Today the Snapshot only grows. Measured on one thread at 535 exchanges: 306,574 characters, of which
`entity_state` is 169,044 across 24 people, and it gains roughly 11,700 characters per Continuity
Update. The Continuity Engine's own input is 289,751 characters, 89% of which is the world it already
wrote and 11% the new evidence it exists to analyse.

The cause is structural rather than incidental. Three parts of the Snapshot are rewritten in full at
every update and are stable at their ceilings. Five parts merge by handle, are never re-examined, and
grow without limit. `story_summary` carries 535 exchanges in 9,287 characters; `entity_state` carries
the same 535 exchanges in 169,044. Same engine, same story, 18× the size — because rewriting forces
selection and merging never asks.

This plan gives the merged categories the mechanism the rewritten ones already have.

## Locked Domain Rules

- The Continuity Snapshot remains an independently valid, complete account. Bounding it must not make
  it partial.
- Nothing is deleted to save space. A fact leaves the live set only by being absorbed into prose that
  supersedes it.
- The Continuity Engine never handles identifiers. Compaction is semantic; the Continuity Compiler
  keeps identity, as it does for every other operation. See ADR-0008 and ADR-0010.
- A Cast Member is never compacted out of existence. Cast Seeds are authoritative input and are
  projected, never rewritten. See ADR-0010.
- Compaction is a Continuity Compiler concern, not a Roleplay Model concern. No roleplay reply is
  delayed by it.
- A failed or malformed compaction leaves the entity exactly as it was. Absence means unchanged, as it
  does for every other draft operation.
- Retained Roleplay Exchanges are never rewritten, never summarized in place, and never deleted by this
  mechanism. They are the record.
- Every threshold in this plan is a rendering and compaction policy, not stored state. Changing one
  must not require rewriting a stored Snapshot.

## The three tiers

The vocabulary is deliberate: two of these already exist and are not being built.

| Tier | What it is | Where it lives now | Bounded? |
|---|---|---|---|
| **Working State** | What every Continuity Update reads and writes | `world_snapshots.world_state` | no — this plan bounds it |
| **Entity Account** | Prose superseding facts no longer worth carrying individually | does not exist | new, bounded by ceiling |
| **The Record** | Every Roleplay Exchange, verbatim, forever | `chat_turns` | yes, and already correct |

The Record needs no construction. Room already stores every exchange verbatim and branch-valid. What it
lacks is reachability: the only verbatim memory a model ever sees is the fifteen-exchange Roleplay
Transcript Window, which is a fixed recency slice rather than a retrieval. Making it reachable is Phase
2 and is specified but not built by this plan.

## Entity Account

Each Continuity Entity gains one field:

- `account: String` — a bounded prose statement of what is established about this entity, into which
  compacted facts are folded. Ceiling 4,000 characters. Empty until an entity is first compacted.

An Entity Account is written the way `story_summary` is written: replaced whole, never appended to.
That is the property that makes it stable, and it is the only property that matters here.

An Account is not a description. It says what the story established, in the register the fact buckets
used — what this person believes, wants, conceals, and can do — with the detail that no longer earns a
row of its own.

## Compaction Contract

A new operation joins the state-transition algebra:

- `compact_entity` — `handle`, `account`, and `retire` (the fact handles the account now supersedes).

Rules the Continuity Compiler enforces:

1. `handle` must resolve to an existing entity. An unresolvable handle is a recoverable defect and the
   operation is dropped.
2. Every handle in `retire` must belong to the named entity. One that does not is dropped with a
   recoverable defect; the rest of the operation still applies.
3. `account` replaces the entity's account entirely. An empty account with a non-empty `retire` is a
   recoverable defect and the whole operation is dropped — facts are never retired into nothing.
4. Facts named in `retire` are removed from their buckets. No other fact is touched.
5. A fact belonging to a Cast Seed's locked fields is never retired.
6. Compaction never creates, renames, merges, or retires an entity.

The engine is asked to compact at most **three** entities per Continuity Update, chosen by the host and
named in the request, so the work is bounded and the engine is not asked to survey the world.

## Selection

The host selects compaction candidates deterministically, from state it already maintains:

- an entity is a candidate when its serialized size exceeds **6,000 characters**;
- candidates are ordered by size descending, with salience ascending as the tie-break;
- the first three are named in the request as `compaction_candidates`.

Size leads rather than salience, and the measurement is why. On the thread this plan was written
against, all four candidates have a salience age of zero: the entities that accumulate most are the
entities that appear most, so the main cast is never stale and salience cannot separate them. It still
earns its place as the tie-break, and it is the right signal for a large entity the story has left
behind. But the primary signal is size, because size is the problem.

The threshold is calibrated, not guessed. On that thread it selects 4 of 24 entities holding 86% of
`entity_state`; the remaining 20 average 1,219 characters and are never touched.

If no entity exceeds the threshold, no candidate is named and the engine is not asked to compact.

## What the engine is told

`PROMPT.md` gains a section that is symmetric with the ones that already exist. The asymmetry being
corrected is explicit: today adding is free and encouraged (*"That is not permission to write little"*),
while removal must cite an exchange ordinal as justification. Nothing has ever asked the engine to
reconsider what it already wrote.

The instruction states that a compaction candidate's facts have outgrown their usefulness as separate
rows, that the account must carry everything the retired facts established, and that a fact still doing
work — one a scene could turn on — is kept rather than retired.

## Persistence Shape

- `EntityState` gains `account: String = ""`. Tolerant default, so existing snapshots decode unchanged.
- No migration. An absent account is an entity never compacted, which is the correct reading of every
  snapshot written before this change.
- `PromptWorldState` carries `account` and renders it, because it is story content that a Roleplay
  Model must read. Unlike `salience`, it is not bookkeeping.
- `draft.schema.json` gains the `compact_entity` operation and a 4,000 `maxLength` on `account`.

## Prompt-Cache Invariants

Unchanged. Compaction alters `durable_state`, which already changes at every accepted Continuity
Update, and never the static prefix. No new per-turn volatility is introduced.

## Verification

The plan is satisfied when all of these hold.

**Bounding.** Replaying a thread's real snapshot through twenty synthetic Continuity Updates that each
add facts at the observed rate produces a snapshot whose size plateaus. Growth over the last five
updates must be under 2% per update. Today it is unbounded; this is the acceptance criterion the plan
exists for.

**Nothing lost.** After compaction, for every retired fact: its body's distinctive content appears in
the entity's account. Asserted as a fixture test over a hand-written case, not as a similarity metric.

**No entity lost.** Entity count before compaction equals entity count after. No Cast Member's entity
is ever a candidate for retirement.

**Failure is safe.** A `compact_entity` with an unknown handle, an empty account, a foreign fact
handle, or malformed JSON leaves the entity byte-identical and reports a recoverable defect. The
Continuity Update still succeeds.

**Idempotence.** Compiling the same draft twice against the same baseline produces the same snapshot.

**Determinism of selection.** The same snapshot always yields the same three candidates in the same
order.

**Engine input shrinks.** The evidence projection for the measured thread falls below 200,000
characters, from 289,751 today.

## Phase 2 — reaching the Record

Specified here so the tier boundary is designed rather than discovered, and deliberately not built by
this plan.

The Record is complete and unreachable past fifteen exchanges. [Fidelity Before
Structure](https://arxiv.org/pdf/2601.00821) finds verbatim chunks beat extracted artifacts on recall
accuracy, which means an Entity Account is a lossy tier by construction and should be reachable past.

Phase 2 adds retrieval over `chat_turns` for the Roleplay Model, scoped to the branch lineage the Stage
already resolves, so a scene can reach an exchange from two hundred turns ago rather than only its
compacted residue. It is a retrieval problem, not a memory problem, and it does not change any contract
in this plan.

## Out of scope

- Replacing the Continuity Engine, the Compiler, or the Snapshot. The measured comparison against
  published memory systems put this architecture ahead on determinism, identity handling, branching and
  fiction-shaped state; the hierarchy is what it lacked.
- Vector search, embeddings, or a graph store.
- Any change to the Roleplay Transcript Window, Scene Intent, Story Direction, or the Stage.
