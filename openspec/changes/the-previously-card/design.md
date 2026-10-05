# Design

## Context

See proposal.md for why. What exists:

- The **Chronicler** (host) runs in the background, one run at a time per Story, when a Scene ends and every twelve
  exchanges of an open one (`dueChronicle`). Each run appends a `chronicle` entry off the Path (docs/adr/0007) with
  `summary` set only when the Scene has ended; "has this Scene been summarised" is read as "has a Chronicle with a
  summary". `fantasia serve` queues what is due when it starts.
- The Scene view (host, `sceneView`) is built per request; earlier Scenes carry their summaries (contract 4).
- Every entry carries `createdAt`, from a clock the tree takes (tests pass their own).
- The phone opens a Story at its latest Reply and keeps the player's place; Home already says how long ago a Story was
  played (`playedAgo`). The screen to build is `docs/design/SceneReturn.dc.html`.

## Goals / Non-Goals

**Goals:**
- The card's words exist before the player comes back, so opening a Story never waits on a model.
- The card's words come from the one record the Chronicler keeps (docs/adr/0006), never from a second writer.

**Non-Goals:**
- `MovingOn.dc.html` and the Weaver; the Scene header's other screens; Edit and Try another way.
- Anything the card does beyond telling: it never changes the Story, and Story time stands still while the player is
  away (stories: A week away).

## Decisions

### One summary field, for a Scene so far or a Scene ended (host)

When the Chronicler records an open Scene it now writes `summary` too, as where the Scene stands so far ("Hermione
waited up for him and brought up the inkwell"), in one or two lines and no more words than now. A Scene that has ended
gets what happened in it, as before. The `chronicle` entry gains `sceneEnded`, so "this Scene has been summarised"
becomes "a Chronicle with `sceneEnded`" instead of "a Chronicle with a summary". Entries written before keep their
meaning when read (`readPayload`, the one place entries are read): `sceneEnded` is whether they had a summary.

The Chronicler sees the whole Scene so far already (it records from `recordFrom`, reading from the Scene's start), so
the so-far summary costs no extra call. The latest summary of a Scene is its best: an earlier Scene shows its ended
summary, as now.

Alternative: a separate `soFar` field. Rejected: two fields where one is always empty, and a reader that has to know
which to take; one field with whether the Scene had ended says the same thing once.

### The Chronicler records an open Scene once the player steps away (host)

An open Scene is now due to be chronicled also when the Path's head is an hour old and its latest Reply is not
covered yet: the player stepped away. The engine arms a timer per Story after each turn (a little over the hour,
`unref`'d so it never keeps the process alive), and the timer only queues the Chronicler, which asks `dueChronicle`
as always, given the time now. `fantasia serve` catches up at start on whatever came due while it was stopped.

Why an hour: the card needs the record long before a day passes, and a short break (making tea) should not spend a
call. Alternatives considered: recording when the player comes back (the card would wait on a model, or appear late,
and the spec says opening never waits); recording after every Reply (a call per turn for a card shown once a day);
relying on the twelve-exchange record (a short evening's play would have none).

### The card is the Scene view's, decided on the Mac (host, protocol)

`SceneView` gains `previously: { summary, since } | null` (contract version 5). `since` is when the head entry was
written: everything on the Path is something the player did or a turn they started, so it is when they last played.
The Mac sets `previously` when that is more than a day before now and the Scene the player is in, or the Scene that
closed when they are at the Day View, has a summary: its latest. The view takes the time as a parameter, so tests
pass their own. Without a summary there is no card, rather than an older Scene's words passed off as this one's.

The Mac decides because it alone knows the records; the phone only says how long ago, as Home does.

### The card on the phone (android)

Built as drawn in `SceneReturn.dc.html`: a surface card (#1E1B24, line #2E2A36, corner 16) with the eyebrow
"PREVIOUSLY · 30 HOURS AGO" (hours under two days, then days), a Dismiss button (44 point target, the cross drawn
16), and the summary in Literata 15/1.55 in the prose colour.

Mid-Scene it sits just above the latest Reply, after the latest Move. The Scene opens at its end as now, as drawn:
the card and the Reply above the composer. A Reply too long for both to fit opens with the card at the top of the
screen and the Reply under it instead, so the card is never out of sight; nothing is padded to make a short Reply
reach the top. At a Day View it sits at the top of the Day View, above the day. The player's place is kept as before
once they scroll.

Dismissing hides it and remembers, on the phone, the `since` it dismissed for that Story (in the app's preferences,
in a file of its own): the card shows again only for a different `since`, that is after the player has played and been
away a day again. The Mac never hears of it: it changes nothing in the Story.

## Risks / Trade-offs

- [The so-far summary invents] → the same check as every summary: its length, and the Chronicler's rule to invent
  nothing; a real-model check reads three so-far summaries against their Scenes.
- [The Mac was off when the player stepped away, and they open the Story before the catch-up run ends] → the card
  shows the Scene's older summary if it has one, or none; it never waits.
- [A Story played on two phones] → dismissal is per phone; the player has one.
- [The timer is lost when the Mac restarts] → the catch-up at start covers it.

## Migration Plan

Contract 5 is a breaking contract change: the Mac and the phone update together, as before. Old `chronicle` entries
read with `sceneEnded` from whether they had a summary; no State shape changes.
