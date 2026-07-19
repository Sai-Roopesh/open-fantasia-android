# Open Fantasia Roleplay

Open Fantasia provides ongoing character roleplay while preserving the facts and narrative state needed for continuity across a long conversation.

## Language

**Roleplay Exchange**:
A user message together with the assistant reply it produces. An exchange is complete when the assistant reply has been committed.
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
A mandatory, non-bypassable pause after every seventh completed Roleplay Exchange on a branch since its Continuity Baseline, or when an early update is explicitly requested. The triggering reply remains visible, but the affected lineage becomes read-only until a valid Continuity Snapshot has been accepted; update failures leave the checkpoint in force. The pause follows the checkpointed exchange into descendant branches without blocking unrelated branch lineages or roleplay threads.
_Avoid_: App stop, crash, shutdown

**Continuity Baseline**:
The latest accepted Continuity Snapshot reachable through a branch's current history. Replaced or discarded exchanges do not contribute to the next checkpoint, while a new branch inherits the baseline and subsequent exchanges reachable from its fork point.
_Avoid_: Global counter, lifetime reply count

**Continuity Source Window**:
The exact Roleplay Exchanges after the Continuity Baseline through the exchange that triggered the checkpoint, normally seven. Together with the complete baseline snapshot, it is the narrative evidence for the next Continuity Update; earlier transcript is not included.
_Avoid_: Full transcript, approximate recent history

**Rewind**:
Moving a branch head to an earlier retained Roleplay Exchange and permanently discarding every later exchange on that lineage. Discarded content is no longer story truth, and the retained lineage requires an immediate Continuity Update before roleplay can continue.
_Avoid_: Undo, temporary rollback

**Continuity Update**:
The act of producing and accepting a new Continuity Snapshot for the exchange at a Continuity Checkpoint. Acceptance establishes a new Continuity Baseline and restarts the seven-exchange cadence.
_Avoid_: HCE call, scan

**Continuity Host**:
A trusted external computer that produces and returns Continuity Snapshots for pending Continuity Checkpoints. Its availability never weakens or bypasses checkpoint enforcement.
_Avoid_: Mac worker, HCE worker, Codex machine

**Story Summary**:
A causally ordered synthesis of the important story so far, using as much detail as continuity quality requires up to a 20,000-character safety ceiling. It is rewritten at every Continuity Update from the prior story knowledge and new exchanges; it is never an append-only transcript or event log.
_Avoid_: Running log, appended recap

**Scene Summary**:
A replaceable description of the immediate situation at the snapshot: current place and time, present participants, active tension, and what is poised to happen next, using up to an 8,000-character safety ceiling.
_Avoid_: Story Summary, recent transcript

**Latest Beat**:
A focused account of how the newest Roleplay Exchange changed the scene, using up to a 4,000-character safety ceiling. It replaces the prior Latest Beat at every Continuity Update.
_Avoid_: Scene Summary, latest reply
