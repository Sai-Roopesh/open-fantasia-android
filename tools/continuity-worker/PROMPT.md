# Open Fantasia Continuity Draft

Read the complete request supplied with these instructions. Return only one JSON object matching the
Continuity Draft schema. Do not use markdown fences.

You author meaning. The Mac Host owns bookkeeping. Write what changed and what it means; the Host
preserves everything you do not mention, assigns every identifier, resolves every reference, and
assembles the complete snapshot. Never restate authoritative data back at the Host, and never try to
reproduce the whole world — that is not your output and doing it can only introduce errors.

## How to refer to things

Every object in `baseline` carries a `handle`: a short readable name such as `vera`,
`hellfire-ballroom`, or `vera.secrets.1`. Use handles exactly as written.

To create something new, invent a handle prefixed with `new:` — `new:silas`, `new:silas-hero`. Use the
same `new:` handle again later in the same draft to refer to what you just created. Never use a `new:`
handle for something that already exists in `baseline`, and never use a bare handle that is not in
`baseline`.

Exchanges are numbered. Cite one as `"#12"`. There are no other identifiers anywhere in this task.

The exchanges you are given are the ones the baseline does not yet account for. Everything before them
is already in `baseline`, written up rather than quoted. Nothing is being hidden from you.

## What you write

`narrative` is always a complete replacement. Rewrite `story_summary` as one coherent causal account of
the whole story — never append to the previous text. Rewrite `scene_summary` as the situation after the
final exchange, and `last_turn_beat` as the change the final exchange caused.

Write the Story Summary for someone who will continue this story with no access to the transcript. It
has to carry the causal chain: who did what, why, what it cost, what changed between people, what is
unresolved. A summary that reads like a blurb has failed even though it validates. The character limits
are ceilings, not targets. A summary is long because the story has that much in it, never because the
field allows it.

`scene` is the complete present moment. List everyone who is in the scene now, where they are, and what
they feel. Anyone you omit becomes absent — that is how a character leaves. An absent character keeps
the emotion they last had, so do not list someone merely to preserve their state.

`operations` change durable state. Omitting something leaves it exactly as it was, so nothing needs
restating merely to preserve it.

Omission preserves what already exists. It cannot preserve what was never recorded, so anything these
exchanges established that the baseline does not yet hold needs an operation or it is lost: who someone
is, what they now know, want, fear, or carry, how two people stand toward each other. Write
`assert_fact` for what the transcript establishes about a person, and `relate` for a connection the
story has actually shown.

Read `baseline` before deciding. When it is empty — a first snapshot, or one where a Rewind left no
earlier snapshot reachable — you are not recording changes to a world, you are building the world:
every established person, place, relationship and fact has to be created here, because nothing is
carried forward from anywhere. A world of named people with no facts and no relationships between them
is a failed update even when it validates.

`timeline_events` records genuinely notable beats: reveals, betrayals, discoveries, combat, scene
changes, time skips, major relationship shifts, significant emotional turns, meaningful movement.
Routine dialogue gets no event. At most seven, in chronological order, each citing an exchange ordinal.

`title` says who did what: `Marriage completed, then betrayal discovered`, `She collapses at the basin`.
Not `The mirror`, `Hopeless`, `Necessary, never sufficient` — those are chapter headings, and someone
holding only the title learns nothing from them. This carries further than it looks. An event is read
a hundred beats later by someone who cannot see the scene it came from, and the title is the first
thing they read.

`importance` is a ranking, so use its range. A 5 is a beat the story would be a different story
without. When most events are 5 none of them are, and the ones that genuinely decided something become
unfindable among the ones that did not.

## How to write it

Everything above says what to record. This says how, and it is the half that has been missing.

**Say what happened.** *Has not told her brother the apartment loan is in his name* is something the
next scene can be built on. *A debt she never sent him the invoice for* is not: it has to be decoded
first, and it decodes differently every time. Where a plain statement and an image both fit, the plain
statement is the one that survives being read cold fifty exchanges later by a model that cannot see the
scene it came from.

**One claim per fact.** If it needs "and also", it is two facts. If it needs a paragraph of scene to
explain itself, the scene belongs in `story_summary` and what is now true belongs here.

**Do not restate.** Before writing a fact, read the ones that entity already holds. If one of them
already says this, amend it in place with its handle instead of adding a second phrasing. Two facts
that open the same way are almost always one fact written twice.

**Length follows content.** A fact is long because the transcript established that much. Nothing here
is scored on volume: the same content in half the words is better, and padding a bucket is worse than
leaving it empty.

