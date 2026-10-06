# Design

## Context

See proposal.md for why. Entries are never changed (docs/adr/0003). Redo already replaces the latest Reply without
changing one: it writes the new Reply beside the old, carrying Focus and Linger, and moves the Path's head to it, so
the old Reply is left off every Path and no new Path appears. Background records (the Chronicler's, the World's)
hang off the entries they follow (docs/adr/0007). Path changes are pointer changes in `src/engine/paths.ts`, refused
while a Reply is being written, and announced with `path_changed`. The phone's stream sends the Path it shows; the
Mac sends `path_changed` first when that is no longer the current Path. The Mac's commands (`fantasia …`) open the
same SQLite store in their own process; the serving process is not told of what they write.

## Goals / Non-Goals

**Goals:**
- An edit never changes an entry, and an edit in place leaves the Story exactly as it was apart from the words.
- Every phone shows an edit, whether made in the app or through `fantasia edit`, without the player doing anything.
- The phone builds the latest Reply's row from `Scene.dc.html`, the held passage's menu and its line from
  `LongPress.dc.html`, and the Edit sheet in the style of `Redo.dc.html`.

**Non-Goals:**
- Editing the Story's setup (people, places, Groups, Leads, Arcs, Landmarks, Premise, Style, Taste, the time): that
  comes with the World and Person screens.
- Rewriting what came after an edit in place. An edited latest Move keeps its Reply; Redo is there to change it.

## Decisions

**1. An edit in place is a replay (host).** The latest Move or Reply (nothing but Focus, Linger and the Story closing
the Scene come after it) is edited by writing the edited entry beside the original, with the same parent, then
writing a copy of every entry that came after the original on the Path, in order, onto it, together with a copy of
every record that hung off them, and moving the head to the last copy. This is Redo's pattern carried through the
tail: the World and the Chronicler find their records where they expect them, so nothing is woven or chronicled
again, and the Path keeps its id and name. The alternative, an "edited" entry that every reader applies on top of
the original, would make every prompt, view and Moment quote remember to apply it.

**2. An earlier edit is a Path (host).** Anything earlier is edited by writing the edited entry beside the original
and starting a current Path at it, with origin `edited` and its card labelled "FROM SCENE 13 · EDITED". An edited
Move is waiting for its Reply, so the turn starts as for any Move. The Path the player was on is untouched.

**3. What can be edited.** A Move, a Reply, and a Scene's opening prose, which the player reads as a Reply. The text
must be non-empty and different. Refused with the reason while a Reply is being written, and for a stale `after`.
One request, `POST /stories/:id/edit` with `EditRequest { entry, text, after }`, answers `Accepted` with the new
head; both kinds emit `path_changed`, so every phone reads the Scene again.

**4. A Move's "here" is the moment before it (host).** Rewind to here and Try another way from here on a Move act on
the Move's parent: the entry the Move answered. The Mac resolves it, so the phone sends the Move's own id.

**5. The stream knows the head the phone shows (host, android).** A phone opens its stream with `?path=` and
`&head=`, the head of the Scene view it holds. When the Path differs, or that head is no longer on the current
Path (an edit in place replaced it, or a Rewind went back past it), the first event is `path_changed`. Comparing
heads alone would miss entries on a newly opened Path written before the phone's last event, so both are sent.

**6. Edits through the Mac's commands reach a watching phone (host).** `fantasia edit <story> <entry> <text>` runs
the same engine code in its own process, and for an earlier Move waits for the Reply before it exits. The serving
process notices: once a second it reads SQLite's `PRAGMA data_version`, which changes only when another connection
has written, and for every Story a phone is watching whose current head is not the one it last announced, emits
`path_changed`. This serves every later Mac command (the Director, setup edits) the same way.

**7. The phone (android).** The latest Reply's row gains Edit and Try another way beside Copy and Redo. A Move can
be held like a Reply, opening the same menu, which now ends with Edit; the menu has the drawing's line under it
("Editing an earlier Reply carries the Story on from the edit on a new Path. The Path you were on stays as it
was.", worded for a Move when a Move is held). Edit opens a sheet: the title ("Edit this Reply", "Edit this Move"),
the words in a field, a line saying whether it changes in place or starts a Path, and Cancel and Save, disabled
while a Reply is written. The earlier Scene reader offers the same.

**8. Contract version 10.** New: `EditRequest`; `path_changed` also covers an edit; the stream's `head` parameter.

## Risks / Trade-offs

- [A replayed tail duplicates entries] → Only the tail after the latest Move or Reply, a handful of entries; the
  originals stay as history no Path walks, like a redone Reply.
- [The serving process misses a change in the same second it announces its own] → It compares current heads with
  the last it announced per Story, not timestamps, so its own changes never trigger it and a missed tick is caught
  by the next.
- [A Mac command and the phone write at once] → The store refuses a stale head (`moveHead` from a known head), and
  the second writer is told the Story moved on, as two phones are today.
- [`fantasia edit` of an earlier Move runs a Reply from the command line] → It uses the Mac's job models and the
  same turn code; the command waits and prints the Reply or the reason it failed.

## Migration Plan

Nothing stored changes shape; `origin` gains the value `edited`. Regenerate the contract, build and install the
phone with the Mac restarted on the same commit. Rolling back is reinstalling the version 9 pair.
