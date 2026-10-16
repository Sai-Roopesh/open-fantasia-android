# Design

## Context

The Writer answers every Move with a call: `continue`, `land` or `end`. On `end` the Actor writes the Reply as the
Scene's close, and the engine appends `scene_closed` by "story" after the Reply, which runs the Scene's end and opens the
Day View. The Day View tells the phone `closed_by` so it can offer Redo on that closing Reply. A Move that leaves the
Scene (`leaves_scene`, which also closes a long Scene that has become another) closes it by "move" and goes straight
into the next Scene; the player's End scene closes it by "player".

## Decisions

1. **The Writer's calls are `continue` and `land`.** `end` leaves the format, WRITER.md and the Actor's call lines.
   Landing still brings the Scene's purpose to its turn; the Scene stays open, and the Writer's frame `exit` stays as
   what landing looks like.
2. **Nothing but a Move or the player closes a Scene.** The engine's turn never appends `scene_closed` after a Reply.
   `SceneClosed.by` is "player" or "move"; so is the State's `scene.closed`.
3. **`closed_by` leaves the Day View (contract 24).** The player always ended the Scene the Day View follows, so the
   phone's Redo at the Day View (only for a Story-closed Scene) goes, with the `ClosedBy` type.
4. **No backwards compatibility.** Old entries closed by "story" still read as closed; nothing distinguishes them.

## Risks

- A Scene the Writer has landed may keep going while the player has nothing more to do in it; the composer and End
  scene are always there, and a stalled Scene is already pushed toward its turn.
