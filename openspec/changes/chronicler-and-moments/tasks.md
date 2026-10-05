# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Requirements this change builds:
- `living-world`: Only the player makes facts about the Player Character (added here, both scenarios); Moments are
  remembered from one record (Draconia remembers the station); Characters know only what they could know (Hermione
  does not know about the egg).
- `scenes`: Every Scene opens with a title card (Scrolling back); The Reply never writes the Player Character
  (Hermione asks a question, as a real-model gate).

## 1. The Chronicler

- [x] 1.1 Write `host/src/agents/CHRONICLER.md`: record what happened, invent nothing; Moments in the words used; the Player Character's facts only from his Moves; weights; telling; the summary; and verify by reading it against design.md
- [x] 1.2 Write the Chronicler's schema and its check (quotes word for word, a Reply's line deciding for the Player Character refused, `what` about him only with a Move quoted, names, `told`, the summary exactly when the Scene has ended) with one repair, and verify unit tests: a good answer passes, each broken rule is named, and a repaired answer is taken
- [x] 1.3 Add the Chronicler's model to `models.json` and `fantasia models`, Claude Sonnet 5.5 by default, and verify the CLI test

## 2. Chronicles beside the Path

- [x] 2.1 Add the `chronicle` entry, written as a child of the last entry it covers (docs/adr/0007), and look up the Chronicles on a Path; verify store tests that a Path sees the Chronicles whose parent is on it, a new Path from an earlier entry inherits those before it, and walking a Path never meets one
- [x] 2.2 Test first, then build: a Redo of a Reply a Chronicle covered takes that Chronicle off the Path, and the Scene is chronicled again from the last Chronicle still on it

## 3. When the Chronicler runs

- [x] 3.1 Test first, then build: a Scene that ends (closed by the Story, by End scene, or left by a Move) is chronicled to its end with its summary, in the background, while the next Move is accepted
- [x] 3.2 Test first, then build: an open Scene is chronicled every twelve exchanges, with no summary
- [x] 3.3 Test first, then build: a failed run is kept with its reason and runs again the next time it is due; `fantasia serve` queues what is due when it starts

## 4. Recall

- [x] 4.1 Test first, then build: `living-world › Moments are remembered from one record › Draconia remembers the station` (the station's quotes in the Actor's prompt in a later Scene with Draconia)
- [x] 4.2 Test first, then build: `living-world › Characters know only what they could know › Hermione does not know about the egg` (a Moment known only to Hagrid, Ron and Harry never reaches a Scene with only Hermione; told to her, it does)
- [x] 4.3 Test first, then build: `living-world › Only the player makes facts about the Player Character › An invented past is not remembered` (the Reply's line is refused as a Moment and never reaches a later prompt)
- [x] 4.4 Test first, then build: `living-world › Only the player makes facts about the Player Character › What the player wrote is remembered` (the Move's words reach Meera's later Scene)
- [x] 4.5 Recall caps and ranks: at most five Moments, from earlier Scenes, ranked by weight, the people present who know them and recency, shown oldest first; the end of the last Scene and the summaries of the last day's Scenes for the Writer only; the Writer reads `what` and the quotes, the Actor only the quotes; verify unit tests

## 5. The link, the phone and the Mac

- [ ] 5.1 Extend the contract to version 4: earlier Scenes' summaries, and an earlier Scene in full; regenerate both sides
- [ ] 5.2 Test first, then build: `scenes › Every Scene opens with a title card › Scrolling back` on the host (summaries in the Scene view; an earlier Scene in full on the current Path)
- [ ] 5.3 Test first, then build: `scenes › Every Scene opens with a title card › Scrolling back` on the phone, built to `Scene.dc.html` and `Journal.dc.html` in docs/design (a tap on Scene 13’s summary shows Scene 13 in full)
- [x] 5.4 Add `fantasia moments <story>`, and verify a CLI test

## 6. Real models (opt-in)

- [ ] 6.1 The Chronicler on Claude, three runs: its quotes are word for word, it records the inkwell and the troll as Moments shared with Hermione, and it never records Hermione's invented "you told me at breakfast you hate flying" as something Roopesh said
- [ ] 6.2 `scenes › The Reply never writes the Player Character › Hermione asks a question` as a gate: the real Chronicler records an earlier Scene, then the real Writer and Actor answer the kiss; judged, three runs out of three
- [ ] 6.3 `living-world › Moments are remembered from one record › Draconia remembers the station` and `living-world › Characters know only what they could know › Hermione does not know about the egg`, judged, three runs each

## 7. Together

- [ ] 7.1 On the phone, play the Night Train across two Scenes, then read `fantasia moments`; verify the first Scene's summary shows on the phone and opens in full, a later Reply draws on a Moment in its own words, and the Chronicler never delays a Reply (from `fantasia trace`)
- [ ] 7.2 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, and `openspec validate --all --strict`, and verify all pass
