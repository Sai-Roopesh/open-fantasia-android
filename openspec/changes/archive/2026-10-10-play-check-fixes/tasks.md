# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds:
- `day-view`:
  - Up to four Happenings: The Scene that matters is one he promised; In time order. The three scenarios already
    there must stay passing.
  - The player chooses where to be: A Landmark weeks away.
  - Missing something has consequences: What he missed keeps its time.
- `living-world` › Moments are remembered from one record: Named with a title; Set right, not asked again; A line a
  little long is kept.

## 0. Words and decision

- [x] 0.1 Write `docs/adr/0012-a-check-sets-right-what-it-can.md`. Verify: `openspec validate --all --strict`.

## 1. The Day View

- [x] 1.1 One card for the pick and the Engagement (design decision 1). Test first: `day-view › Up to four
  Happenings › The Scene that matters is one he promised`, on the engine with a plan whose next Scene that matters is
  at the Engagement's place and time. Watch it fail with no pick.
- [x] 1.2 Pick first, then time order (design decision 2). Test first: `day-view › Up to four Happenings › In time
  order`.
- [x] 1.3 How far a skip is (design decision 6): contract 20 `Skip.days_away`, regenerated, and the phone's skip row.
  Test first: `day-view › The player chooses where to be › A Landmark weeks away`, on the host, and as a shared check
  on the JVM and the device. Draw the skip row on `docs/design/DayView.dc.html`.

## 2. The checks

- [x] 2.1 Names past a title (design decision 3): unit tests in `test/agents/names.test.ts` ("Madam Hooch",
  "Professor McGonagall", "Prof. Flitwick", "Mr Malfoy" is nobody's). Then test first: `living-world › Moments are
  remembered from one record › Named with a title`, on the Director's check: nothing left out.
- [x] 2.2 The Weaver sets right its move mark and what he missed (design decision 4). Test first: `living-world ›
  Moments are remembered from one record › Set right, not asked again` (one Weaver call, not two), and `day-view ›
  Missing something has consequences › What he missed keeps its time`.
- [x] 2.3 A line refused only when far too long (design decision 5). Test first: `living-world › Moments are
  remembered from one record › A line a little long is kept`. "One bad part does not lose the Scene" must stay
  passing, with lines past the new bound.

## 3. Together

- [x] 3.1 Run `scripts/scenarios.mjs --strict`, the host suite and lint, the Android JVM and device suites, and `openspec validate
  --all --strict`, and verify all pass.
- [x] 3.2 Restart the Mac's server, and play a test copy of The Malfoy Problem over adb until a promise is made.
  Verify:
  - the Day View offers it once, as the pick when it is the Scene that matters;
  - the cards are in time order;
  - Scene ends ask no model twice for a title or a mark.

  Send the screenshots, then remove the test copy.
