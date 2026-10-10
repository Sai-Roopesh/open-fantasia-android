# Design

## Context

See proposal.md for the evidence from the first play.

**How it works today (host):**
- **Offers.** The Day View's offers are the Weaver's `happenings`, written at each Scene's end. `story/day.ts`
  `onAhead` keeps every Happening still ahead from every `world_moved` record on the Path. `todayOn` puts the pick
  first and caps at four.
- **Where arrangements end up.** An arrangement made in a Scene reaches the Day View only if the Weaver, reading the
  last twelve exchanges, writes it as a Happening. One told in Meanwhile only if the Weaver also writes a Happening
  for it. A Gap's span writes no Happenings at all.
- **Missing.** `engine/weaving.ts` `gapAsk` passes the Weaver the Happenings on in a Gap as `missed`, so an expected
  one goes on without him, noticed. A Scene that runs past something he is expected at misses nothing: only Gaps
  look.
- **The record.** The Chronicler records Moments from the page, quote-checked, part by part (lasting-records), and
  is shown the Moments someone in the Scene knows, by label (`M1`).

No compatibility is kept. The player replays.

## Goals / Non-Goals

**Goals:**
- Every arrangement the Player Character knows of is on the Day View until it is kept, missed, called off or past.
- Missing what he was expected at has consequences, however the time passed.
- Engagements are recorded from what was written, never invented, by the agent that saw them made.

**Non-Goals:**
- **A school timetable in the Story File.** A separate change; it would add Engagements the same way.
- **Arrangements between other people.** Only what he knows is an Engagement. Other people's plans stay the Weaver's
  Lives and Threads.
- **The Actor reading Engagements.** The people in a Scene know an arrangement made in front of them from the page
  and from Moments, as now.

## Decisions

**1. An Engagement is its own record (host; ADR 0011).**

Engagements are written in the records that already exist, by the agents that saw them made:

- **The Chronicler's answer** gains `engagements`, each:
  `{ what, at, place, who, expected, every, quotes }`
  - `at` is a story time after the Scene's start, resolved from the Scene's own day and time ("Wednesday, half past
    seven" from Sunday is Day N 19:30).
  - `every` is `"week"` or null.
  - `quotes` are one to three passages from the Scene's Moves and Replies, with their entry labels, checked word for
    word exactly as a Moment's are.
  - `expected` is true when his Move agreed, or someone with the standing to expect him summoned or ordered him; an
    invitation is false.
- **The Chronicler's answer** also gains `changed`: `{ engagement, to, quotes }`. `engagement` is the label `E1`
  of an Engagement it was shown (decision 2). `to` is a new `at` (moved), or `"off"` (called off).
- **A Weaver Meanwhile line** gains an optional `engagement: { what, at, place, who, expected, every }`. The line
  itself is how he learned it, so it needs no quote. It is checked for a time after the span and people in the Story.
- **Reading them.** `story/engagements.ts` `engagementsOn(mac, head)` reads every Engagement on the Path from the
  Chronicles and the World records in Path order, applies the moves and call-offs, and returns those still on, each
  with its next time ahead of a given clock. A weekly one's next time is the first time on its weekday and hour at or
  after the clock.

Each part is checked part by part, as in lasting-records: a bad quote, a time before the Scene, a name not in the
Story, or a `changed` label not shown is left out and noted, and the rest is kept.

**Considered, and rejected:**
- **Telling the Weaver to offer what was set up.** That is what fails today: re-deriving from prose every time, with
  nothing to check against.
- **Having the Writer declare arrangements in its Beat Note.** The Writer plans before the Reply is written, and the
  Reply decides the words and the time. The page is the truth, and the Chronicler reads the page.

**2. The Chronicler sees what is on (host).** The Chronicler's task gains `<engagements_on>`: each Engagement known
to someone in the Scene or to him, labelled `E1`, `E2`, with its time and place. That way a Scene that moves or
cancels one can say so with `changed`, and one that is merely mentioned again is not recorded twice. The check
leaves out a new Engagement that duplicates one on (same place, within an hour of its next time) and notes it.

**3. The Day View offers what is on (host, `story/day.ts`).**

`onAhead` becomes what is on: the Weaver's Happenings still ahead, and each Engagement's next time as a Happening
with an id of its own. A Weaver Happening at an Engagement's place within an hour of its time is the same thing, so
the Engagement is kept and the Happening dropped.

`todayOn` orders the pick first, then the Engagements he is expected at before the pick, then the rest by time. Past
four, the latest give way first, never the pick or an expected Engagement before it.

The Weaver is told the Engagements on (`<engagements_on>`, the way `still_on` is told now) and offers only what is
not on already.

**4. Kept or missed (host, `engine/weaving.ts`).**

- **Kept.** An occurrence is kept when:
  - the choice that opened a Scene was for it (the choice carries its Engagement, as it carries a Scene that matters
    now); or
  - a Scene on the Path ran over its time at its place (the same place-match as the World screen's places been).

  This is decided in code from the Path, so it does not wait on any agent.
- **Missed.** Every span the Weaver moves over, a Scene's end as well as a Gap, is given the occurrences in it that
  were not kept, as `missed`. Today only a Gap's are. An expected one goes on without him, noticed, by the existing
  rule.
- **What comes next.** A one-off Engagement is done once kept, missed or past. A weekly one moves to its next week.

**5. Filling in (engine; protocol; android).** A record is written after the Day View is ready, and the Chronicler
may land after the Weaver. When a Chronicle or a World record on the Path the phone is showing adds or changes an
Engagement, the engine emits `record_written`. The phone reads the Scene again, as it does after `world_moved`. The
Day View never waits for the Chronicler.

**6. The link and the phone.** Contract 19:
- `StoryEvent.kind` gains `record_written`.
- `Happening` gains `every`: the day a weekly one repeats ("Wednesdays"), or null.
- The phone reads the Scene again on `record_written`.
- A weekly Happening's card says "Every Wednesday · 7:30 pm", drawn first on DayView.dc.html for approval.

**7. The Writer is told what he has arranged (host).** The Writer's world section gains his Engagements ahead,
expected ones marked. That way a Scene can bring them up ("you're due in the library in ten minutes") and a Scene
that plays through one knows it.

## Risks / Trade-offs

- **[The Chronicler misses an arrangement.]** It is less likely than the Weaver missing it today: the Chronicler reads
  the whole Scene to quote it, not twelve exchanges, and a live check measures it on the first play's five cases. A
  missed one is no worse than today.
- **[Times said loosely: "after dinner", "Wednesdays".]** The Chronicler resolves them against the Scene's day and
  the Story's usual hours. A wrong hour is still on the right day, and the player sees it.
- **[A place written two ways: "the library" and "the library's end table".]** Matching uses the same tolerant
  place-match as the World screen's places been. A mismatch errs toward showing both, never toward hiding one.
- **[The Day View fills in after it is ready.]** That is by the presence spec; the card appears without a tap.

## Migration Plan

None kept. After this change, The Malfoy Problem is imported again, with the player's agreement, and replayed.
