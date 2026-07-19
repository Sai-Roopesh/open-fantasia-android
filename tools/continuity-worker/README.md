# Open Fantasia Continuity Host

The Continuity Host lets the Android app create strict seven-reply Continuity Snapshots through Codex on this Mac without a USB connection. The phone and Mac communicate only through private Tailscale HTTPS. A stopped or unreachable host never bypasses the checkpoint lock.

## One-time setup

1. Install the standalone Tailscale client on the Mac and Tailscale on the Android phone. Sign both into the same tailnet.
2. From the repository root, run `tools/continuity-worker/install-host-launch-agent.sh`.
3. Start the private host with `tools/continuity-worker/continuity-remote on`.
4. Run `tools/continuity-worker/continuity-remote pair`, then scan the terminal QR code with the phone. The printed address and one-time code are the backup pairing method in Open Fantasia Settings.

## Everyday controls

- `tools/continuity-worker/continuity-remote on` starts Tailscale, private HTTPS, and the host.
- `tools/continuity-worker/continuity-remote status` shows whether the host is on and whether Codex has active or queued work.
- `tools/continuity-worker/continuity-remote off` stops accepting work, lets the active job finish, preserves queued jobs, then turns Tailscale off.
- `tools/continuity-worker/continuity-remote off --force` interrupts the active job and leaves it recoverable for the next start.
- `tools/continuity-worker/continuity-remote devices` lists paired phones.
- `tools/continuity-worker/continuity-remote revoke DEVICE_ID` immediately revokes one phone.

The host keeps one global FIFO Codex job active at a time. Each job may run for up to 30 minutes and receives one automatic correction only if its output fails validation. A failed job remains strictly blocked until Retry is tapped in the app.
