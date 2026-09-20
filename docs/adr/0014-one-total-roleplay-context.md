---
status: accepted
---

# One total Roleplay Context

Everything a Roleplay Model is given is named once, in one type, and rendered by one function. The type
is total: no field has a default, so no field can be silently absent, and a projection from stored state
into it will not compile until every field is supplied.

Three pieces of context were being lost, and they were lost three different ways. `supportingCast` was a
parameter marked `@Suppress("UNUSED_PARAMETER")` — wired, never read, forgotten. Timeline events were
resolved correctly, filtered correctly for branch validity, and then discarded at the call site with a
hardcoded `timeline = emptyList()`. Cast Profile fields disappeared through a serializer nobody
configured: `private val json = Json` leaves `encodeDefaults` off, so any field holding its declared
default is omitted from the JSON the model reads.

Different mechanisms, one cause. Nothing owned "the complete context". It was assembled across a hundred
lines of a ViewModel method and rendered by three builders taking scattered parameters, so completeness
was nobody's job and rotted quietly in three directions at once.

The serializer setting is not the defect worth fixing. `CastProfile` declares defaults so that *decoding*
stored and remote JSON is tolerant of missing fields, and that same tolerance makes *encoding* lossy.
One type is doing two jobs whose requirements are opposites. Configuring `encodeDefaults = true` would
paper over that; the fix is two types. Storage and wire keep the tolerant shape, and a prompt projection
carries the total one. The projection is where the two concerns meet, and because the total type has no
defaults, the compiler refuses to build a projection that forgets a field.

The Cast Roster moves out of the serialized world state and becomes its own section. Continuity Updates
run every fifteen exchanges, so binding cast delivery to the Snapshot meant a manually authored Cast
Seed reached the model as a bare name for the first fifteen exchanges of every thread, and a seed added
mid-thread stayed a bare name until the next checkpoint. The complete branch-valid roster is now sent in
full on every call, whatever continuity knows, which also removes the Active Speaker special case: every
member ships with every field rather than one profile plus a list of names.

Sending it in its own section means it must not also ship inside `durable_state`, or every established
member appears twice in one prompt. The prompt's world state is therefore a projection of the Continuity
Snapshot with `cast_roster` removed. What the model reads is no longer a byte-faithful serialization of
what the database holds, which is the real cost of this decision; the roster section carries the same
data losslessly, and the completeness test asserts it.

Completeness stops being a habit and becomes a check, and it needs two different checks because context
reaches the model two different ways. Serialized state is covered by reflection over every property of
every world-state type, which holds because the total type has no defaults for a serializer to drop.
Hand-rendered state — the Character Sheet, the Persona, and every Cast Member — cannot be checked that
way, because the prompt prints "Voice" where the field is called `voice_style`. There the guarantee is
structural: those types declare no defaults, so adding a field fails to compile at every fixture until
it is named, and a per-field sentinel then fails the assertion until it is actually rendered.

That second half was missed on the first pass. A deliberately unrendered field was added as a control
and the suite went green, because the field happened to be on a serialized type where rendering is
automatic. The same control against a hand-rendered type is what forced `PromptCastMember` to exist:
`CastProfile` was still carrying storage defaults into the one path that prints fields by hand, which is
precisely the arrangement this decision exists to remove.

## Considered Options

- Setting `encodeDefaults = true` is one line and fixes today's omission. It leaves the type still doing
  two opposed jobs, so the next defaulted field added to a context type disappears again.
- Removing defaults from the stored types would make storage total too, but it breaks decoding of every
  existing snapshot and changes a wire contract the Mac Host already satisfies, for a guarantee the
  projection provides without either cost.
- Sending only the cast the Snapshot lacks would avoid duplication without moving the roster out of
  `durable_state`, but the prompt's shape would then vary with continuity state — path-dependent context
  is the class of defect being removed.
- Keeping cast in both places is faithful to the stored Snapshot and duplicates roughly fifteen profiles
  in every request.

## Consequences

Adding context becomes a typed operation with one obvious home, and forgetting to render it is a build
failure. The Active Speaker is no longer privileged in what the model knows about the cast, so Ensemble
mode and single-speaker mode receive identical cast knowledge. A thread's first fifteen exchanges stop
being played by a model that knows only names.

Prompts grow: the full roster ships every call rather than one profile and a name list. That is the
intended trade — the cast is authored content and withholding it was never a decision anyone made.

The cache split changes with it. The Cast Roster used to sit in the volatile per-reply suffix so that the
cached system prefix stayed byte-identical as speakers changed; it now sits in the prefix beside the
world state it describes. That is the better split by rate of change — the roster holds still between
Continuity Updates while the Active Speaker changes every reply — but it means editing a Cast Seed
invalidates the cached prefix, where previously it did not. Selecting a different speaker still leaves
the prefix untouched, which is the case that happens every turn.

`greeting`, `starters` and `private_notes` remain deliberately unsent. They are recorded here as
decisions rather than omissions, because an undocumented withheld field is indistinguishable from the
three defects this decision exists to remove.
