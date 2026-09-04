---
status: accepted
---

# A regeneration is a revision of a reply

Regeneration sent the direction and not the reply it was about. A `<regeneration_direction>` block was
appended to the player's message saying "follow it while preserving the Continuity Snapshot, retained
transcript, Active Speaker, and character constraints", and the rejected prose was nowhere in the
request.

An instruction with no referent is not read as a correction. "Don't let her leave the room" has nothing
to point at, so the model takes it as the brief and builds the whole reply around it — a different scene
in a different place doing something else, technically responsive to the note and useless as a
replacement. That is what overfitting on a steering note is: the model doing the only thing the request
made possible.

The context was never the problem. Regeneration routes through the same path as any send, so it already
carried the Stage, the Scene Intent, the Cast Roster and the Reply Length. What it lacked was the one
thing that makes a correction a correction.

## What a Revision carries

- **The rejected prose**, marked as never having happened, so the direction has an antecedent and nothing
  written afterwards may refer to it.
- **A conservation rule.** Same scene, same place, same people, same moment, same speaker, same length;
  change only what the direction names. This is the load-bearing half. Without it a direction is an
  invitation to rewrite everything, and a reply that could not be recognized as a rewrite of the one it
  replaces has changed too much.

Three cases, said three different ways, because they are three different things:

| | |
|---|---|
| prose + direction | a revision: change this, keep the rest |
| prose, no direction | a different reply to the same turn — never a blind reroll, since the model can now see what not to repeat |
| direction, no prose | a brief for a fresh attempt, when the reply being replaced never finished |

## Where it lives

Out of `RoleplayContextAssembler` and into rendering. That module documents itself as owning lineage,
and lineage is a different problem from prompt content; appending direction to `current_user_message`
also put out-of-character instruction into the player's own voice, where a model can reasonably read it
as something a character said. It now renders after the player's prose, with the other per-turn controls,
plainly not part of the turn.

A Revision does not override the Scene Intent. Dwell still forbids the intrusion the rejected reply
committed, which is frequently why it was rejected in the first place.

## Consequences

- The prompt grows by the length of one reply, and only on a regeneration.
- `RoleplayContextAssembler` no longer takes a direction and is purely about ancestry.
- The Antigravity runner's guard against duplicated model context follows the tag rename.
- The dialog asks "what should change about this reply?" instead of "steer this response", because the
  question a person is answering decides what they type.
