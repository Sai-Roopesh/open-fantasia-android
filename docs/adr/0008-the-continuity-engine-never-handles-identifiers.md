---
status: accepted
---

# The Continuity Engine never handles identifiers

Open Fantasia will stop asking the Continuity Engine to reproduce host-owned identifiers. The engine
authors content — prose, judgement about what changed, descriptions of people — and the Mac Host owns
every identifier and every reference between them. Where a Continuity Update must point at an
exchange, the engine cites its 1-based `exchange_index` as `"#12"` and the host compiles that ordinal
into the canonical turn id. The engine never transcribes a UUID.

This does not relax acceptance. A Continuity Checkpoint stays mandatory and non-bypassable, a failed
update still leaves the lineage read-only, and no degraded or partial snapshot is ever accepted as
continuity truth. The goal is not to tolerate imperfect updates but to remove the failure modes that
were making perfect updates impossible to achieve reliably.

The problem was structural rather than a property of any one model. A Continuity Update is validated
atomically, so a single mistyped character in one optional field discarded a complete engine run —
measured at roughly 8.5 minutes for `codex:gpt-5.6-terra:high` — and left roleplay blocked until a
person intervened. Two fields carried that hazard: a discovered Cast Member's `first_seen_turn_id`,
and each timeline event's `turn_id`. Both required a 36-character identifier copied exactly out of a
long transcript. The failure rate of that operation is never zero, and its blast radius was total.

The codebase already demonstrated the fix. Relationship and location identifiers have always been
pure slugs — `relationship:jean-sai`, `location:hellfire-club-ballroom` — and have never been a source
of validation failure. Every observed failure came from a field carrying a UUID. An ordinal shares the
property that makes a slug safe: it is short, meaningful in context, and checkable against the ordered
exchange list, so a wrong value is detected and resolved rather than being indistinguishable from a
right one.

The host applies one canonicalization pass before semantic validation, in a fixed order: ordinal
references are resolved to turn ids, authoritative seed data is projected back over the roster,
discovered lineage is grounded in a reachable exchange, and timeline events that still cannot be
grounded are discarded. Each stage is deterministic and independently tested. Canonicalization may
only ever produce values that already exist in the request; it can repair a transcription slip but
cannot manufacture a fact, so `validateResponse` remains a real gate rather than a formality.

Repair and validation stay separate, and they stay on separate machines. The Mac Host repairs; Android
re-validates the same invariants independently on acceptance and is the final authority. Android
deliberately does not implement the repairs — a phone that only ever accepts fully-formed snapshots is
what keeps a host bug from becoming corrupted continuity.

Cast Members that cannot be grounded, dropped seeds, changed locked fields, identity mismatches, and
malformed or oversized envelopes remain hard failures. Those indicate a protocol violation or a
genuinely incoherent response, not a transcription slip, and a blocked lineage is the correct outcome.

## Considered Options

- Accepting a degraded carry-forward snapshot when an update fails would keep roleplay available, but
  it makes continuity truth conditional on delivery luck, which is the one property the checkpoint
  exists to guarantee.
- Retrying the full engine run on validation failure is what the system already did; it costs another
  full run and fails again whenever the cause is systematic rather than random.
- Teaching the engine to copy identifiers more carefully through prompt emphasis reduces the rate but
  cannot reach zero, and the cost of the residual rate is a blocked lineage.
- Migrating existing snapshot identifiers to pure slugs would remove the hazard at the source, but it
  rewrites references across a live database for a benefit the ordinal indirection already delivers.

## Consequences

The engine is never asked to perform an operation it is unsuited to. Ordinals are validated against
the exchange window, so a wrong reference is caught and resolved on the host instead of surfacing as
a fatal error minutes later on the phone. Existing identifiers keep their current form, so no snapshot
migration is required and the change is confined to the model-facing request view and the host's
canonicalization pass. A model that does transcribe an identifier correctly is still honoured, so the
change is backwards-compatible with responses produced before it. Prompt changes and host code changes
must ship together, and because the host caches its modules for the life of the process, the host must
be restarted for either to take effect.
