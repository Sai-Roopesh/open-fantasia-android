# Design

## Context

See proposal.md for why. What exists after the-weaver:

- The Weaver runs at each Scene end, records the World off the Path (`world_moved`), and the Day View waits for it;
  the Day View opens when the Player Character is next free to choose (7:30 after a late Scene).
- A Move from the Day View goes to the Writer, which frames the next Scene (`opening === "day_view"`).
- The Actor reads Moments known to someone present (recall); off-screen happenings reach only the Writer.
- `DayView.dc.html` draws What's on today (the Story's pick first, with a "The Story's pick" label and a "You're
  expected" pill), the OR choices, and the composer; `Gap.dc.html` draws the Gap sheet.

## Goals / Non-Goals

**Goals:**
- A choice is a Move in the player's words, so everything downstream (the Writer, the Chronicler, the phone's
  bubbles) reads it as it reads any Move.
- What he misses is settled before the next Scene, so the people he meets already know.

**Non-Goals:**
- The Director's long-run pick (the Story's pick here is the Weaver's, by what matters now).
- Free-form destinations beyond the Story's places (the composer is for those).

## Decisions

### Happenings are the Weaver's (host, docs/adr/0004)

The Weaver's answer gains `happenings`: at most four, each `{ id, at, place, what, who, expected, pick }`, from the
span's end on (today and, late in the day, tomorrow morning). Code checks: at most four; every `at` at or after the
Day View's time; names are the Story's, and never the Player Character's; at most one pick, the first, when there are
any; a summons he knows of is `expected`. After two Scenes in a row without a Lead (worked out from the Scenes' people
on the Path), the pick must have a Lead in it: an answer that offers none, or picks another, is refused with the
reason. The record keeps them; the Day View shows the latest record's Happenings that are still ahead.

Alternative: Happenings from the Writer. Rejected: one writer per part of the State, and the Weaver already knows
everyone's Life.

### A choice is a Move the engine writes (host, protocol)

`POST /stories/{id}/choose` takes `{ after, go | follow | somewhere | skip | story, gap }` and answers as a Move does.
The engine writes one `move` entry in the player's voice, the Gap first when he wrote one, then the choice:
"I spent the morning in the library reading about life debts. I go to the hospital wing for 11:00." Left blank, the
Gap is the rule's own words: "I spend the time until then quietly in Gryffindor Tower." The entry also keeps the
choice itself (`choice: { kind, happening, who, place, at }`), which only the Writer reads.

The options come with the Day View: the Happenings; people to follow (the Leads and whoever was in the Scene that
ended, with their Lives); the Story's places; and Skip to later's times (this evening at 6:00 pm, tomorrow at
7:30 am, the weekend's first morning when the Story knows weekdays, and the next Landmark).

Alternative: a separate `choice` entry beside the Move. Rejected: two entries for one act, and every reader of Moves
would have to read both.

### The Writer opens the Scene the choice asked for (host)

For a Move with a choice, the Writer's task says what was chosen, and code checks the frame against it: Go and Let
the Story choose open at the Happening's time with its people in `comes_in`; Follow opens with that person in
`comes_in`, where their Life has them going; Go somewhere opens at that place; Skip opens at that time. A frame that
does not is refused with the reason, as any rule is.

### The Gap is woven before the Scene opens (host)

A choice later than the Day View's time has a Gap. Before the Writer runs, the engine runs the Weaver over it (from
the World's `until` to the chosen time), with the Move: the Happenings in the Gap go on without him, and for each one
he was expected at, code requires something that happened in which the people involved noticed his absence (known to
them). The record hangs off the Move. The turn waits for it, and the phone shows the Reply being written as for any
turn; a failed Gap Weaver fails the turn with its reason and Retry.

Alternative: weave the Gap lazily at the next Scene end. Rejected: the next Scene could meet McGonagall before she
knew.

### People know what they lived through (host)

The Actor's `remembered` gains, beside the Moments, what happened off-screen in the last day of Story time that
someone present knows, each with who of them knows it: knowledge-filtered exactly as Moments are (docs/adr/0004).
The Writer already reads all of it.

### The phone (protocol, android)

Contract 7: `DayView.happenings` (each with `id`, `time`, `place`, `what`, `who`, `expected`, `pick`), `DayView.choices`
(`follow`: names, `places`, `skips`: `{ label, at, time }`), and `POST /stories/{id}/choose`. Built to
`DayView.dc.html`: WHAT'S ON TODAY under MEANWHILE, the pick's card with its accent border, "The Story's pick" and
the amber "You're expected" pill, each card's time · place, what in Literata, who, and Go; then OR with Follow
someone, Go somewhere, Skip to later and Let the Story choose (pickers as simple sheets in the app's style); then the
composer. A choice later than now opens the Gap sheet as `Gap.dc.html` draws it: the span ("7:40 am – 11:00 am,
before the hospital wing"), GOES ON WITHOUT YOU with what is in the Gap (expected ones marked), "What Roopesh did",
the blank-means-quietly line, Back, and the Go button named for the choice.

## Risks / Trade-offs

- [A choice with a Gap waits for two models before the Reply starts] → measured on the phone; the Gap Weaver is
  skipped when nothing in the Gap is happening and the Gap is under an hour.
- [The Weaver offers dull Happenings] → WEAVER.md: what matters now, the people he cares about, the Leads; a
  real-model judge reads them.
- [Lead leaning by rule can force an odd pick] → only after two Scenes without one, as the spec asks.

## Migration Plan

Contract 7 is breaking: the Mac and the phone update together. Records written before have no Happenings: their Day
View offers none until the next Scene end.
