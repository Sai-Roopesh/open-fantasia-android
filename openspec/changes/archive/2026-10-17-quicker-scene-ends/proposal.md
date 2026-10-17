# Proposal

## Why

A Scene's end takes fifteen to twenty minutes: the Chronicler thinks for minutes on an older model, the Director
rewrites the whole Outline twice (a focused pass that only concludes the Scene turned the Story, then a deep one), and
every step waits for the one before. Lingering is interrupted when a Move leaves the Scene, and one accidental tap on
End scene closes the Scene with nothing to undo it.

## What Changes

- The Director's focused revision says first whether the Scene turned the Story, and otherwise writes only what the
  Scene changed in the Outline (turns done, new or changed turns, relationships, movers, Lives, setups); the rest stays
  as it was. A deep re-plan runs only when the Scene turned the Story, an Act ended, or the player steered, and rewrites
  only the Acts it changes; the first Outline is still written whole.
- After the Chronicler, the Director's step and the Weaver run side by side when no new Stretch is due; the Weaver lives
  out the World against the Outline as it stood. When the Director plans the next Stretch, the World follows it, as now.
- The Chronicler's default becomes Opus 5.5 at medium effort, and the player's Mac is moved to it.
- While Linger is on, nothing ends or leaves the Scene but the player's End scene: a Move that goes somewhere or skips
  ahead goes on in the same Scene, and a long Scene is not closed as another.
- End scene asks the player to confirm before the Scene closes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scenes`: Linger holds the moment until the player ends the Scene; End scene asks first; a long Scene is not closed
  while Linger is on.
- `presence`: Between Scenes, the World moving on and the Outline being reconsidered happen side by side.

## Impact

- Host: the Director's Outline format, check, instructions and fake answers; the engine's Scene end (Director and Weaver
  side by side); the Writer's check and task under Linger; the Chronicler's default model; tests.
- Android: End scene's confirmation; its drawing first; UI checks.
- The player's models.json: the Chronicler on Opus 5.5, medium.
