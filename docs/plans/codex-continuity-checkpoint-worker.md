# Codex Continuity Checkpoint Worker Plan

> Historical ADB implementation plan. Its runtime transport is superseded by [Tailscale Mac Host](./tailscale-continuity-host.md); ADB remains only for development and maintenance.

## Outcome

Replace every paid in-app HCE path with an event-driven Mac worker. After the fifteenth committed Roleplay Exchange on a branch since its Continuity Baseline, the fifteenth reply remains visible but the affected lineage becomes read-only. The app publishes a checkpoint request; the worker detects it over ADB, runs Codex once, returns a complete validated Continuity Snapshot, and the app unlocks only after accepting it.

This plan implements the language in [CONTEXT.md](../../CONTEXT.md) and the architecture recorded in [ADR 0001](../adr/0001-event-driven-continuity-checkpoint-worker.md).

## Locked Decisions

- Checkpoints occur after fifteen committed exchanges on the active branch lineage, not from a lifetime or global counter.
- Regenerations replace an exchange; rewinds discard exchanges; branches inherit the baseline and count at their fork point.
- A pending checkpoint is strict and non-bypassable. Failures and USB disconnections leave the lineage blocked.
- Blocking follows the checkpointed lineage. Unrelated threads and branch lineages remain usable.
- History-changing actions are frozen while the lineage is checkpointed. Reading, copying, inspecting, and switching to unrelated roleplays remain available.
- The response is a new complete snapshot, not a mutation patch.
- Codex receives the prior complete baseline plus the complete retained branch transcript. The request separately identifies the post-baseline checkpoint exchanges.
- Story Summary, Scene Summary, and Latest Beat are rewritten rather than appended. Their safety ceilings are 20,000, 8,000, and 4,000 characters respectively; there are no sentence-count targets and no mechanical truncation.
- Stable IDs and still-valid facts are preserved; current state is replaced with the latest truth; historical timeline events append only when genuinely notable.
- All paid automatic extraction, self-healing extraction, and Deep Scan extraction paths are removed. Deep Scan becomes an early `Update Continuity Now` checkpoint.
- The worker uses `gpt-5.6-terra` with high reasoning and one corrective retry when validation fails.
- The worker starts automatically for the signed-in macOS user and consumes no Codex usage while merely watching ADB.
- Every genuine rewind creates an immediate strict checkpoint. Deleted prose is never exported; only the old head, new head, discarded-exchange count, and retained continuity evidence are supplied.

## State and Storage

### Room migration 3 → 4

Add a `continuity_checkpoint_requests` table rather than encoding workflow state into UI flags. Each row contains:

- request ID and protocol version;
- thread, branch, target turn, and baseline turn IDs;
- baseline snapshot version and canonical content hash;
- status: `pending_export`, `waiting_for_worker`, `processing`, `validating`, `ready_to_import`, `accepted`, or `failed`;
- worker attempt count, user-facing failure detail, and timestamps.

Add indices for pending status, thread, branch, and target turn. Preserve all existing data with an explicit `MIGRATION_3_4`; do not use destructive migration. Existing latest reachable snapshots become initial baselines so installed users begin counting fifteen new exchanges from their current state.

### Baseline lookup

Change snapshot lookup from “snapshot attached to the current head turn” to “nearest accepted snapshot reachable through the current head's ancestors.” Between checkpoints, DeepSeek continues using that baseline while the normal conversation history contains the newer exchanges.

Keep existing snapshot rows during migration. New worker snapshots are marked with their checkpoint request identity so only accepted worker output establishes future cadence.

## Checkpoint State Machine

1. `commitTurn` commits the assistant reply normally.
2. In the same database transaction, walk the committed active lineage from its latest accepted baseline and count post-baseline exchanges.
3. On the fifteenth exchange, create exactly one pending request tied to the branch head and baseline hash.
4. The UI immediately observes the request and makes the affected lineage read-only.
5. A repository service exports the request package atomically to app external storage and marks it `waiting_for_worker`.
6. Worker status files advance the visible state through processing and validation.
7. The app imports only a response that still matches the pending request, target head, baseline version, and hash.
8. A single Room transaction inserts the snapshot, persists new timeline events, marks the request accepted, and establishes the new baseline.
9. The cadence returns to zero and the chat unlocks.

