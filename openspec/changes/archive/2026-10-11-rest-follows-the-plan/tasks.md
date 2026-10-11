# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

- [x] 1.1 Test first: `long-run › Rest is deliberate › The rest the Director planned`, on the Weaver's check: an answer
  offering the next Scene that matters, without `quiet`, is taken and marked quiet. The prompt carries no peak line
  when there is a next Scene. "A quiet pick after a peak" must stay passing.
- [x] 1.2 Run `scripts/scenarios.mjs --strict`, the host suite and lint, and `openspec validate --all --strict`.
  Restart the Mac's server, and verify that The Malfoy Problem's World moves on and its Day View offers the pick.
