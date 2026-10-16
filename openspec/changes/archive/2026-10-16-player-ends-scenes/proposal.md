# Proposal

## Why

The Story closes a Scene on its own when the Writer decides its purpose has turned: the Reply lands, and the player is
dropped into the Day View when they were not done. The player wants the Scene to stay open until they end it.

## What Changes

- The Writer no longer calls a Scene's end: its calls are continue and land. Landing still brings the Scene's purpose
  to its turn, but the Scene stays open.
- The Actor no longer writes a closing Reply, and the engine never closes a Scene "by the Story".
- A Scene ends only when a Move leaves it (it goes somewhere else, skips ahead, or the long Scene has become another,
  as now, straight into the next Scene with no Day View), or when the player taps End scene, which opens the Day View.
- **BREAKING** (contract 24): the Day View no longer says who closed the last Scene (`closed_by`); the player always
  did. The phone drops the Redo it offered on a Reply that closed the Scene, and the Writer's `end` call leaves the
  contract.
- No backwards compatibility: Scenes the Story closed before this change stay closed as they were.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scenes`: "A Scene ends in one of three ways" becomes "A Scene ends when a Move leaves it or the player ends it": the
  Story no longer closes a Scene.

## Impact

- Host: the Writer's format and instructions (WRITER.md), the Actor's call lines, the engine's turn (no story close),
  the Story's types (SceneCall, SceneClosed), the Day View, the fake models, and the tests that closed Scenes by the
  Writer's call.
- Protocol: contract 24; `closed_by` leaves the Day View, `end` leaves SceneCall.
- Android: the Day View's Redo on a Story-closed Scene, and the fakes and fixtures that carry `closed_by`.
- Docs: CONTEXT.md (Scene, Day View) and the day-view spec's purpose.
