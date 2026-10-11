# Proposal

## Why

The player found the Story boring and its agents working blind. On 2026-10-10/11 most faults had one of three causes:
- an agent wasn't told something;
- two copies of the story disagreed;
- a check fought the model.

That last one is ~100 refusal paths, and is most of the slow Scene ends.

The architecture causes all three:
- each agent picks its own slice of records kept beside the Path;
- a Scene's end is three racing queues;
- the Director relays its plan through the Weaver;
- pacing rules (a rest Stretch after any peak, one Scene per Lead) make every week the same.

The player approved a rebuild (2026-10-11), with no backwards compatibility: The Malfoy Problem is imported again.

## What Changes

- **One truth.** Everything is an entry on the Path, including what the Chronicler, the Director, the Weaver and the
  Folder write. The State is one fold of it: the cast with their Lives, facts tagged with who knows them, Bonds,
  calendar, Threads, the plan, The Story So Far, the brief, and the pacing curve.
- **Lenses.** One Context Builder renders the State for each role: omniscient (Director, Weaver), author (Writer,
  with who-knows-what), character (Actor, each person's knowledge), player (the phone). Budgets per section, a stable
  cached part, and quoted Moments recalled by who is present.
- **One pipeline per Story.** Move: Writer, then Actor. Scene end: Chronicler, then Director (when due), then Weaver,
  then Folder (when due). Choice: Weaver (the Gap), then Writer, then Actor. Each step has a timeout, a repair only
  when the answer is unusable, a second model, then a stop with Retry.
- **Agents judge, code keeps the books.** Answer formats carry the Story's people and places as fixed lists, times
  are offsets the code turns into clock times, ids are the code's. Checks stay only where truth is at stake.
- **The Director owns the offers.** Its Scenes carry the line the player sees. The Day View is built by code from
  the plan, the calendar and what is on. The Weaver moves the World only.
- **A Director with ideas:**
  - Stretches of three to six days;
  - something new each Stretch, and it can bring in new people;
  - no Scene per Lead by rule;
  - pacing from the curve: a breath after a peak, not a rest week;
  - a new plan when the player goes off-plan;
  - the brief and reactions;
  - a daily routine.
- **The Folder** (Haiku) folds The Story So Far into weeks and chapters.
- **Backstage:** How it's going, and what each Stretch brought.
- **The phone:**
  - progress and failure name the step;
  - one Retry;
  - the brief and reactions;
  - the Folder and second models on the Models screen.

  `record_written`, record gaps and the stepped-away Chronicler go.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `living-world`: Every agent knows the Story So Far (new); Moments are remembered from one record; Characters know
  only what they could know.
- `presence`: Between Scenes is quiet, and shows progress; Nothing fails silently.
- `long-run`: Something new every Stretch and The player steers with a brief and reactions (new); The Director shapes
  the long run; Rest is deliberate; Leads act every Stretch.
- `stories`: The Director can bring someone new into the Story (new).
- `outside-the-scene`: One Models screen; Backstage shows everything else.
- `story-file`: A Story File sets up every part of a Story (routine, brief).

## Impact

- **Host:** `story/` (entries, state, reducer, day, calendar), `context/` (new), `agents/` (all), `engine/` (pipeline
  and engine), `views/`, `models/jobs.ts`. Old record readers go.
- **Protocol:** contract 21. **Android:** Day View progress and failure, Retry, brief and reactions, Models screen,
  Backstage.
- **Data:** no migration; Stories are imported again.
