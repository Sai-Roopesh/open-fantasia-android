---
status: accepted
---

# Use a checkpoint-backed Roleplay Transcript Window

Every Roleplay Generation Request will contain the complete accepted Continuity Snapshot reachable from the selected branch head exactly once, followed by the latest fifteen complete retained Roleplay Exchanges on that lineage as raw user and committed assistant prose, followed by the current incomplete exchange with its Active Speaker, reply controls, and optional regeneration direction exactly once.

One Roleplay Context Assembler owns ancestry validation, branch selection, the fifteen-exchange limit, raw transcript rendering, and current-message placement before a Roleplay Generation Job is reserved. Normal send, regenerate, user-message replacement, branch continuation, and the first reply after Rewind therefore cannot assemble context differently. Missing ancestry, cycles, and a Continuity Baseline outside the selected lineage fail closed. Rewind-discarded prose, sibling continuations, failed attempts, and starter seeds are absent.

The complete Continuity Snapshot is appended after the byte-stable Character Sheet system prefix. It remains stable between Continuity Updates and therefore remains useful to provider prompt caches. Historical exchanges never replay their stored rendered user messages: doing so accumulated obsolete snapshots and reply controls quadratically. Pins and Cast Roster resolution must be valid at the selected context head so editing an earlier exchange cannot leak facts discovered later.

Direct model adapters serialize the frozen request with native roles. The Antigravity adapter renders the identical request into one deterministic role-delimited prompt and supplies that prompt directly as the `agy --print` model input. It must not ask an Antigravity agent to inspect a prompt file, because file-tool pagination allowed the agent to skip most of large conversations. If direct delivery exceeds its explicit transport ceiling, the job fails visibly; no adapter may truncate, summarize, reorder, or selectively read the Roleplay Generation Request.

The Continuity Evidence Transcript is unchanged. A Continuity Update still receives the complete retained lineage so it can rewrite a complete independent Continuity Snapshot. The shared Codex and Antigravity Continuity adapters place that complete request directly in model input as well; neither may rely on agent-selected file ranges. An input beyond the explicit direct-delivery ceiling fails visibly and remains blocked. Portrait generation remains governed by its complete Portrait Brief and does not receive an irrelevant roleplay transcript.

## Consequences

- At most thirty historical role messages plus one current user message enter a Roleplay Generation Request.
- The latest fifteen exact exchanges preserve local prose, while the Continuity Snapshot carries older story truth.
- Prompt size grows linearly within a bounded window instead of quadratically with thread age.
- Provider differences remain adapter capabilities, not context-assembly differences.
- Editing committed assistant prose makes existing continuity stale and therefore requires an immediate blocking Continuity Update before roleplay resumes.

Committed Roleplay Exchanges are immutable once another branch can reference them. Editing assistant prose creates a branch-local replacement lineage from the edited exchange through the current head, preserves sibling history, and establishes a mandatory Continuity Checkpoint. Its Continuity Baseline is the nearest accepted snapshot strictly before the edited exchange, never a snapshot derived from the replaced prose.

This ADR supersedes ADR-0006 only where it required all reachable history and file-artifact delivery to Antigravity. ADR-0006 remains authoritative for the single provider-neutral request and shared job lifecycle.
