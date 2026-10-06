# Proposal

## Why

Every agent runs on Claude today: the Mac can reach no other provider, and the only way to change a job's model is
`fantasia models` on the Mac. When a Claude model is overloaded mid-Scene the phone offers Retry and nothing else,
and Claude's limits carry the whole Story. Three scenarios are unbuilt (`outside-the-scene › One Models screen` twice,
`scenes › Redo on another model`), and the "another model" that `presence › Nothing fails silently` promises is not
on the phone. The player wants to play for real, which means spreading the load and having a way out when a model
is down.

## What Changes

- The Mac reaches **Codex** through one warm `codex app-server` process (JSON-RPC over stdio, a fresh ephemeral
  thread per call, text streamed from its deltas) and **Antigravity** through the `agy` CLI (a process started ahead
  of each call, as Claude's are), alongside Claude (docs/adr/0005).
- The Mac lists the models each provider offers, asked of the provider itself (Claude's SDK, Codex's `model/list`,
  `agy models`), with the reasoning efforts each supports; the last list a provider gave is kept for when it cannot
  be asked.
- Every model setting lives in the Mac's `models.json`: the Writer, the Chronicler, the Weaver and the Director for
  every Story, and an Actor for each Story that has its own (the Story File's Actor otherwise). Read on every call,
  as today, so a change reaches the next call.
- A **Models screen** on the phone, reached from Home, built to `Models.dc.html`: each Story's Actor, then each job
  with what it does and its model; tapping one opens the picker, grouped by provider, with the effort the model
  supports.
- **Redo** gains "Written by": this Story's Actor, or another model for just this Reply (`Redo.dc.html`). The Redo
  records the model; the next Reply goes back to the Story's Actor.
- **Another model** when a Reply or the World fails (`SceneFailed.dc.html`): the failure says which job failed, and
  the retry runs that job on the chosen model for that one try.
- The Director appears on the Models screen and keeps its setting; it does its work once the Director is built.
- `fantasia models` shows and sets the same settings, a Story's Actor included, and accepts every provider.
- Contract version 12: the Models view and its two writes, the model on Redo and Retry, the failed job on a failed
  turn.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `outside-the-scene`: One Models screen (reached from Home, efforts, a provider that cannot be asked, a scenario
  for a setting outlasting a restart of the Mac).
- `scenes`: Redo, with a Direction and another model if wanted (the model is chosen from the same list, and is
  recorded with the Reply).
- `presence`: Nothing fails silently (another model for a failed Reply or a World that could not move on, a scenario
  for each).

## Impact

- Decisions: ADR 0008, model choices are the Mac's settings, not entries in the Story.
- Host: `models/codex.ts` and `models/antigravity.ts` (new runners), `models/catalog.ts` (what each provider offers),
  `models/jobs.ts` (per-Story Actors and the Director), `agents/actor.ts`, `engine/engine.ts` (the model on Redo and
  Retry, the failed job), `link/server.ts` (`GET /models`, `PUT /models/jobs/{job}`, `PUT /stories/{id}/actor`),
  `cli/commands.ts` and `cli/serve.ts`.
- Protocol: `link.schema.json` and `contract.json` to 12; the Kotlin types regenerated.
- Android: a `ModelsScreen.kt` and its picker sheet, Home's Models button, `RedoSheet.kt` ("Written by"), the
  failure card's "Another model", `FantasiaModel.kt`, `FantasiaLink.kt`, `LinkClient.kt`, `MacConnection.kt`.
- Tests: host tests for the runners against fake `codex` and `agy` processes, the catalog, the settings and the
  engine; link tests; shared checks on the JVM and the device; one live check per provider on the Mac.
- Dependencies: none new. `codex` 0.160.0 and `agy` are already installed on the Mac; both are pinned by the version
  they report and upgraded on purpose.
