---
status: accepted
---

# Keep dynamic cast lineage-scoped and speaker input volatile

Open Fantasia will treat speakable characters as a complete Cast Roster carried by branch-valid Continuity Snapshots, not as a thread-global Supporting Cast list. Manual Cast Seeds exist from the thread root; characters discovered by Continuity Updates exist only on lineages where story evidence establishes them. This prevents a character introduced on one branch from leaking into siblings and lets Rewind prune later discoveries with the same truth rules as every other continuity fact.

The Primary Character remains the default, but each branch has an explicit sticky Active Speaker and every Roleplay Exchange records the requested speaker. Single-speaker mode permits only that Cast Member's dialogue, action, reaction, and interiority; Ensemble is a separate explicit mode. The player-controlled Persona is never eligible. Historical replies retain their recorded speaker identity through profile edits, archives, forks, regeneration, and Rewind.

Dynamic cast and speaker data will never mutate the cacheable system-prompt prefix. The Active Speaker's full Cast Profile, concise profiles for other present members, and current continuity view live in a deterministic per-exchange suffix. Open Fantasia stores the exact rendered model input used for every exchange and reuses it byte-for-byte when reconstructing history, so each later request extends the previous request prefix instead of replacing an earlier state-enriched user message with raw text. Automatic cast changes therefore cause no recurring prefix invalidation and should increase prompt-cache reuse after one unavoidable upgrade cold start.

Continuity Updates return the complete Cast Roster atomically with the complete world state. Stable IDs, aliases, provenance, field ownership, player exclusion, branch reachability, and references are validated together; invalid cast output rejects the entire update and receives the existing single corrective run. Manually locked profile fields cannot be overwritten by generated content, uncertain duplicate identities are never merged automatically, and established members are archived rather than destructively deleted.

Branch-valid Side State is resolved through branch ancestry and reachable Roleplay Exchange IDs at one shared seam. A child branch inherits valid pins, timeline events, Cast Profile overrides, and Cast Portraits from its ancestors; Rewind or replacement immediately hides side state attached to prose that is no longer reachable. A fork restores the sticky Active Speaker recorded at the fork exchange rather than copying the source branch's later speaker state.
