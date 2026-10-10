# Proposal

## Why

The phone check of `engagements` passed, but it showed six faults. Two of them slow every Scene's end, and one loses
the Story's pick.

- **The pick was lost.** At the end of Scene 2 the Day View had no Story's pick and no "Let the Story choose". The
  Director planned Hermione's library meeting at 7:00 pm, the one he had just promised, as the next Scene that
  matters, and the Weaver offered it as the pick. The Day View treats a Weaver Happening at an Engagement's place
  within the hour as the same thing. It kept the Engagement and dropped the Happening, and the pick and its Scene
  went with it. Choosing the card would not have opened the Scene that matters either.
- **Offers out of time order.** With no pick, the library at 7:00 pm came above Charms at 9:00 am. The order puts the
  Engagements he is expected at before everything else. That rule was meant to stop them being crowded out, and
  never to order the cards.
- **People named with a title were "not in the story".** The Director wrote "Madam Hooch" and "Professor
  McGonagall". The Story has Rolanda Hooch and Minerva McGonagall. The name lookup does not see past a title, so both
  were left out, and the Director was asked again at every Scene's end. That repair took 30 to 80 seconds each time.
- **Repairs for things the check could set right itself.** Any part left out costs a second call to the model:
  - The Weaver marked two ordinary happenings as Lead's moves. Clearing the mark loses nothing, but the answer was
    sent back for 22 seconds more.
  - The Chronicler's lines for a Bond came back 29 words long where 25 were asked, and 42 where 40 were asked. Both
    were left out and sent back, once costing 80 seconds.
- **What he missed moved day.** In the first Gap, the Weaver wrote Sunday's library Scene, which he skipped, as
  happening on Saturday. The time of what he missed is on record, and the model wrote it again by hand.
- **A skip weeks away read like this week.** "The Halloween troll · Thursday 7:00 pm" was 48 days away. "Next week ·
  Friday 7:30 am", offered on a Friday, read like today.

## What Changes

- **The pick and an Engagement are one card.** When the Weaver's Happening and an Engagement are the same thing, the
  Day View offers one card. It carries the Engagement's time, place and expected mark, and the Happening's pick and
  Scene. Choosing it opens the Scene that matters and keeps the Engagement.
- **Pick first, then time order.** The rule for which cards survive past four is unchanged.
- **Names resolve past a title.** "Professor McGonagall", "Madam Hooch" and "Mr Filch" are the Story's people, for
  every agent, through the one name lookup.
- **A check sets right what it can, and asks again only for what was lost.**
  - A wrong Lead's-move mark is cleared.
  - A Gap's happening that answers what he missed takes its time and place from the record.
  - A Bond's line is left out as too long only when it runs well past the length asked: by more than half again.
- **A skip a week or more away says how far.** "Thursday 7:00 pm · in 48 days", "Friday 7:30 am · in 7 days".

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `day-view`:
  - Up to four Happenings: one card for the pick that is an Engagement, and time order.
  - The player chooses where to be: how far a skip is.
  - Missing something has consequences: what he missed keeps its time.
- `living-world`, Moments are remembered from one record:
  - what a check sets right, not left out;
  - names with titles;
  - a line a little long is kept.

## Impact

- **Host:**
  - `story/day.ts`: `onAhead` and `todayOn`, and the skip times in `dayChoicesOf`.
  - `agents/names.ts`: `storyName` sees past a title.
  - `agents/weaver.ts`: the move mark and the missed item's time.
  - `agents/chronicler.ts` and `story/bonds.ts`: the length a line is refused at.
- **Android:** `DayViewChoices.kt`, the skip row.
  - `docs/adr/0012-a-check-sets-right-what-it-can.md`.
- **Contract 20:** a Skip gains `days_away`. The phone's skip row says "in N days" a week or more away, in the pick's
  style, drawn on `docs/design/DayView.dc.html`. The Gap sheet keeps the plain time.
- **Speed.** Fewer repairs. In the phone check, each Scene's end would have been one to two minutes shorter.
