# Design

## Decisions

**1. The Ledger (host; ADR 0015 supersedes ADR 0007).** No record hangs beside the Path. A Scene's end writes its
entries after `scene_closed`, in order: `chronicle`, `director_plan` (when due), `world_moved`, `story_folded` (when
due). A choice's Gap writes `world_moved` after the Move. The State is `apply` over the Path. Rewind, Paths and edits
then carry every fact with no reader of their own.

**2. The World model (host, `story/state.ts`).** The State adds:
- `lives` by person;
- `threads`;
- `facts`: what happened, from the page (Moments, with quotes) or off it (World), each with `at`, `knownTo` and
  `source`;
- `bonds`, `known`, `calendar` (Engagements);
- `plan`;
- `storySoFar` (`scenes`, `weeks`, `chapters`);
- `curve` (each Scene's intensity);
- `brief` (`more`, `less`), `reactions`, `routine`, `newThings`.

The Chronicler's Scene paragraph enters `storySoFar.scenes`. The Folder's entry replaces folded paragraphs with a week
or a chapter.

**3. Lenses (host, `context/`).** `contextFor(lens, state, scene)` renders the same sections in the same order:
1. story and brief;
2. routine and calendar;
3. The Story So Far;
4. the cast by salience: present and Leads in full, people in live Threads or the calendar in a line, the rest as a
   count;
5. Threads;
6. world now (omniscient and author only);
7. recalled Moments (quoted, for who is present);
8. the Scene.

What each lens sees:
- **Character** gives each present person only facts whose `knownTo` holds them.
- **Author** marks every fact with who knows it.
- **Omniscient** shows everything.

Each section has a budget in items and words. The system prompt (role instructions plus the Story's fixed setup) is
the cached part.

**4. The pipeline (host, `engine/scene-end.ts`, `agents/step.ts`; ADR 0016 supersedes ADR 0010's order).** There is
one queue per Story. A Scene's end is a list of steps; `scene.ended` in the State says which are done, so a step that
resumes never runs twice.
A step:
1. calls its model with a timeout;
2. repairs once only when the answer is unusable (fails its format, or truth checks leave nothing);
3. then tries the job's second model;
4. then stops the job, keeping `{ job, step, reason, trace_id }`.

Retry, with an optional model, resumes at the failed step. A Mac start resumes every unfinished job. The Day View
is ready when the Scene-end job is done.

A Move that leaves a Scene for something else closes it (`scene_closed` by `move`); its end runs inside that Move's
turn, then the Writer's plan opens the next Scene, with no Day View between. A step that stops there stops the
turn, and Retry goes on into the next Scene.

**5. Formats and checks (host, `agents/format.ts`).** Formats are built per Story: `enum` of people (the Story's and
the plan's new ones), places (known plus a free `new_place`), Engagement and Scene labels. Times are asked as the Story
reads them: the Writer gives minutes from now, the Director a day from the Stretch's start and an `HH:MM`, the
Chronicler and Weaver `Day N HH:MM`; the code makes and keeps clock times in range. Checks that stay:
- Moment quotes are on the page;
- nothing invents the Player Character's actions;
- names are in the lists (for Antigravity, which does not enforce formats).

Lengths are asked for, never refused.

**6. Roles (host, `agents/`):**
- **Writer:** beats, who comes and goes, minutes the Reply covers, the call, and on the last Reply the Scene's
  intensity.
- **Actor:** prose, from the character lens.
- **Chronicler:** Moments, Bonds, what he knows, Engagements, the Scene's paragraph.
- **Director:** a Stretch of 3 to 6 days, Scenes that matter (each with the player's line and a headline), new things
  (with new people), Lead moves, Arc steps, roadmap. It is given the curve, the brief, reactions and the recent
  Stretches.
- **Weaver:** salient Lives, Threads, what happened (with `knownTo`), what reached him, and what is on.
- **Folder:** a week or a chapter from paragraphs.

**7. The Day View in code (host, `story/day.ts`).** The pick is the plan's next Scene, then the calendar, then the
Weaver's "on". It merges by place and time, as now, takes four, and shows the pick first.

**8. When the Director runs.** The Director is due when there is no plan; the Stretch is over; the last Scene peaked
(intensity 5); a Landmark passed; or the plan's next Scene's time passed without it being played (off the plan).

**9. Jobs (host, protocol, android).** `JOBS` adds `folder` (Haiku 4.5, the Haiku Claude offers on this Mac). Every job has a `backup`, whose defaults
are Sonnet 5.5, or GPT 6.1 Sol when the job is already on Sonnet. The Models screen shows both.

**10. The phone (android, contract 21).**
- `DayView.world` becomes `scene_end { step | null, failed | null }`.
- New events: `scene_end_step` and `scene_end_failed`. One `retry` covers turns and Scene ends.
- New: the `brief_set` and `reaction_set` requests, and `How it's going` in Backstage.

These are built to drawings on `DayView.dc.html`, `Backstage.dc.html` and `Models.dc.html`.

## Risks / Trade-offs

- **Slower Scene ends:** about 2 to 4 minutes. The player accepted this.
- **A larger prompt:** kept down by budgets, caching and salience.
- **Fail-stop** blocks play only after both models fail. Retry or another model resumes.
