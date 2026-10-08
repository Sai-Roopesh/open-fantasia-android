# Proposal

## Why

A player who comes back to a Story after a day away lands mid-Scene with nothing to say what was going on. The living
spec already asks for a dismissible "Previously" card (stories: Back after a night away), and docs/design draws it
(`SceneReturn.dc.html`), but it was left out of chronicler-and-moments, the change the design assigns it to. Its tests
today prove only that the Story reopens at its latest Reply, and say the card "is outside this change's scope".

The card is built from what the **Chronicler** has already written, so opening a Story never waits on a model. But
the Chronicler writes a summary only when a Scene ends, and a player mid-Scene left one that has not ended.

## What Changes

- When the **Chronicler** records a Scene that is still going on, it also writes where the Scene stands so far, in
  one or two lines, beside the Moments it records. A Scene that has ended keeps its one-line summary, as now.
- The Chronicler also records an open Scene once the player has stepped away from it: an hour after its latest Reply,
  with nothing written since. One background call per break, never during play. `fantasia serve` catches up on any
  that came due while it was not running.
- When the player opens a Story they last played more than a day ago, the Scene view carries a Previously card: what
  the Story's records say about where it stands (the Scene so far, or the Scene that just closed when the Story is at
  its **Day View**), and how long ago they last played.
- The phone shows the card as drawn in `SceneReturn.dc.html`: "PREVIOUSLY · 30 HOURS AGO", the summary in the
  Story's own type, and a Dismiss button. It sits just above the latest Reply mid-Scene, and at the top of the Day
  View. Dismissed, it stays gone until the player has been away again.
- The contract goes to version 5 for the card.

Not in this change: the one line between Scenes (`MovingOn.dc.html`), which says the Scene is being recorded and the
World is moving on until the Day View is ready, and so comes with the Weaver; the Scene header's World, Journal, Paths
and Backstage buttons, and the Edit and Try another way actions the drawing shows, which come with those screens.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `stories`: Opening a Story returns exactly where the player left. The requirement says what the card shows
  mid-Scene and at a Day View, and that a dismissed card stays dismissed; it gains scenarios for coming back within a
  day, coming back to a Day View, and dismissing the card.

## Impact

- host: the Chronicler's answer, check and prompt (a so-far line for an open Scene); when a Chronicle is due (the
  player stepped away); the `chronicle` entry gains the so-far line; the Scene view gains the card.
- protocol: contract version 5, `SceneView.previously`.
- android: the Previously card on the Scene screen and the Day View, its dismissal kept on the phone, built to
  `docs/design/SceneReturn.dc.html`.
- One more Sonnet call per break of an hour or more in a Story; none during play.
