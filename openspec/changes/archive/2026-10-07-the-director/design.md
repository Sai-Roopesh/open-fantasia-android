# Design

## Context

See proposal.md for why. The engine runs agents as a graph (docs/adr/0004).
- **A turn:** the Writer, then the Actor.
- **A Scene's end:** the Chronicler and the Weaver at once, each in its own queue per Story. Only the Day View waits,
  and only for the Weaver.

The State already carries what the long run needs:
- `premise`, `arcs` (strings) and `landmarks` (name, time, what), from the Story File;
- for each Scene, the Writer's `intensity` (1 routine to 5 a change that cannot be undone) and `arcMoved`, which
  counts `withoutArc`.

The Writer reads the Premise, the Arcs and the Landmarks (WRITER.md "What the story serves"), and so far nothing
else about the long run. The Weaver puts its own pick first among the Day View's Happenings and is already checked
for one rule about it: a Lead after two Scenes without one. Background records hang off the Path (docs/adr/0007).
The Director's model is already a setting (`jobModels().director`, Opus 5.5 by default). Backstage's view and
screen leave a gap for "THE DIRECTOR" (Backstage.dc.html: "Building toward the flying test on Wednesday. This
stretch builds; rest comes after it.").

## Goals / Non-Goals

**Goals:**
- Stretches that build, peak and rest, planned rarely and followed by the Writer.
- A slow burn that moves one small step at a time, and a Premise that keeps returning without taking over.
- Rest after a peak, as a rule the engine checks, not a hope.
- The plan in Backstage and nowhere else.

**Non-Goals:**
- Editing Arcs in the app (`long-run`: the player can add, rewrite or drop Arcs). That is the setup-editing change;
  the Director reads whatever Arcs the State holds.
- Moving Landmarks; the Weaver brings them about as now.
- Showing the player anything of the plan outside Backstage.

## Decisions

**1. A plan is a background record (host).** `director_plan` hangs off the entry that closed the Scene it followed
(docs/adr/0007), so Paths and Rewind carry or drop it with that Scene. The plan holds:
- `toward`: what the stretch builds toward, in the story's words ("the flying test on Wednesday").
- `landmark`: the Landmark it builds toward, if it is one, or null.
- `phase`: `build`, `peak` or `rest`.
- `scenes`: how many Scenes the stretch should take, from 1 to 6.
- `arcs`: one row per Arc, each with:
  - `now`: where the Arc stands now;
  - `next`: the one step this stretch may take;
  - `not_yet`: what would be too far, too soon.
- `premise`: how the Premise comes into this stretch: which kinds of Scene serve it and which leave it alone.
- the call and its model, as every record keeps them.

The current plan is the newest one on the Path. It has run its course once `scenes` Scenes have closed since it.

**2. When the Director plans (host).** At each Scene's end, after the Chronicler's record of that Scene and the
Weaver's are written, `directing.ts` decides whether a plan is due. One is due when:
- there is no plan on the Path yet;
- the current plan has run its course;
- the Scene that ended peaked: the highest intensity the Writer gave it is 4 or more;
- or a Landmark's time has passed since the plan was written.

If none of these holds, nothing runs: the Director is the most expensive model, and a stretch is several Scenes long.
One run at a time per Story, in its own queue. A failure is kept with its call and the plan is due again at the next
Scene's end; meanwhile the Writer goes on with the last plan.

**3. What the Director sees and answers (host).** Everything, as the Writer does (docs/adr/0004):
- the Premise, the Arcs and the Landmarks with their times;
- the clock;
- every Scene so far as the Chronicler summarised it, each with its highest intensity and whether an Arc moved;
- the Threads;
- the plan before this one.

DIRECTOR.md says:
- An Arc's `next` is the smallest step that is still a step.
- `not_yet` names what the Story must not reach in this stretch.
- After a peak the stretch rests.
- The Premise comes into some Scenes of a stretch and not every one.

The answer is JSON against `DIRECTOR_SCHEMA`, checked with one repair as every agent's is (`answerWithOneRepair`):
- one row per Arc, named as the State names it;
- `scenes` within 1 to 6;
- a `landmark` that is one of the Story's;
- `phase` `rest` when the Scene that ended peaked.

**4. The plan reaches the Writer only (host).** `writerPrompt` gains a "The long run" section from the current plan:
- the phase;
- what the stretch builds toward, and how many Scenes are left;
- for each Arc, where it stands, the step it may take now, and what is not yet;
- how the Premise comes in.

WRITER.md says the Writer may move an Arc as far as `next` and never into `not_yet`, and that a resting stretch is
rated low and kept quiet. Nothing else reads the plan except Backstage. The Actor, the Day View, the World screen and
the Journal never see it.

**5. Rest after a peak (host).** `weaveAsk` gains `afterPeak`: the highest intensity in the Scene that ended is 4 or
more. Each Happening gains `quiet`: the Weaver's word that nothing is at stake in it. When `afterPeak` holds, the
task tells the Weaver its pick must be quiet, and the check refuses a pick that is not, with one repair. The
Lead-absence rule still holds, so a quiet pick can have a Lead in it. Happenings already stored without `quiet` read
as not quiet.

**6. Backstage (protocol, host, android).**
- `BackstageView.director` is null until the Director has planned. Otherwise it holds:
  - `toward` and `phase`;
  - one line said from them: "Building toward the flying test on Wednesday. This stretch builds; rest comes after it."
    / "…This stretch peaks." / "Resting. Next, building toward the flying test on Wednesday." (in a resting
    stretch, `toward` is what comes after the rest)
- The phone shows "THE DIRECTOR" with that line, between Lives and the Writer, as drawn.
- The Arcs' rows stay off the phone: Backstage is to read, and the Director's working is in its call.

**7. Testing the long run (host).** The four scenarios are proved at two levels.
- **Scripted engine tests** prove the mechanics:
  - when a plan is due and when it is not;
  - that the plan reaches the Writer's prompt and no other agent's;
  - the rest check;
  - that the plan is in Backstage and absent from every other view.
- **Live tests** (`npm run test:real`) prove what only a model can show:
  - "The Premise keeps returning" plays ten Scenes of The Malfoy Problem, each opened by the real Writer from a Day
    View Move, with the real Director planning between them. The Actor, the Chronicler and the Weaver are scripted:
    a Scene's record is its purpose, and each Scene ends after its opening. A judge then asks, of each Scene's
    purpose, whether it moves what is between Draconia and the Player Character. Several must, and some must not.
  - "A slow burn stays slow" plays twenty such Scenes and asks the judge whether the Arc has moved from insults
    toward slips and jealousy without anything being declared.

## Risks / Trade-offs

- [The Director costs Opus calls] → It plans only when a stretch turns or a Scene peaks: about one call in three or
  four Scenes. Its model is the player's to change on the Models screen.
- [A plan arrives after the next Scene has begun] → The Writer uses the newest plan there is. A next Scene opened
  while the Director is still running follows the previous plan for its first Beat Note and the new one from then.
- [The live tests are slow and spend quota] → They run only when asked, once each (not three times), and each Scene
  is played as its opening only.
- [The Weaver's "quiet" is its own judgement] → The rule holds it to saying so; a live Weaver test over a peaked
  Scene shows its pick is quiet.
