# Tailscale Continuity Host Plan

## Outcome

Replace the runtime ADB file exchange with a private, authenticated HTTP connection from Open Fantasia to the Mac Continuity Host through Tailscale. The phone can request a Continuity Update from any internet-connected network while the Mac has been manually enabled, remains awake and online, and is connected to Tailscale.

This changes transport and operational control only. Continuity Checkpoints remain strict, the seventh reply remains visible, Rewinds immediately require a replacement snapshot, discarded prose remains unavailable to Codex, and only an atomically accepted complete Continuity Snapshot establishes a new Continuity Baseline.

## Locked Decisions

- Tailscale HTTP is the only runtime transport. ADB is limited to development, installation, backups, and diagnostics.
- Availability is Mac-owned through one command with `on`, `off`, `off --force`, and `status` operations.
- The Android app reports reachability and retries but cannot enable or disable the Mac.
- Each phone is paired once using a Mac-generated QR or backup code and receives a unique revocable credential.
- The API uses idempotent HTTP submission and status polling, not a persistent WebSocket.
- Foreground polling occurs every ten seconds. Background retries start at ten seconds and back off.
- Jobs and results survive host restarts in a durable atomic file spool separate from the phone database.
- One global first-in-first-out queue runs one Terra High job at a time.
- A run has a thirty-minute watchdog and one automatic corrective attempt after validation failure.
- Tailscale Serve provides private HTTPS under MagicDNS; the backend listens only on localhost and Funnel is never used.
- Accepted prose is removed from the Mac after phone acknowledgement. Metadata-only diagnostics remain seven days; unaccepted content expires after thirty days.
- Migration happens with no pending checkpoint and only after a verified phone-data backup. ADB and HTTP runtimes never run concurrently.

## Runtime Sequence

1. The seventh Roleplay Exchange completes, an early update is requested, or a Rewind establishes a retained branch head.
2. The app commits the immutable checkpoint request and strict blocked state locally before attempting network delivery.
3. The app submits the request to `POST /v1/checkpoints` using its paired credential and existing request identity.
4. The host atomically records the request and returns its current state. Repeated submissions return the same job.
5. The single global queue starts Codex Terra High when the job reaches the front.
6. The host validates identity, version, snapshot completeness, references, summary ceilings, and timeline events. One validation failure may trigger one corrective Codex run.
7. The app polls `GET /v1/checkpoints/{request_id}` every ten seconds while visible. Background work retries with increasing delays.
8. When complete, the app downloads and independently validates the response.
9. One Android database transaction stores the complete snapshot and timeline, accepts the checkpoint, establishes the new baseline, and unlocks the affected lineage.
10. The phone acknowledges acceptance through `POST /v1/checkpoints/{request_id}/ack`; only then may the host delete narrative content.

If the phone, Mac, Tailscale, host, or Codex becomes unavailable, the persisted checkpoint remains blocked. Reconnection resumes the same request rather than starting another run.

## HTTP Protocol

Implement a versioned `/v1` API with JSON request and response envelopes:

- `GET /v1/health` reports protocol version, enabled or draining state, queue depth, active request identity, and elapsed time without exposing story content.
- `POST /v1/pair` exchanges a single-use, short-lived pairing code for a unique device credential.
- `POST /v1/checkpoints` idempotently creates or retrieves a job by request identity and immutable payload hash.
- `GET /v1/checkpoints/{request_id}` returns `queued`, `generating`, `validating`, `ready`, `failed`, `superseded`, or `incompatible` plus safe progress metadata.
- `GET /v1/checkpoints/{request_id}/result` returns a completed response only to the credential that submitted it.
- `POST /v1/checkpoints/{request_id}/ack` records phone acceptance and schedules narrative-content deletion.
- `POST /v1/checkpoints/{request_id}/supersede` invalidates stale work and supplies the replacement request identity.

Require the existing `protocol_version`, `request_id`, `thread_id`, `branch_id`, `target_turn_id`, `baseline_hash`, and attempt identity on every relevant transition. A duplicate identity with a different immutable payload hash is a conflict, never an update. Unknown protocol versions return an explicit incompatibility response and cannot launch Codex.

## Phase 1: Extract and Lock the Protocol

1. Move request hashing, identity comparison, response validation, and status definitions into transport-neutral modules on both platforms.
2. Preserve the current request and response schemas, including the complete baseline, exact source exchanges, Rewind pruning metadata, complete replacement `world_state`, and timeline events.
3. Add fixtures covering cadence, early update, Rewind, stale branch, duplicate request, mismatched payload, incompatible protocol, oversized summaries, invalid references, and timeline errors.
4. Add contract tests that run the same valid and invalid envelopes through the Mac and Android validators.
5. Leave the installed ADB runtime untouched during development; this phase changes no phone data or active transport.

