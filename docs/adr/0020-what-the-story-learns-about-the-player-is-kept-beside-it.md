# What the Story learns about the player is kept beside the Story, not on a Path

A Story's **Taste**, the player's brief, their reactions and their steering notes are kept for the Story as a whole, and the player's own
Taste for the player across every Story. They are not entries on a **Path**. This is the one exception to
docs/adr/0015, which puts everything the Story knows on the Path.

Everything on a Path is about what happened in the Story, and a Redo or another Path rightly leaves behind what
happened on the abandoned one. What the Story learns about the player is not about what happened: it is about what
they want. In The Malfoy Problem the lesson "never write her as a first-timer", given with a Redo, was kept in a Beat
Note on the branch the Redo left, so the Path the player kept never had it, and the next Replies made the same mistake
(docs/research/malfoy-memory-audit.md).

## Considered Options

- Keeping Taste on the Path and copying it onto a new Path at a Redo. Rejected: every way of making a Path (Redo, Try
  another way, Rewind, an edit) would need its own copy, and a lesson learned on one Path would still never reach
  another.

## Consequences

- Going back on a Path does not take back what the player taught the Story; they edit or delete a lesson instead.
- The player's own Taste is the first thing every new Story knows about them.
