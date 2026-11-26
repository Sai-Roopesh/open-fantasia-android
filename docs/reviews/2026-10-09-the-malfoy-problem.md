# Review: The Malfoy Problem, first eight days

Played 8–9 October 2026. The Main Path covers 56 exchanges in 15 Scenes, taking story time from Day 6 to Day 14.
Agent calls:
- Writer: 60;
- Actor: 56;
- Chronicler: 113, of which 104 failed;
- Weaver: 19;
- Director: 4.

The player's complaints:
- the story is too slow, because each big event is two months away;
- the Director does not seem to take steps for the romance.

This review traces those complaints, and everything else found, to their causes in the design. It does not stop at
the symptoms.

## What happened, in numbers

- **Time.** Story time moved about one day for every seven exchanges. The first Landmark, the Halloween troll on
  Day 61, is about 350 exchanges away at that rate. The Battle of Hogwarts on Day 1706 is out of reach.
- **Scene length.** 15 Scenes in 8 days. Half of them had four exchanges or fewer, and one had none.
- **The Story's own picks.** 17 Day View picks. 13 were marked quiet, most of them meals with Harry, Ron and
  Hermione. Two had Draconia in them.
- **Intensity.** The Writer rated every Scene 2 or 3. Nothing peaked.
- **The Director's plans.** All four were about Draconia, but each looked only days ahead ("the second lesson,
  Wednesday, Day 18"). None named a Landmark. Each Arc was given its smallest possible step.
- **Who drove the romance.** Every warm turn came from the player's Moves:
  - taking her hand to correct her wand motion;
  - floating her and catching her;
  - the compliments;
  - wiping Hermione's cheek.

  The Story's own moves for Draconia were about status: billing him for the slap, setting a weekly arrangement on
  her terms. When she saw him hold Hermione, she "watched with a face like glass" and left. That is far short of
  the possessiveness the player asked for, "amplified three times".
- **Memory.** Chronicles exist for Scenes 1–9 only. Scenes 10–15 have no Moments: the floating classroom, the
  Bludger hug, the library and the pub with Hermione. Later Scenes cannot remember them.
- **What worked.** Her voice, the slips and the denials, Hermione's slow fluster, and Dumbledore and the secret.
  The checks on the Line held: the Writer was caught once deciding for the Player Character, and repaired it.

## Causes

### 1. Nothing owns story time

Time moves only in three ways:
- a few minutes per exchange;
- a Scene ending, which moves it at most to the next morning;
- the player choosing a skip: this evening, tomorrow, the weekend, or the next Landmark.

No agent can say "the next thing worth living is ten days from now". The Director plans in Scenes, with no
calendar. The Weaver offers only "today, or tomorrow morning". The Writer is told a few minutes pass per exchange.

A Story that spans five years and is built around Landmarks two months apart therefore crawls through ordinary
days, unless the player skips. A skip then jumps straight to the Landmark, with nothing lived on the way.

### 2. The agent that chooses the next Scene cannot see the plan

- **Who chooses.** At a Scene's end the Weaver writes the Day View's Happenings and the Story's own pick.
- **Order.** It runs at the same time as the Chronicler. The Director runs only after both, and only when a plan
  is due (docs/adr/0004).
- **What it sees.** The Weaver never receives the Director's plan.
- **Result.** The pick that decides what the player does next is made blind to the long run. The Weaver is told to
  favour "what matters most now", with quiet picks after peaks. So it chooses meals.

### 3. Arcs are told to move by the smallest step, and only the player moves them

- **The Director's limit.** The Director gives each Arc "the smallest step that is still a step… never two steps
  at once".
- **The Writer's limit.** The Writer may move an Arc only as far as that step, never into "not yet". It re-plans
  around the player, and its Scenes are framed from the player's Move.
- **What is missing.** No part of the design has a Lead *go after* the Player Character. Draconia never claims him
  in public, never acts on her jealousy, never sabotages a rival.
