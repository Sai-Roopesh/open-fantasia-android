# The Director owns the calendar; at a Scene's end, the record, then the plan, then the World

Supersedes the Scene-end order in docs/adr/0004. Everything else in 0004 stands: agents never message each other,
they share only through the State, and each part of the State has one writer.

The Director plans the Story a **Stretch** at a time: about a week of story time, its two to five Scenes that matter
(each with a day, a place, its people and what it is for), a move for each Lead that week, on screen or off, and
where each Arc should stand by each of the next two Landmarks. So the Director owns when things happen, as well as
what the long run builds toward.

At a Scene's end the order is:
- the **Chronicler**, so the newest record of what happened and the Bonds are in the State;
- the **Director**, when a plan is due: none yet, the Stretch's days have passed or its Scenes that matter have been
  played, a Scene peaked, or a Landmark passed;
- the **Weaver**, which reads the Stretch: its pick for the Day View is the next Scene that matters, even when it is
  days away, and over the span it moves the World across, it writes the Leads' off-screen moves.

The Day View waits for the Weaver, as before, and so waits longer once a week of story, when a plan is due. A
Director that fails leaves the last plan in force, and the Weaver goes ahead with it.

The Malfoy Problem showed the cost of the old order (docs/reviews/2026-10-09). The Weaver picked the next Scene
before the Director had planned, from a horizon of one morning, so breakfast was always the pick. The Director's plan
reached only the Writer, measured in Scenes, never in days. Nothing owned story time, so a Story spanning four years
moved a few hours per Scene.

## Considered Options

- Keeping the Weaver's pick and handing it the plan. Not enough: the plan said nothing about when or where.
- A separate agent for the calendar. Rejected: two agents would own the long run, against 0004's one writer for each
  part of the State.
- Jumping time automatically. Rejected by the player: the Story proposes the jump, and the player chooses.
