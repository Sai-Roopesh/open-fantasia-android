---
status: accepted
---

# Evidence is what the Baseline does not already cover

A Continuity Request carries the Continuity Baseline and the exchanges since it. Earlier prose is not
sent, because the Baseline is what that prose became.

The request used to carry every retained exchange from the beginning of the branch, and it grew with the
thread forever. At 197 exchanges it stopped fitting. The failure reads as a transport limit and is not
one: the prompt is passed as a command line argument to the engine CLI, `ARG_MAX` on the host is
1,048,576 bytes, and the 768 KB ceiling is the margin under it. Raising the ceiling buys a few more
checkpoints and then fails again, as `E2BIG` rather than as a sentence anyone can read.

The measurements on the thread that hit it:

| | bytes |
|---|---|
| all 197 exchanges | 621,138 |
| of which precede the Baseline | 575,703 |
| of which follow it | 45,436 |
| the Baseline Snapshot itself | 167,377 |

The Snapshot is a complete account of everything through exchange 182, and then all 182 of those
exchanges were sent again as raw prose. Ninety-two percent of the transcript restated what the Snapshot
already said. The rendered task fell from 790 KB to 241 KB by sending only what the Baseline does not
cover, and it stays there no matter how long the thread runs.

This is what a Continuity Snapshot has always claimed to be. CONTEXT.md calls it "an independently valid,
complete account of the current world". Sending the history alongside it asserted the opposite, that the
Snapshot could not be trusted without the prose behind it. Only one of those can be true.

The change removes machinery rather than adding it. `checkpoint_turn_ids` existed to mark which
exchanges were new, the prompt explained not to repeat older timeline events, and the evidence
projection computed `checkpoint_exchange_indexes`. All of it existed because old exchanges were present.
Send only new ones and every exchange in the request is new, so there is nothing left to mark.

Two consequences follow. The compiler must not re-date a Discovered Cast Member whose lineage points at
an exchange the request no longer carries, or every checkpoint would drag established members into the
current window; a member the roster already holds keeps the lineage it was given. And the host can only
vouch for the lineage of a genuinely new member, since it no longer sees the history an older one was
dated against. Android still checks that against the real branch, which it already did, so the authority
that matters is unchanged.

## Considered Options

- Raising the byte ceiling defers the same failure and turns a readable error into an exec failure.
- Passing the prompt on stdin instead of argv removes the argument ceiling but leaves the request growing
  without bound, so the thread would eventually exhaust the model's context instead of the shell's.
- Trimming history only when a request runs oversized would make the evidence a thread receives depend on
  its length, so the same story would be summarized from different material at different times.
- Summarizing older exchanges into a second, smaller digest rebuilds the Continuity Snapshot under
  another name.

## Consequences

A Continuity Request is now bounded by the checkpoint cadence rather than by thread length, so the cost
of an Update stops growing as a story gets longer. Long threads become possible; the 197-exchange thread
that could not checkpoint at all now renders at roughly a third of the limit.

More weight rests on the Snapshot being genuinely complete, since nothing else carries the older story.
That was already the claim, and ADR-0010 already made the compiler responsible for preserving it, but a
thin Story Summary now costs more than it used to. The `thin_world_state` defect is the signal to watch.
