# Proposal

## Why

The Story is already a tree of immutable entries with Paths as pointers (docs/adr/0003), but the player has no way to
use it: nothing on the phone goes back, tries something else or starts again, and the `paths` spec's five
requirements have no tests. A roleplay the player cannot take back or branch makes every Move feel final; Paths are
what let them play boldly.

## What Changes

- Long-pressing any Reply, in the Scene or in an earlier Scene being read, opens its menu as drawn in
  `docs/design/LongPress.dc.html`: Copy, Rewind to here, Try another way from here. Edit stays hidden until Editing is
  built.
- Try another way starts a new Path at that Reply and puts the player on it; the Path they were on stays exactly as
  it was.
- Rewind takes the Path the player is on back to that Reply and sets what came after aside as a Path of its own.
- A Paths screen, as drawn in `docs/design/Paths.dc.html`: the Story as a tree, shared Scenes folded, every fork, a
  card per Path with the one the player is on marked; tapping a Path returns to its latest moment; Rename and Delete;
  Start again from the beginning; Clear Paths you never went back to. The Scene's header gains a Paths entry.
- Decided here: Clear removes only Paths that Rewind set aside and the player never opened; Delete asks once and is
  never offered for the Path the player is on; no Path changes while a Reply is being written.
- The Mac does the work and says when the Story's Path has changed, so every phone follows (docs/adr/0001).
  **BREAKING** for the contract: version 9, the phone and the Mac are installed together.
- The Mac's store gains what a Path card needs (how it began, where it forked, whether it was ever opened, whether
  the player named it), added to existing stores in place.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `paths`: Rewind sets aside, never destroys (what Clear removes); The Paths screen (Delete asks once, never for the
  Path the player is on); a new requirement that a Path changes only between Replies.

## Impact

- `protocol/schemas/link.schema.json`, `contract.json`: Paths screen view, Path requests, `path_changed` event, the
  stream's Path; version 9; both generated sides.
- Host: `src/store/db.ts` and `src/store/tree.ts` (Path columns, opening, renaming, deleting), a new
  `src/engine/paths.ts` (Try another way, Rewind, switching, starting again, clearing), `src/views/paths.ts` (the
  tree), `src/link/server.ts` (routes), `src/engine/engine.ts` (refusing mid-Reply, the event, the stream).
- Android: a long-press menu on Replies in `SceneScreen.kt` and `PastSceneScreen.kt`, a new `PathsScreen.kt`, the
  header entry, `FantasiaModel.kt` and the stream's reload on `path_changed`.
- Tests: host engine, view and link tests; Android shared checks on the JVM and the device; previews compared with
  `LongPress.dc.html` and `Paths.dc.html`.
