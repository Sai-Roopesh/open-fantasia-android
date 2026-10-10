# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds:
- `living-world` › An Engagement is recorded where it is made: Made in a Reply; Words that are not on the page;
  Arranged behind his back.
- `day-view`:
  - What he has arranged is on: A note under the door; Wednesday evenings in the library; An invitation, not a
    summons; Called off.
  - Up to four Happenings: What he is expected at is never crowded out (the two scenarios already there must stay
    passing).
  - Missing something has consequences: A summons he only heard of is still missed; Missed while in another Scene.
- `presence` › Between Scenes is quiet, and shows progress: An Engagement fills in.

## 0. Words, decision and screen

- [x] 0.1 Add **Engagement** to CONTEXT.md, and write `docs/adr/0011-an-arrangement-is-recorded-where-it-is-made.md`.
  Verify: `openspec validate --all --strict`, and the specs use the term as the glossary spells it.
- [ ] 0.2 Draw a weekly Engagement's card on `docs/design/DayView.dc.html` ("Every Wednesday · 7:30 pm", marked
  "You're expected"), and update the README row. The player approves it before any phone code.

## 1. The record

- [x] 1.1 The Chronicler's `engagements` and `changed`, and its `<engagements_on>` (design decisions 1 and 2):
  - the schema, the check part by part (quotes word for word, a time after the Scene's start, people in the Story, a
    duplicate of one on left out, a `changed` label not shown left out), and `CHRONICLER.md`;
  - unit tests for each check.

  Then test first: `living-world › An Engagement is recorded where it is made › Made in a Reply`, `› Words that are
  not on the page` and `› Arranged behind his back`.
- [x] 1.2 A Meanwhile line's `engagement` in the Weaver (schema, check, `WEAVER.md`), with unit tests: a time before
  the span's end and a name not in the Story are left out.
- [x] 1.3 `story/engagements.ts` `engagementsOn`: Engagements from Chronicles and World records in Path order, moves
  and call-offs applied, each one's next time ahead of a clock, weekly ones rolled on. Unit tests: one-off, weekly,
  moved, called off, and another Path unchanged.

## 2. The Day View

- [x] 2.1 What is on draws on Engagements (design decision 3): `onAhead` and `todayOn`, the Weaver Happening at the
  same place and time dropped, the order and the cap, and the Weaver told what is on. Test first: `day-view › What
  he has arranged is on › A note under the door`, `› An invitation, not a summons`, and `day-view › Up to four
  Happenings › What he is expected at is never crowded out`.
- [x] 2.2 Weekly and called off. Test first: `day-view › What he has arranged is on › Wednesday evenings in the
  library` (offered days away and again the next week) and `› Called off`.
- [x] 2.3 Kept or missed (design decision 4): a choice carries its Engagement; kept by the choice or by a Scene at its
  place over its time; every span's missed Engagements passed to the Weaver. Test first: `day-view › Missing
  something has consequences › A summons he only heard of is still missed` and `› Missed while in another Scene`.
  "Skipping a summons" and "McGonagall answers the absence" must stay passing.
- [x] 2.4 The Writer is told his Engagements ahead (design decision 7). Test: the Writer's prompt in a Scene on
  Wednesday at 7:10 pm carries the library at 7:30 pm, marked expected.

## 3. The link and the phone

- [x] 3.1 Contract 19: `record_written` and `Happening.every`. Regenerate; verify both sides compile; link tests for
  the event and the field.
- [x] 3.2 `record_written` from the engine when a record adds or changes an Engagement on the Path the phone shows.
  Test first: `presence › Between Scenes is quiet, and shows progress › An Engagement fills in`, on the host (the
  event after a late Chronicle, and the Day View read again shows the session).
- [ ] 3.3 The phone: read the Scene again on `record_written`, and the weekly card built to the approved drawing.
  Shared checks on the JVM and the device.

## 4. Together

- [ ] 4.1 A live check with the real Chronicler on the first play's five arrangements, played as scripted Scenes
  (Draconia's Wednesday, Hermione's invitation, Flitwick's practical) and Meanwhile lines (McGonagall's summons, the
  note under the door). At least four of the five are recorded with the right day, place and expected flag, and none
  invented. Run with `npm run test:real`.
- [ ] 4.2 Run `scripts/scenarios.mjs --strict`, the host suite and lint, the Android JVM and device suites, and
  `openspec validate --all --strict`, and verify all pass.
- [ ] 4.3 With the player's agreement, import The Malfoy Problem again on the Mac. Play on a test copy over adb until
  an arrangement is made on the page. Check the next Day View offers it, and that skipping past it has it noticed
  when he was expected. Send the screenshots, then remove the test copy.
