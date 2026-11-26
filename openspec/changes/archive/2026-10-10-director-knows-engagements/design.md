# Design

## Context

**How it works today:**
- **The Director's ask** (`engine/directing.ts` `directionDue`) carries the State, the World, the Scenes so far, the
  last plan and the Bonds. It carries no Engagements.
- **A planned Scene** (`PlannedScene`) has its own `at` and `place`, written by the model.
- **The Day View** already makes one card of a Weaver Happening and an Engagement at the same place within the hour.
  The card keeps the Engagement's mark and the Happening's pick and Scene (`play-check-fixes` decision 1).
- **The Weaver's pick** is the Stretch's next Scene that matters, at its time and place, and its check enforces that.
- **The phone's Gap sheet** lists the Day View's cards that fall in the Gap, in the Day View's order: the pick first.

## Goals / Non-Goals

**Goals:**
- One meeting for one arrangement, and the Story's pick built on it when it matters.
- The Gap sheet reads in time order.

**Non-Goals:**
- **The Director moving or calling off an Engagement.** Only a Scene's page does that, through the Chronicler (ADR
  0011).
- **Requiring a Scene for every Engagement.** Most stay ordinary offers.

## Decisions

**1. The Director is told his Engagements (host).** `directionDue` passes `engagementsOn(mac, closing, clock)`. The
prompt gains `<his_engagements>`, in the Writer's form: `E1 Saturday 10:00 am, the library: Draconia, about the train
and what she owes. With Draconia Malfoy; he is expected.` Weekly ones say they repeat.

**2. A Scene that matters can be an Engagement (host).** The schema's Scene gains `engagement`: a label (`E1`) or null.
The check, part by part:
- **A label shown, at a time in the Stretch:** the Scene takes the Engagement's next time and place from the record,
  and its people join the Scene's. The plan stores the Engagement's id on the Scene. Set right, not asked again (ADR
  0012).
- **A label not shown:** cleared, and the Scene keeps its own time and place.
- **A label for an Engagement outside the Stretch's days:** the Scene is left out and noted, like any Scene outside
  the Stretch.

The Weaver's pick follows the Scene's time and place, so the pick and the Engagement are one card on the Day View.
Choosing it opens the Scene that matters and keeps the Engagement.

*Rejected:* dropping a planned Scene at an Engagement's place near its time. That throws away the Director's work on
a guess. Labelling is explicit, and the record gives the time.

**3. DIRECTOR.md, "What he has arranged".** What `<his_engagements>` is. A Scene that matters about one of them is
that Engagement: set `engagement` to its label. Never plan a second meeting about the same thing beside it. If he
arranged it and it matters, it is the natural Scene.

**4. The Gap sheet in time order (android).** `GapSheet` sorts what goes on without him by story minute, the same
measure it already uses to pick them out.

**5. What he knows of someone is asked for shorter (host, CHRONICLER.md).** On the phone, the Chronicler was sent back
for a 62-word line where the limit is 60. That limit is a promise to the player (outside-the-scene: what he knows stays
at most 60 words), so it stays. The Chronicler is asked for forty-five words instead, as the summary is asked for thirty
and refused past forty-five. A line a little long then stays within the bound, and nothing is asked again (ADR 0012).

*Rejected:* refusing the line only past ninety words, as Bond lines are refused past half again. It would break the
World screen's 60-word promise.

## Risks / Trade-offs

- **[The Director still plans a second meeting.]** The prompt and the label make it unlikely. The live check measures
  it, and the Day View still offers both, so nothing is hidden.
- **[An Engagement he was only invited to.]** It can still be a Scene that matters. Its card is not marked expected,
  as before.

## Migration Plan

None. A plan stored before has no `engagement` on its Scenes, which reads as null.
