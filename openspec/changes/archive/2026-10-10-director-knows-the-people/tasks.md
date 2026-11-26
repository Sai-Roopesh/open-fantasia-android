# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

## 1. The Director

- [x] 1.1 The Director's system prompt carries `<places>` and `<people>` (design decision 1), and DIRECTOR.md says to
  name only them (design decision 2). Unit test: the system prompt lists Rolanda Hooch with who she is, and not the
  Player Character, and asks for walk-ons unnamed.
- [x] 1.2 A live check with `npm run test:real`: `long-run › The Director shapes the long run around Arcs and
  Landmarks › Only the Story's people`. Three first plans for The Malfoy Problem; in at least two of the three, no
  name is left out.

## 2. Together

- [x] 2.1 Run `scripts/scenarios.mjs --strict`, the host suite and lint, and `openspec validate --all --strict`, and
  verify all pass. Restart the Mac's server.
