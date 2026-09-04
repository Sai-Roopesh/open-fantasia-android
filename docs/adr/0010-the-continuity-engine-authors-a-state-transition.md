---
status: accepted
---

# The Continuity Engine authors a state transition

The Continuity Engine authors a semantic state transition. The Mac Host compiles that transition over
the authoritative baseline into a complete Continuity Snapshot. Android independently validates the
result. This completes and generalizes ADR-0008, which removed identifier transcription from two
fields while leaving the engine responsible for reproducing the entire snapshot around them.

ADR-0008 diagnosed the structural problem correctly and then applied the remedy too narrowly. Asking a
model to re-emit host-owned data byte-for-byte, and validating the result atomically, is a failure mode
regardless of which field carries it. A discovered Cast Member's `first_seen_turn_id` was one instance.
A dropped Cast Seed is another, and it is the one that is now blocking lineages: a checkpoint measured
at roughly nine minutes was discarded repeatedly because a roster of about sixty kilobytes of manually
authored prose came back missing a single member. Dropped entities, orphaned placements, and dangling
relationship references are the same failure waiting for a longer transcript, because `world_state` has
always been a complete rewrite of the baseline and every reference in it is checked atomically.

The engine is good at exactly one thing here: reading a transcript and judging what changed. It is bad
at bulk transcription, and bulk transcription is most of what the response envelope asked of it. So the
engine now emits a Continuity Draft describing only what it authored, and the Continuity Compiler
applies that draft to the baseline. The engine cannot drop a Cast Seed because Cast Seeds are not part
of its output. It cannot corrupt metadata it never writes. It cannot break a reference using an
identifier it never sees.

## The state-transition algebra

Every part of a Continuity Snapshot is governed by exactly one update rule.

| State category | Update rule |
|---|---|
| Story Summary, Scene Summary, Latest Beat, narrative timestamp, transition type | Replaced completely by model-authored prose |
| Current location, adjacent locations, presence, placement, current emotion | Authored as a complete replace-set for the current scene; the compiler clears the complement |
| Entities, relationships, locations, edges, facts, threads | Merged by Model-facing Handle; removal requires an explicit operation |
| Cast Seed lineage, provenance and locked fields | Always projected from authoritative input, never from the draft |
| A Cast Seed's unlocked fields | Editable through the same operations as any other Cast Member |
| Discovered Cast Members | Added and updated through semantic operations; the Host assigns identity |
| Timeline events | New checkpoint events only, cited by exchange ordinal |
| Salience of every merged record | Set to the new version when this update touched the record, carried forward otherwise; Cast Members are always current |

## Salience, the rule that lets state settle

The merge rule above only ever adds. Removal exists as `retract_fact`, `retire_entity` and
`resolve_thread`, and nothing has ever asked the engine to use them, so in practice nothing was ever
removed. One thread reached 304 entity records, 139 timeline beats and ten simultaneous open objectives,
and the prompt built from it spent 88% of itself on state while 2.3% of it described how to write.
A memory with no consolidation rule becomes a landfill, and this one had none.

Salience records the snapshot version at which the story last had anything to do with each entity,
relationship and thread. A record this update touched — named by an operation, present in the scene,
cited by a timeline event, or still discussed by the rewritten prose — becomes current. One it ignored
keeps the version it last mattered at. Age is `metadata.version - salience[id]`.

It is only a signal. Nothing is deleted, and nothing about the Continuity Snapshot's defining property
changes: it remains an independently valid, complete account. What salience enables is a later decision
about resolution, taken where the prompt is built rather than where truth is stored, which is why the
threshold is deliberately not recorded here. A stored snapshot never has to be rewritten to change it.

Cast Members are exempt and always current. A character a person wrote by hand does not become less real
for being off-screen a while, and without that exemption no tiering built on this signal would be safe to
trust. Salience lives beside the records rather than inside them, because `entity_state` is serialized
into the roleplay prompt verbatim and a field added there would sit among a character's secrets as though
it were one of them.
| Envelope identity, versions and hashes | Written exclusively by the Host |

Omission means unchanged, never delete — with one deliberate exception, which is the second row.

Presence and placement cannot be delta-merged. `is_present` lives on the entity, `entity_placements`
is a parallel array, and both are checked referentially on the host and again on Android. Under a pure
merge, a character who walks out of a scene stays present until the engine remembers to say otherwise,
and remembering-to-say-otherwise is precisely the reliability property this decision removes from the
engine's job. So the scene projection keeps full-rewrite semantics: the draft names everyone present
now, and the compiler marks everyone else absent. The slice is small, the engine authors it fresh
anyway, and it makes staleness structurally impossible rather than a matter of diligence. It also
removes the need for a `clear_placement` operation, because clearing is what omission already means
inside a replace-set.

Entities absent from the scene keep their last recorded emotion rather than having it cleared. An
absent person's inner state is not observable from the transcript, and inventing a neutral value would
write a fact the evidence does not support.

A Cast Seed is split across two rows rather than frozen whole. Its lineage identity, provenance, lock
declaration, and every locked field are re-asserted from authoritative input after the draft is applied,
so nothing the engine writes can move them. Everything else stays editable. Freezing the entire record
was tempting while the engine had to re-emit the roster, because a dropped or mangled seed was the
failure being fixed — but drafts remove that risk on their own, and freezing would only stop a seeded
character developing across a long story. `manual_locks` has always been the control a person uses to
say what must not change, and it remains sufficient.

## The operation vocabulary

