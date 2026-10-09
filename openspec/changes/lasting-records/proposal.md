# Proposal

## Why

The first eight days of The Malfoy Problem (docs/reviews/2026-10-09-the-malfoy-problem.md) lost the record of six
of its fifteen Scenes. The Chronicler failed 104 of 113 calls, and nobody noticed. Four causes in the design meet
here:
- **Memory that only grows.** What the **Player Character** knows of someone is one line, rewritten after each Scene
  with whatever it showed. For a **Lead** in a four-year romance the line only grows. Past 80 words every chronicle
  is refused, and the repair message asks for "three sentences" while it counts words.
- **Records that are all or nothing.** One bad part of an answer throws the whole record away: an overlong line, or
  a name the Mac thinks was absent. The Chronicler then always goes back to the earliest unrecorded Scene. One stuck
  Scene therefore blocked every Scene after it, at two calls per Scene end, and nothing showed the player.
- **Presence that disagrees with the page.** The Actor wrote Crabbe and Goyle walking in at Draconia's heels. The
  Writer never named them, so the Mac did not count them as present, and a Moment naming them was refused.
- **No record of where things stand.** There is no record of where things stand between the Player Character and
  the people he has history with. Recall carries the last day's summaries and five Moments, which is too thin to
  carry a relationship across four years.

This is the foundation for the chapters change that follows: a Story planned in weeks needs a record that lasts.

## What Changes

- **What he knows of someone stays short (host).** The line is rewritten whole each time, to at most 60 words. A
  repair asks for that in words. A line that is still too long keeps the old line, and the rest of the record is
  kept.
- **Bonds, a new record (host).** For each person the Player Character has history with, a **Bond** is a short
  standing ("where things stand between them", at most 40 words) plus a history of short dated turns. The
  Chronicler writes a turn when a Scene changes what is between them. Each turn is a line, so nothing grows
  without bound. The standing is written as he saw it, never from anyone's secret feelings.
- **Records degrade, never vanish (host).**
  - A background answer is checked part by part. A bad Moment, a bad name in `there`, a bad line or a bad telling is
    dropped and noted, and the rest is kept.
  - Only an answer with nothing usable is a failure.
  - A failed Scene is tried again after the next Scene ends, at most three times, and never holds up the Scenes
    after it.
  - Every Scene left unrecorded is backfilled in order.
  - The same part-by-part rule applies to the Weaver's records and the Director's plans.
- **Presence follows the page (host).** Each turn, the Writer is told who the last Reply showed in the Scene
  without their being here, and names them in `comes_in` if they are. The Chronicler may name anyone the Scene's
  own words show present.
- **Recall carries Bonds (host).** The Writer, the Director and the Actor read the Bond of each person present:
  the standing and the latest turns. The Actor reads only those of the people in the Scene.
- **The phone (android, protocol):**
  - a person's page shows **Between you**, the standing and the turns, drawn first for approval;
  - Backstage shows **The record**: Scenes not yet recorded and parts that were dropped, with Retry.
- **New ADR 0009:** a relationship's standing is kept as its own short record, beside Moments. It amends ADR 0006,
  without replacing it.

Out of scope: background work running only when there is something to do (cause 10 in the review). It moves to the
chapters change, where the World moves in longer spans.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `living-world`:
  - Moments are remembered from one record: records degrade part by part, nothing blocks the Scenes after, and
    missed Scenes are recorded later.
  - A new requirement for Bonds.
- `outside-the-scene`:
  - The World screen shows what the Player Character knows: the line stays short, and a person shows Between you.
  - Backstage shows everything else: it shows The record, with Retry.
- `scenes`: People stay in a Scene until they go: someone the page shows arriving is in the Scene.
- `story-file`: A Story File sets up every part of a Story: a person's Bond to start from.

## Impact

- **Host:**
  - `agents/chronicler.ts` and `CHRONICLER.md`: Bonds, a part-by-part check, the word limit;
  - `agents/repair.ts`: keeping what passed;
  - `engine/chronicling.ts`: due order, attempts, backfill;
  - `story/known.ts` and a new `story/bonds.ts`;
  - `agents/recall.ts`, `agents/writer.ts` and `WRITER.md`: the presence hint;
  - `agents/actor.ts`, `agents/director.ts`, `agents/weaver.ts`;
  - `views/world.ts`, `views/people.ts`, `views/backstage.ts`;
  - `link/server.ts`: a retry route;
  - `story/entries.ts`: chronicle shape and a `record_gap` record.
- **Protocol:** the Story File schema gains a person's `bond`; contract 17 (`between` on a person, `record` on Backstage, a retry request).
- **Android:** Person page, Backstage, model and link.
- **Design:** `docs/design/Person.dc.html` and `Backstage.dc.html`, updated for approval.
- **Docs:** `docs/adr/0009-a-bond-is-its-own-record.md`.
- **Compatibility:** none kept. Stored shapes change, and the player replays from the start.
