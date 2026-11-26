# Only the player ends Scenes

A Scene closes only through the explicit End Scene action. Moving elsewhere, passing time, changing activity or
reaching a dramatic payoff continues the current Scene. The Writer updates its place, clock, people and beats.
The engine no longer has a model-triggered route that closes it. Existing entries closed by a Move remain readable.

Remove the three-reply Arc deadline and four-reply beat deadline. They pushed conversations toward a payoff before
the player was ready. Linger remains an optional way to hold a particular beat, rather than a prerequisite for
keeping a Scene open. A `land` call lets a beat have its effect, without instructing the Actor to wrap up the Scene.

Long Scenes are still recorded for memory. End Scene still runs the Chronicler, Director and Weaver and opens the
Day View. This supersedes automatic transitions described in the earlier scenes specifications.

The failure was reproduced with scripted Writer answers requesting a transition, with Linger off, after a time
skip and after recording a long Scene. The tests also verify that explicit End Scene still runs its normal steps.
