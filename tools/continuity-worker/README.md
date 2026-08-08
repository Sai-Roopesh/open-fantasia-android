# Open Fantasia Mac Host

The Mac Host gives Open Fantasia three private, durable services through Tailscale:

- complete Continuity Snapshots after every fifteen committed replies, after a Rewind, or on demand;
- optional stateless roleplay replies from Antigravity Gemini 3.6 Flash High.
- cinematic character portraits created through Antigravity's managed image tool.

Continuity can use either Codex GPT-5.6 Terra High or Antigravity Gemini 3.6 Flash High. Roleplay can continue using any existing direct Android provider, including DeepSeek, or use Antigravity through this host. An unavailable host never bypasses a checkpoint or silently changes models.

## One-time setup

1. Install Tailscale on the Mac and Android phone and sign both into the same tailnet.
2. Install and sign in to Codex CLI and Antigravity CLI on the Mac.
3. From the repository root, run `tools/continuity-worker/install-host-launch-agent.sh`.
4. Start the private host with `tools/continuity-worker/fantasia-host on`.
5. Run `tools/continuity-worker/fantasia-host pair`, then scan the terminal QR code with the phone. The printed address and one-time code are the backup pairing method in Open Fantasia Settings.

The old `continuity-remote` command remains an alias so existing Mac setup keeps working.

## Everyday controls

- `tools/continuity-worker/fantasia-host on` starts Tailscale, private HTTPS, and the host.
- `tools/continuity-worker/fantasia-host status` reports reachability, queued work, and active work without story content.
- `tools/continuity-worker/fantasia-host off` drains active work, preserves queued work, then turns Tailscale off.
- `tools/continuity-worker/fantasia-host off --force` interrupts active work and leaves it recoverable for the next start.
- `tools/continuity-worker/fantasia-host devices` lists paired phones.
- `tools/continuity-worker/fantasia-host revoke DEVICE_ID` immediately revokes one phone.

## Runtime guarantees

- The app submits immutable, idempotent protocol-v2 jobs and polls every ten seconds.
- Continuity work is globally serialized. On the Antigravity lane, queued work runs in Continuity → roleplay → portrait priority order; active work is never preempted.
- A Continuity run may take up to thirty minutes and receives one corrective run after validation failure.
- Codex and Antigravity Continuity Engines receive the same complete retained Continuity Evidence Transcript directly as model input. Neither engine chooses ranges from a request file; oversized input remains blocked with a visible failure rather than being partially processed.
- A roleplay run may take up to ten minutes and never falls back to another model.
- Direct API and Mac-hosted replies originate from the same immutable Roleplay Generation Request: one complete reachable Continuity Snapshot, the latest fifteen exact retained Roleplay Exchanges, and the current reply controls and user prose. Antigravity receives the complete deterministic role-delimited rendering directly as model input; it never selects ranges from a prompt file. Oversized input fails visibly rather than being truncated.
- The Antigravity CLI does not expose Temperature, Top P, maximum-token, or repetition-penalty controls. These capabilities are reported as unsupported rather than silently presented as applied; prompt-level length and variation contracts remain authoritative.
- A portrait run may take up to ten minutes, receives one corrective attempt for an invalid image, and never falls back to Pollinations.
- Responses are accepted only when request, thread, branch, turn, speaker, mode, and frozen model all match.
- Accepted request and response files are deleted after phone acknowledgement. Unacknowledged Continuity content expires after thirty days; roleplay and portrait content expires after twenty-four hours.
- Antigravity receives each job through a fresh private project directory. No blanket file or command permission is granted.
