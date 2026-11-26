# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds:
- `day-view` › The Gap is the player's, and everything in it goes on without them: A blank week. "Skipping a summons"
  must stay passing.
- `outside-the-scene` › Backstage shows everything else, only when visited: The Stretch, a line each.

## 1. A blank Gap

- [x] 1.1 Update `docs/design/Gap.dc.html` with both captions, and its README row.
- [x] 1.2 The host's Move (design decision 1). Test first: `day-view › The Gap is the player's, and everything in it
  goes on without them › A blank week`, on the engine.
- [x] 1.3 The phone's caption (design decision 1). Test first, as a shared check on the JVM and the device: the same
  scenario on the Gap sheet.

## 2. Headlines

- [x] 2.1 The Director's `headline` (design decision 2): the schema, the check, `PlannedScene`, DIRECTOR.md, and unit
  tests (kept; one past fifteen words, or none, falls back to `for` and is not asked again). Then test first: `outside-the-scene › Backstage shows everything
  else, only when visited › The Stretch, a line each`, on the Backstage view.

## 3. Together

- [x] 3.1 Run `scripts/scenarios.mjs --strict`, the host suite and lint, the Android JVM and device suites, and
  `openspec validate --all --strict`, and verify all pass.
- [x] 3.2 Restart the Mac's server. On a test copy over adb, skip a week from the pub with the Gap blank and check the
  caption, then open Backstage and check the Stretch's lines. Send the screenshots, then remove the test copy.
