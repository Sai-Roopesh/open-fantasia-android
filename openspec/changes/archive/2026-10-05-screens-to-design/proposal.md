# Proposal

## Why

The phone was built from the specs alone, with no design, so it works but looks nothing like what the player expects
to play in: plain blocks of text, controls scattered over two rows, a Day View that is one small card. The screens
are now drawn and approved (docs/design, 5 October 2026). This change builds the screens that exist today as drawn,
before the Chronicler adds more to them.

## What Changes

- The phone takes the approved look: the palette, Literata for the Story's words and Manrope for the rest, the shapes.
- Home (`Main.dc.html`): every Story with where it stands and a line of detail ("Friday 9:40 pm · with Hermione",
  "3 Scenes played"), how long ago it was played, and the Mac's name and whether it is reachable. A Story waiting at
  its Day View says so ("Sunday 7:40 am · choosing where to go"), as `stories: Home shows where every Story stands`
  asks.
- Pairing (`Pair.dc.html`).
- The Scene (`Scene.dc.html`): a header with the Story's name; earlier Scenes folded to one line; the title card
  with Portraits, Focus marked on one; each Reply as one passage of prose and each Move as a bubble with the Player
  Character's name; Copy and Redo under the latest Reply; Linger and End scene as chips above the composer, which
  asks "What does Roopesh do?".
- A Reply arriving (`SceneWriting.dc.html`): "Reply being written", the words with a caret, the header showing the
  Scene and the time, and the composer open to type while Send waits for the Reply (`presence: The player can always
  write`).
- A Reply that failed (`SceneFailed.dc.html`): the reason, Retry and the trace, in the Scene where it failed.
- Redo (`Redo.dc.html`) as a sheet: the Direction, and Remember this, which waits for a Direction.
- The Day View, first form (`DayView.dc.html`): the day large, the time and place, countdown tiles, and the composer
  for the next Move.

Not in this change: anything the drawn screens show that is not built yet (World, Journal, Paths, Backstage and
Models; Edit and Try another way; another model on Redo or a failure; Meanwhile, Happenings and the Gap; the
Previously card). Each arrives with its own change, built to its drawn screen.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: this change builds the drawn screens for requirements as they are specified. `.openspec.yaml` sets
`skip_specs`.

## Impact

- protocol: contract 3. A Story's summary gains its detail line; the Day View gains the day and the time apart, and
  each countdown gives how long to go apart from the Landmark's name.
- host: the home screen's standing and detail lines; the Day View's new fields.
- android: the theme and every screen listed above.
