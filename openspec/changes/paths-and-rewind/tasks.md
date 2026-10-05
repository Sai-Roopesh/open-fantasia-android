# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds, all in `paths`: Try another way from any Reply (Following the lantern); Everything
belongs to the Path (Two clocks); Rewind sets aside, never destroys (Going back and carrying on; Clearing what was
set aside); The Paths screen (Returning by the Paths screen; Deleting a Path); Starting again from the beginning
(Re-experiencing the Story); A Path changes only between Replies (Rewinding while a Reply is written).

## 1. The contract

- [x] 1.1 Extend the contract to version 9: `PathsView`, `PathRow` (`scenes`, `fork`, `path`, with depth), `PathCard` (id, label, title, detail, current, `played_at`, `can_delete`), `TryAnotherWayRequest` (`from` nullable, `after`), `RewindRequest`, `RenamePathRequest`, the `path_changed` event kind; regenerate both sides; verify the host typecheck, the Android build and the mac-link rule test that every optional request field accepts null

## 2. Paths on the Mac

- [x] 2.1 The store gains `origin`, `forked_at`, `opened` and `named` on Paths, in place for an existing store with Main's defaults; verify a store test that opens a version-8 store and finds Main unchanged with the new columns
- [x] 2.2 Test first, then build: `paths › Try another way from any Reply › Following the lantern` (a new current Path at the lantern Reply; three Scenes on it; switching back finds Main at 11:47 pm with nothing changed, and the forest Path still there)
- [x] 2.3 Test first, then build: `paths › Everything belongs to the Path › Two clocks` (one Path on Tuesday afternoon, another on Saturday night; switching puts the Scene view's clock and Day View on Saturday night)
- [x] 2.4 Test first, then build: `paths › Rewind sets aside, never destroys › Going back and carrying on` (Rewind to a Reply with five exchanges after it; the current Path keeps its name at that Reply; the five exchanges are a set-aside Path; a different Move carries on)
- [x] 2.5 Test first, then build: `paths › Rewind sets aside, never destroys › Clearing what was set aside` (only the never-opened set-aside Path goes; the opened one and the tried one stay)
- [ ] 2.6 Test first, then build: `paths › The Paths screen › Returning by the Paths screen` on the host (the rows: shared Scenes folded, the fork Scene, a card per Path with its label, title and detail; opening a Path puts the Story at its latest moment)
- [x] 2.7 Test first, then build: `paths › The Paths screen › Deleting a Path` on the host (the other Path deleted, Main unchanged, the current Path refused)
- [x] 2.8 Test first, then build: `paths › Starting again from the beginning › Re-experiencing the Story` (a new current Path at the opening Scene, the State as the Story File made it, every other Path untouched)
- [ ] 2.9 Test first, then build: `paths › A Path changes only between Replies › Rewinding while a Reply is written` (every Path command refused `busy` mid-Reply, Paths unchanged); and the refusals for a stale `after`, an entry that is not a Reply on the Path, and Rewind at the latest Reply; verify link tests
- [ ] 2.10 Every Path change emits `path_changed`, and a stream opened with a Path that is no longer current starts with it; verify engine event and link stream tests

## 3. Paths on the phone

- [ ] 3.1 Test first, then build: `paths › Try another way from any Reply › Following the lantern` on the phone: long-pressing an earlier Reply opens the menu built to `docs/design/LongPress.dc.html` (Copy, Rewind to here, Try another way from here; no Edit), Try another way sends the request and the Scene reloads at that Reply; the same from an earlier Scene being read; shared check on the JVM and the device
- [ ] 3.2 Test first, then build: `paths › Rewind sets aside, never destroys › Going back and carrying on` on the phone: Rewind to here sends the request, the latest Reply offers no Rewind, and the Scene reloads; shared check on the JVM and the device
- [ ] 3.3 Test first, then build: `paths › The Paths screen › Returning by the Paths screen` on the phone: the header's Paths opens the screen built to `docs/design/Paths.dc.html` (folded Scenes, the fork card, Path cards, MAIN · YOU ARE HERE, played time), and tapping a Path opens it; shared check on the JVM and the device
- [ ] 3.4 Test first, then build: `paths › The Paths screen › Deleting a Path` and `paths › Rewind sets aside, never destroys › Clearing what was set aside` on the phone: Rename and Delete sheets, Delete asks once and is absent on the current card, Clear shows only when there is something to clear; shared checks on the JVM and the device
- [ ] 3.5 Test first, then build: `paths › A Path changes only between Replies › Rewinding while a Reply is written` on the phone: the menu's Path actions and the Paths screen's are disabled while a Reply is written; shared check
- [ ] 3.6 `path_changed` reloads the Scene, and the stream opens with the Path the phone shows; verify JVM stream tests
- [ ] 3.7 Render with `-PfantasiaPreviews` and compare with `LongPress.dc.html` and `Paths.dc.html`; fix what differs

## 4. Together

- [ ] 4.1 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, and `openspec validate --all --strict`, and verify all pass
- [ ] 4.2 On the phone, with the Mac and the phone installed together at version 9: on the Night Train, Try another way from an earlier Reply, play a Move, open the Paths screen, return to Main, and Rewind; compare with the drawings, and check `fantasia trace` for each command