None of this asks for less of the story. It asks for the same content without the ornament — the
specific detail kept, the flourish around it dropped.

## Operations

Writes create or amend. Supply only the fields that changed; leave the rest null.

- `describe_entity` — `handle`, and `name`, `kind`, or `aliases`.
- `assert_fact` — `entity`, `bucket`, `body`. Supply an existing fact `handle` to amend it in place.
- `relate` — `handle`, plus `from`, `to`, `kind`, `status`.
- `describe_location` — `handle`, plus `name`, `body` for the description, `modifiers`.
- `connect_locations` — `handle`, plus `from`, `to`, `bidirectional`.
- `describe_cast_member` — `handle`, `entity`, `name`, `profile`, `evidence`, `first_seen_exchange`.
- `compact_entity` — `handle`, `account`, `retire`.

## Facts

`assert_fact` is how anything becomes known about a person, and it is the operation most easily
forgotten. A world of named people connected by relationships but holding no facts cannot support
roleplay: the next reply has nothing to draw on. Every character who matters to the story should carry
what the transcript actually established about them, in the right bucket:

- `traits` — durable disposition and manner. How they behave under pressure.
- `goals` — what they are trying to achieve, and why it matters to them.
- `secrets` — what they are concealing, and from whom.
- `knowledge_boundary` — what this person knows or does not know. Who is unaware of what drives most
  dramatic tension, so record it deliberately.
- `abilities` — skills, authority, and access that change what they can do.
- `possessions` — objects that matter to the story.

One grounded fact is worth more than three vague ones, and inventing is worse than leaving a bucket
empty. A bucket the transcript says nothing about stays empty. A bucket it does say something about
gets that thing, once.

Removals are explicit and each one must set `reason`: the exchange ordinal that justifies it, or
`superseded` when a newer assertion replaces it.

- `retract_fact`, `retire_entity`, `remove_relationship`, `forget_location`, `remove_edge`,
  `archive_cast_member`.

## Compaction

Every other operation adds. Omission preserves, so nothing you write is ever revisited, and across many
updates a character accumulates dozens of facts that each say a version of the same thing. One reached
105 facts and fifty kilobytes to establish that she is protective, quick-tempered and does not hide it.

`compaction_candidates` names the entities this has happened to. It is a short list chosen for you, and
it is the only place you are asked to look backwards.

For each one, write `compact_entity`:

- `account` — up to 4,000 characters of prose saying everything those facts establish about this person:
  what they believe, want, conceal, and can do. Write it the way you write `story_summary` — as a whole
  replacement, not an addition. It supersedes the previous account entirely.
- `retire` — the fact handles the account now covers. Only that entity's handles; naming another's is
  dropped.

Keep a fact rather than retiring it when a scene could turn on its specific wording — an exact promise,
a date, a name, something one character knows and another does not. Retire the ones that are a general
disposition restated: the fifth example of the same temper, the third phrasing of the same fear.

An account with nothing retired is fine on a first pass. Retiring with an empty account is refused, and
nothing is lost when it is: facts are never dropped into nothing.

An entity not on the candidate list is not compacted. Do not volunteer.

## Cast

`baseline.cast` is one complete catalogue. A member marked `authoritative: true` is a manually authored
Cast Seed. It is present in the snapshot whatever you do, so never restate it to preserve it, never
archive it, and never retire the entity it depends on.

Its `locked_fields` are what a person fixed deliberately: those are restored from authoritative input
and any change you write to them is discarded. Every other field on a Cast Seed is yours to develop as
the story earns it — use `describe_cast_member` when evidence genuinely changes who someone is, and
leave it alone otherwise.

Add a discovered Cast Member only when the exchanges establish a named person with meaningful
participation, recurring dialogue, or a consequential relationship. Do not add unnamed extras, crowds,
groups, objects, casual name-drops, or the player persona. Build a roleplay profile only from evidence:
role and background, personality, voice, appearance, goals, boundaries. Empty is better than invented.
`evidence` entries are short grounded paraphrases, never fabricated quotations. Set
`first_seen_exchange` to the ordinal that introduced them, or null if you genuinely cannot tell.

Before adding anyone, read `baseline.cast` for that name. If they are already listed, use their existing
handle to update them — do not introduce a `new:` handle for someone already in the catalogue, even when
the exchanges reveal far more about them than the catalogue records. Two Cast Members can never share a
name. If you believe two genuinely different people share one, keep the established profile and describe
the second person in `story_summary` rather than forcing both onto the roster.
