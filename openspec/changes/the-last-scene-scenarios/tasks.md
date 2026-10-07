# Tasks

Each scenario task writes or restores its test, watches it fail against code that lacks the behaviour, then sees it
pass against the code as it is. Tests are named `<capability> › <requirement> › <scenario>` and quote the scenario. A
test is never changed to make code pass.

Scenarios this change proves, all in `scenes`:
- People stay in a Scene until they go: Meera stays on the toy train; Meera gets off at Barog.
- The Reply never writes the Player Character: Others may describe him.

## 1. Who is in a Scene

- [x] 1.1 Restore `scenes › People stay in a Scene until they go › Meera stays on the toy train` and `› Meera gets
  off at Barog` from 910959c into `host/test/engine/presence.test.ts`, word for word, with their helpers:
  - see each fail with the reducer's `leave()` and the Beat Note's `here` reverted to keeping the Writer's list;
  - restore the code, and see both pass.

## 2. Others may describe him

- [x] 2.1 In `host/test/agents/deciding.test.ts`: notes where others say how the Player Character looks pass
  `decidesForPlayer`, and "Ishaan feels exhausted after the night" does not. Verify with the host suite.
- [ ] 2.2 Test first: `scenes › The Reply never writes the Player Character › Others may describe him` in
  `host/test/real/actor.test.ts` (design decision 2):
  - first judge YES in at least two of three runs, second judge NO in every run;
  - run it with `npm run test:real`, and record the passages it judged.

## 3. Together

- [x] 3.1 Add the strict check to `openspec/config.yaml`'s `rules.tasks` (design decision 3)
- [ ] 3.2 Run `scripts/scenarios.mjs --strict`, the host suite and lint, and `openspec validate --all --strict`, and
  verify all pass with no scenario untested
