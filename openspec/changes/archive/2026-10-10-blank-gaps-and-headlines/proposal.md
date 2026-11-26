# Proposal

## Why

Two things the phone checks showed, both noted earlier and left for later.

- **A blank week in the pub.** Skipping a week from the Three Broomsticks with the Gap left blank said "Left blank,
  Roopesh spends it quietly in the Three Broomsticks". The Move the Mac wrote for him said the same, so the Writer and
  the Weaver read it as fact. The spec says a blank Gap is spent "where they were". That is right for an afternoon and
  wrong for a week. The approved Gap drawing and the spec's own scenario say "in his room", which no Story records.
  The player chose to make it depend on the day.
- **Backstage's Stretch is long.** The approved drawing shows each Scene that matters in one line ("Charms: Flitwick
  pairs him with Draconia"). Backstage shows the Director's whole note to the Writer, three or four sentences each.

## What Changes

- **A blank Gap depends on the day.**
  - Ending the same day: "spends it quietly in the library", as now.
  - Running past a night: "goes about his days quietly", with no place. The Move reads "I go about my days quietly
    until then."
  - The host's Move and the phone's caption follow the same rule.
- **Each Scene that matters has a headline.** The Director writes one short line for each Scene, for Backstage. The
  note to the Writer (`for`) is unchanged, and Backstage shows the headline.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `day-view`, The Gap is the player's: a blank Gap is spent where he was within the day, and going about his days
  past a night.
- `outside-the-scene`, Backstage: each Scene that matters in one short line.

## Impact

- **Host:**
  - `engine/choosing.ts`: the blank Gap's Move.
  - `agents/director.ts` and `DIRECTOR.md`: the `headline`.
  - `story/entries.ts`: `PlannedScene.headline`.
  - `views/backstage.ts`: the Stretch's lines.
- **Android:** `DayViewChoices.kt` `GapSheet`, the caption. No contract change: Backstage's `purpose` carries the
  headline.
- **Drawing:** `docs/design/Gap.dc.html` shows both captions.
