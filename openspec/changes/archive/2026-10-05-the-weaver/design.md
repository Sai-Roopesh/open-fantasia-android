# Design

## Context

See proposal.md for why. What exists:

- Agents run from one engine and share only the State (docs/adr/0004): at each Scene end the Chronicler and the
  Weaver run at once, and only the Day View waits, only for the Weaver. The Weaver owns Lives, Threads, Happenings
  and Meanwhile.
- Records agents write beside play hang off the Path and never move its head (docs/adr/0007); the Chronicler's do.
  Prompts read them beside the Path (`chroniclesOn`); the reducer's State never depends on them.
- The Day View (host `dayView`, phone `DayViewContent`) shows the day, the time, the place and countdowns, from the
  State at the `scene_closed` entry. The Story File (docs/adr/0002) has people (`who_they_are`, `after`, `group`),
  Groups (`name`, `description`), Leads, Arcs and Landmarks, and no Threads.
- `MovingOn.dc.html` has no composer: the player waits for the Day View.

## Goals / Non-Goals

**Goals:**
- One writer for the World: only the Weaver writes Lives, Threads, what happened off-screen and Meanwhile.
- The player learns of the World only as the Player Character would, and code, not the model, guarantees that
  Meanwhile never holds what he could not know.
- The Day View's time is known the moment a Scene ends, so the phone can show it while the World moves on.

**Non-Goals:**
- Happenings and choosing where to be, the Gap, consequences of missing something, Lead absence (the second half).
- Telling the people in a Scene what happened off-screen beyond their own Life: the Writer's note carries what the
  Scene needs; recall of off-screen events by who knows them is for later, as Moments are.

## Decisions

### When the Day View is: a rule in the reducer (host)

When a Scene closes, the reducer keeps when it ended and sets the clock to when the Player Character is next free to
choose: the same time, or 7:30 the next morning when the Scene ended between 10:00 pm and 5:00 am (7:30 the same
morning after midnight): he sleeps, wakes and goes through his morning as he always does, breakfast included, so what
he would see or hear in that morning can be in Meanwhile ("At breakfast, Lavender says…", as `DayView.dc.html`
draws it at 7:40). It is a rule, not the Weaver's call, so the time is known at once (the phone shows
"Saturday 7:10 am" while the World moves on, as drawn) and never depends on a model; the Writer's "the clock never
goes back" then holds the night as passed. A player who wants the night writes a Move inside the Scene that goes
there, and no Day View opens.

Alternatives: the Weaver chooses the time (then the phone cannot show it until the Weaver is done, and a model
decides how long the player slept); the Day View at the Scene's end always (then a late Scene's Meanwhile is empty
and the drawn morning never comes). A Story with other hours (a night shift) can set its own later.

### The Weaver's record hangs off the Path (host, docs/adr/0007)

The Weaver writes a `world_moved` entry, a child of the Scene's last entry (`scene_closed`, or the last Reply before
the Move that left it), never on the Path:

- `from` and `until`: the Story time it covers, from where the World last stood to the Day View's time (or to the
  next Scene's start, when a Move left the Scene);
- `lives`: the Lives it moved, each `{ who, where, doing, after }`, `who` a person or a Group;
- `threads`: the Threads it moved or that began, each `{ name, now }`;
- `happened`: what happened off-screen, each `{ what, at, where, knownTo, landmark }`;
- `meanwhile`: what the Player Character learned, each `{ text, how: seen | told | rumour, happened, toldBy }`.

The World at an entry is worked out beside the Path (`worldOn`): Lives and Threads from the Story File, each replaced
by the latest record that moved it, and what happened, oldest first. A Redo or Rewind that takes a Scene's end off the
Path takes its record with it, with no clean-up, as for Chronicles. Even when the player waits for it, the record
stays off the Path, so there is one rule for every background record, and a Move that leaves a Scene (no Day View,
the Weaver running while the next Scene plays) needs nothing different.

