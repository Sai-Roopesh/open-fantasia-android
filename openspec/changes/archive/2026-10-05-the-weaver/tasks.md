# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Requirements this change builds:
- `day-view`: The Day View opens when the Player Character is next free to choose (added here, both scenarios);
  Meanwhile shows only what the Player Character knows (Quirrell's night stays hidden; A rumour is marked as one).
- `living-world`: Everyone has a Life (A Group lives as one); Threads develop off-screen (The dragon egg moves without
  the player); The background reaches the player only through the Story (Discovering Quirrell); Off-screen time is
  resolved only as far as it reaches the player (Nothing written that no one will meet); Landmarks arrive on their
  date (The Triwizard comes anyway). Backstage is `fantasia world` until it exists.
- `presence`: Between Scenes is quiet, and shows progress (The World moves on).

## 1. When the Day View is

- [x] 1.1 Test first, then build: `day-view › The Day View opens when the Player Character is next free to choose › A Scene ends in the afternoon` and `› A late Scene ends` (the reducer keeps when the Scene ended and sets the clock to the next free moment; the Day View shows it; a Move from it is never before it); `STATE_SHAPE` goes up

## 2. The World

- [x] 2.1 Test first, then build: `story-file › A Story File sets up every part of a Story › A Story File with a Thread` (the Story File gains optional `threads`, `{ name, now }`; imported, the Story's World has each Thread where the Story File put it)
- [x] 2.2 Add the `world_moved` entry, a child of the Scene's last entry (docs/adr/0007), and work out the World beside the Path: Lives and Threads from the Story File, each replaced by the latest record that moved it, and what happened, oldest first; verify store and World tests (a new Path inherits the records before it; a Redo of a Scene's end takes its record off)

## 3. The Weaver

- [x] 3.1 Write `host/src/agents/WEAVER.md`: move the World on over a span; move only what will reach the player or change something they will meet; Lives, Groups as one, Threads from what people do, what happened and who knows it; Meanwhile only as he would learn it, seen, told or rumour, rumours may be wrong; Landmarks happen; the Style; and verify by reading it against design.md
- [x] 3.2 The Weaver's schema, prompt and check (names; no Life for the Player Character; members live through their Group; times in the span; every Landmark in the span happens; each Meanwhile item names something the Player Character knows, `told` by someone who knows it; at most six) with one repair; add the Weaver's model to `fantasia models`, Sonnet 5.5 by default; verify unit tests that a good answer passes, each broken rule is named, and a repaired answer is taken
- [x] 3.3 Test first, then build: `living-world › Landmarks arrive on their date › The Triwizard comes anyway` (an answer that leaves out a Landmark in its span is refused; the World shows it happened)
- [x] 3.4 Test first, then build: `living-world › Everyone has a Life › A Group lives as one` (an answer giving Crabbe a Life of his own is refused; the World shows one Life for Crabbe and Goyle)
- [x] 3.5 Test first, then build: `day-view › Meanwhile shows only what the Player Character knows › Quirrell's night stays hidden` (an answer putting Quirrell's night in Meanwhile is refused; recorded as hidden, the World shows it and Meanwhile does not)

## 4. When the Weaver runs

- [x] 4.1 Test first, then build: `presence › Between Scenes is quiet, and shows progress › The World moves on` on the host (ending a Scene shows the Day View moving on until the Weaver's record exists, then ready with Meanwhile; the Chronicler runs beside it)
- [x] 4.2 Test first, then build: a Scene the Story closes and a Scene a Move leaves are woven too (the second while the next Scene plays, up to its start); a failed Weaver leaves the Day View failed with its reason and trace, and Retry runs it again; `fantasia serve` reruns at start any Scene end without a record; verify engine and link tests
- [x] 4.3 `fantasia world <story>`: Lives, Threads, and what happened with who knows each; verify a CLI test

## 5. What the Writer and the Actor read

- [x] 5.1 Test first, then build: `living-world › The background reaches the player only through the Story › Discovering Quirrell` (something hidden reaches the Writer's prompt, and never Meanwhile or the Actor's prompt, until the Writer's note brings it into a Scene)
- [x] 5.2 The Writer reads every Life, every Thread and the last day of what happened with who knows it; the Actor reads each present person's own Life; verify prompt tests

## 6. The link and the phone

- [x] 6.1 Extend the contract to version 6 (`DayView.world`, `ended`, `meanwhile`, `failure`; events `world_moved` and `world_failed`; `POST /stories/{id}/world/retry`) and regenerate both sides; verify the contract tests
- [x] 6.2 Test first, then build: `presence › Between Scenes is quiet, and shows progress › The World moves on` on the phone, built to `docs/design/MovingOn.dc.html` (the Scene that ended, the day and time, the one line as a status, no composer; the Day View fills in when the World has moved), as a shared check on the JVM and the device
- [x] 6.3 Test first, then build: `day-view › Meanwhile shows only what the Player Character knows › A rumour is marked as one` on the phone, built to `docs/design/DayView.dc.html` (MEANWHILE with SEEN, TOLD and RUMOUR tags in their colours), shared check on the JVM and the device
- [x] 6.4 A failed Weaver on the phone: the reason, the trace and Retry where the Day View would be, as other failures are; verify a shared check
- [x] 6.5 Render with `-PfantasiaPreviews` and compare with `MovingOn.dc.html` and `DayView.dc.html`; fix what differs

## 7. On Claude

- [x] 7.1 `living-world › Threads develop off-screen › The dragon egg moves without the player`, judged, three runs: a week passes with the Player Character never near Hagrid, and the Thread is further along
- [x] 7.2 `living-world › Off-screen time is resolved only as far as it reaches the player › Nothing written that no one will meet`, three runs: the Hufflepuff Quidditch Group's Life is unchanged after a week that touches nothing of theirs
- [x] 7.3 `day-view › Meanwhile shows only what the Player Character knows › A rumour is marked as one` and `› Quirrell's night stays hidden`, judged, three runs each
- [x] 7.4 `living-world › Everyone has a Life › A Group lives as one`, three runs: one Life for Crabbe and Goyle, none for either alone

## 8. Together

- [x] 8.1 On the phone: play the Night Train to a Scene's end, watch the Day View move on and fill in, and read `fantasia world`; verify how long the player waits (from `fantasia trace`), that Meanwhile holds nothing Ishaan could not know, and compare with the drawings
- [x] 8.2 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, and `openspec validate --all --strict`, and verify all pass

## 9. Found on the phone

- [x] 9.1 Test first, then build: the Weaver is told when the Scene that ended ran, and that before it opened the player's character was off-screen and only the player says what he did (`WEAVER.md`, `scene_that_ended`)
- [x] 9.2 `living-world › Only the player makes facts about the Player Character › The World moves on around him`, three runs on Claude: the Barog stop at 9:05 am, nothing earlier known to Ishaan, nothing putting him back on the train
