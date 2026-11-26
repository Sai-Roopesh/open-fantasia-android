# Proposal

## Why

The player's two complaints about The Malfoy Problem (docs/reviews/2026-10-09-the-malfoy-problem.md):
- the story goes too slowly;
- the Director takes no steps for the romance.

Both come from the design:
- **Time (cause 1).** Nothing owns story time. It moves a few minutes per exchange, to the next morning at most
  when a Scene ends, or by the player's skip. Fifty-six exchanges covered eight days of a five-year Story.
- **The plan (cause 2).** The plan cannot choose what comes next. The Weaver picks the Day View's next Scene before
  the Director plans, and never sees the plan. It picks meals.
- **Arc steps (cause 3).** Arcs move by the smallest step, and only the player moves them. No **Lead** ever goes
  after the **Player Character**. Draconia saw him hold Hermione and only looked.
- **Scenes (cause 4).** A Scene is a place, so walking to the library ends one. Fifteen tiny Scenes, each with its
  own Day View and background work.
- **Leads (cause 8).** Any Lead keeps the rule about Leads satisfied, so Harry, always there, keeps Draconia away.
- **Peaks (cause 9).** Nothing schedules a peak, so nothing peaked.
- **Background work (cause 10).** It runs at every Scene end, to move the World on twenty minutes.

The player chose how it should work instead (9 October 2026):
- **The jump.** The Story proposes the jump: after a Scene, the Day View leads with the next Scene that matters,
  and ordinary days in between pass as a short Meanwhile.
- **Leads.** Leads act every Stretch without being forced into every Scene. When they are off-screen, what they did
  is tracked and reaches him.
- **Length.** A Stretch is about a week of story time.

## What Changes

- **The Director owns the calendar (host).** It plans a **Stretch**: about a week of story time, from a day to a
  day, with:
  - what it builds toward and its phase;
  - two to five **Scenes that matter**, each with a day, a time, a place, who is there and what it is for;
  - each Arc's step, sized to reach where the Arc should stand by the next Landmarks;
  - each Lead's move this week, on screen in one of the Scenes or off it.

  It plans when a Stretch's days have passed or its Scenes are played, when a Scene peaks, or when a Landmark
  passes.
- **Arcs keep pace with the run (host).** The Director keeps a roadmap: where each Arc should stand by each
  Landmark, revised as the Story goes. A Stretch's steps are as big as the roadmap needs. "The smallest step that
  is still a step" goes.
- **One plan leads what comes next (host).**
  - At a Scene's end the order is Chronicler, then Director when due, then Weaver.
  - The Weaver reads the Stretch and writes the next Scene that matters as the Story's pick, even when it is days
    away. It writes the Leads' off-screen moves into what happened, with who knows.
  - The days between pass as a Gap.
  - This supersedes the order in docs/adr/0004, in a new ADR 0010.
- **Leads act (host).** Every Stretch gives each Lead a move about the Player Character, on screen or off. Off-screen
  moves happen in the World and reach him as Meanwhile, as things found, or as consequences. The "two Scenes
  without a Lead" rule goes.
- **A Scene is a dramatic unit (host).**
  - A Scene has one purpose, and the people it is about.
  - It goes on when they walk somewhere together, with the place changing in a line.
  - It ends when its purpose turns, when a Move skips ahead or turns to something else, or when the player ends it.
  - CONTEXT.md's **Scene** changes, and **Stretch** is added.
- **The Day View (host, protocol, android).**
  - Its first offer is the Stretch's next Scene that matters, with its day ("Thursday 10:00 am · in 5 days").
  - Skip to later adds "Next week".
  - Backstage shows the Stretch: its days, the Scenes that matter and each Lead's move.
  - Both are drawn first for the player's approval.
- **Background work when it matters (host).** The Weaver moves the World when the next Day View needs it. A span
  of less than an hour with nothing on keeps the World as it stood, as a Gap already does.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `long-run`:
  - The Director shapes the long run around Arcs and Landmarks: Stretches of a week, the Scenes that matter, the
    plan reaching the Weaver.
  - Rest is deliberate: a Stretch rests.
  - New: Arcs keep pace with the run.
  - New: Leads act every Stretch.
- `day-view`:
  - Up to four Happenings: the pick is the next Scene that matters, even days away.
  - The player chooses where to be: Next week.
  - Lead absence is felt, not counted: replaced, since a Lead away still acts and that reaches him.
- `scenes`: A Scene ends in one of three ways: a Scene is a dramatic unit and goes on as its people move.
- `living-world`: Off-screen time is resolved only as far as it reaches the player: over days, Leads and Threads
  move, ordinary days are not itemised, and a short span with nothing on moves nothing.

## Impact

- **Host:**
  - `agents/director.ts` and `DIRECTOR.md`: the Stretch, the roadmap, the Leads' moves;
  - `engine/directing.ts` and `engine/engine.ts`: the order at a Scene's end;
  - `agents/weaver.ts` and `WEAVER.md`: the plan's Scenes, Leads off-screen;
  - `engine/weaving.ts`: spans, skipping empty ones;
  - `agents/writer.ts` and `WRITER.md`: Scene as a dramatic unit, framing from a planned Scene;
  - `story/day.ts`: skips;
  - `story/entries.ts`: `director_plan` shape;
  - `views/backstage.ts`.
- **Protocol:** contract 18: the Day View's first offer carries its day, a "next week" skip, and Backstage's
  Stretch.
- **Android:** the Day View's first offer and Backstage's Stretch, built to updated `DayView.dc.html` and
  `Backstage.dc.html`.
- **Docs:** `docs/adr/0010-the-director-owns-the-calendar.md` (supersedes the Scene-end order in 0004); CONTEXT.md
  (Scene, Stretch).
- **Depends on** lasting-records: Bonds feed the Director's roadmap, and records must not be lost across weeks.
- **Compatibility:** none kept. The player replays The Malfoy Problem from the start.
