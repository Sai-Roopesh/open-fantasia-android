# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds:
- `long-run › The Premise is what the Story serves`: The Premise keeps returning.
- `long-run › Arcs are built toward, never resolved on a schedule`: A slow burn stays slow.
- `long-run › The Director shapes the long run around Arcs and Landmarks`: The plan stays Backstage; A stretch that
  has not run its course.
- `long-run › Rest is deliberate`: A quiet pick after a peak.
- `outside-the-scene › Backstage shows everything else, only when visited`: What the Director is building toward.

## 1. The plan

- [x] 1.1 The `director_plan` entry as a background record (design decision 1), the current plan on a Path and
  whether it has run its course; store tests, including a Rewind past the Scene it followed dropping it
- [x] 1.2 Contract 13: `BackstageView.director` (toward, phase, line) in `link.schema.json` and `contract.json`;
  regenerate the host and Kotlin types and verify both compile

## 2. The Director

- [x] 2.1 `agents/director.ts` and `DIRECTOR.md`: the prompt from everything (decision 3), `DIRECTOR_SCHEMA`, and the
  check with one repair. Agent tests on a scripted model: an Arc row missing, a Landmark that is not the Story's,
  `scenes` out of range, and anything but `rest` after a peak are each refused with the reason
- [x] 2.2 Test first, then build: `long-run › The Director shapes the long run around Arcs and Landmarks › A stretch
  that has not run its course`, an engine test:
  - when the plan is due (decision 2): the first Scene's end, a plan run out, a peak, a Landmark passed;
  - after the Chronicler and the Weaver;
  - one run at a time, on the Director's model;
  - a failure kept and due again.

## 3. The plan reaches the Writer

- [x] 3.1 The Writer's "The long run" section from the current plan, and WRITER.md on `next`, `not_yet` and resting
  (decision 4); a writer test that the section is in the Writer's prompt and in no other agent's

## 4. Rest

- [x] 4.1 Test first, then build: `long-run › Rest is deliberate › A quiet pick after a peak`:
  - `afterPeak` in the Weaver's task, and `quiet` on Happenings;
  - the check refuses a pick that is not quiet after a peak;
  - engine test: a Scene the Writer rated 4 ends, and the Day View's pick is quiet;
  - a live Weaver test of the same.

## 5. Backstage

- [x] 5.1 Test first, then build: `long-run › The Director shapes the long run around Arcs and Landmarks › The plan
  stays Backstage`: the plan is in `GET /stories/{id}/backstage` and absent from the Scene view, the Day View, the
  World and the Journal; a link test
- [x] 5.2 Test first, then build: `outside-the-scene › Backstage shows everything else, only when visited › What the
  Director is building toward`: Backstage's Director section on the phone as drawn in Backstage.dc.html; shared
  checks on the JVM and the device, and a preview compared with the design

## 6. The long run, live

- [x] 6.1 Test first: `long-run › The Premise is what the Story serves › The Premise keeps returning`, live (decision
  7): ten Scenes of The Malfoy Problem with the real Writer and Director, and a judge on each Scene's purpose
- [x] 6.2 Test first: `long-run › Arcs are built toward, never resolved on a schedule › A slow burn stays slow`, live:
  twenty Scenes, and a judge on how far the Arc has moved
- [x] 6.3 Run both, with the Director's prompt changed only as their results show; verify they pass

## 7. Together

- [x] 7.1 Run `scripts/scenarios.mjs`, the host suite, `npm run test:real` for the Director's and the Weaver's live
  tests, the Android JVM and device suites, and `openspec validate --all --strict`, and verify all pass
- [ ] 7.2 On the phone: play the Night Train past a Scene end and see the Director's line in Backstage; end a Scene
  that peaks and see a quiet pick at the Day View
