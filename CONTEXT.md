# Open Fantasia Roleplay

Open Fantasia provides ongoing character roleplay while preserving the facts and narrative state needed for continuity across a long conversation.

## Language

**Roleplay Exchange**:
A user message together with the assistant reply it produces. An exchange is complete when the assistant reply has been committed. Persisted as `chat_turns`, and referenced as `fork_turn_id` and `head_turn_id`: those names are the stored spelling of this same concept, deliberately left unrenamed, and carry no separate meaning.
_Avoid_: Turn, message

**Primary Character**:
The character whose Character Sheet anchors a roleplay thread and supplies its default Active Speaker.
_Avoid_: Main bot, original bot

**Cast Member**:
A named, established story character eligible to author assistant dialogue and action. The player-controlled Persona is never a Cast Member.
_Avoid_: Side character, Supporting Cast, NPC card

**Cast Profile**:
The branch-valid identity, aliases, personality, voice, appearance, goals, boundaries, and provenance that keep a Cast Member consistent when speaking.
_Avoid_: Character description, cast blob

**Cast Roster**:
The complete set of Cast Members valid on a branch lineage, including its Primary Character, manual Cast Seeds, and characters established by Continuity Updates.
_Avoid_: Global character list, Supporting Cast JSON

**Cast Seed**:
A manually authored Cast Profile available from a thread's beginning and inherited by its branches.
_Avoid_: Initial NPC, hardcoded side character

**Discovered Cast Member**:
A Cast Member established from story evidence during a Continuity Update rather than supplied as a Cast Seed.
_Avoid_: Auto NPC, hallucinated character

**Active Speaker**:
The Cast Member explicitly selected to own dialogue, action, reaction, and interiority in assistant replies on a branch until another selection is made.
_Avoid_: Point of view, target bot

**Reply Length**:
How much prose an assistant reply should contain, chosen per roleplay thread and named rather than counted: Terse, Measured, Full, Expansive, or Unbounded. It states an intention about visible story text only, and is given to a Roleplay Model as a word target calibrated for that model. The transport ceiling a provider needs is derived from it by an adapter, never stored and never authored.
_Avoid_: Max tokens, token budget, output cap, paragraphs

**Roleplay Model**:
The model selected for a roleplay thread to author assistant dialogue and action for each Roleplay Exchange. It is independent of the Continuity Engine that creates Continuity Snapshots.
_Avoid_: Chat model, HCE model, brain model

**Roleplay Generation Request**:
The immutable, provider-neutral model input frozen for one reply attempt: the authoritative system prompt containing the reachable Continuity Snapshot, the Roleplay Transcript Window, the current user message and reply controls, Active Speaker selection, generation preferences, and output contract. Provider, transport, queue, request-identity, and timing metadata are never part of its model-visible content.
_Avoid_: API payload, agent task, prompt file

**Roleplay Context**:
The complete, provider-neutral account of everything a Roleplay Model is given for one reply: Character Sheet, Persona, director notes, the reachable Continuity Snapshot, the complete branch-valid Cast Roster, pins, timeline beats, the Roleplay Transcript Window, the player's prose, and the reply controls. It is total — every part is required — so context cannot be omitted by being forgotten. Which action asked for the reply never changes what it contains.
_Avoid_: Prompt, payload, system prompt

**Roleplay Transcript Window**:
The latest fifteen complete retained Roleplay Exchanges reachable from the selected branch head, serialized chronologically as raw user prose and committed assistant prose. The current incomplete exchange follows it separately. A Continuity Snapshot, speaker control, regeneration direction, or other model instruction never appears inside a historical transcript exchange.
_Avoid_: Full chat dump, rendered-message history, context tail

**Roleplay Generation Job**:
A recorded attempt to execute one frozen Roleplay Generation Request through the selected Roleplay Model. Its delivery may stream directly or complete through durable Mac Host polling, but Android accepts the result only while its originating thread branch and pending reply still match.
_Avoid_: Live session, streaming session, hidden conversation, Mac-only job

**Character Portrait**:
The canonical generated visual identity of a Primary Character or branch-valid Cast Member. A replacement does not supersede the current portrait until the new image has been accepted successfully.
_Avoid_: Avatar, profile photo, temporary render

**Chat Backdrop**:
The edge-to-edge Character Portrait shown behind a roleplay thread. It follows the Active Speaker when that speaker has a portrait and otherwise falls back to the Primary Character.
_Avoid_: Wallpaper, card background, thumbnail

