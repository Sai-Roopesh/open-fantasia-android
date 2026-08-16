---
status: accepted
---

# Use Claude Code subscription execution for Mac-hosted roleplay

Open Fantasia adds `claude-code:sonnet:high` as a Roleplay Model on the existing Mac Roleplay Host connection. The protocol identity intentionally uses Claude Code's moving `sonnet` alias rather than pretending a subscription guarantees one immutable dated model. Each roleplay job still freezes the Open Fantasia model identity, request hash, thread, branch, turn, speaker, and output settings.

Claude is an execution adapter only. Android assembles the same provider-neutral Roleplay Generation Request defined by ADR-0006 and the same checkpoint-backed context window defined by ADR-0007. The Claude adapter receives the complete deterministic rendering directly as its prompt. It may not retrieve, select, compact, summarize, or omit context, and it never owns conversational state. Rewind, regeneration, editing, and branching therefore keep the same semantics as DeepSeek and Antigravity.

The Mac Host invokes Claude Code in non-interactive print mode with safe mode, a replacement roleplay system prompt, no built-in tools, no MCP servers, disabled slash commands, one maximum agent turn, no Chrome integration, and no session persistence. It runs in a fresh private directory. Output arrives atomically and must pass the same prose validation as Antigravity before Android can accept it.

Claude Code subscription OAuth is the only allowed authentication route. Before every invocation the host removes `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, and the Bedrock, Vertex, and Foundry selectors, together with external model and effort overrides. This prevents an inherited shell or LaunchAgent environment from silently converting a subscription job into API, gateway, or cloud-provider billing. If subscription authentication or allowance is unavailable, the frozen job fails visibly and remains retryable; it never falls back to Gemini, DeepSeek, or another Claude model.

The host treats Claude as an optional independent execution lane. A missing Claude installation cannot prevent Gemini, portraits, or Continuity from starting. Claude becomes available after the official CLI is installed, authenticated with a Claude.ai subscription, and the Mac Host is restarted. The authenticated health response advertises the Roleplay Model identities currently executable by that host.

As of this decision, Anthropic accounts scripted `claude -p` use on subscription plans against Agent SDK credit. That is subscription-backed execution, not Anthropic API-key billing, but it has its own allowance and may change under Anthropic's product terms. Open Fantasia reports unavailable or exhausted allowance as a model failure rather than estimating credits.

## Considered Options

- Anthropic API or OpenRouter would be easier to run headlessly but violates the requirement to use the existing Claude subscription and introduces separate usage billing.
- A persistent Claude session could reuse hidden context but would become incorrect after Rewind, branch changes, edits, regeneration, and speaker changes.
- Claude Code bare mode would isolate customizations more aggressively, but Anthropic documents that bare mode skips subscription OAuth and keychain reads. Safe mode provides deterministic customization isolation while retaining subscription authentication.
- A separate Claude HTTP service would duplicate Tailscale pairing, durable jobs, acknowledgement, retention, and lifecycle controls already owned by the Mac Host.

## Consequences

Claude roleplay requires the Mac, Tailscale, the Mac Host, the official Claude Code CLI, and an active signed-in subscription. It does not stream to Android. Gemini and direct API models remain available as explicit independent choices. The stable-first canonical request and fixed adapter system prompt are compatible with provider prompt caching, but Open Fantasia does not claim cache-hit telemetry that Claude Code does not expose.