Enforce the freeze in DAO transactions as well as Compose. Sending, regenerating, editing either side of an exchange, rewinding, forking from the affected lineage, pin mutation, and continuity-affecting thread settings must fail closed even if invoked outside the visible screen. Thread-global continuity settings remain frozen while any lineage in that thread has a pending checkpoint.

## ADB Protocol

Use the app's external files directory under a versioned `continuity/` folder with `requests/`, `status/`, `responses/`, and `archive/` subfolders. Every write uses a temporary filename followed by an atomic rename.

### Request envelope

The exported JSON contains no API keys or connection secrets. It contains:

- protocol, request, app-build, and schema versions;
- thread, branch, target-turn, baseline-turn, version, and hash identity;
- character definition, selected persona, supporting cast, director notes, and active pins;
- the complete previous Continuity Snapshot, or an empty initial snapshot;
- the complete ordered retained transcript with turn IDs, parent IDs, user text, assistant text, and timestamps, plus the exact checkpoint-turn IDs;
- the complete output schema and semantic rules, including summary rewrite semantics and size ceilings.

### Response envelope

The response repeats all request identity fields and contains:

- the complete new Continuity Snapshot;
- only newly discovered notable timeline events, each anchored to an exact exchange turn ID from the source window;
- validation metadata produced by the worker.

The app is the final authority. It rejects malformed, stale, mismatched, partial, or semantically invalid responses without changing the existing baseline.

## Snapshot Reconstruction Rules

Codex treats the previous snapshot as compressed truth and the source window as evidence of change:

- Rewrite Story Summary as one coherent causal account of old story knowledge plus the full retained branch transcript. Never concatenate the old summary and a new paragraph.
- Rewrite Scene Summary from the situation after the checkpoint exchange only.
- Replace Latest Beat with the change produced by the checkpoint exchange.
- Preserve canonical entity, fact, relationship, location, edge, and narrative-thread IDs unless correcting a proven merge or duplicate.
- Preserve facts and off-stage entities that remain true even if unmentioned in the source window.
- Replace presence, emotion, placement, current location, relationship dynamics, goals, possessions, and thread status when the new exchanges provide evidence of change.
- Deduplicate equivalent facts and aliases; never invent proper names or merge distinct people.
- Resolve cross-references and ensure every placement, relationship, edge, and fact owner exists.
- Append only notable new timeline events; routine dialogue does not create history entries.

## Mac Checkpoint Worker

Create a small Node.js worker under `tools/continuity-worker/` using only stable local process and filesystem APIs where practical. Include:

- a worker executable and configuration file;
- request and response JSON Schemas;
- a quality-focused Codex prompt stored as a reviewable file;
- a fake-ADB/fake-Codex test harness;
- install, status, and uninstall commands for a per-user macOS LaunchAgent.

The worker loop:

1. Wait for an authorized device and reconnect automatically after disconnects.
2. Poll only for request markers; idle polling invokes no model.
3. Claim the oldest pending request and pull it into a request-specific temporary directory.
4. Verify request JSON, identity, source-window ordering, baseline hash, and absence of secrets.
5. Invoke Codex with structured output, the configured quality-first model, and high reasoning.
6. Validate JSON structure, identity, sizes, uniqueness, graph references, metadata version, current turn, and every timeline event's turn/entity/relationship references.
7. Constrain Codex with the phone-compatible response JSON schema. If semantic reference validation still fails, run one corrective attempt with the exact validation errors and revalidate.
8. Push the valid response under a temporary name, atomically rename it, and wait for the app's accepted or rejected acknowledgement.
9. Archive successful protocol files and retain concise diagnostics for failures.

Probe candidate Codex executables at startup instead of trusting `PATH`. The current Homebrew wrapper is broken; the working fallback is `/Applications/ChatGPT.app/Contents/Resources/codex` (`codex-cli 0.144.2`). Keep this path configurable because application updates may move it. Use the Android SDK ADB at `/Users/sairoopesh/Library/Android/sdk/platform-tools/adb` when `adb` is not on `PATH`.

## Android Import and UI

Replace the startup-only debug importer with a production-safe, idempotent checkpoint bridge:

- scan on app startup and resume;
- observe or briefly poll while a checkpoint screen is visible so import happens without relaunching;
- consume worker status files for clear progress;
- archive accepted responses and acknowledgements;
- tolerate duplicate delivery and process death.

