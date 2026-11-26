# Design

## Context

See proposal.md for what the phone check of `engagements` showed. The test copy was removed before the lost pick was
traced. The cause below is read from the code, and the first test of task 1.1 reproduces it before anything changes.

**How it works today (host):**
- **Same thing, one card.** `story/day.ts` `onAhead` drops a Weaver Happening at an Engagement's place within an hour
  of its time, and keeps the Engagement's card. That card has the Engagement's own id, no `pick`, and no `scene`.
- **Finding the pick.** `todayOn` finds the pick by the latest weave's pick id, then by a card with a `scene`. A
  dropped Happening's id is on no card, so there is no pick, and no "Let the Story choose".
- **Order.** `todayOn` orders the cards as: the pick, then the Engagements he is expected at before the pick, then the
  rest.
- **Names.** `agents/names.ts` `storyName` looks a name up as written, by full name, alias, first name or surname.
  "Madam Hooch" is none of them.
- **Repairs.** `agents/repair.ts` `answerWithOneRepair` asks the model again whenever its check left anything out.
  Some checks leave out what they could set right themselves:
  - the Weaver's mark of a Lead's move on an ordinary happening;
  - the time of a happening that answers what he missed.
- **Line lengths.** The Chronicler's Bond lines are refused past the length asked: 25 words for a turn, 40 for where
  things stand.
- **Skips.** `dayChoicesOf` says a skip's time as weekday and hour, however far off it is.

## Goals / Non-Goals

**Goals:**
- The pick is never lost to an Engagement.
- The cards read in time order after the pick.
- No second call to a model for what the Mac can set right itself.

**Non-Goals:**
- **Listing the Story's people in the Director's prompt.** The names it used were the Story's people, with titles. If
  invented people turn up in later play, that is a change of its own.
- **Changing what is asked.** The lengths asked, and every prompt, stay as they are.

## Decisions

**1. One card for the same thing (host, `onAhead`).** When a Weaver Happening is at an Engagement's place within an
hour of its time, one card stands for both:
- **From the Engagement:** its time, place, expected mark, `every`, and `engagement` id.
- **From the Happening:** its id, `pick`, `scene` and `what`. The Weaver writes why it matters now, in the World's
  words.
- **Who:** both lists, without repeats.

The pick is then found by its id as before, and choosing it carries the Scene and the Engagement: `engine/choosing.ts`
already reads both from the card. An Engagement with no Happening at its time is a card of its own, as now.

*Rejected:* dropping the Engagement instead. That would lose its expected mark and its `every`, and "kept" would stop
working, since a choice is matched to an Engagement by its id.

**2. Pick first, then time order (host, `todayOn`).** Which cards survive past four is unchanged: the pick, the
Engagements he is expected at before it, then the soonest of the rest. The cards that survive are shown as the pick,
then the others by time.

**3. Names past a title (host, `names.ts`).** `storyName` tries the name as written, then without one leading title
from a fixed list. The list is Professor, Madam, Madame, Mr, Mrs, Ms, Miss, Mister, Dr, Doctor, Sir, Dame, Lord, Lady
and Master, with or without a full stop. Every agent's check resolves names through `storyName`, so all of them gain
it. A title before a shared surname ("Mr Malfoy") is still nobody's, as the shared surname is today.

**4. A check sets right what it can (host; ADR 0012).** A check sets a part right itself, without leaving it out, when
the right value is on record and nothing the model wrote is lost:
- **The Weaver's Lead's-move mark** on a happening by someone with no move to make is cleared. The happening is kept.
- **A Gap's happening that names what he missed** (`missed: "G2"`) takes that item's time and place from the record.
  When the model's time is outside the span, the record's time is used, and the happening is kept.
- **The cause of the wrong day, too.** The Weaver's list of what he missed said the hour only ("G2 2:00 pm"), so over
  a span of days it guessed the day. The list now says the day: "G2 Sunday 2:00 pm".

Only what is left out still goes back to the model, as now.

**5. A line is refused only when far too long (host, `story/bonds.ts`).** The lengths asked stay at 25 and 40 words. The
check refuses a line only past half again as much: 37 and 60 words. A model cannot count words exactly, and a line
four words over is still a short line. The Story File's own check for a Bond, written by the author, keeps 40.

**6. How far a skip is (host, `dayChoicesOf`; contract 20; android).** A Skip carries `days_away`, as a Happening
does. The phone's skip row says "Thursday 7:00 pm · in 48 days" a week or more away, with "in 48 days" in the pick's
amber. Nearer ones say the weekday, which names a day this week.

*Rejected:* writing "· in 48 days" into the Skip's `time`. The Gap sheet's header reuses `time` ("9:42 pm – Thursday
7:00 pm, before The Halloween troll"), and would have carried the days too.

## Risks / Trade-offs

- **[Two things at one place within the hour that are not the same.]** It was already one card. Now the card keeps
  the pick too, so the risk is no worse than today.
- **[A title list in English.]** The Stories are in English. A title not on the list is still left out, and is asked
  again as now.
- **[Longer lines kept.]** At most half again what was asked, and still bounded.

## Migration Plan

None. Nothing stored changes shape. The phone and the Mac update together for contract 20.