## Phase 2: Build the Continuity Host Server

1. Split the current worker into transport-neutral Codex execution, validation, job scheduling, and HTTP-adapter modules.
2. Bind the HTTP backend only to `127.0.0.1` on a fixed configurable port.
3. Implement the `/v1` endpoints with strict content types, body-size ceilings, constant-time credential comparison, request rate limits, and metadata-only structured logs.
4. Store jobs under the signed-in user's Application Support directory using private permissions and atomic write-then-rename operations.
5. Represent durable states explicitly: `queued`, `running`, `ready`, `failed`, `superseded`, and `acknowledged`.
6. On startup, recover interrupted `running` jobs to `queued`; never assume an incomplete Codex process succeeded.
7. Run one job globally at a time. Preserve FIFO order, except that a replacement keeps the superseded job's existing position.
8. Enforce a thirty-minute process watchdog. Kill the process cleanly on timeout, record metadata-only failure, and require an explicit phone retry after automatic attempts are exhausted.
9. Reuse Terra High, the response schema, full-snapshot prompt, timeline requirements, one corrective validation retry, and all existing semantic validation.
10. Delete acknowledged narrative request and response files immediately. Remove metadata-only diagnostics after seven days and unacknowledged content after thirty days.

## Phase 3: Pairing and Mac Control

1. Use the macOS Keychain for device credentials and pairing secrets. Never place credentials or prose in LaunchAgent property lists, command arguments, or logs.
2. Add `continuity-remote pair`, `devices`, and `revoke` commands. Pairing codes are single-use, expire quickly, and can be rendered as a QR code or copied as a backup code.
3. Install the supported standalone Tailscale Mac client and its CLI integration during one-time setup; login and VPN authorization remain explicit user actions.
4. Configure Tailscale Serve in private HTTPS mode to proxy the stable MagicDNS URL to the localhost backend. Do not configure Funnel.
5. Implement `continuity-remote on` to connect Tailscale, start the host, enable private Serve, and acquire a `caffeinate` sleep-prevention lease.
6. Implement normal `off` as a drain: reject new submissions, finish and persist active work, stop Serve and the host, release the sleep lease, then run `tailscale down`.
7. Implement `off --force` to interrupt active Codex safely, return unfinished work to the durable queue, and shut down immediately.
8. Make `status` report Tailscale reachability, Serve URL, pairing state, queue depth, active request, elapsed time, and draining state without story content.
9. Replace the always-running ADB watcher LaunchAgent with a manually controlled host LaunchAgent that is disabled while remote continuity is off.

## Phase 4: Android Network Gateway and Pairing

1. Add a transport-neutral Continuity Gateway interface and an authenticated Ktor HTTP implementation.
2. Remove runtime production calls to the external-files ADB bridge. Retain ADB tooling only outside the app for maintenance.
3. Add a Continuity Host settings surface for pairing by QR or backup code, displaying the private host name, credential status, last successful contact, protocol compatibility, and revoke or re-pair actions.
4. Encrypt the device credential with Android Keystore-backed storage. Never put it in Room rows, exported files, logs, or diagnostics.
5. Keep the immutable checkpoint request and all blocking state in Room so app death or network loss cannot weaken the checkpoint.
6. Submit idempotently and poll every ten seconds while the relevant chat is visible.
7. Schedule background retries beginning at ten seconds with increasing delays and network constraints. Do not hold a permanent foreground service.
8. When Android permits notifications, notify after a background Continuity Update is accepted; correctness must not depend on notification permission.
9. Provide `Mac available`, `Mac unavailable`, `queued`, `generating`, `validating`, `failed`, and `version mismatch` UI states with queue position and safe elapsed-time information.
10. Show an availability warning before the exchange that will trigger the next checkpoint, but preserve the domain rule: that reply may complete and remains visible before strict blocking begins.
11. Offer connection retry and a shortcut to the Tailscale Android app when the tailnet is disconnected. Do not claim Open Fantasia can enable the Android VPN itself.

## Phase 5: Acceptance, Supersession, and Recovery

