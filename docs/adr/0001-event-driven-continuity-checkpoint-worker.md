# Use an event-driven host worker for continuity checkpoints

> The event-driven host decision remains active, but its runtime ADB transport is superseded by [ADR-0002](./0002-use-a-private-network-transport-for-continuity.md).

Open Fantasia will pause after each continuity checkpoint and publish a request for a Mac-side worker watching the phone through ADB. The worker will start Codex only when a request exists, validate and return the resulting Continuity Snapshot, and allow the chat to resume after the app accepts it. This was chosen over a recurring Codex heartbeat because idle ADB polling does not consume Codex usage, while preserving automatic recovery without paid in-app HCE calls.

## Considered Options

- A heartbeat attached to a long-lived Codex task would retain conversational context, but every idle poll would consume Codex usage and checkpoint detection would be schedule-bound.
- A fresh Codex CLI run loses task context, but the checkpoint package can provide all required roleplay context and the run occurs only when needed.

## Consequences

The Mac must remain awake with the worker running, and the phone must remain connected and authorized for USB debugging. The checkpoint package and response protocol must contain enough context and identity information for a stateless Codex run to produce a safe, non-stale update.

A genuine rewind is also a checkpoint event, independent of the fifteen-exchange cadence. The app deletes the later lineage before it publishes the request and blocks further roleplay until the worker returns a complete replacement snapshot. Codex receives the retained baseline, retained exchanges, old and new head identifiers, and the number of discarded exchanges. It never receives, infers, or reconstructs the discarded prose.
