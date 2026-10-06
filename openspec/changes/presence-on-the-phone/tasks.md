# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds, all in `presence`: The phone buzzes for two things only (A Reply finishes while the
phone is locked); The phone finds the Mac on any shared network (A new network; A network that keeps them apart);
What has been seen can be read without the Mac (The Mac is asleep); The Mac keeps working while the phone is locked
(Ending a Scene and locking the phone).

## 1. Reaching the Mac

- [x] 1.1 Test first, then build: `presence › The phone finds the Mac on any shared network › A new network` and `› A network that keeps them apart` (every address the Mac gave or that answered is kept and tried; a stored pairing from before still reads); JVM tests against fake Macs on two addresses

## 2. Without the Mac

- [x] 2.1 Test first, then build: `presence › What has been seen can be read without the Mac › The Mac is asleep` (the Stories, a Scene, an earlier Scene and the Journal read from the kept copy with no Mac; the composer says the Mac is unreachable); JVM test and shared check on the JVM and the device
- [x] 2.2 A Move written without the Mac waits ("Sends when the Mac is back") and is sent once when it is back; a Story that moved on meanwhile returns it to the composer with the reason; JVM tests

## 3. Notifications

- [x] 3.1 Test first, then build: `presence › The phone buzzes for two things only › A Reply finishes while the phone is locked` (with the app away and a Reply under way, one silent note, then one "The Reply is ready" notification and the watch stops; the same for a Day View; nothing for anything else); Robolectric tests of the watch
- [x] 3.2 The notification permission is asked the first time a Move is sent on Android 13 and later; without it nothing is shown; verify a JVM check

## 4. The Mac

- [x] 4.1 Test first: `presence › The Mac keeps working while the phone is locked › Ending a Scene and locking the phone` on the host (End scene, the stream closed at once, the Day View ready on the next read)

## 5. Together

- [ ] 5.1 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, and `openspec validate --all --strict`, and verify all pass
- [ ] 5.2 On the phone: send a Move and lock the phone, and see the quiet note then the buzz; stop the Mac's host and read the Night Train from the kept copy, write a Move, start the host and see it sent; with the phone on mobile data and Tailscale, see it reach the Mac
