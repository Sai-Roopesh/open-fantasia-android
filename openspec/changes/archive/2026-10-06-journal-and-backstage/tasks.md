# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds: `outside-the-scene › The Journal reads the Story back › Reading back`;
`outside-the-scene › Backstage shows everything else, only when visited › Quirrell's nights, Backstage`;
`long-run › Taste is short, readable and the player's › Deleting a lesson`.

## 1. The contract

- [x] 1.1 Extend the contract to version 11: `JournalView` (days of Scene and Meanwhile rows), `BackstageView` (off-screen by day, Threads, Lives, the Writer's plan, Taste), `RemoveTasteRequest`; regenerate both sides; verify the host typecheck and the Android build

## 2. On the Mac

- [x] 2.1 Test first, then build: `outside-the-scene › The Journal reads the Story back › Reading back` on the host (the Journal lists every Scene on the Path by day with its summary, the Meanwhile after each in order, nothing only Backstage knows; Scene 3 opens in full through the past-Scene route)
- [x] 2.2 Test first, then build: `outside-the-scene › Backstage shows everything else, only when visited › Quirrell's nights, Backstage` on the host (Saturday night's off-screen has what Quirrell did, known to him alone; Threads, Lives, the Writer's plan and Taste)
- [x] 2.3 Test first, then build: `long-run › Taste is short, readable and the player's › Deleting a lesson` (a `taste_set` entry; later Writer and Actor calls no longer carry the line; other Paths keep it; refused mid-Reply); verify engine and link tests

## 3. On the phone

- [x] 3.1 Test first, then build: `outside-the-scene › The Journal reads the Story back › Reading back` on the phone, built to `docs/design/Journal.dc.html`; tapping Scene 3 shows it in full; shared check on the JVM and the device
- [x] 3.2 Test first, then build: `outside-the-scene › Backstage shows everything else, only when visited › Quirrell's nights, Backstage` on the phone, built to `docs/design/Backstage.dc.html`; shared check on the JVM and the device
- [x] 3.3 Test first, then build: `long-run › Taste is short, readable and the player's › Deleting a lesson` on the phone: the ✕ deletes the line once the Mac takes it; shared check
- [x] 3.4 The header's Journal, Paths and Backstage; render with `-PfantasiaPreviews` and compare with `Journal.dc.html` and `Backstage.dc.html`; fix what differs

## 4. Together

- [x] 4.1 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, and `openspec validate --all --strict`, and verify all pass
- [x] 4.2 On the phone, with the Mac and the phone installed together at version 11: open the Journal and Backstage on the Night Train, tap an earlier Scene, and compare with the drawings