**Portrait Engine**:
The trusted external producer responsible for creating Character Portraits. It is independent of both the Roleplay Model and Continuity Engine.
_Avoid_: Image API, portrait worker, Pollinations

**Portrait Brief**:
The stable visual specification used to generate one Character Portrait. Known Character Sheet or Cast Profile details are binding; artistic completion of unspecified details remains visual-only and never becomes continuity truth.
_Avoid_: Image prompt, appearance canon, transcript excerpt

**Ensemble**:
An explicit reply mode allowing multiple present Cast Members to speak and act in one assistant reply.
_Avoid_: Auto speaker, group character

**Continuity Entity**:
Any person, creature, object, group, or other story subject tracked for continuity. A Continuity Entity is not necessarily a Cast Member or eligible speaker.
_Avoid_: Cast Member

**Continuity Snapshot**:
An independently valid, complete account of the current world, Cast Roster, entities, relationships, locations, and narrative state at a particular completed exchange. Each accepted snapshot supersedes the previous snapshot as the branch's continuity truth.
_Avoid_: HCE, memory blob, world-state blob

**Continuity Checkpoint**:
A mandatory, non-bypassable pause after every fifteenth completed Roleplay Exchange on a branch since its Continuity Baseline, or when an early update is explicitly requested. The triggering reply remains visible, but the affected lineage becomes read-only until a valid Continuity Snapshot has been accepted; update failures leave the checkpoint in force. The pause follows the checkpointed exchange into descendant branches without blocking unrelated branch lineages or roleplay threads.
_Avoid_: App stop, crash, shutdown

**Revision**:
A reply attempt that replaces a rejected one, carrying the rejected prose together with what the player wants changed about it. The rejected prose is marked as never having happened, and everything the direction does not name is preserved: a Revision alters a reply rather than replacing the idea behind it. A direction with no prose to revise is a brief for a fresh attempt, which is a different thing and is said differently.
_Avoid_: Regeneration direction, steering, guidance, retry

**Scene Report**:
What a Roleplay Model states about the scene its reply leaves behind: who is present, which open thread the beat moved, and whether the scene ended. Named in prose, never by identifier, and always optional — a missing or unreadable report costs freshness and never the reply, because presence then falls back to the Continuity Snapshot. It is stripped from the prose before the exchange is committed, so it never becomes story.
_Avoid_: Metadata, tail, structured output, function call

**Scene Intent**:
What the current scene is for, chosen by the player per reply and carried until changed: Dwell, Develop, Escalate, or Close. It selects exactly one turn policy for the assistant reply, and the policies are mutually exclusive, so a scene can never be told both to hold still and to introduce an interruption. It is held on the branch beside the Active Speaker.
_Avoid_: Director note, guidance, steering, mood, tone

**Stage**:
The projection of a Continuity Snapshot that one reply is written against, derived deterministically and never stored. Resolution varies by presence and salience: what is in the scene arrives as a complete record, the rest of the Cast Roster and anyone the scene can reach arrive as a name and kind, and everyone else the story knows arrives as a name. Nothing is omitted, so a Roleplay Model can always call for a character it cannot currently see and can never invent a second one who already exists.
_Avoid_: Trimmed context, summary, truncated state, context window

**Salient**:
Said of an entity, relationship, or thread the story has referred to recently. Recorded by the Continuity Compiler as the snapshot version at which each record was last touched, so its age is the distance from the current version. Cast Members are always salient. Salience decides how much of a record reaches a Roleplay Model, never whether it remains true.
_Avoid_: Recent, active, hot, cached, relevant

**Continuity Baseline**:
The latest accepted Continuity Snapshot reachable through a branch's current history. Replaced or discarded exchanges do not contribute to the next checkpoint, while a new branch inherits the baseline and subsequent exchanges reachable from its fork point.
_Avoid_: Global counter, lifetime reply count

**Branch-valid Side State**:
Pins, timeline events, Cast Profile overrides, and Cast Portraits inherited through a branch's ancestry and filtered by the Roleplay Exchanges reachable from its current head. State attached to a Rewind-discarded or replaced exchange is invisible even when that exchange remains physically stored for a sibling branch.
_Avoid_: Exact-branch rows, global thread state, copied branch metadata

