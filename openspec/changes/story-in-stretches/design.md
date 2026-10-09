# Design

## Context

See proposal.md and docs/reviews/2026-10-09-the-malfoy-problem.md, causes 1–4 and 8–10. This builds on
lasting-records: Bonds and records that do not get lost.

**How it works today (host):**
- **At a Scene's end.** The Chronicler and the Weaver run at once. The Director runs after both, when
  `directionDue` says so: no plan yet, the plan has run its course in Scenes, a peak, or a Landmark passed
  (docs/adr/0004).
- **The Weaver** answers the span from where the World stood to when the Player Character is next free (the next
  morning at most). Its Happenings fall "today, or tomorrow morning". It never reads the plan.
- **The Director's plan** is `{ toward, landmark, phase, scenes (a count of 1–6), arcs[{ arc, now, next, not_yet }],
  premise }`. The plan reaches only the Writer, as `long_run`. `DIRECTOR.md` asks for "the smallest step that is
  still a step".
- **The Writer** frames a new Scene whenever a Move goes somewhere else.
- **Skips** (`story/day.ts`): this evening, tomorrow, the weekend, the next Landmark.

No compatibility is kept. The player replays from the start.

## Goals / Non-Goals

**Goals:**
- A Story spanning years plays at the pace of what matters: about a week per Stretch, a few Scenes per week, the days
  between passing as Meanwhile.
- The long-run plan decides what comes next, and Leads act every week, on screen or off.
- Arcs move at the pace the run needs.
- Fewer, fuller Scenes.

**Non-Goals:**
- **Automatic jumps.** The player chose that the Story proposes and the player chooses. The Day View stays, with
  every other choice still there.
- **Changing what an Arc or a Landmark is.** They stay the player's, set in the Story File and edited in The Story.
- **A new agent.** The Director gains the calendar; no Showrunner is added.

## Decisions

**1. The Stretch plan (host, `agents/director.ts`, `DIRECTOR.md`, `story/entries.ts`).**

The `director_plan` payload becomes:

- `from`, `until`: story days. A Stretch is five to nine days; the first starts at the clock.
- `toward`, `landmark`, `phase` (build, peak or rest), `premise`: as now.
- `scenes`: two to five **Scenes that matter**, each `{ id, at, place, who, for, lead }`:
  - `at` is a story time within the Stretch;
  - `who` is the people there;
  - `for` is what it is for, the turn it is built around;
  - `lead` is the Lead it is about, or null.

  Each Scene is checked: its time is within the Stretch and after the clock, its people are in the Story, and its
  place is the Story's or new.
- `arcs`: `{ arc, now, next, not_yet }`, as now, with `next` sized by the roadmap (decision 2).
- `leads`: for every Lead, `{ who, move, scene }`. `move` is what they do this week about the Player Character.
  `scene` is the id of the Scene that matters where it happens, or null when it happens off-screen.
- `roadmap`: for each Arc, `{ arc, by, stands }` for each of the next two Landmarks (`by` is the Landmark's name):
  where the Arc should stand by then.

The plan is due (`directionDue`):
- when there is none;
- when the clock has passed `until`;
- when every Scene that matters has been played or passed;
- when a Scene has peaked;
- when a Landmark has passed.

"Run its course" counts days and planned Scenes, not a number of Scenes.

**Considered:**
- Keeping the Weaver's pick and passing it the plan. Not enough on its own: the plan would still say nothing about
  when or where.
- A separate agent for the calendar. Rejected: two agents would own the long run (docs/adr/0004's one writer per
  part of the State).

**2. A roadmap paced by the run (host, `DIRECTOR.md`).**

The Director is given:
- the whole run: today, the last Landmark's day, and every Landmark;
- the Bonds of the Leads (lasting-records);
- its previous roadmap.

`DIRECTOR.md`'s "smallest step that is still a step… never two steps at once" is replaced: "the step this week
needs for the Arc to stand where the roadmap says by the next Landmark; when the player has run ahead of the roadmap,
move the roadmap, never hold the Arc back." `not_yet` stays, as the guard against rushing: no declaration in the
first month of a four-year slow burn.

**3. The order at a Scene's end (host, `engine/engine.ts`; new ADR 0010).**

The order becomes Chronicler, then the Director when due, then the Weaver:
- The Weaver needs the plan to write the next Scene that matters as the pick, and the Leads' off-screen moves.
- The Director needs the newest record of what happened and the Bonds.
- The Day View waits for the Weaver, as now, and so waits longer once a week of story, when a plan is due.
- A failed Director run leaves the old plan in force, and the Weaver goes ahead with it.

ADR 0010 supersedes the Scene-end order in 0004. Everything else in 0004 stands: agents never message each other,
and they share only through the State.

**4. The Weaver follows the plan (host, `agents/weaver.ts`, `WEAVER.md`, `engine/weaving.ts`).**
- **The plan.** The Weaver reads the current Stretch.
- **The pick.** Its pick is always the Stretch's next unplayed Scene that matters, written as a Happening (its time,
  place, who, and what it is for in the World's words, never the plan's). That holds even when it is days away, and
  it carries the Scene's id.
- **Other Happenings.** Today's other Happenings are still offered, so the player can stay in the present.
- **Over a span of days.** The span runs to the chosen time, as a Gap does now. The Weaver writes, for each Lead whose
  move is off-screen and falls in the span, what they did, with `known_to` and how it reaches him. It writes nothing
  for ordinary days.
- **An empty span.** A span under 60 minutes with nothing on and no Lead move moves nothing. The Day View reuses the
  last Happenings, minus those already past.

**5. Framing from a planned Scene (host, `agents/writer.ts`, `WRITER.md`).**
- When the player chooses the pick, the choice's Move carries the Scene's id. The Writer's task then includes the
  planned Scene (its time, place, who, what it is for, and the Lead's move), and the Writer frames from it. The player
  turning it aside is still the player's right.
- **A Scene is a dramatic unit.** `WRITER.md` replaces "a Scene is one place and one stretch of time": a Scene is one
  thing happening between its people. A Move that walks somewhere with them while it goes on keeps the Scene:
  `leaves_scene` is false, and the frame's place changes. A new Scene starts when the Move turns to something else,
  or skips more than a couple of hours.
- A Scene's place may change within it. The title card stays. The Scene view shows the newest place line.

**6. Skips (host, `story/day.ts`, `time.ts`).** "Next week" lands on the same weekday a week on, at the waking hour.
The next Landmark stays.

**7. The link and the phone (protocol, android).** Contract 18:
- **The Day View.** `Happening` gains `days_away` and `scene` (the Scene that matters it is, if any).
- **Backstage.** `BackstageView.director` gains the Stretch: `from_label`, `until_label`, its Scenes that matter
  (day, place, who, played or not) and each Lead's move (on-screen or off).
- **The phone:**
  - **Day View (`DayView.dc.html`):** the pick shows its day when not today: "Thursday 10:00 am · in 5 days".
  - **Backstage (`Backstage.dc.html`):** THE DIRECTOR shows the Stretch's days, its Scenes that matter, and the
    Leads' moves.
  - Both are drawn first, for approval.

## Risks / Trade-offs

- **[The Director's call is slower and costlier at Stretch ends.]** About once per week of story, against the
  Weaver's eighteen calls for eight days today. Empty spans now skip it.
- **[A planned Scene can feel scripted.]** It is a time, a place and what it is for, never what happens. The Writer
  frames it, and the player can turn it aside or choose anything else.
- **[Bigger Arc steps could rush the slow burn.]** `not_yet` and the roadmap's per-Landmark points keep it a burn. A
  live check tests a month of Stretches for no declaration.
- **[Off-screen Lead moves may pile up unseen.]** Each must say how it reaches him. Backstage shows them all.
- **[A Scene that goes on across places can run long.]** "Only what matters earns time" and the Writer's land and
  end calls stand. A Scene still ends when its purpose turns.

## Migration Plan

None kept. After lasting-records and this change, The Malfoy Problem is imported again and replayed from Freshers'
Friday, with the player's agreement.
