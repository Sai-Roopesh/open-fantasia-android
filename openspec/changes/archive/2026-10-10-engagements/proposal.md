# Proposal

## Why

An arrangement the Player Character knows of has no place in the State. It might be a summons, an invitation, a
weekly session, or a lesson he was told about. It lives only as prose in a Reply or a line of Meanwhile. The Day
View's offers are written afresh by the Weaver after each Scene, from a window of the last twelve exchanges. So
whether an arrangement is offered depends on the model noticing it again every time, and often it does not.

In the first play of The Malfoy Problem, five arrangements set up on the page were never offered:
- **McGonagall's Sunday 9:00 summons**, told in Meanwhile. It was never offered and never noticed as missed, because
  the Gap's missed logic reads only offered Happenings.
- **Draconia's Wednesday evenings in the library**: "You'll be there before me", in Scene 8, and he agreed.
- **"Flitwick's practical on Friday"**, in Scene 9.
- **Hermione's invitation to the library**, in Scene 12. The Day View offered nothing at all.
- **Draconia's note "Library. Ten o'clock."** On the test copy after story-in-stretches, it was seen in Meanwhile,
  but only the Stretch's pick was offered.

Telling the Weaver to try harder would be patch work. The fix is to record an arrangement where it is made and have
the Day View read the records.

## What Changes

- **An Engagement record.** It is new, and it is what the Player Character knows is on: when, where, who, whether
  he is expected, whether it repeats each week, and the words it was made in. It is written by the agent that saw it
  made:
  - **The Chronicler**, from the Scene's page. It quotes the Move or Reply word for word, as Moments are quoted, so
    an Engagement can never be invented. It can also record that an Engagement known to someone in the Scene was
    moved or called off.
  - **The Weaver**, when a line of Meanwhile carries one, such as a note under the door or a message passed on.
- **The Day View offers every Engagement ahead.** They sit beside the Stretch's pick and the Weaver's Happenings,
  with nothing he is expected at before the pick ever left out. They fill in when the record lands, as the Day View
  already fills in part by part. The Day View never waits longer for them.
- **Kept, missed or past.** An Engagement chosen at the Day View is kept. One whose time passes without him is
  missed. If he was expected, a Gap or a Scene's end that passes it has it go on without him, and the people there
  notice. A weekly Engagement then moves to its next week. The Weaver is told what is recorded and no longer has to
  re-offer it.
- **A new event.** When a record adds an Engagement on the Path the phone is showing, a `record_written` event tells
  the phone to read the Scene again. **BREAKING:** contract 19.
- **Words.** "Engagement" is added to CONTEXT.md. ADR 0011 says an arrangement is recorded where it is made and the
  Day View reads records, not a re-reading of prose.
- **Not in this change:** a school timetable in the Story File. It was considered: a weekly routine of lectures the
  Story knows without anyone saying it. It is a separate change, and it would feed the same records.

## Capabilities

### New Capabilities

None. Engagements belong to the Day View, the record of the living world, and presence.

### Modified Capabilities

- `day-view`:
  - "Up to four Happenings" changes: Engagements ahead are offered, and those he is expected at before the pick are
    never left out.
  - "Missing something has consequences" changes: an Engagement passed without him is missed, whether in a Gap or
    across a Scene.
  - New requirement: what he has arranged is on.
- `living-world`: new requirement, an Engagement is recorded where it is made, on the page or in Meanwhile, and
  never invented.
- `presence`: "Between Scenes is quiet, and shows progress" gains a scenario: Engagements fill in on the Day View
  when the record lands.

## Impact

- **Host:**
  - `story/entries.ts`: Engagement and the Chronicler's moves and call-offs.
  - `agents/chronicler.ts` and `CHRONICLER.md`: the `engagements` and `changed` parts, checked part by part.
  - `agents/weaver.ts` and `WEAVER.md`: a Meanwhile line's `engagement`, and the recorded Engagements told to it.
  - `story/engagements.ts`: new, `engagementsOn`, what is on, next occurrences.
  - `story/day.ts`: what is on draws on Engagements.
  - `engine/weaving.ts`: missed Engagements in Gaps and at a Scene's end; a choice carries its Engagement.
  - `engine/engine.ts`: `record_written`.
  - `views/scene.ts`.
- **Protocol:** contract 19, with `StoryEvent.kind` gaining `record_written` and `Happening` gaining `every`
  ("Wednesdays").
- **Android:** read the Scene again on `record_written`, and say "Every Wednesday" on a weekly Happening's card.
  DayView.dc.html is updated first, for approval.
- **Data:** none kept. The player replays.
