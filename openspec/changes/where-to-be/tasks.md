# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Requirements this change builds, as the living `day-view` spec gives them: Up to four Happenings (A summons is
marked); The player chooses where to be (Following someone; Letting the Story choose); The Gap is the player's, and
everything in it goes on without them (Skipping a summons; Filling the Gap; Both, in turn); Missing something has
consequences (McGonagall answers the absence); Lead absence is felt, not counted (Two Scenes without a Lead).

## 1. Happenings

- [x] 1.1 Add Happenings to WEAVER.md (at most four, what matters now, who will be there, the Story's pick first, a summons marked; after two Scenes without a Lead, a pick with a Lead), and verify by reading it against design.md
- [x] 1.2 The Weaver's schema, prompt and check gain `happenings` (at most four; at or after the Day View's time; the Story's names, never the Player Character's; one pick, first); verify unit tests that each broken rule is named
- [x] 1.3 Test first, then build: `day-view › Up to four Happenings › A summons is marked` on the host (the Day View carries the Happenings, the pick first, McGonagall's summons expected)
- [x] 1.4 Test first, then build: `day-view › Lead absence is felt, not counted › Two Scenes without a Lead` (after two Scenes with no Lead, an answer whose pick has none is refused; the Day View's pick has Draconia or Hermione in it)

## 2. Choosing

- [x] 2.1 Extend the contract to version 7 (`DayView.happenings` and `choices`; `POST /stories/{id}/choose`) and regenerate both sides; verify the contract tests
- [x] 2.2 `choose` writes one Move in the player's words (the Gap first, then the choice; a blank Gap in the rule's words) with the choice kept beside it; verify engine and link tests for each kind of choice and a refused one (unknown Happening, a time before now)
- [x] 2.3 Test first, then build: `day-view › The player chooses where to be › Letting the Story choose` (the next Scene opens on the Story's pick: its time, place and people, checked by code)
- [x] 2.4 Test first, then build: `day-view › The player chooses where to be › Following someone` (the next Scene opens where Hermione is going next, with her in it; a frame without her is refused)
- [x] 2.5 Go somewhere and Skip to later open at the place and the time chosen; verify engine tests

## 3. The Gap

- [x] 3.1 Test first, then build: `day-view › The Gap is the player's, and everything in it goes on without them › Skipping a summons` (blank: the Move says he spent it quietly where he was; the Gap is woven before the Scene, and McGonagall took the accounts without him and noticed: an answer without that is refused)
- [x] 3.2 Test first, then build: `day-view › The Gap is the player's, and everything in it goes on without them › Filling the Gap` (his words are the Move's, and the Chronicler can quote them later)
- [x] 3.3 Test first, then build: `day-view › The Gap is the player's, and everything in it goes on without them › Both, in turn` (after the 9:00 Scene ends at 9:40, the Day View still offers the hospital wing at 11:00)
- [x] 3.4 A failed Gap Weaver fails the turn with its reason, and Retry runs the Gap and the turn again; a Gap under an hour with nothing in it is not woven; verify engine tests

## 4. What people know

- [x] 4.1 Test first, then build: `day-view › Missing something has consequences › McGonagall answers the absence` on the host (the Actor's prompt in his next Scene with McGonagall holds her noticing his absence; a Scene without anyone who knows it does not)

## 5. The phone

- [x] 5.1 Test first, then build: `day-view › Up to four Happenings › A summons is marked` on the phone, built to `docs/design/DayView.dc.html` (WHAT'S ON TODAY, the pick's card and its label, the "You're expected" pill, Go), shared check on the JVM and the device
- [x] 5.2 Test first, then build: `day-view › The player chooses where to be › Letting the Story choose` and `› Following someone` on the phone (the OR choices and their pickers send the choice), shared checks on the JVM and the device
- [x] 5.3 Test first, then build: `day-view › The Gap is the player's, and everything in it goes on without them › Filling the Gap` on the phone, built to `docs/design/Gap.dc.html` (the span, GOES ON WITHOUT YOU, what he did, the blank line, Back and Go), shared check on the JVM and the device
- [x] 5.4 Render with `-PfantasiaPreviews` and compare with `DayView.dc.html` and `Gap.dc.html`; fix what differs

## 6. On Claude

- [x] 6.1 Happenings on Claude, three runs: at most four, the summons expected, the pick first, and a judge finds each one something that could happen at that time and place with those people
- [x] 6.2 `day-view › Missing something has consequences › McGonagall answers the absence`, judged, three runs: he skips her summons, then meets her, and the real Reply shows she knows he did not come

## 7. Together

- [ ] 7.1 On the phone: at a Night Train Day View, read What's on today, choose with a Gap, write what he did, and see the next Scene open on it; verify the wait (from `fantasia trace`) and compare with the drawings
- [x] 7.2 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, and `openspec validate --all --strict`, and verify all pass
