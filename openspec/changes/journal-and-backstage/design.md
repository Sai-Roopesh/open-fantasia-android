# Design

## Context

See proposal.md for why. The Scene view already lists earlier Scenes with the Chronicler's summaries, and
`/stories/:id/scenes/:n` returns a past Scene in full. Meanwhile items live on `world_moved` records beside the Path
(docs/adr/0007); `worldOn` gathers Lives, Threads and what happened along a head. The State holds the current
Scene's Beat Note (beats with their status, the call, the purpose, the exit) and Taste, at most ten lines, which only
grows today (from a Redo's "remember this").

## Goals / Non-Goals

**Goals:**
- The Mac lays out both screens; the phone draws rows (docs/adr/0001). Both follow the current Path.
- Nothing from Backstage reaches the Scene, the Day View or the Journal: the Journal is built only from what the
  Player Character saw and heard.
- Built as drawn in `Journal.dc.html` and `Backstage.dc.html`.

**Non-Goals:**
- The Director's section (with the Director); the World screen; editing a line of Taste's words (deleting only, as
  drawn and as the scenario asks).

## Decisions

**1. The Journal (host, protocol).** `GET /stories/:id/journal` answers days in order, each a list of rows: a Scene
(number, time, place, title, summary, and whether it is the Scene the player is in, which reads "now") or a Meanwhile
item (how: seen, told, rumour, and its text), in the order they happened on the Path: a Scene's row, then the
Meanwhile of the World that moved on after it. Tapping a Scene opens the existing past-Scene reader; the current Scene
closes the Journal.

**2. Backstage (host, protocol).** `GET /stories/:id/backstage` answers: off-screen, what happened grouped by day with
its time, newest day first and no more than the last seven days, each item with who knows it; the Threads with where
each stands now; every Life (who, where, doing); the Writer's plan for the current Scene when one is open (call,
purpose, beats with done, in play or pending, exit); and Taste. It is read only when the screen is opened.

**3. Taste is the Path's (host).** Deleting a lesson writes a `taste_set` entry after the head with the lines that
remain, which the reducer takes as the new Taste, so the lesson is gone from that moment on that Path only, and the
Writer and the Actor stop reading it at their next call. `POST /stories/:id/taste/remove` with `{ line, after }`,
refused mid-Reply or stale; it emits `path_changed` so phones read again.

**4. The phone (android).** The header's words become Journal, Paths and Backstage, with the Story's title giving way
first. Each screen is a model state like Paths, with its back arrow. Backstage uses its own darker ground
(`#100E13`) as drawn; Taste lines have a ✕ that deletes after the Mac accepts.

**5. Contract version 11.**

## Risks / Trade-offs

- [A long Story makes Backstage long] → Off-screen keeps the last seven days; Threads and Lives are short by nature.
- [Three words crowd the header] → The title ellipsizes; the previews are compared at 390 dp and the words tightened
  if the title disappears.