### What code checks, and what the Weaver judges (host)

The Weaver answers in a JSON schema, checked by code and repaired once, as the Writer and Chronicler are:

- names are the Story's; the Player Character never has a Life (his are the player's Moves); a person in a Group
  lives through the Group's Life;
- every `at` falls in the span; every Landmark whose time falls in the span has something that happened with it;
- every Meanwhile item names something that happened whose `knownTo` holds the Player Character; a `told` item names
  who told him, who knows it; so nothing hidden can be in Meanwhile, whatever the model writes;
- at most six Meanwhile items, each a line.

What the Weaver judges, from WEAVER.md: moving only what will reach the player or change something they will meet
(a Life that touches nothing is left as it was), Threads moving from what people do, rumours that may be wrong, and
the Story's Style.

Alternative: the model marks what is hidden. Rejected: a hidden thing in Meanwhile breaks the Story, and a rule over
`knownTo` makes it impossible rather than unlikely.

### The Weaver runs at Scene end; only the Day View waits (host)

The engine queues the Weaver for a Story when a Scene closes (by the Story or End scene) and when a Move leaves one,
one run at a time, beside the Chronicler. It reads the Story, the World as it stands, the Scene that ended (its last
twelve exchanges, as the Writer does: the Chronicler's summary is written at the same time), who was there, and the
span with the Landmarks in it. The Day View is ready once the record for its `scene_closed` exists; until then the
Scene view says the World is moving on, and a failure (after the one repair) says why, with a trace and Retry.
`fantasia serve` reruns at start any Scene end that has none. The phone hears `world_moved` and `world_failed` and
reloads.

### What the Writer and the Actor read (host)

The Writer reads the World: every Life, every Thread, and what happened in the last day of Story time with who knows
it, hidden things included. It sees everything and passes on only what happens next (WRITER.md: Who knows what), so a
scorched door can be found in a Scene without anyone having been told. The Actor reads, for each person present,
their own Life: where they are, what they are doing and after; it is theirs to know.

### The Story File sets Threads (protocol, host)

The Story File gains optional `threads`, each `{ name, now }`. Lives start from the Story File: a person's `after`, a
Group's `description`, with no place until the Weaver gives one.

### The phone (protocol, android)

Contract 6: `DayView.world` is `moving_on`, `ready` or `failed`; `DayView.ended` says when the Scene began and ended;
`DayView.meanwhile` lists `{ text, how }`; `DayView.failure` gives the reason and trace. New events `world_moved` and
`world_failed`; `POST /stories/{id}/world/retry`.

Built to `MovingOn.dc.html` while moving on: the Scene that ended ("SCENE 14 · ENDED", its title, "Friday 9:40 pm –
11:05 pm · The Gryffindor common room"), the day and time, the line "Recording the Scene. The World is moving on." as
a status, the placeholder bars, and no composer. Then `DayView.dc.html`'s first part: the day, the time and place,
the countdowns, and MEANWHILE with SEEN (teal), TOLD (blue) and RUMOUR (amber) tags, and the composer. "What's on
today" and the choices come with the second half.

### Inspecting it (host)

`fantasia world <story>` prints the Lives, the Threads, and what happened with who knows each, until Backstage.

## Risks / Trade-offs

- [The player waits for a model at every Scene end] → one Sonnet call, the Moving on line while it runs, Retry when
  it fails; measured on the phone.
- [The Weaver moves too much, or too little] → WEAVER.md and a real-model gate on a Life that touches nothing.
- [A rule-based bedtime suits a school story and not every Story] → a Story-level setting can come later; the rule
  is one function.
- [The Writer's prompt grows with the World] → only the last day of what happened; Lives and Threads are short.

## Migration Plan

Contract 6 is breaking: the Mac and the phone update together. Stories already played have no World records: their
World starts from the Story File, and the next Scene end moves it on from the State's clock. Saved States change
shape (`CurrentScene` gains when the Scene ended), so `STATE_SHAPE` goes up.
