---
status: accepted
---

# Share the Mac Host across continuity and Antigravity roleplay

Open Fantasia will broaden the Tailscale service introduced in ADR-0002 into one Mac Host for two durable job types: Continuity Updates and Antigravity Roleplay Generation Jobs. Android remains the authority for thread history, branch lineage, pending replies, speaker selection, and accepted Continuity Snapshots. The Mac Host supplies model execution only; it never owns a hidden conversation.

ADR-0006 further establishes that direct API and Mac-hosted Roleplay Models execute one provider-neutral Roleplay Generation Request through one orchestration pipeline. The Mac Host changes delivery and lifecycle capabilities, not prompt assembly or roleplay semantics.

Continuity Checkpoints occur after fifteen completed Roleplay Exchanges since the reachable Continuity Baseline. The fifteenth reply remains visible before strict blocking begins. Rewind and explicit early-update checkpoints remain independent of that cadence. A checkpoint can never be skipped because the Mac Host or selected Continuity Engine is unavailable.

Each future checkpoint freezes one exact Continuity Engine identity when created. The supported identities are `codex:gpt-5.6-terra:high` and `antigravity:gemini-3.6-flash:high`; display labels are not protocol identities. Android requires an app-wide default before submitting the fifteenth reply, while changes affect only future checkpoints. A failed checkpoint permits retry with the same engine or explicit replacement by the other engine. Replacement supersedes the old request under a new request identity and never unlocks the lineage by itself.

Both Continuity Engines receive the same canonical request, prompt, response schema, semantic validation, quality ceilings, and one corrective run after validation failure. The request includes the complete retained branch transcript and separately identifies the post-baseline checkpoint turns; Rewind-discarded prose is never included. The adapters differ only in process invocation. Codex retains schema-constrained execution; Antigravity uses the official authenticated `agy` CLI and complete local schema validation. Neither credentials nor Antigravity login material are copied to Android.

Roleplay threads gain `antigravity:gemini-3.6-flash:high` as a built-in Roleplay Model alongside all existing API connections and models. Selection remains per thread. Existing threads keep their selection until explicitly changed, and each submitted reply freezes its Roleplay Model. DeepSeek and every existing direct API path remain operational and behaviorally unchanged.

Every Antigravity reply is a fresh stateless run receiving the same canonical Roleplay Generation Request used by the Android model pipeline. Because the Antigravity CLI does not expose native chat-message roles, its adapter deterministically renders that request into role-delimited direct model input while preserving the authoritative system prompt, Roleplay Transcript Window, and volatile suffix. Stable content remains at the front and the selected speaker and other exchange-volatile instructions remain at the tail. Request IDs, timestamps, host state, and transport metadata never enter the model prompt. ADR-0007 defines context selection and forbids agent-selected prompt-file reads.

Android submits immutable Roleplay Generation Jobs and polls their durable status every ten seconds. A thread permits one pending reply and remains input-locked until that reply is accepted or its pending user message is explicitly discarded. Other threads remain usable and may queue work. Failure offers retry, change-model-and-retry, or discard; there is no automatic DeepSeek fallback. A Gemini roleplay attempt has a ten-minute watchdog.

Each roleplay result is accepted atomically only if its request identity, thread, branch, branch head, pending user message, selected speaker, and frozen model still match. Rewind, regeneration, branch replacement, or discarding the pending message supersedes the job, requests best-effort cancellation, and permanently rejects late output. A new attempt receives a new request identity.

The Mac Host has separate Codex and Antigravity execution lanes. Antigravity runs at most one job at a time. A queued Gemini Continuity Update precedes queued Gemini roleplay work because it blocks a lineage, but active work is not preempted. The existing global ordering of Continuity Updates remains authoritative; a Terra Continuity Update may run alongside Antigravity roleplay work.

Roleplay request and response prose is removed from the Mac immediately after Android acknowledges acceptance. Unacknowledged roleplay content expires after twenty-four hours, after which Android reports expiration and offers retry. Logs retain only non-content diagnostics. Background completion uses opportunistic Android work and a privacy-safe `Reply ready` notification with no character or story text; reopening the app synchronizes immediately. No permanent foreground notification is required.

Android persists typed pending acknowledgements for Continuity, roleplay, and portrait jobs and retries them independently of whether the accepted job still appears in a pending-job query. The running Mac Host enforces retention periodically, not only at startup. Expiration removes request and response prose while retaining a short-lived diagnostic tombstone so Android reports expiration and offers an explicit new immutable retry instead of silently recreating the old job.

The version-2 authenticated HTTP protocol carries both job types through the same pairing credential and Tailscale-only route. Version mismatches fail explicitly. The user-facing service name becomes Mac Host. A `fantasia-host on|off|off --force|status` command controls Tailscale, serving, job processing, and sleep prevention together; the existing `continuity-remote` command remains an alias.

Antigravity usage displays provider identity and elapsed time only. Token counts, cache hits, and credit consumption are marked unavailable instead of estimated. Existing usage reporting for direct API providers is unchanged.

## Considered Options

- Direct Gemini API access provides streaming and explicit API features but consumes separate API billing instead of the user's Antigravity subscription and credits.
- A persistent Antigravity conversation may reuse hidden state but becomes incorrect after branching, regeneration, speaker changes, and Rewind.
- A long-lived HTTP response is simpler but is fragile across phone backgrounding, Tailscale changes, and slow high-effort runs.
- Silent DeepSeek fallback improves apparent availability but unpredictably changes character voice, model behavior, and cost.
- Separate Mac services isolate job types but duplicate pairing, lifecycle control, state reporting, and failure modes.

## Consequences

Antigravity roleplay requires the Mac Host and Tailscale to be available and does not stream tokens; completed prose arrives atomically. Durable jobs survive transient disconnection, and other direct API Roleplay Models remain available when the user explicitly selects them. The protocol and Android database require a coordinated upgrade, preceded by a verified phone-data backup. The broader Mac Host name reflects its expanded responsibility without changing strict checkpoint enforcement.