- **No sense of the whole run.** Step size is not set by how much story there is to get through. Four years of
  romance, condensed, needs bigger moves per month than a single novel's slow burn. The Director has no view of
  the whole run, only of the next few Scenes.

### 4. A Scene is a place, not a dramatic unit

The Writer is told "a Scene is one place and one stretch of time", and that a Move that walks somewhere opens the
next one. "I go to the library with Hermione" ends a Scene and starts another. That is why the Scenes are so many
and so short. Each Scene's end then runs the Chronicler, the Weaver and possibly the Director, and opens a Day View
for a move of a few hundred yards. The fragmentation costs time, money and momentum.

### 5. "What he knows" of a person is one line that only grows

- **The form.** What the Player Character knows of someone is one line of at most three sentences, rewritten after
  each Scene with what that Scene showed.
- **Why it breaks.** For a Lead in a four-year relationship, the line can only grow. Past 80 words every chronicle
  is refused. The repair message asks for "three sentences" while it counts words.
- **The cost.** One overlong field throws away the whole chronicle: the Moments, the summary and the telling. That
  is why Scenes 10–15 are unrecorded.

### 6. All-or-nothing records

A Chronicler answer with any one invalid part is refused whole, retried, and in the end dropped. The same holds for
the Weaver and the Writer. Nothing records what was lost, nothing tries again later, and the player is never told.
104 failed calls went unnoticed for a day of play.

### 7. Presence is whatever the Writer remembered to say

- **How it is tracked.** Who is in a Scene is the Writer's `comes_in` and `goes`.
- **The mismatch.** The Actor writes everyone in the Scene, and brought Crabbe and Goyle in at Draconia's heels
  because the story made sense that way. The Writer never named them, so the Mac did not count them as present.
- **The cost.** The Chronicler was refused for naming them, and lost those Scenes too. What is on the page and what
  the Mac believes are two different records of the same fact, and nothing reconciles them.

### 8. "A Lead" is not "the Premise"

- **The rule.** It is meant to keep Leads in the Story, but any Lead satisfies it. Harry, the Player Character's
  roommate, is nearly always there, so it never fires for Draconia.
- **What is missing.** The Story has no idea which people the Premise is about, or which relationships it should
  keep in motion.

### 9. Peaks are left to chance

- **How phases depend on peaks.** The Director's rest and build follow peaks, and peaks are the Writer rating a
  Scene 4 or 5.
- **Why none came.** Nothing schedules a peak. With small Scenes, small steps and quiet picks, nothing ever peaked,
  so the Story kept planning gentle stretches toward the next weekday lesson.

### 10. Background agents run on every Scene end, whatever the Scene

The Weaver ran 18 times in eight days of story time, mostly to move the World on by twenty minutes. Such a span
has nothing to move, and each run costs a call and a wait at the Day View. The same applies to the Chronicler.

## What a fix has to achieve

- **Story time is planned.** A Story five years long is lived as a sequence of chapters. Each chapter is a stretch
  of the calendar with a few Scenes that matter. Ordinary days pass in summary, and the next Scene that matters is
  where the Day View leads.
- **One plan drives what comes next.** The long-run plan decides the next Scenes: who, where, roughly when, and what
  for. The World's offers grow around that plan, not past it.
- **Leads act.** Each chapter gives the Premise's people something they do to or about the Player Character. The
  Story starts moments as well as answering them.
- **Arc pace follows the run's length.** Arcs have milestones across the run, tied to the Landmarks ("by the Yule
  Ball…"). A chapter's steps are as big as the calendar needs.
- **A Scene is a dramatic unit.** It ends when its purpose turns or time jumps, not when someone walks down a
  corridor.
- **Memory has a shape that lasts four years.** For each person: a short current line, the Moments with the words
  that were written, and a relationship's standing kept as its own record. Nothing has to grow forever.
- **Records degrade gracefully.** A bad part of an answer is dropped and noted. The rest is kept, missed records
  are made later, and failures show in Backstage.
- **Presence is reconciled with the page.** People named on the page in a Scene are in it.
- **Background work runs when it has something to do.** The World moves when time has moved enough to matter.
