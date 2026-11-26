# Model choices are the Mac's settings, not entries in the Story

Which model does each job, the Actor of each Story included, is kept in `models.json` in the Mac's folder and read
on every call. It is not written to the Story's tree. A Story's Actor starts as the one its Story File names and
changes only when the player sets it.

The Story's tree records what happened in the Story (docs/adr/0003), and Paths and Rewind move along it. A model
choice written there would be undone by Rewinding past it, and two Paths of one Story could be written by different
Actors without the player choosing it. A model is about the player's subscriptions and limits, which belong to the
Mac and change for reasons outside the Story.

## Consequences

- What wrote each Reply is still on the tree, with the Reply (`model`), so a trace answers "which model wrote this".
- A Redo on another model is recorded on its `redo` entry, because it is part of how that one Reply came to be.
- Exporting a Story does not carry the player's later choice of Actor; its Story File's Actor does.
