# Records written in the background hang off the Path; they never extend it

A Chronicle, and anything else an agent writes while the player plays on, is an entry like any other (docs/adr/0003),
but its parent is the last entry it is about, and no Path ever points at it. A Path sees every such record whose
parent is on the Path. Only the player's commands and the turn they start move a Path's head.

The Chronicler runs in the background after a Scene ends and every twelve exchanges (docs/adr/0004). Written onto
the Path, its entry would move the head while the player types, and their next Move would be refused as written
against a head the Story has moved past; or the engine would have to treat some heads as invisible and accept Moves
behind them. Hanging the record off the entry it covers keeps the head the player's, and keeps what ADR-0003 wanted
from summaries being entries: a new Path inherits every record whose parent it contains, and a Redo or Rewind that
takes an entry off the Path takes the records about it off too, with no clean-up.

## Consequences

- Walking a Path from its head never meets these records; the State the reducer works out does not depend on them.
  Prompts look them up beside the Path: the records whose parent is on it.
- An entry's children are no longer only the ways the Story went on from it. Branches are the children that are not
  background records, and anything listing Paths or branches leaves those records out.
