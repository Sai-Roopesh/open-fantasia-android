# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds:
- `long-run` › The Director shapes the long run around Arcs and Landmarks: A Scene that matters he arranged.
- `day-view` › The Gap is the player's, and everything in it goes on without them: What goes on without him, in time
  order.

## 1. The Director

- [x] 1.1 The Director's ask and prompt carry his Engagements (design decision 1). Unit test: the prompt's
  `<his_engagements>` for a one-off expected and a weekly one.
- [x] 1.2 A Scene that matters can be an Engagement (design decision 2): the schema, the check, `PlannedScene`, and
  DIRECTOR.md (design decision 3). Unit tests in `test/agents/director.test.ts`:
  - a label takes the Engagement's time and place;
  - a label not shown is cleared;
  - one outside the Stretch is left out.

  Then test first, on the engine: `long-run › The Director shapes the long run around Arcs and Landmarks › A Scene
  that matters he arranged`.

- [x] 1.3 What he knows of someone is asked for in forty-five words, refused past sixty (design decision 5). Unit
  test: a 52-word line is kept, and the Chronicler's instructions ask for forty-five.

## 2. The phone

- [x] 2.1 The Gap sheet in time order (design decision 4). Test first, as a shared check on the JVM and the device:
  `day-view › The Gap is the player's, and everything in it goes on without them › What goes on without him, in time
  order`.

## 3. Together

- [x] 3.1 Run `scripts/scenarios.mjs --strict`, the host suite and lint, the Android JVM and device suites, and
  `openspec validate --all --strict`, and verify all pass.
- [x] 3.2 A live check with the real Director, with `npm run test:real`. Given the first play's Scene 1 with the
  library arrangement recorded, the plan's Scene with Draconia is that Engagement, in at least two of three runs.
- [x] 3.3 Restart the Mac's server. Play a test copy over adb to the same arrangement, and verify the Day View offers
  one library meeting with Draconia, as the pick. Send the screenshots, then remove the test copy.
