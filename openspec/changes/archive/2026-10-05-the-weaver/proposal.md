# Proposal

## Why

Nothing moves in a Story while the player is in a Scene. Meera, Bhalla, Hermione and everyone else stand still
between Scenes, the Day View has no Meanwhile, and a Thread the Story File sets up (the dragon egg in Hagrid's hut)
can never develop on its own. The living specs ask for a World that goes on without the player (living-world) and a
Day View that says what the Player Character learned while elsewhere (day-view: Meanwhile), and docs/design draws
both (`DayView.dc.html`, `MovingOn.dc.html`). The **Weaver** is the agent that owns this (docs/adr/0004): Lives,
Threads, Happenings and Meanwhile.

This change is the Weaver's first half: the World moves on, and the player learns of it only as the Player Character
would. Happenings, choosing where to be, the Gap and what missing something costs are the second half, and need this
one first.

## What Changes

- The **Weaver** runs when a Scene ends (the Story closes it, the player ends it, or a Move leaves it), beside the
  Chronicler. It moves the World on from where it last left it to when the Player Character is next free to choose:
  the end of the Scene, or the next morning when the Scene ended late and he went to bed (as `MovingOn.dc.html`
  draws: Friday 11:05 pm, then Saturday 7:10 am).
- It writes one record, hanging off the Path like a Chronicle (docs/adr/0007): the **Lives** it moved (where each
  person or **Group** is, what they are doing, what they are after; a Group has one Life), the **Threads** it moved,
  what happened off-screen and who knows each thing, and **Meanwhile**: what the Player Character learned, each
  marked seen, told or rumour. It moves only what will reach the player or change something they will meet.
- Code checks the record: names are the Story's; time never goes back and goes no further than the next morning;
  every Landmark whose time falls in the span happens; every Meanwhile item comes from something that happened and
  reaches the Player Character the way it says (told by someone who knows it; seen where he was); nothing anyone
  could not know is in Meanwhile.
- The Day View waits for the Weaver, and only the Day View does (docs/adr/0004). Until it is ready, the phone shows
  the Scene that ended and the one line "Recording the Scene. The World is moving on." as drawn; then the day, the
  time and Meanwhile, as `DayView.dc.html` draws them (SEEN, TOLD and RUMOUR). A Weaver that fails says so there,
  with Retry.
- The Writer reads the World (every Life, Thread and what happened, hidden things included) so its notes can bring
  it into a Scene; the Actor reads each person present's own Life. Nothing off-screen reaches a Reply but through
  the Writer's note or what the people present know.
- A Story File may set Threads; Lives start from who each person is and what they are after.
- `fantasia world <story>` shows the Lives, the Threads and what happened with who knows each, until Backstage.
- The contract goes to version 6.

Not in this change: Happenings, "What's on today", Follow someone, Go somewhere, Skip to later, Let the Story choose,
the Gap and its screen, what missing something costs, and Lead absence (the Weaver's second half); Backstage; the
Director.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `day-view`: adds "The Day View opens when the Player Character is next free to choose": at the Scene's end, or
  the next morning after a Scene that ended late.
- `story-file`: "A Story File sets up every part of a Story" adds the Threads, each with where it stands.

## Impact

- host: the Weaver (prompt, schema, check, one repair) and its model in `fantasia models`; a `world_moved` entry off
  the Path; the World worked out from the Story File and those records; the engine runs the Weaver at each Scene
  end and the Day View waits for it; the Day View view; the Writer's and Actor's prompts; `fantasia world`; the
  Story File's optional `threads`.
- protocol: contract version 6 (the Day View's Meanwhile, and whether it is ready or failed); the Story File schema
  gains `threads`.
- android: the Day View's Meanwhile and the Moving on state, built to `DayView.dc.html` and `MovingOn.dc.html`.
- One Sonnet call per Scene end, which the Day View waits for (the Chronicler's runs beside it).
