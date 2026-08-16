# Open Fantasia Mac Host

The Mac Host gives Open Fantasia three private, durable services through Tailscale:

- complete Continuity Snapshots after every fifteen committed replies, after a Rewind, or on demand;
- optional stateless roleplay replies from Antigravity Gemini 3.6 Flash High or Claude Code Sonnet High;
- cinematic character portraits created through Antigravity's managed image tool.

Continuity can use either Codex GPT-5.6 Terra High or Antigravity Gemini 3.6 Flash High. Roleplay can continue using any existing direct Android provider, including DeepSeek, or use Antigravity or Claude Code through this host. An unavailable host never bypasses a checkpoint or silently changes models.

## One-time setup

1. Install Tailscale on the Mac and Android phone and sign both into the same tailnet.
2. Install and sign in to Codex CLI and Antigravity CLI on the Mac.
3. To use Claude roleplay, install Claude Code from Anthropic and run `claude auth login` without `--console`. Confirm `claude auth status` succeeds. Do not set `ANTHROPIC_API_KEY`; the host removes API-key, gateway, Bedrock, Vertex, and Foundry variables from every Claude invocation.
4. From the repository root, run `tools/continuity-worker/install-host-launch-agent.sh`.
5. Start the private host with `tools/continuity-worker/fantasia-host on`.
6. Run `tools/continuity-worker/fantasia-host pair`, then scan the terminal QR code with the phone. The printed address and one-time code are the backup pairing method in Open Fantasia Settings.

The old `continuity-remote` command remains an alias so existing Mac setup keeps working.

## Everyday controls

- `tools/continuity-worker/fantasia-host on` starts Tailscale, private HTTPS, and the host.
- `tools/continuity-worker/fantasia-host status` reports reachability, queued work, and active work without story content.
- `tools/continuity-worker/fantasia-host claude-status` verifies subscription authentication without allowing API-key or cloud-provider credentials.
- `tools/continuity-worker/fantasia-host claude-login` refreshes the Claude subscription login when it expires.
- `tools/continuity-worker/fantasia-host off` drains active work, preserves queued work, then turns Tailscale off.
- `tools/continuity-worker/fantasia-host off --force` interrupts active work and leaves it recoverable for the next start.
- `tools/continuity-worker/fantasia-host devices` lists paired phones.
- `tools/continuity-worker/fantasia-host revoke DEVICE_ID` immediately revokes one phone.

## Runtime guarantees

- The app submits immutable, idempotent protocol-v2 jobs and polls every ten seconds.
- Continuity work is globally serialized. On the Antigravity lane, queued work runs in Continuity → roleplay → portrait priority order; active work is never preempted.
- A Continuity Engine authors a Continuity Draft — the semantic state transition — and the Continuity Compiler applies it to the Continuity Baseline to produce the complete snapshot. The engine never emits an identifier, never restates authoritative Cast Seeds, and never writes envelope or version fields. See ADR-0010.
- The Continuity Compiler is deterministic and has no model in it: `compiler.test.mjs` exercises replacement, preservation, explicit removal, forced cascades, first snapshots, and Rewind directly.
- Every Continuity Engine proves its exact execution path with a small schema-constrained job before the host offers it. An engine that fails is not advertised, `/v2/health` says why, and a checkpoint naming it is refused at submission instead of queued for a run that cannot finish. See ADR-0012.
- A Continuity run may take up to thirty minutes and receives one corrective run. The draft and its typed Continuity Defects are stored with the job, so the corrective run repairs the section that failed rather than authoring the whole state transition again, and a host restarted mid-checkpoint resumes instead of restarting. See ADR-0011.
- Codex and Antigravity Continuity Engines receive the same complete retained Continuity Evidence Transcript directly as model input, projected once so no fact and no Cast Profile appears twice. Neither engine chooses ranges from a request file; oversized input remains blocked with a visible failure rather than being partially processed.
- A roleplay run may take up to ten minutes and never falls back to another model.
- Direct API and Mac-hosted replies originate from the same immutable Roleplay Generation Request: one complete reachable Continuity Snapshot, the latest fifteen exact retained Roleplay Exchanges, and the current reply controls and user prose. Antigravity and Claude Code receive the same complete deterministic role-delimited rendering directly as model input; neither selects ranges from a prompt file. Oversized input fails visibly rather than being truncated.
- The Antigravity CLI does not expose Temperature, Top P, maximum-token, or repetition-penalty controls. These capabilities are reported as unsupported rather than silently presented as applied; prompt-level length and variation contracts remain authoritative.
- Claude runs in stateless print mode with safe mode, a replacement non-coding system prompt, no tools, no MCP servers, no slash commands, one agent turn, and no session persistence. The stable system prompt and stable-first canonical roleplay request preserve prompt-cache friendliness.
- Claude Code authenticates only through its signed-in Claude subscription. The host strips every API-key, gateway, and cloud-provider route before launch. Anthropic currently accounts scripted `claude -p` subscription use against Agent SDK credit rather than API billing; subscription limits can still stop a job, and Open Fantasia never falls back to another model.
- A portrait run may take up to ten minutes, receives one corrective attempt for an invalid image, and never falls back to Pollinations.
- Responses are accepted only when request, thread, branch, turn, speaker, mode, and frozen model all match.
- Accepted request and response files are deleted after phone acknowledgement. Unacknowledged Continuity content expires after thirty days; roleplay and portrait content expires after twenty-four hours.
- Antigravity and Claude Code receive each job through a fresh private project directory. No blanket file or command permission is granted.
