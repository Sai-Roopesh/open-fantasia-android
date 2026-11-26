# Reaching the models (research, 4 October 2026)

Findings behind ADR-0005, kept for the changes that build the Claude pool, the Codex and Antigravity runners and
the Models screen. Checked against SDK and CLI source, official docs and the installed tools; anything not
confirmed is marked.

## Claude: the Agent SDK

- Use `@anthropic-ai/claude-agent-sdk` (0.3.289 on 3 Oct, released roughly daily; it bundles its own CLI, so a new
  model can need an SDK upgrade). Keep warm `startup()` handles, one per (model, system prompt), each used once.
- Options per call: `model`, `tools: []`, `maxTurns: 1`, `persistSession: false`, `settingSources: []`, a fixed empty
  non-git `cwd`, `includePartialMessages: true` for streamed words, `outputFormat: {type: 'json_schema', …}` for
  structured answers (validated and re-asked, not constrained decoding). No temperature, top_p or max_tokens.
- Sign-in: `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` (one year). Never `--bare`, which ignores it. An
  `ANTHROPIC_API_KEY` in the environment outranks it.
- Caching: server-side, by model and exact prefix, shared across processes; one hour on a subscription. Different
  working directories miss each other's cache.
- Unverified: whether the SDK prepends Claude Code's identity to a custom system prompt. Check the first stored
  request.
- Models, listed live with `query.supportedModels()` (no model call): `opus` / `claude-opus-5-5`,
  `sonnet` / `claude-sonnet-5-5`, `claude-fable-5-1`, `haiku` / `claude-haiku-4-5` (guaranteed only to 15 Oct 2026),
  with `effort` low to max on most. Thinking is always on for Fable 5.1 and Opus 5.5.
- Quota: `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()` gives five-hour and weekly utilisation;
  `rate_limit_event` messages arrive in the stream.

## Codex: `codex app-server`

- One long-running `codex app-server` over stdio JSON-RPC; many threads in one process. The only path that streams
  text (`item/agentMessage/delta`). `codex exec` and the TypeScript SDK start a process per call and do not stream.
- Per call: `thread/start {model, ephemeral: true, baseInstructions, sandbox: 'read-only', approvalPolicy: 'never',
  cwd}`, then `turn/start {input, outputSchema, effort}`. Schemas follow OpenAI strict mode (every property
  required, `additionalProperties: false`). Types: `codex app-server generate-ts`, matched to the pinned version.
- The native binary runs without Node: `…/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`.
- Models, listed live with `model/list`: `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`,
  `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5` (retires 14 Oct 2026); efforts low to max, `ultra` on most; a
  `priority` service tier is faster and uses more.
- Quota: `account/rateLimits/read`, and `account/rateLimits/updated` notifications. The player's plan is Plus: one
  weekly window, no five-hour window.

## Antigravity: `agy`

- Installed at `~/.local/bin/agy` (1.2.16), signed in to the player's Google account. 59 releases since June, so pin
  the version and turn off its auto-update.
- Per call: `agy -p … --output-format stream-json --model <id> [--json-schema …]`; one kept-alive process with
  `--input-format stream-json` is possible since 1.1.15.
- Models, listed live with `agy --output-format json models`: Gemini 3.8, 3.7 and 3.6 Flash and 3.1 Pro (effort is
  part of the id, such as `gemini-3.8-flash-high`), plus Claude 4.6 and GPT-OSS 120B until 2 Nov 2026.
- Quota: `agy -p "/usage" --output-format json` (shape unverified).
- Its terms forbid use "in connection with products not provided by us"; the player accepted the risk (ADR-0005).
