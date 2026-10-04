# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Requirements this change builds:
- `scenes`: A Move can contain anything (A time skip in a Move); A Scene ends in one of three ways (all three);
  Focus keeps a Scene close to one person (all three); Only what matters earns time (both); Linger holds the moment;
  Redo, with a Direction (A Direction that is not remembered, Remember this; Redo on another model waits for the
  other providers' runners).
- `day-view`: The Day View says where and when the player is (A countdown).
- `long-run`: Taste is short, readable and the player's (kept to ten lines; editing it arrives with editing).

## 1. The Writer

- [x] 1.1 Port the deciding-verbs check (`decidesForPlayer`) from the first Open Fantasia's host to `host/src/agents/deciding.ts`, and verify unit tests that "Ishaan tells her", "makes Ishaan cry" and "Ishaan goes quiet" are caught while "Ishaan is offered a seat" and "Meera tells him" pass
- [x] 1.2 Add JSON-schema answers to the model call (`ModelRequest.schema`, the Agent SDK's `outputFormat`, and scripted answers as JSON), and verify a scripted call returns a parsed answer and a real one (opt-in) returns one that matches its schema
- [x] 1.3 Write `host/src/agents/WRITER.md` from the first Open Fantasia's draft, adapted: the Writer sees the Move first; Focus and Linger instead of Pace; Arcs, the Premise and Taste instead of a chapter; `arc_moved`, `clock`, `leaves_scene` and `taste`; and verify by reading it against design.md
- [x] 1.4 Write the Writer's schema and its check (note length, beats, frame, `who`, `clock`, deciding for the Player Character) with one repair, and verify unit tests: a good answer passes, each broken rule is named, and a repaired answer is taken

## 2. Scenes in the tree

- [x] 2.1 Add entries `beat_note` (carrying any Taste line), `redo`, `scene_closed`, `focus_set` and `linger_set`, and a `scene_opened` that carries a frame and may start at a Move; verify reducer tests for each
- [x] 2.2 Read the counts from the Path (beat in play for, exchanges without an Arc moving), and verify they restart in a new Scene and are left out while Linger is on

## 3. The turn with the Writer

- [x] 3.1 Test first, then build: `scenes › A Move can contain anything, and what it says has happened › A time skip in a Move` (the Writer's clock is kept; a clock earlier than now is refused)
- [x] 3.2 Test first, then build: `scenes › A Scene ends in one of three ways › Walking out of a Scene` (the Writer leaves the Scene; the Move opens the next one with a title card; no Day View)
- [x] 3.3 Test first, then build: `scenes › A Scene ends in one of three ways › The Story closes a Scene` (a call of `end`; the Day View after the Reply)
- [x] 3.4 Test first, then build: `scenes › A Scene ends in one of three ways › The player ends a Scene` (End scene after a Reply)
- [x] 3.5 Test first, then build: `scenes › Only what matters earns time › A stalled Scene moves on` (three exchanges with no Arc moving put it in the Writer's task) and the beat cap at four
- [x] 3.6 Test first, then build: `scenes › Linger holds the moment › Lingering with Hermione` (eight exchanges, nothing forced, the Scene still open)
- [x] 3.7 Test first, then build: a Writer that fails twice fails the turn with its reason, the Move stays the head, and Retry runs the Writer again

## 4. Focus, Linger and Redo

- [x] 4.1 Test first, then build: `scenes › Focus keeps a Scene close to one person › Focus starts and clears by itself`
- [x] 4.2 Test first, then build: `scenes › Focus keeps a Scene close to one person › A private moment stays private` and `› A Move brings someone in` (Focus reaches the Writer and the Actor's prompt; nobody new is framed in while it is on)
- [x] 4.3 Test first, then build: `scenes › Redo, with a Direction and another model if wanted › A Direction that is not remembered` (the Direction reaches the Writer, never the Actor or the Story; the new Reply replaces the old on the Path)
- [x] 4.4 Test first, then build: `scenes › Redo, with a Direction and another model if wanted › Remember this` and Taste kept to ten lines
- [x] 4.5 Add the Beat Note, the call, the time, Focus and Linger to the end of the Actor's prompt, and verify a unit test that the beats, purpose and exit never reach it

## 5. The link and the Day View

- [x] 5.1 Extend the contract: the Scene view's Focus, Linger and closing; the Day View; End scene, Focus, Linger and Redo requests; regenerate both sides
- [x] 5.2 Test first, then build: `day-view › The Day View says where and when the player is › A countdown`
- [x] 5.3 Serve End scene, Focus, Linger and Redo, each refused with a reason while a Reply is being written, and verify link tests
- [x] 5.4 Add `fantasia models` and `models.json`, with the Writer on Claude Sonnet 5.5 by default, and verify a test that a change reaches the next Writer call

## 6. The phone

- [ ] 6.1 Test first, then build: End scene on the Scene screen, and the Day View when the Scene has closed, taking the next Move
- [ ] 6.2 Test first, then build: Focus by tapping a Portrait on the title card, shown on the card, and Linger as a toggle beside End scene
- [ ] 6.3 Test first, then build: Redo on the latest Reply, with a Direction and "remember this"
- [ ] 6.4 Keep the end of the latest Reply in view while the keyboard is open, and verify a Compose UI test
- [ ] 6.5 Ask for the Story list once on opening the app, and verify a test that counts the requests

## 7. Real models (opt-in)

- [x] 7.1 `scenes › Only what matters earns time › Procedure does not take over`, judged by a second model, three runs out of three
- [x] 7.2 The Writer, three runs each: it leaves the Scene for "I go to my room; Harry, Ron and Neville are playing a board game"; it moves the clock at least an hour for "after an hour, I'm still sitting on her broom"; its notes never soften anyone (judged)

## 8. Together

- [ ] 8.1 On the phone, play a Scene of the Night Train Story until the Story closes it on its own, Redo one Reply with a Direction, end the next Scene with End scene, and open a third from the Day View; verify the time a Writer step adds before a Reply streams, from `fantasia trace`
- [ ] 8.2 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, and `openspec validate --all --strict`, and verify all pass