Show a prominent checkpoint card above a disabled input area:

- `Continuity checkpoint reached`;
- `Waiting for Mac worker`;
- `Codex is rebuilding continuity`;
- `Validating complete snapshot`;
- `Connection lost — reconnect USB to continue`;
- `Update failed — Retry` with the exact safe error summary.

Retry republishes the same immutable continuity payload with an incremented attempt number, so the worker treats it as a new bounded run instead of suppressing it as already seen. Exhausted worker attempts publish a failure status that the phone displays. There is no skip or continue-without-memory action. `Update Continuity Now` creates the same state machine early and resets cadence only after acceptance.

## Remove Paid HCE Paths

- Stop calling `materializeSnapshotForTurnInBackground` after a committed reply.
- Remove automatic extraction from `selfHealSnapshotIfNeeded`.
- Replace `runDeepScan` with early checkpoint creation.
- Remove the HCE brain-model controls from thread settings; retain old database columns during this migration if dropping them would add risk, but make them unused.
- Remove obsolete HCE call wiring only after checkpoint tests pass. Preserve unrelated uncommitted work currently present in the same files.
- Add a regression test proving fifteen ordinary exchanges and an on-demand update make no extraction-provider requests.

## Verification

### Unit and DAO tests

- fifteen-exchange boundary, no gate at fourteen, exactly one request at fifteen;
- regeneration replacement, rewinds, fork inheritance, descendant blocking, and unrelated-branch freedom;
- nearest reachable baseline lookup;
- transactional enforcement for every frozen mutation;
- request export ordering and exact fifteen-exchange content;
- complete-snapshot schema, summary ceilings, stable IDs, graph references, hashes, and stale-response rejection;
- idempotent duplicate response and process-restart handling;
- early checkpoint cadence reset.

### Worker tests

- fake device disconnect/reconnect and unauthorized-device states;
- multiple queued requests processed serially;
- malformed request refusal;
- Codex failure, invalid response, one corrective retry, and permanent failure;
- atomic push and acknowledgement handling;
- no Codex process while idle.

### UI and device tests

- fifteenth reply remains visible while input and lineage mutations are disabled;
- progress and failure states survive rotation and app restart;
- unrelated threads and eligible branches remain usable;
- accepted response updates the Inspector and unlocks without relaunching;
- no paid HCE network call occurs.

### USB end-to-end acceptance

1. Restore ADB visibility—the phone is physically connected but `adb devices -l` currently lists no device. Unlock it, select file-transfer mode, and accept the debugging authorization prompt.
2. Build and install the migrated debug app without clearing its data.
3. Run the worker manually first and verify a synthetic request/response round trip.
4. Complete fifteen real exchanges and observe strict blocking, one Codex run, live import, and unlock.
5. Disconnect USB during processing, confirm the chat stays blocked, reconnect, and confirm automatic recovery.
6. Test rewind, regeneration, and branching around a baseline.
7. Install and enable the LaunchAgent only after the manual worker passes.

## Implementation Order

1. Add protocol fixtures, JSON Schemas, validators, and failing tests.
2. Add Room v4 request state and non-destructive migration.
3. Implement lineage baseline lookup, counting, and transactional checkpoint creation.
4. Switch chat prompting to the nearest accepted baseline.
5. Implement atomic request export and live response import with stale guards.
6. Add the read-only checkpoint UI and enforce mutation blocking below the UI.
7. Build and test the Mac worker with fake ADB and Codex processes.
8. Repurpose Deep Scan and remove all paid extraction call paths and brain-model UI.
9. Run unit, instrumentation, migration, worker, and full Gradle verification.
10. Restore phone authorization, perform USB end-to-end tests, then install the LaunchAgent.

## Definition of Done

- Exactly the fifteenth eligible exchange creates one durable checkpoint request.
- No affected lineage mutation can bypass a pending checkpoint.
- Idle watching consumes no Codex run and ordinary chat makes no HCE provider call.
- Codex receives the complete retained branch transcript and prior snapshot; Rewind-discarded exchanges are absent.
- Only a complete, current, semantically valid snapshot can establish a new baseline.
- Disconnects, crashes, invalid output, duplicate delivery, and stale responses never unlock or corrupt the chat.
- A successful response updates the visible continuity state and unlocks the chat without restarting the app.
- The worker starts at macOS login and recovers automatically when USB reconnects.
