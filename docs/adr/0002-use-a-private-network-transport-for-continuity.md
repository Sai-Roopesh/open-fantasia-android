---
status: accepted
---

# Replace the ADB continuity transport with a private network service

Open Fantasia will preserve the event-driven Continuity Host from ADR-0001 but replace its runtime ADB file exchange with an authenticated HTTP service reachable through Tailscale. This keeps Codex execution on the trusted Mac while allowing Continuity Updates from any phone network without USB debugging; the existing checkpoint request and validated snapshot protocol remains the authority for strict blocking, rewind pruning, and acceptance.

Availability is explicitly Mac-owned. A single Mac command will enable, disable, or report the Tailscale connection and Continuity Host together. The Android app will report reachability and retry pending checkpoints, but it will not attempt to enable or disable the Mac remotely because disabling the private route would also remove the route needed to re-enable it.

Tailscale HTTP is the only runtime checkpoint transport. The ADB request-directory watcher will be removed rather than retained as a fallback, preventing two transports from processing or reporting different states for the same checkpoint. ADB remains a development and maintenance tool for installing builds, creating backups, reading diagnostics, and other explicitly initiated work; the installed app never depends on it for normal Continuity Updates.

Tailscale reachability is necessary but not sufficient authorization. Each phone must be paired once using a QR code or backup code produced by a Mac command. Pairing issues a unique random credential stored securely on both devices; reinstalling the app, losing the credential, or revoking the phone requires pairing again. An unpaired tailnet device cannot submit checkpoint requests or read their status or results.

Checkpoint delivery uses retryable HTTP rather than a persistent socket. The app idempotently submits an immutable checkpoint under its existing request identity, receives a pending acknowledgement, and polls its status while the lineage is blocked. App restarts, Mac restarts, and phone network changes resume the same request instead of creating another Continuity Update; polling while a job is pending does not invoke Codex or consume model usage.

The Continuity Host durably stores received jobs and their outcomes using atomic Mac-side files, separate from the Android database. Interrupted work returns to the queue after a host restart, completed results remain available until the phone confirms acceptance, and resubmitting an existing request identity returns its existing job rather than launching Codex twice.

The host runs one Codex Continuity Update at a time through a global first-in-first-out queue. Checkpoints on other lineages may wait independently, while unrelated unblocked lineages remain usable. Serial execution avoids competing Terra High runs and makes resource use, validation, and recovery deterministic.

The host backend listens only on localhost and is exposed to the tailnet through private Tailscale Serve HTTPS under its stable MagicDNS name. Tailscale Funnel is never enabled. The Android Tailscale client remains user-controlled and connected; the Mac command is the sole availability control for the Continuity Host.

The Mac command supports `on`, `off`, `off --force`, and `status`. Enabling starts Tailscale, private HTTPS, the Continuity Host, and a sleep-prevention lease. Normal shutdown drains and durably saves active work before disconnecting; forced shutdown interrupts safely and returns unfinished work to the queue.

The app displays host reachability and warns when an unavailable host will be needed, but it preserves checkpoint semantics: the fifteenth reply remains visible before strict blocking begins. While blocked, foreground status checks run every ten seconds; background retries begin at ten seconds and use increasing delays without a permanent foreground service. A completed result is validated and accepted atomically, with a notification when Android permits it.

Each Terra High run has a thirty-minute watchdog and one automatic corrective run after output validation failure. Exhaustion reports failure, leaves the checkpoint in force, and permits a new explicit retry without any skip or continue-without-continuity path.

Both host and phone validate response identity, structure, references, and safety ceilings. The phone acknowledges only after atomically storing the Continuity Snapshot and timeline. Accepted request and response prose is then deleted from the host; non-content diagnostics remain for seven days, while unaccepted jobs may remain for thirty days and never place story prose in logs.

Branch changes and Rewinds supersede stale queued or running jobs. A stale result can never be accepted, and its replacement keeps the superseded job's queue position. Credentials are kept in Android Keystore and macOS Keychain, with Mac-owned commands to pair, list, and revoke phones.

The HTTP protocol is versioned under `/v1`. Incompatible app and host versions remain blocked with an explicit upgrade message. Cutover occurs only with no active checkpoint and after a verified phone-data backup: install and pair the network build, test a private round trip, then disable the ADB runtime before enabling the network runtime. Terra High, full replacement snapshots, the fifteen-exchange cadence, Rewind pruning, timeline events, summary ceilings, and existing acceptance rules do not change.

## Considered Options

- A local-Wi-Fi service avoids a private-network dependency but fails across unrelated networks and can be blocked by guest-network isolation.
- A cloud relay works while the phone and Mac are on unrelated networks but introduces a hosted intermediary for private roleplay content.
- Direct USB accessory communication removes ADB but retains a cable and requires substantially more platform-specific protocol work.

## Consequences

The Mac must be awake, online, connected to Tailscale, and running the Continuity Host. When it is unavailable, a Continuity Checkpoint remains in force and the app retries without offering a bypass. Tailscale and the worker are enabled manually on the Mac; no cloud control path is introduced merely to toggle them remotely.
