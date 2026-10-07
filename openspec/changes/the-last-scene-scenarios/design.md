# Design

## Context

See proposal.md for why. What already exists, all in host:
- **Who is in a Scene.** The Writer names only who comes in (`comes_in`) and who goes (`goes`). The reducer works
  out `here`, and `leave()` takes whoever went out of the Scene once their Reply is written, clearing Focus on them.
  The Actor's `<people_here>` is built from `here`.
- **The Line.**
  - The Actor is told never to decide what the Player Character says, chooses, does on purpose, thinks or feels,
    and that "the people here may see him and say how he looks to them" (`agents/actor.ts`).
  - `decidesForPlayer` (`agents/deciding.ts`) refuses a Writer's note or a Chronicler's Moment where he is the
    subject of a deciding verb ("Ishaan tells her"), or is made to do something ("makes Ishaan cry").
- **The live check.** `test/real/actor.test.ts` has "Hermione asks a question", judged by a second model, "Answer
  YES or NO", and `RUNS` runs each.

## Goals / Non-Goals

**Goals:**
- A test for each of the three scenarios, named for it, so `scripts/scenarios.mjs --strict` passes with every
  scenario proved.
- Keep it passing: a lost test should fail the strict check, not shrink a number.

**Non-Goals:**
- Changing who is in a Scene, the Line, or any prompt. The behaviour is built; only its proof is missing.

## Decisions

**1. The Meera tests return in their own file (host, `test/engine/presence.test.ts`).** They are restored word for
word from 910959c, with the Night Train helpers they use (`atKalka`, `writer`, `chronicle`). A file named for who is
present, not for people, keeps a later change to editing people from rewriting it.
- **Considered:** putting them back into `people.test.ts`. Rejected, because that file now belongs to editing.

**2. Others may describe him, proved twice (host).**
- **Mechanically,** in `test/agents/deciding.test.ts`:
  - notes where others say how he looks pass `decidesForPlayer`: "Meera tells Ishaan he looks like he hasn't slept",
    "Ishaan looks like he hasn't slept" (the file's names are the Night Train's);
  - one that decides how he feels does not: "Ishaan feels exhausted after the night".
  - This proves the Writer may plan the remark.
- **Live,** in `test/real/actor.test.ts`, beside "Hermione asks a question":
  - The Move is "I sit down across from her. I haven't slept properly in three days." (the common room Scene is at
    11:35 pm).
  - The Beat Note has Hermione notice he looks like he hasn't slept, and say so.
  - Two judges per run. First: does someone in the passage remark on how he looks, tired or unslept? It must say
    YES in at least two of three runs: the remark is allowed, and the Actor does not shy away from it. Second:
    the "Hermione asks a question" judge's question, which already says that others describing how he looks does
    not count. It must say NO in every run.
  - It runs only with `npm run test:real`, as the other live checks do.

**3. The strict check becomes the standard (repo).** `openspec/config.yaml`'s `rules.tasks` gains: the last task of
every change runs `scripts/scenarios.mjs --strict`. With nothing untested left, a missing test fails it by name.

## Risks / Trade-offs

- **[The live judge reads a remark as deciding his feelings.]** The judge's question already excludes how he looks
  to others; a failure shows the passage and the judge's words, and the fix is the judge's wording, never the
  scenario.
- **[The Actor, told plainly by the note, may also describe his tiredness in narration.]** Narration of how he
  looks is plain physical continuity, which the requirement allows; the second judge decides whether anything
  crossed the line.
