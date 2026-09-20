---
status: accepted
---

# A reply reports the room it leaves

The Stage resolves by presence, and presence came only from a Continuity Update. That runs every fifteen
exchanges, which is the right cadence for truth and far too slow for a room: `is_present` can be fourteen
exchanges stale, so a projection reading it would be looking at people who have left and missing people
who have arrived, for most of a scene.

So the Roleplay Model reports the room alongside the prose. After its reply it emits one optional
`<scene_state>` block naming who is present, which open thread the beat moved, and whether the scene
ended. Android splits prose from report at `RoleplayOutputValidator`, the single point both the Mac Host
and direct providers pass through, and stores the report on the exchange that produced it.

## Why this does not reopen ADR-0010

ADR-0010 moved the Continuity Engine off bulk transcription because a model asked to re-emit sixty
kilobytes of roster reliably dropped a member. That objection is about volume, not about structure.
Naming the four people in a scene it has just written is the thing a model is good at, and the report is
three fields.

It follows ADR-0008 on identifiers: names, never `entity_id`. A Roleplay Model has never seen an
identifier and must not start.

## Failure is the ordinary case, not an exception

This is the only step in the architecture that puts a parse between a person and the reply they waited
for, so every way it can go wrong ends the same way: **the prose is committed and the report is absent.**
A missing block, malformed JSON, a truncated stream, a model that ignored the instruction — all yield a
reply and a null report, and the Stage falls back to snapshot presence exactly as before. Absence means
unchanged, which is the omission semantics a Continuity Draft already has.

The block is stripped whether or not it parsed. A report that could not be read is still not story, and
leaving it in the transcript would put markup into the next fifteen prompts. It is hidden from the moment
its opening tag arrives mid-stream, so bookkeeping never appears on screen inside a scene.

The one thing that is refused is a reply consisting only of a report, on Android and in the Antigravity
runner both. That is not a fallible parse; it is a reply with no story in it.

## Consequences

- Presence is current every exchange rather than every fifteen, which is what makes the Stage's
  resolution trustworthy rather than merely cheap.
- `scene_ended` is recorded and clears stale presence, so the room does not persist across a cut.
- The Antigravity runner's contract changes from "return only final in-character prose" to allow the one
  block; everything else it refuses is unchanged.
- The Scene as a first-class entity — a bounded span with its own place, cast, and threads — is now
  detectable and still not built. ADR-0019 deferred it for want of boundary detection; that reason is
  gone, and what remains is the work. Recorded as deferred, not as absent.
