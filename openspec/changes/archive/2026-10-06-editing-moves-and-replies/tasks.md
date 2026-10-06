# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds: `scenes › Editing` (Fixing a typo in the latest Reply; Fixing the latest Move; Editing
an earlier Move); `scenes › The latest Reply has its actions in view` (Copying the latest Reply; Holding an earlier
Move); `stories › Claude can edit a Story as the player can` (Claude fixes a typo through the Mac).

## 1. The contract

- [x] 1.1 Extend the contract to version 10: `EditRequest` (`entry`, `text`, `after`), `path_changed` described as covering an edit, and regenerate both sides; verify the host typecheck, the Android build and the mac-link rule test that every optional request field accepts null

## 2. Editing on the Mac

- [x] 2.1 Test first, then build: `scenes › Editing › Fixing a typo in the latest Reply` (the Reply reads "Hermione", the Path keeps its id and name, no new Path exists; Focus, Linger and a Scene the Story closed after it are replayed with their records, so nothing is woven or chronicled again)
- [x] 2.2 Test first, then build: `scenes › Editing › Fixing the latest Move` (the Move reads "I sit at the far end of the sofa", its Reply is as it was, no new Path exists)
- [x] 2.8 Found on the phone, decided by the player: an edited latest Move is answered by a new Reply on the same Path; test first (`scenes › Editing › Fixing the latest Move` as the spec now reads), then build on the Mac, the phone's Edit sheet and menu line, and `fantasia edit`
- [x] 2.3 Test first, then build: `scenes › Editing › Editing an earlier Move` (a new current Path from the edited Move with its Reply written, its card "FROM SCENE N · EDITED"; the ten exchanges after the original remain on the Path they were on)
- [x] 2.4 A Scene's opening prose can be edited as a Reply; an edit is refused with the reason while a Reply is written, from a stale head, with empty or unchanged words, and for anything that is not a Move or a Reply; verify engine and link tests for `POST /stories/:id/edit`
- [x] 2.5 Test first, then build: `scenes › The latest Reply has its actions in view › Holding an earlier Move` on the Mac (Rewind to here and Try another way from here on a Move act on the moment before it)
- [x] 2.6 A stream opened with the head the phone shows starts with `path_changed` when that head is no longer on the current Path, after an edit in place or a Rewind; verify link stream tests
- [x] 2.7 Test first, then build: `stories › Claude can edit a Story as the player can › Claude fixes a typo through the Mac` (`fantasia edit` in a second process on the same store; the serving engine sends `path_changed` within two seconds and the Scene view shows "Hermione"); and `fantasia edit` of an earlier Move waits for the Reply and prints it; verify CLI and two-process tests

## 3. Editing on the phone

- [x] 3.1 Test first, then build: `scenes › The latest Reply has its actions in view › Copying the latest Reply` on the phone, with the row built to `docs/design/Scene.dc.html` (Copy, Redo, Edit, Try another way); shared check on the JVM and the device
- [x] 3.2 Test first, then build: `scenes › The latest Reply has its actions in view › Holding an earlier Move` on the phone: a held Move opens Copy, Rewind to here, Try another way from here and Edit, with the line under the menu built to `docs/design/LongPress.dc.html`; shared check on the JVM and the device
- [x] 3.3 Test first, then build: `scenes › Editing › Fixing a typo in the latest Reply` on the phone: Edit opens the sheet in the style of `docs/design/Redo.dc.html` with the words, Save sends the edit and the Scene shows it; shared check on the JVM and the device
- [x] 3.4 Test first, then build: `scenes › Editing › Editing an earlier Move` on the phone: Edit from the menu, in the Scene and in an earlier Scene being read, says it starts a Path and lands on it; Edit is off while a Reply is written; shared check on the JVM and the device
- [x] 3.5 The stream opens with the head the phone shows, and `path_changed` after an edit reloads the Scene; verify JVM stream tests
- [x] 3.6 Render with `-PfantasiaPreviews` and compare the latest Reply's row with `Scene.dc.html`, the menu with `LongPress.dc.html` and the Edit sheet with `Redo.dc.html`; fix what differs

## 4. Together

- [x] 4.1 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, and `openspec validate --all --strict`, and verify all pass
- [x] 4.2 On the phone, with the Mac and the phone installed together at version 10: on the Night Train, fix a word in the latest Reply, edit an earlier Move and see its Reply on a new Path, and run `fantasia edit` on the Mac while the phone shows the Scene; compare with the drawings and check `fantasia trace`
