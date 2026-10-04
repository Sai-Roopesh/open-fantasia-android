# Agents never talk to each other; one engine runs them

A story engine written as ordinary code decides when each agent runs, hands it a view of the State, checks its
structured answer, and writes it to the tree as an entry. Agents never message each other; they share information
only through the State. The engine runs agent work as a dependency graph, everything without a dependency at the
same time:

- each turn: the player's Move, then the **Writer** (which must see the Move: a Move can leave the Scene or skip
  time), then the **Actor**, streaming the Reply;
- each Scene end: the **Chronicler** and the **Weaver** at once, then the **Director** when the chapter turned. Only
  the Day View waits, and only for the Weaver;
- every twelve exchanges inside a long Scene: the Chronicler, in the background, so early Moments are recorded
  while they are fresh.

The exact prompt and answer of every agent call are kept beside the entry they produced, never part of the Story,
so any Reply can be traced to what produced it.

Every part of the State has exactly one kind of writer: the player's Moves and edits can set anything, and they
alone make facts about the **Player Character**, so a Reply's claim about what the Player Character did or said is
prose and is never recorded as true; the
Chronicler records what happened in a Scene; the Weaver owns Lives, Threads, Happenings and Meanwhile; the Writer
owns the Scene's beats; the Director owns its plan. That is why the Chronicler and the Weaver can run at the same
time without contradicting each other. Each agent sees a different view: the Actor only what the people in the
Scene know, plus what is public; the Writer and the Director everything, so they can steer, passing it on only as
what happens next.

Agents that talk to each other make a system slow and unpredictable, and two agents writing the same facts (the
first design had both Continuity and the World turn recording where everyone was) will in time disagree.

## Considered Options

- Running the Writer after each Reply, while the player types, so its note was ready in advance. Rejected: the note
  could not account for the Move it was meant to answer.
- The Chronicler, then the Weaver, in sequence. Rejected once each part of the State had one writer: they read the
  same input and write different parts.
