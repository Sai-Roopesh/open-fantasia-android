# Scene pacing and Redo audit — 10 November 2026

Investigated the Mac's recorded model requests, saved entries and the live prompt builders. No played paths or
story content were edited during the investigation.

## Why conversations felt rushed or static

The Writer inserted mandatory pacing instructions after three Beat Notes without an Arc moving and four Beat
Notes on the same beat. Its system prompt described `land` as heading for the exit, and the Actor received an
instruction to bring the Scene toward its turn. These are pacing pressures, not a literal three-turn close timer.

An independent route allowed `leaves_scene` to close the Scene when the model interpreted a Move, time skip or long
Scene as a transition. Only Linger blocked that route. With Linger enabled, the prompts instead said to hold the
beat, force nothing and answer only what the Move does. This made the workaround for rushed endings also suppress
initiative.

Beyond the Arc — Rewritten had Linger enabled just after each of its two Scene openings. Its only saved closure
was by the player. This confirms the workaround was active; it does not show automatic closures happening on that
particular played path. The transition route was reproduced separately with scripted models against the engine.

## What Redo retains and loses

The latest Redo was entry `23ac83b6-f8f6-49dd-b510-937e97128cae`, sequence 5941, recorded at
2026-11-09T19:01:29.558Z. Its successful Writer request retained the Story, character information, standing state,
a Scene record, 24 preceding Moves with their exchanges, and the current Move. Its system text was 68,412
characters and its prompt 84,833 characters. This request was not reduced to the director note alone.

However, Redo removes the rejected Reply and its Beat Note from the active Path before replanning. The discarded
Reply's full text and its opening were both absent from the new Writer request. Notes referring to what was good
or missing in that Reply therefore lack their immediate reference.

The raw Direction goes only to the Writer. The Actor sees its newly generated Beat Note, requested at roughly
forty words; it does not receive the original Direction. This is a concrete information bottleneck. It can explain
why a nuanced adjustment becomes a much more literal or sweeping change, although these records alone cannot
assign every prose-quality issue to that mechanism.

The Actor was already using the full Reply setting, allowing up to about 600 words. Reply length is separate from
how many exchanges a Scene can run.

## Change made

Only End Scene now closes a Scene. Model-requested transitions update location instead, and the automatic closure
route was removed from the engine. The three- and four-reply pacing deadlines were removed. `land` now describes a
beat having its effect while keeping room for the player's response and the aftermath. Long-Scene recording and
the normal manual Scene-end steps remain in place. Saved historical transitions remain readable.

Redo's draft omission and Direction handoff are findings for a separate change; this patch does not alter them.
The recorded requests also confirm Claude access failures and successful Codex fallback, without establishing
that model differences are irrelevant to the writing.

## Validation

All three new engine regression scenarios failed before the fix and passed afterwards: a transition with Linger
off, pacing beyond the old reply deadlines, and a transition after long-Scene recording. Explicit End Scene still
runs its normal steps. All 626 host tests across 77 files passed, as did TypeScript and ESLint checks. These checks
establish engine and prompt behavior; they do not establish that future generated dialogue will be satisfying.

After an in-flight player Reply completed, the Open Fantasia worker was stopped gracefully and restarted by its
existing LaunchAgent to load the change. Its HTTPS endpoint responded, and all 77 saved Path heads and current-Path
flags matched the snapshot taken immediately before restarting. The player's existing Linger setting was preserved.

## Follow-up implementation

The findings above describe the pre-fix system. The subsequent architecture change now addresses the Redo draft
omission, exact Direction persistence, creative handoff, Codex Story retrieval, durable checking and rolling
long-Scene records. See [ADR 0022](../adr/0022-shared-directions-and-one-writing-pass.md) for the current behavior,
data migration and validation. ADR 0021 remains the decision for manual Scene endings.