Writes are upserts addressed by handle: `describe_entity`, `assert_fact`, `relate`, `describe_location`,
`connect_locations`, `open_thread`, and `describe_cast_member`. An upsert against an existing handle
merges the supplied fields and leaves the rest alone; an upsert against a `new:`-prefixed handle
creates the object and the compiler assigns its permanent identity.

Removals are explicit and separately named: `retract_fact`, `retire_entity`, `remove_relationship`,
`forget_location`, `remove_edge`, `archive_cast_member`, and `resolve_thread`.

The `new:` prefix is required rather than inferred. Treating an unrecognized handle as a creation would
turn a mistyped handle into a duplicate character, which is the one outcome the Cast Roster rules exist
to prevent. With the prefix, a typo is a defect the compiler names instead of a person discovering a
second Vera three checkpoints later.

Destructive operations must cite the exchange ordinal that justifies them, or one of the permitted
non-narrative reasons. A retraction whose citation cannot be grounded is dropped and reported rather
than failing the compile: staleness is recoverable at the next checkpoint, and a lost engine run is not.
This is the same trade ADR-0008 made for ungrounded timeline events, for the same reason.

## Handles and identity

Existing objects are presented to the engine through Model-facing Handles — short readable slugs
derived from canonical names, disambiguated by suffix when they collide. Handles are derived fresh from
the baseline on every run and are meaningful only inside one Continuity Update. Stored identifiers never
enter the model-facing request and never leave it.

This resolves an identity problem the previous design was hiding rather than solving. Facts carry an
`id` and a `body`, live in six buckets per entity, and have never been checked for uniqueness or
stability by either validator — they were rewritten wholesale every run, so nothing depended on them.
Merge semantics make fact identity load-bearing for the first time, against stored snapshots whose fact
identifiers were never required to be unique. The compiler therefore canonicalizes the baseline before
applying a draft, assigning host-owned identifiers to any fact that lacks a unique one, and addresses
facts in the draft as `<entity-handle>.<bucket>.<n>`. No snapshot migration is required, because the
correction happens on the way through.

## Defects and cascades

The compiler returns a complete snapshot together with a list of typed defects. Fatal defects are
deliberately rare, because failing a compile costs the same nine minutes that failing validation did.
There are three: a draft with no usable narrative prose, a `new:` handle naming something that already
exists, and an attempt to retire or archive a Cast Seed. The first makes the snapshot unproducible; the
other two have no safe deterministic reading, because one would silently create a second Vera and the
other would silently destroy authoritative data.

Everything else is recoverable. The offending operation is dropped, the compile succeeds, and the defect
is reported. That deliberately includes removals naming an object that is not there: the desired end
state already holds, so failing the run accomplishes nothing. It also includes writes whose endpoints
cannot be resolved — losing one authored relationship is a smaller harm than losing every sentence the
engine wrote alongside it.

Cascades that referential integrity forces are performed, not refused. Retiring an entity necessarily
removes the relationships that reference it, the placements that place it, and archives the Cast Member
that speaks through it. That is arithmetic rather than judgement, and performing it while reporting it
is not silence. Reserving typed defects for genuinely ambiguous cases is what keeps this decision from
trading one class of whole-run failure for another.

Typed defects are also what make repair possible rather than merely diagnosable, since each one names
the operation that produced it. ADR-0011 builds on that: the draft is stored with its defects, so a
corrective run edits the section that failed instead of authoring the transition again.

A request that no snapshot could satisfy is refused before any of this begins. Two Cast Seeds sharing a
name make "every seed appears" and "no two members share a name" mutually unsatisfiable, and a thread in
that state failed three consecutive checkpoints — each after a full engine run — alternating between
the two errors. Compiling is only worth attempting when an answer exists.

Repair and validation stay separate and stay on separate machines, exactly as ADR-0008 established. The
Continuity Draft never crosses the wire: the compiler emits the same response envelope Android already
consumes, so this changes no protocol version and requires no coordinated release. Engines can be moved
onto drafts one at a time, and Android continues to re-validate every invariant independently and
remains the final authority.

## Considered Options

- Reinstating a dropped Cast Seed inside the existing canonicalization pass would stop today's error in
  about thirty lines, but it leaves the identical failure available through entities, relationships,
  locations, and placements, and leaves the engine emitting sixty kilobytes it cannot affect.
- Keeping the full-rewrite envelope and making validation forgiving would accept degraded snapshots as
  continuity truth, which is the one property the checkpoint exists to guarantee.
- Expressing the transition as a JSON Patch over the baseline would be smaller to specify, but it is a
  document-shaped vocabulary rather than a story-shaped one: it can express an incoherent edit as easily
  as a coherent one, and it gives the engine back the identifiers this decision removes.
- Retrying more aggressively is what the system already does. It costs another full run and fails again
  whenever the cause is systematic rather than random.

## Consequences

The engine's output shrinks to what it authored, which removes the omission class entirely and should
substantially reduce checkpoint latency. Preservation, identity assignment, reference resolution, and
serialization become one deterministic module with no model in it, which is testable directly and
independently of any provider. The accepted product is still a complete independent snapshot, and
`validateResponse` still runs unchanged over the compiled result, so the shared parity corpus keeps its
meaning.

World state can still shrink: obsolete facts are retracted, entities retired, locations forgotten, and
Cast Members archived, each through a named operation that cites its evidence. Summaries remain complete
model-authored rewrites, because coherence there is the thing a model is actually good at.

The compiler and the draft schema decide engine behaviour, so both join the contract file set and a host
running a stale copy restarts itself. Prompt, schema, and compiler changes must ship together.
