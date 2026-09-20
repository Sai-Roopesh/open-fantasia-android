---
status: accepted
---

# Claude Opus High is a third Continuity Engine

Open Fantasia adds `claude-code:opus:high` as a Continuity Engine alongside `codex:gpt-5.6-terra:high`
and `antigravity:gemini-3.6-flash:high`. Like the other two it is an execution adapter and nothing
more: it authors a Continuity Draft, the Continuity Compiler applies that draft to the Continuity
Baseline, and Android validates the resulting snapshot independently. Adding an engine changes who
writes the state transition and changes nothing about checkpoint enforcement, snapshot acceptance, or
what a Continuity Draft is allowed to contain.

The protocol identity uses Claude Code's moving `opus` alias for the same reason ADR-0009 used
`sonnet` for roleplay: a subscription does not guarantee one immutable dated model, and pretending
otherwise would freeze a promise the CLI cannot keep. Each checkpoint still freezes the engine
identity it was created with, and changing the default affects only future checkpoints.

Claude has no `--output-schema`. Codex is handed the Continuity Draft schema and its CLI enforces the
shape; Antigravity and Claude are not, so both carry the schema and one filled-in operation in the
prompt — the arrangement ADR-0012 arrived at after Antigravity authored two good drafts that were
rejected on shape alone. That instruction now lives once in `host-lib.mjs` rather than in each
adapter, because it is a property of the Continuity Draft contract; what stays adapter-local is how
each CLI is invoked and how its failures read.

Claude occupies its own CLI lane. Continuity is globally serialized either way, but the lane is what
keeps a Claude Continuity Update from running beside a Claude roleplay reply: both would be headless
sessions on one account and one allowance. Codex, Antigravity, and Claude each hold their own lane,
so an engine choice never quietly changes what else can run.

Two Claude failures are not Continuity Defects and are translated rather than passed through: an
exhausted subscription allowance, and a CLI that is not signed in. Both would otherwise reach the
phone as an unexplained failed update carrying Anthropic's transport wording. Neither is worth the
corrective run's minutes, and both have an obvious next step — another engine, or `fantasia-host
claude-login`.

A failed checkpoint can now move to either of two other engines rather than the one alternative a
two-engine world made implicit. The phone therefore asks which, instead of rotating through a choice
the person cannot see.

Being the first optional engine also forced two gaps closed that a required-engine world never
exposed. The phone now reads the engine list out of `/v2/health` and does not offer an engine the
paired Mac has said it cannot run, so the choice is prevented rather than regretted; nothing is
blocked before the first health check, and a Mac that can run no engine at all leaves every choice
open rather than presenting a dialog with nothing to press. And a host answer that rejects the
request itself now fails the checkpoint carrying the host's own reason. It used to be recorded as
"Waiting for Mac Host" with the status untouched, which left the lineage locked on a checkpoint that
had already been refused, reported progress that was never going to happen, and hid Retry and Switch
engine, both of which appear only once a checkpoint has failed. ADR-0012 always promised that
refusal reached the person; only the host end of it was built.

## Considered Options

- Reusing `claude-code:sonnet:high`, already installed for roleplay, would have added no setup, but a
  Continuity Update is the most expensive and most consequential job in the system; the reason to
  reach for Claude here is the stronger model, not a second Gemini.
- The Anthropic API would give real structured output and remove the prompt-carried schema, at the
  cost of separate usage billing — the thing ADR-0009 exists to avoid.
- A single "best available engine" that the host picks would hide which model wrote a snapshot, and
  the engine identity is frozen into the checkpoint precisely so that stays visible.

## Consequences

Host startup costs one more preflight — a small schema-constrained Claude job — and a Mac without
Claude Code installed reports the engine as unavailable with that reason rather than omitting it
silently. Claude Opus High requires the same signed-in subscription roleplay already requires, and a
Continuity Update on it consumes that allowance; an exhausted allowance stops the job and never falls
back to another engine on its own. Android's engine catalog and the host's supported identities are
declared independently and checked against each other in `ContinuityEngineParityTest`, so an engine
offered on the phone but unknown to the host cannot reach a checkpoint. Android now depends on two
health fields the host was already sending, and treats their absence as "not known yet" rather than
as "unavailable", so an older host keeps working unchanged.
