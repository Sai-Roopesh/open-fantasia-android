# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass; a
test retired with a removed requirement is deleted with it.

Lasting-records is applied first.

Scenarios this change builds:
- `long-run`:
  - The Director shapes the long run around Arcs and Landmarks: The plan stays Backstage; A stretch that has not run
    its course.
  - Rest is deliberate: A quiet pick after a peak.
  - Arcs keep pace with the run: Four years of romance, paced; The roadmap follows the player.
  - Leads act every Stretch: Jealousy acted on; A move made off-screen reaches him.
- `day-view`:
  - Up to four Happenings: The next Scene that matters is days away.
  - The player chooses where to be: Skipping a week.
  - A Lead away still acts: Away, but not idle.
- `scenes` › A Scene ends in one of three ways: Walking somewhere together keeps the Scene.
- `living-world` › Off-screen time is resolved only as far as it reaches the player: Five days, told in a few lines;
  Twenty minutes with nothing on.

## 0. Words, decisions and screens

- [x] 0.1 CONTEXT.md: **Stretch** added, **Scene** redefined as one thing happening between its people.
  `docs/adr/0010-the-director-owns-the-calendar.md` supersedes the Scene-end order in 0004. Verify:
  `openspec validate --all --strict`.
- [ ] 0.2 Draw the Day View pick's day on `docs/design/DayView.dc.html` and the Stretch in Backstage's THE DIRECTOR
  on `Backstage.dc.html`, and add them to the README. The player approves them before any phone code.

## 1. The Stretch plan

- [x] 1.1 The new `director_plan` shape, the schema, and `checkPlan`:
  - Scenes within the Stretch and after the clock, people in the Story, a row for every Lead and Arc, and roadmap
    rows for the next two Landmarks;
  - part by part, as in lasting-records;
  - the fake Director's answer updated.

  Unit tests for each check.
- [x] 1.2 `directionDue` by days and planned Scenes. Test first: `long-run › The Director shapes the long run around
  Arcs and Landmarks › A stretch that has not run its course`, and the plan stays Backstage, with its view test.
- [x] 1.3 `DIRECTOR.md` and the prompt: the whole run, the Landmarks, the Leads' Bonds, the previous roadmap, and the
  pacing rule. Test first: `long-run › Arcs keep pace with the run › Four years of romance, paced` (the prompt
  carries the run and the next Landmarks, and the plan's roadmap names Halloween) and `› The roadmap follows the
  player`.
- [x] 1.4 Test first: `long-run › Leads act every Stretch › Jealousy acted on`. The Director's task carries the Bond
  turn for the hug, and a plan without a move for Draconia is refused part by part, then repaired.

## 2. The order, and the Weaver following the plan

- [x] 2.1 The order at a Scene's end: Chronicler, then the Director when due, then the Weaver, in the engine, with
  the tests that pin the order. A failed Director keeps the old plan, and the Weaver goes ahead.
- [x] 2.2 The Weaver reads the Stretch (`WEAVER.md`, the prompt and the check): its pick is the next unplayed Scene
  that matters, with its id. Test first: `day-view › Up to four Happenings › The next Scene that matters is days
  away`, through choosing it, the Gap and Meanwhile.
- [x] 2.3 Off-screen Lead moves in the span. Test first: `long-run › Leads act every Stretch › A move made off-screen
  reaches him`, and `day-view › A Lead away still acts › Away, but not idle`.
- [x] 2.4 Spans. Test first: `living-world › … › Five days, told in a few lines` and `› Twenty minutes with nothing
  on` (an empty span moves nothing, and the Day View reuses what is still ahead).
- [x] 2.5 Rest. Test first: `long-run › Rest is deliberate › A quiet pick after a peak`, with a rest Stretch planned
  after a peak.
- [x] 2.6 Retire "Lead absence is felt, not counted": delete its test, and the leadless counting in `weaving.ts` and
  `WEAVER.md`.

## 3. The Writer

- [ ] 3.1 Framing from a planned Scene: the choice carries the Scene's id, and the Writer's task carries the planned
  Scene. Test: a chosen pick's first Writer call has its place, its people, what it is for and the Lead's move.
- [ ] 3.2 A Scene as a dramatic unit (`WRITER.md`, the check, the Scene view's place line). Test first: `scenes › A
  Scene ends in one of three ways › Walking somewhere together keeps the Scene`. "Walking out of a Scene" still
  passes.

## 4. Skips, the link and the phone

- [ ] 4.1 "Next week". Test first: `day-view › The player chooses where to be › Skipping a week`.
- [ ] 4.2 Contract 18 (design decision 7). Regenerate; views and link tests for `days_away`, `scene` and the
  Backstage Stretch.
- [ ] 4.3 The phone: the Day View pick's day and the Backstage Stretch, built to the approved drawings, with shared
  checks on the JVM and the device.

## 5. Together

- [ ] 5.1 A live check with the real models: a scripted month of Stretches from Freshers' Friday, choosing the
  Story's pick each time, covers at least four weeks of story time in under twenty Scenes. Draconia acts in every
  Stretch, on screen or off, and no declaration is reached. Run with `npm run test:real`.
- [ ] 5.2 Run `scripts/scenarios.mjs --strict`, the host suite and lint, the Android JVM and device suites, and
  `openspec validate --all --strict`, and verify all pass.
- [ ] 5.3 With the player's agreement, import The Malfoy Problem again and play the first Stretch on the phone over
  adb. Check the Day View leads with the next Scene that matters and its day, and that Backstage shows the Stretch
  and Draconia's move. Send the screenshots.