**Device Test Sandbox**:
The separate Android package `com.example.open_fantasia.sandbox` targeted by connected instrumentation. Test installation, storage clearing, and uninstall are confined to this package; the personal app's characters, threads, Continuity state, credentials, and portrait files are never test-owned.
_Avoid_: Personal app test target, connected Debug test

**Continuity Evidence Transcript**:
The retained Roleplay Exchanges the Continuity Baseline does not already account for: everything from the Baseline's own exchange through the exchange that triggered the checkpoint, normally fifteen. Earlier prose is not sent, because the Baseline is what it became. A thread with no accepted Baseline yet supplies its whole retained lineage. Rewind-discarded prose is absent and unknowable.
_Avoid_: Partial context, discarded transcript

**Rewind**:
Moving a branch head to an earlier retained Roleplay Exchange and permanently discarding every later exchange on that lineage. Discarded content is no longer story truth. Continuity after a Rewind is whichever Continuity Snapshot is still reachable from the new head together with the exchanges retained after it, so a Rewind never requires a Continuity Update of its own; it can only reduce the distance to the Continuity Baseline, never increase it.
_Avoid_: Undo, temporary rollback

**Continuity Update**:
The act of producing and accepting a new Continuity Snapshot for the exchange at a Continuity Checkpoint. Acceptance establishes a new Continuity Baseline and restarts the fifteen-exchange cadence.
_Avoid_: HCE call, scan

**Mac Host**:
The trusted external Mac service reached through Tailscale. It durably executes Continuity Updates and Antigravity Roleplay Generation Jobs while keeping provider credentials off Android. Its availability never weakens or bypasses checkpoint enforcement.
_Avoid_: Continuity Host, Mac worker, HCE worker, Codex machine

**Continuity Engine**:
The user-selected model-backed producer the Mac Host uses to create a Continuity Snapshot. Changing engines never changes checkpoint enforcement or snapshot acceptance rules.
_Avoid_: HCE model, provider, worker

**Continuity Draft**:
The provider-neutral semantic state transition a Continuity Engine authors for one Continuity Update: replacement prose, the complete present scene, the operations that add, amend, or remove durable state, and new timeline events. It carries no stored identifier, no envelope identity, and no copy of authoritative input, and it never crosses the wire to Android.
_Avoid_: Model response, patch, diff, delta blob

**Continuity Compiler**:
The deterministic Mac Host module that applies a Continuity Draft to the Continuity Baseline to produce a complete Continuity Snapshot. It preserves authoritative records, assigns every identifier, resolves every reference, performs the cascades referential integrity forces, and reports what it could not apply as typed defects. It contains no model and is exercised directly by fixtures.
_Avoid_: Post-processor, canonicalization pass, repair step

**Model-facing Handle**:
The short readable slug through which a Continuity Draft refers to a story object. Handles are derived fresh from the baseline for one Continuity Update and are meaningful only inside it; a `new:` prefix declares that the object does not exist yet and asks the Continuity Compiler to assign its identity.
_Avoid_: Entity ID, temporary ID, reference key

**Engine Preflight**:
The smallest schema-constrained job the Mac Host runs through a Continuity Engine's exact execution path before advertising it. It proves the executable, account, model, headless permissions, and structured output; an engine that fails is not offered and a checkpoint naming it is refused with the reason.
_Avoid_: Health check, version check, ping

**Continuity Defect**:
A named reason the Continuity Compiler could not apply part of a Continuity Draft. A recoverable defect drops the offending operation and is reported; a fatal defect means the draft is incoherent and the Continuity Update fails.
_Avoid_: Validation error, warning, parse failure

**Story Summary**:
A causally ordered synthesis of the important story so far, using as much detail as continuity quality requires up to a 20,000-character safety ceiling. It is rewritten at every Continuity Update from the prior story knowledge and complete retained transcript; it is never an append-only transcript or event log.
_Avoid_: Running log, appended recap

**Scene Summary**:
A replaceable description of the immediate situation at the snapshot: current place and time, present participants, active tension, and what is poised to happen next, using up to an 8,000-character safety ceiling.
_Avoid_: Story Summary, recent transcript

**Latest Beat**:
A focused account of how the newest Roleplay Exchange changed the scene, using up to a 4,000-character safety ceiling. It replaces the prior Latest Beat at every Continuity Update.
_Avoid_: Scene Summary, latest reply
