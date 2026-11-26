# Proposal

## Why

The phone check of `play-check-fixes` showed two more faults.

- **Two meetings about one thing.** In Scene 1, he told Draconia to meet him in the library at ten on Saturday. She
  said she would think about it, and the Chronicler recorded the Engagement. The Director then planned the Stretch's
  first Scene that matters: a private talk with Draconia about the train and the debt, in the library, on Sunday at
  2:00 pm. That is the same meeting, a day later. The Day View offered both. When he skipped the week, Draconia waited
  in the library twice. The Director is never told what he has arranged, so it cannot build on it.
- **The Gap sheet out of order.** "Goes on without you" listed Sunday's pick above Saturday's meeting. The sheet
  lists the Day View's cards in the Day View's order, which puts the pick first.

## What Changes

- **The Director is told his Engagements ahead**, labelled `E1`, `E2`, with their time, place, people, and whether he
  is expected.
- **A Scene that matters can be an Engagement.** A planned Scene names the Engagement it is (`engagement: "E1"`). The
  check gives it the Engagement's time and place from the record. The Weaver's pick then falls on the Engagement, and
  the Day View already makes them one card (`play-check-fixes`).
- **DIRECTOR.md** says: a Scene about something he has arranged is that Engagement, never a second meeting beside it.
- **The Gap sheet lists what goes on without him in time order.**
- **The Chronicler is asked for forty-five words of what he knows of someone**, within the sixty the World screen
  promises, so a line a little long is not sent back. Found on the phone check of this change.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `long-run`, The Director shapes the long run around Arcs and Landmarks: the Director knows his Engagements, and a
  Scene that matters about one is that Engagement.
- `day-view`, The Gap is the player's: what goes on without him is in time order.

## Impact

- **Host:**
  - `agents/director.ts`: the ask, the prompt section, the schema's `engagement`, and the check.
  - `agents/DIRECTOR.md`.
  - `engine/directing.ts`: the ask carries `engagementsOn`.
  - `story/entries.ts`: `PlannedScene.engagement`.
- **Android:** `DayViewChoices.kt` `GapSheet`, the order of its list. No contract change.
