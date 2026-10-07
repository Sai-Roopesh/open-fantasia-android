# Proposal

## Why

Three `scenes` scenarios are the last in the specs with no test proving them:
- The Reply never writes the Player Character › Others may describe him;
- People stay in a Scene until they go › Meera stays on the toy train;
- People stay in a Scene until they go › Meera gets off at Barog.

None of them needs building.
- **The two Meera scenarios** were built and proved on 5 October 2026 (commit 910959c, "Name who comes in and who goes").
  On 7 October, editing-people rewrote `host/test/engine/people.test.ts` whole and deleted their tests by accident.
  The tests, restored as they were, still pass.
- **Others may describe him** is already in the Actor's instructions: "The people here may see him and say how he
  looks to them". The check on the Writer's notes flags only what he is made to do, not what others see. Nothing
  proves either side of that line.

With all three proved, every scenario in the specs has a test. `scripts/scenarios.mjs --strict` can then be the standard
check, so a test that goes missing again fails at once instead of turning into a count nobody reads.

## What Changes

- **Restored (host).** The two Meera tests come back in a file of their own, `test/engine/presence.test.ts`, so no
  later change to people rewrites them. They are as they were in 910959c.
- **Others may describe him (host).**
  - The check on the Writer's notes passes a note in which others say how the Player Character looks, and still
    refuses one that decides for him.
  - A live check with the real Actor: given a Beat Note that has Hermione say he looks like he hasn't slept, a
    judge finds her saying how he looks, and the same judge as "Hermione asks a question" finds nothing decided for
    him.
- **The standard check (repo).** Every change's last task runs `scripts/scenarios.mjs --strict`, and the project
  context says so.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The behaviour is already specified and built; this change adds the tests that prove it.

## Impact

- **Host:** `test/engine/presence.test.ts` (new), `test/agents/deciding.test.ts`, `test/real/actor.test.ts`.
- **Repo:** `openspec/config.yaml` (the project context names the strict check).
- No change to the app, the protocol, or what any agent is asked.
