---
status: accepted
---

# Use one Roleplay Generation pipeline across providers

Open Fantasia will build one immutable, provider-neutral Roleplay Generation Request and execute it through one orchestration and acceptance pipeline for every Roleplay Model. Direct APIs and the Mac Host are delivery adapters beneath that boundary: they may differ in streaming, durability, cancellation, and supported sampling controls, but they do not receive differently assembled story context or bypass shared validation, lifecycle, retry, supersession, and commit rules. Android remains authoritative for the exact system prompt, Roleplay Transcript Window, reachable Continuity Snapshot, Active Speaker, generation preferences, and output contract.

Every attempt is represented as a Roleplay Generation Job with a frozen request and model identity. The shared lifecycle is queued, generating, optional partial output, completed, failed, cancelled, or superseded. Direct APIs may emit partial output and cannot necessarily resume after process death; Mac-hosted Antigravity work may survive disconnection and return one atomic completion. These are declared adapter capabilities rather than separate generation architectures.

Model-visible prompt bytes are produced before adapter selection. Request IDs, timestamps, provider names, queue state, Tailscale details, and other transport metadata remain outside that content. Shared contract fixtures verify that adapters receive the same canonical request without context loss, reordering, or duplication. ADR-0007 defines the checkpoint-backed Roleplay Transcript Window and current prompt layout.

The Antigravity CLI does not expose a native chat-completions request or the full sampler controls used by direct APIs. Its adapter will therefore render the canonical request deterministically into explicitly role-delimited model input where the embedded system prompt is authoritative, message roles and order are binding, the latest reply control selects the speaker, prior assistant prose is history rather than instruction, and only final in-character prose may be returned. The complete rendered input is supplied directly to the model; agent-selected prompt-file reads are forbidden. Unsupported controls are reported honestly and never silently presented as applied.

All adapters share deterministic output validation for non-empty prose, transport-size safety, and removal or rejection of agent wrappers such as explanations, JSON, or code fences. Creative quality is not judged or automatically rewritten by a second model. A transport retry preserves the frozen request; regeneration, guidance, speaker changes, branch changes, or model changes create a new attempt and supersede the old one. Diagnostics retain hashes, counts, capabilities, timings, and lifecycle state without logging story prose.

## Considered Options

- Keeping the existing fork in the chat view model allows each provider to evolve independently, but it already caused prompt semantics and generation controls to drift.
- Forcing every provider to support identical streaming and sampler behavior would misrepresent Antigravity CLI capabilities and couple the domain to the least common denominator.
- Moving prompt construction to the Mac Host would reduce Android payload size but create two competing authorities for branch history, speaker selection, and continuity truth.

## Consequences

The Android database and generation orchestration will be consolidated around one job and request model, requiring a coordinated app and Mac Host protocol upgrade after a verified phone-data backup. Provider-specific differences remain visible as capabilities, while prompt construction, state selection, validation, retries, supersession, and atomic acceptance become provider-independent. This supersedes any interpretation of ADR-0004 in which Mac-hosted roleplay constitutes a separate generation architecture.
