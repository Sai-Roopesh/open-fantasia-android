# Proposal

## Why

On the phone, choosing where to be at the Day View left the player looking at a greyed Day View for 35 seconds,
under a hint that was wrong for it ("Your Move sends once the Reply is done"), while the Mac wove the Gap and the
Writer opened the next Scene. Nothing said the choice had been taken. The same play also showed that a choice the
Mac cannot take throws away the Gap the player wrote, and that the Gap sheet's span reads "9:05 am – Friday 6:00 pm,
before This evening" where the drawing reads like a sentence.

## What Changes

- A Move at the Day View, a choice or the player's own, opens the next Scene at once: the Move shows straight away,
  the Gap first, under a plain card that says when the Scene is, when the choice set a time, and one line saying the
  Scene is being written. The card takes the Scene's title, place and Portraits when the Writer has opened it.
- The Mac says so: the Scene view and the Move's live event carry the next Scene while it is being written, so a phone
  that reconnects mid-wait shows the same thing (docs/adr/0001). **BREAKING** for the contract: version 8, the phone
  and the Mac are installed together.
- A choice the Mac cannot take keeps the Gap sheet open with what the player wrote, and says why.
- The Gap sheet's span reads like the drawing: "9:05 am – 6:00 pm, before this evening". A Skip's time leaves out the
  day when it falls on the Day View's day, and each Skip says how its label reads inside a sentence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `presence`: Between Scenes is quiet, and shows progress: the next Scene opening after a choice is one of the
  things in progress, shown on the Scene itself.
- `day-view`: The Gap is the player's: a choice that fails keeps what the player wrote in the Gap.

## Impact

- `protocol/schemas/link.schema.json` and `contract.json`: `NextScene`, `SceneView.opening`, `StoryEvent.opening`,
  `Skip.in_sentence`, and the Skip's `time` rule; version 8; both generated sides.
- Host: `src/views/scene.ts` (the opening while a Move at the Day View is answered), `src/engine/engine.ts` (the
  Move's event), `src/views/scene.ts` `dayView` skips.
- Android: `StoryEvents.kt` (a Move at the Day View opens the Scene), `SceneScreen.kt` (the card and its line),
  `DayViewChoices.kt` (the Gap sheet stays until the Mac takes the choice; the span), `FantasiaModel.kt`.
- Tests: host view and link tests, Android shared checks on the JVM and the device, previews compared with
  `Scene.dc.html` and `Gap.dc.html`.
