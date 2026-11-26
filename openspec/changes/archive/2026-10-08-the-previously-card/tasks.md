# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Requirement this change builds: `stories`: Opening a Story returns exactly where the player left (Back after a night
away, which until now proved only the latest Reply; Back the same evening; Back to a Day View; Dismissing the card).

## 1. A summary for a Scene so far

- [x] 1.1 Add to `host/src/agents/CHRONICLER.md` the summary of a Scene that goes on: where it stands so far, in one or two lines, inventing nothing, the Player Character's part only from his Moves; and verify by reading it against design.md
- [x] 1.2 The Chronicler's schema, check and prompt ask for `summary` whether or not the Scene has ended, within the same length; verify unit tests that an open Scene's answer without a summary is refused and one with it is taken, and that the prompt says which summary is wanted
- [x] 1.3 The `chronicle` entry gains `sceneEnded`; an entry written before reads with `sceneEnded` from whether it had a summary; a Scene is summarised when a Chronicle with `sceneEnded` covers it, and a Scene's summary shown anywhere is its latest; verify store and chronicling tests (an old entry reads right; an open Scene with a so-far summary is still chronicled at its end, with its ended summary taking over)
- [x] 1.4 The Chronicler on Claude, three runs: the so-far summary of an open Scene the player stepped away from (the Charms room and the troll, with Hermione's invented "you hate flying") is within the length, and a judge finds nothing in it the Scene did not show and no invented past of his taken as true

## 2. Stepping away

- [x] 2.1 Test first, then build: an open Scene is chronicled once the Path's head is an hour old and its latest Reply is not covered, and not before; the engine's timer only queues the Chronicler; `fantasia serve` catches up at start; verify chronicling and engine tests with their own clock

## 3. The card on the Mac

- [x] 3.1 Extend the contract to version 5 (`SceneView.previously`: the summary and when the player last played) and regenerate both sides; verify the contract tests
- [x] 3.2 Test first, then build: `stories › Opening a Story returns exactly where the player left › Back after a night away` on the host (30 hours after the head entry, the view carries the Scene's latest so-far summary and when they last played)
- [x] 3.3 Test first, then build: `stories › Opening a Story returns exactly where the player left › Back the same evening` on the host (three hours after, no card)
- [x] 3.4 Test first, then build: `stories › Opening a Story returns exactly where the player left › Back to a Day View` on the host (two days after End scene, the card carries the closed Scene's summary)
- [x] 3.5 A Scene with no summary yet has no card, even after a day; verify a view test

## 4. The card on the phone

- [x] 4.1 Test first, then build: `stories › Opening a Story returns exactly where the player left › Back after a night away` on the phone, built to `docs/design/SceneReturn.dc.html` (the card just above the latest Reply, "PREVIOUSLY · 30 HOURS AGO", the summary, Dismiss; the Scene opens with the card at the top), as a shared check on the JVM and the device, replacing the note that left the card out
- [x] 4.2 Test first, then build: `stories › Opening a Story returns exactly where the player left › Back to a Day View` on the phone (the card at the top of the Day View), shared check on the JVM and the device
- [x] 4.3 Test first, then build: `stories › Opening a Story returns exactly where the player left › Dismissing the card` on the phone (dismissed, it stays gone on reopening and after the app restarts; a later time away shows it again), shared check on the JVM and the device
- [x] 4.4 How long ago, as the card says it: hours under two days, then days; verify a unit test
- [x] 4.5 Render the card with `-PfantasiaPreviews` and compare it with `SceneReturn.dc.html`; fix what differs

## 5. Together

- [x] 5.1 On the phone: play the Night Train, step away an hour, and read the stepping-away Chronicle and its so-far summary in `fantasia moments` and the calls; the first time the Night Train has been left a day, open it on the phone and compare the card with `SceneReturn.dc.html`
- [x] 5.2 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, and `openspec validate --all --strict`, and verify all pass
