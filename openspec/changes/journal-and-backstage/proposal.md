# Proposal

## Why

Everything the Story has written and everything the World has done off-screen is on the Mac, but the player can only
scroll back through earlier Scenes one at a time and cannot see the World at all. The `outside-the-scene` spec's
Journal and Backstage are drawn (`docs/design/Journal.dc.html`, `docs/design/Backstage.dc.html`) and every piece of
their data already exists: the Chronicler's summaries, Meanwhile, the Weaver's Lives, Threads and what happened, the
Writer's Beat Note and Taste. Taste also has no way to be read or trimmed, which `long-run` requires.

## What Changes

- The Journal: every Scene on the current Path, grouped by day, each with its time, place, title and one-line
  summary, and what the Player Character heard Meanwhile in between, in order; tapping a Scene shows it in full.
- Backstage, only when visited: what happened off-screen day by day with its time, the Threads and where each
  stands, every Life, the Writer's plan for the current Scene (its call, its purpose, its beats and their state, its
  way out), and Taste, each line with a ✕ that deletes it.
- The Scene's header gains Journal and Backstage beside Paths.
- The Director's section of Backstage comes with the Director.
- The World screen is a later change: what the Player Character knows of each person needs its own decision.
- Contract version 11: the Journal's and Backstage's views and deleting a line of Taste. **BREAKING**: the phone and
  the Mac are installed together.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: this builds `outside-the-scene` (The Journal reads the Story back; Backstage shows everything else, only when
visited) and `long-run` (Taste is short, readable and the player's) as they read.

## Impact

- `protocol/schemas/link.schema.json`, `contract.json`: `JournalView`, `BackstageView`, `RemoveTasteRequest`;
  version 11.
- Host: `src/views/journal.ts`, `src/views/backstage.ts`, routes in `src/link/server.ts`, a `taste_set` entry in the
  reducer so a deleted lesson belongs to the Path, `src/engine/engine.ts` (removing a lesson).
- Android: `JournalScreen.kt`, `BackstageScreen.kt`, the header's entries, `FantasiaModel.kt`.
- Tests: host view, engine and link tests; Android shared checks on the JVM and the device; previews compared with
  the drawings.
