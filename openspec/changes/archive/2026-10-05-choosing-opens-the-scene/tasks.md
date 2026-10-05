# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds: `presence › Between Scenes is quiet, and shows progress › The next Scene is being
written`; `day-view › The Gap is the player's, and everything in it goes on without them › A choice that fails keeps
the Gap`.

## 1. The contract

- [x] 1.1 Extend the contract to version 8: `NextScene` (`at`, `at_label`, both nullable), `SceneView.opening` (required, nullable), `StoryEvent.opening` (on a Move at the Day View), `Skip.in_sentence` (required) and the Skip `time` rule in its description; regenerate both sides; verify the host typecheck, the Android build and the mac-link rule test that every optional request field accepts null

## 2. On the Mac

- [x] 2.1 Test first, then build: `presence › Between Scenes is quiet, and shows progress › The next Scene is being written` on the host: after a Skip to This evening with a Gap at the Night Train's 9:05 am Day View, the Scene view has no Day View, `opening` at Day 2 18:00 "Friday 6:00 pm", the Move as its one exchange with the Gap first, and the closed Scene among the earlier Scenes; after `scene_opened`, `opening` is null and the card is the new Scene's; verify views and link tests
- [x] 2.2 The Move's live event carries `opening` when it is written at the Day View, for a choice with a time, a choice without one (Follow) and the player's own Move (no time); a Move inside an open Scene carries none; verify engine event tests and the stream test that a reconnect mid-wait reads the same opening
- [x] 2.3 A turn that fails while the Scene is opening keeps `opening`, and Retry opens the Scene; verify an engine test with a failing Writer
- [x] 2.4 Skips say how they read: `time` without the day on the Day View's own day ("6:00 pm"), with it otherwise ("Saturday 7:30 am"); `in_sentence` "this evening", "tomorrow", "the weekend", a Landmark's name as named; the chosen Move's wording reads `in_sentence` instead of lowercasing on its own; verify day-view and choosing tests

## 3. On the phone

- [x] 3.1 Test first, then build: `presence › Between Scenes is quiet, and shows progress › The next Scene is being written` on the phone: a Move event with `opening` turns the Day View into the Scene at once, with the NEXT SCENE card (time, "Scene being written") in the style of the Scene card in `docs/design/Scene.dc.html`, the Move below it with the Gap first, and the composer, Linger and End scene disabled; `scene_opened` brings the real card; shared check on the JVM and the device
- [x] 3.2 A failed turn while opening shows the failure and Retry under the Move as in `docs/design/SceneFailed.dc.html`, with the card kept; verify a shared check
- [x] 3.3 Test first, then build: `day-view › The Gap is the player's, and everything in it goes on without them › A choice that fails keeps the Gap`: the sheet stays open while the choice is sent, closes when the Mac takes it, and after a refusal keeps "I spent the morning in the library reading about life debts" with the reason; shared check on the JVM and the device
- [x] 3.4 The Gap sheet's span reads from the Mac's words, "9:05 am – 6:00 pm, before this evening", and its button "Skip to this evening", built to `docs/design/Gap.dc.html`; verify the shared Gap check
- [x] 3.5 Render with `-PfantasiaPreviews` and compare the opening Scene with `Scene.dc.html` and the Gap sheet with `Gap.dc.html`; fix what differs

## 4. Together

- [x] 4.1 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, and `openspec validate --all --strict`, and verify all pass
- [x] 4.2 On the phone, with the Mac and the phone installed together at version 8: at a Night Train Day View, choose with a Gap and see the Scene open at once with the Move and the NEXT SCENE card, then fill in when the Writer has opened it; verify the times from `fantasia trace` and compare with the drawings