1. Revalidate the downloaded envelope and its complete Continuity Snapshot on Android before opening a database transaction.
2. In one transaction, verify that the request is still the active checkpoint for the branch, insert the snapshot and timeline, accept the checkpoint, and unlock only the affected lineage.
3. Send acknowledgement only after the transaction commits. If acknowledgement fails, retry it without re-importing the already accepted snapshot.
4. Reject every response whose request identity, branch head, baseline hash, attempt, schema, references, or target exchange is stale.
5. When a branch change or Rewind supersedes queued work, tell the host before submitting the replacement. If the stale job is running, terminate it; if it is queued, replace it in place.
6. Preserve the rule that discarded Rewind prose never enters the replacement request, host spool, Codex prompt, logs, or diagnostics.
7. On `failed`, keep the checkpoint blocked and expose Retry. Retry republishes the same immutable evidence with an incremented attempt identity and starts a new bounded queue job.
8. On `incompatible`, keep the checkpoint blocked and explain which side requires an update. Never fall back to ADB or paid in-app HCE.

## Phase 6: Verification

### Mac unit and integration tests

- Authentication, expired pairing codes, revocation, and cross-device result isolation.
- Duplicate request idempotency and same-identity or different-payload conflicts.
- FIFO serialization and replacement queue-position preservation.
- Crash recovery from every durable state and atomic-file interruption point.
- Thirty-minute watchdog behavior using a shortened test clock.
- Original response validation, corrective retry, failure publishing, and prose-free logs.
- Acknowledgement cleanup and seven-day or thirty-day retention boundaries.
- Graceful drain and forced interruption.

### Android tests

- Pairing and Keystore-backed credential behavior.
- Ten-second foreground polling and background backoff using virtual clocks.
- Network loss, app restart, Mac restart, repeated submission, and delayed acknowledgement.
- Strict blocking, warning placement, unrelated-lineage availability, retry, and incompatibility UI.
- Atomic snapshot and timeline acceptance and stale response rejection.
- Rewind supersession without discarded prose.

Use isolated test databases and test application storage. Do not run destructive instrumentation against the user's live app data. Before any connected-device acceptance test, create and verify a fresh app-data backup.

### Private-network acceptance

1. Confirm the phone reaches the MagicDNS HTTPS endpoint over home Wi-Fi, unrelated Wi-Fi, and mobile data.
2. Confirm hard-NAT fallback still completes a small checkpoint request.
3. Turn the Mac off mid-wait and verify strict blocking persists; turn it on and verify the same request resumes.
4. Change the phone network mid-generation and verify no second Codex job starts.
5. Restart the host mid-job and verify durable recovery.
6. Revoke the phone and verify it cannot submit or read results.
7. Confirm `off` drains and `off --force` requeues safely.
8. Confirm accepted prose is removed from the Mac and no logs contain story text.

## Phase 7: Safe Cutover

1. Verify there is no pending or active Continuity Checkpoint and allow any current ADB job to finish.
2. Create a timestamped phone app-data backup, record its checksum, and verify database integrity and key row counts.
3. Install and authenticate Tailscale on the Mac and Android phone; enable MagicDNS and private HTTPS for Serve.
4. Install the network-enabled Open Fantasia build without clearing app data.
5. Disable the ADB worker before enabling the Continuity Host so there is never a dual-runtime window.
6. Run `continuity-remote on`, pair the phone, and verify health, authentication, protocol version, queue status, and a synthetic request or result round trip.
7. Trigger one controlled Continuity Update, verify the complete snapshot and timeline transaction, acknowledgement, unlock, and host cleanup.
8. Confirm normal roleplay, seventh-exchange blocking, Rewind supersession, mobile-data operation, Mac drain, and automatic recovery.
9. Remove the obsolete ADB runtime LaunchAgent and ADB polling configuration. Preserve ADB itself and documented maintenance commands for builds, backups, and diagnostics.
10. Retain the pre-cutover backup and a disabled rollback package until multiple real checkpoints have succeeded.

Rollback is explicit and never dual-runtime: turn the network host off, reinstall the prior app build without clearing data, restore the verified backup only if integrity or compatibility requires it, and enable the old ADB worker only after the network runtime is confirmed disabled.

## Completion Criteria

- A checkpoint created on mobile data completes through the private Mac host without USB or ADB.
- The Mac command is the only availability control and accurately reports all relevant state.
- Exactly one Codex job exists for an idempotent checkpoint, including across retries and restarts.
- The app remains strictly blocked through every connectivity, process, validation, and version failure.
- Rewind-pruned prose is never transmitted or reconstructed.
- Only a locally validated, atomically committed complete snapshot and timeline unlocks the lineage.
- No public endpoint, narrative logging, plaintext credential storage, or production ADB dependency remains.
- Phone data counts and integrity match the verified pre-cutover state except for expected new checkpoint records.
