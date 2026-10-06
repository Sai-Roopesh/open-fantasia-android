# Proposal

## Why

A typo in a Reply, a Move the player wishes they had worded differently, a line that took the Scene somewhere
they did not want: today the only way out is Redo or a new Path, and nothing lets the player fix the words
themselves. The `scenes` spec already promises Edit, in place for the latest Move or Reply and on a new Path for
anything earlier, and the drawings show it on the latest Reply and in the long-press menu; neither is built. The
latest Reply's actions also still lack Try another way, which Paths made possible, and a Move cannot be held at
all. The "Editing an earlier Move" scenario carries a stray line from the Story File's import check.

## What Changes

- The latest Reply shows Copy, Redo, Edit and Try another way without a menu, as drawn in
  `docs/design/Scene.dc.html`. Holding an earlier Reply or any Move opens Copy, Rewind to here, Try another way from
  here and Edit, with the drawing's line under the menu (`docs/design/LongPress.dc.html`).
- Edit opens a sheet in the Redo sheet's style with the words to change. The latest Move or Reply changes in place:
  same Path, what came after it kept as it was. Anything earlier carries the Story on from the edit on a new Path,
  and an edited Move gets its Reply; the Path the player was on stays as it was.
- On a Move, Rewind to here and Try another way from here act on the moment before the Move.
- The Mac does the edit, refused while a Reply is being written, and the same edit is a Mac command,
  `fantasia edit`. An edit made through the command reaches a phone that is watching, as the app's own does.
- A phone's stream says the head it is showing, so a phone whose Scene was edited or rewound under it reads the
  Scene again instead of applying the wrong entries. **BREAKING** for the contract: version 10.
- The stray line in "Editing an earlier Move" is removed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scenes`: Editing (the stray line removed; a scenario for the latest Move); The latest Reply has its actions in
  view (a scenario for holding a Move).
- `stories`: Claude can edit a Story as the player can (a scenario for an edit through the Mac's command reaching
  the phone).

## Impact

- `protocol/schemas/link.schema.json`, `contract.json`: `EditRequest`, `path_changed` covering edits; version 10;
  both generated sides.
- Host: a new `src/engine/editing.ts` (in place by writing the edited entry beside the old and copying what came
  after onto it, records included; earlier by a new Path), `src/engine/paths.ts` (a Move's moment before it;
  Paths begun by an edit), `src/engine/engine.ts` (the command, the stream's head, noticing heads moved by another
  process), `src/link/server.ts`, `src/cli/main.ts` and `commands.ts` (`fantasia edit`), `src/views/paths.ts`.
- Android: the latest Reply's action row, a held Move, Edit in the menu with its line, an Edit sheet, the stream's
  head, `FantasiaModel.kt`.
- Tests: host engine, link, CLI and two-process tests; Android shared checks on the JVM and the device; previews
  compared with `Scene.dc.html`, `LongPress.dc.html` and `Redo.dc.html`.
