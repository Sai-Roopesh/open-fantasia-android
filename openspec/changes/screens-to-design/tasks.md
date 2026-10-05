# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass; a
Compose check whose words the approved screens change is updated to the drawn words in the task that changes the
screen.

Screens built here, from docs/design: `Main.dc.html`, `Pair.dc.html`, `Scene.dc.html`, `SceneWriting.dc.html`,
`SceneFailed.dc.html`, `Redo.dc.html`, `DayView.dc.html` (first form).

## 1. What the Mac sends

- [x] 1.1 Extend the contract to version 3 (`StorySummary.detail`, `DayView.day` and `time`, `Countdown.when`) and regenerate both sides
- [x] 1.2 Test first, then build: `stories › Home shows where every Story stands › Two Stories on the home screen` on the host (a Story mid-Scene reads "Scene 14 · After curfew"; one at its Day View reads "Sunday 7:40 am · choosing where to go"), with each Story's detail line
- [x] 1.3 Test first, then build: the Day View's day, time and countdown amounts

## 2. The look

- [x] 2.1 One theme with the palette, Literata and Manrope through the Compose Google Fonts provider, and the shapes from docs/design/README.md; every screen takes its colours and type from it

## 3. The screens

- [x] 3.1 Home as `Main.dc.html`: the Mac's name and status, each Story's title, standing, detail and how long ago; verify a Compose check
- [x] 3.2 Pairing as `Pair.dc.html`; verify the pairing checks still pass
- [x] 3.3 The Scene as `Scene.dc.html`: the header, earlier Scenes folded, the title card with Portraits and Focus, Replies as prose, Moves as bubbles with the Player Character's first name, Copy and Redo under the latest Reply, the Linger and End scene chips, the composer; verify Compose checks
- [x] 3.4 Test first, then build: `presence › The player can always write › Typing during a Reply`, as `SceneWriting.dc.html` (the composer keeps text while a Reply arrives; Send waits and says so)
- [x] 3.5 A failed Reply as `SceneFailed.dc.html` (the reason, Retry, the trace); verify the failure checks
- [x] 3.6 Redo as the sheet in `Redo.dc.html` (Direction; Remember this waits for one); verify the Redo checks
- [x] 3.7 The Day View's first form as `DayView.dc.html` (the day, the time and place, countdown tiles, the composer); verify the countdown check

## 4. Together

- [x] 4.1 Install on the phone, play a Scene of the Night Train to its Day View, and compare a screenshot of each built screen with its drawn one; fix what differs
- [x] 4.2 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, and `openspec validate --all --strict`, and verify all pass
