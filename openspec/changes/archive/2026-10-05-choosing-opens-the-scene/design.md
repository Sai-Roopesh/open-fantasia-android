# Design

## Context

See proposal.md for why. Today a Move at the Day View (a choice through `POST /stories/:id/choose`, or the player's
own through `/moves`) is written at once, but the Scene it opens exists only when the Writer has answered:
`scene_opened` comes after the Gap's `world_moved` record and the Writer's call, about 35 seconds on the phone. Until
then the Mac's State still has the closed Scene, so `sceneView` sends `day_view`, and the phone draws the Day View with
the composer's waiting hint. The phone applies live events to the Mac's view and never works the State out itself
(docs/adr/0001): a `move` event at the Day View only lengthens the closed Scene's exchanges.

The Gap sheet (`DayViewChoices.kt`) closes on tap and keeps its text in its own Compose state, so a refused choice
loses it. Its span is built on the phone from `day.time` and the choice's `time`; a Skip's `time` always carries the
day ("Friday 6:00 pm"), and its label is used as given ("This evening").

## Goals / Non-Goals

**Goals:**
- The Mac says when a Scene is opening, in the view and in the Move's event, so a reload or a reconnect mid-wait
  shows the same screen.
- The phone builds the opening card in the style of the Scene card in `docs/design/Scene.dc.html`, with the content
  the player chose: NEXT SCENE, the time when there is one, and "Scene being written".
- The Gap sheet in `docs/design/Gap.dc.html` keeps the player's words until the Mac takes the choice.

**Non-Goals:**
- Making the Gap's weave or the Writer faster. The wait stays; it is shown truthfully.
- Changing what the Writer decides about the next Scene, or numbering it before it opens.

## Decisions

**1. The Mac derives the opening from the Path (host, protocol).** While the head's State has a closed Scene and the
Path after the `scene_closed` entry holds a Move, that Move is opening the next Scene. `sceneView` then sends
`opening: NextScene` (`at` and `at_label` from the Move's `choice.at` when it set one, otherwise null), `day_view: null`,
`exchanges` from the Move on, and the closed Scene among `earlier_scenes` with its summary. `scene` stays the closed
Scene's card, as the contract requires one; the phone draws the opening card in its place. Nothing new is stored: the
opening is read from entries that exist (docs/adr/0003). The alternative, the phone switching on its own when its
choice is accepted, breaks on a reconnect and puts State on the phone (docs/adr/0001).

**2. The Move's event carries the opening (host, protocol).** `entryEvent` for a Move whose parent's State has a closed
Scene adds `opening`. The phone's projection (`StoryEvents.kt`) applies it as the view would read: `day_view` null,
`opening` set, `exchanges` just that Move. `scene_opened` already makes the phone reload the view from the Mac, which
clears `opening` and brings the new card; no change there. A Retry after a failed turn keeps the Move, so the opening
stays until the Scene opens.

**3. "Scene being written" is the opening card's line (android).** While `opening` is set the card says it and the
usual Reply line does not show; the composer, Linger and End scene are disabled as they are while a Reply is written.
A turn that fails while opening shows the failure and Retry under the Move as any failed Reply does
(`docs/design/SceneFailed.dc.html`); the card stays.

**4. The Gap sheet closes when the Mac takes the choice (android).** The sheet's text moves out of the sheet into the
model's pending choice, beside the composer's draft. Go sends it with the sheet still open and its buttons disabled;
acceptance closes the sheet and clears the text; a refusal or a lost connection leaves it open with the text and the
reason in the sheet. The alternative, reopening a fresh sheet with the text restored, flickers and loses scroll.

**5. Skips say how they read (host, protocol).** A Skip's `time` follows the Happening rule for the Day View's own day:
"6:00 pm" when it falls on that day, "Saturday 7:30 am" otherwise. A new `in_sentence` gives the label as it reads mid-
sentence ("this evening", "tomorrow", "the weekend", a Landmark's name as named), the same words the chosen Move uses
("I let the time pass until this evening"), now worded once on the Mac. The phone's span becomes
"9:05 am – 6:00 pm, before this evening" with no wording of its own.

**6. Contract version 8.** `NextScene`, `SceneView.opening` (required, nullable), `StoryEvent.opening`,
`Skip.in_sentence` (required). Both sides are generated, and the phone and the Mac are installed together.

## Risks / Trade-offs

- [The Writer answers a Move at the Day View without opening a Scene] → The Writer's check already refuses an answer
  with no frame after a closed Scene; the opening ends only with `scene_opened`, so a refused answer fails the turn
  with Retry rather than leaving a card that never fills.
- [An older phone meets a version 8 Mac] → The existing contract check refuses it with the update message.
- [A Skip time without its day is misread in the Skip sheet] → Only the Day View's own day drops it, where the label
  ("This evening") already says the day.

## Migration Plan

Nothing stored changes. Regenerate the contract, build and install the phone with the Mac restarted on the same
commit. Rolling back is reinstalling the version 7 pair.
