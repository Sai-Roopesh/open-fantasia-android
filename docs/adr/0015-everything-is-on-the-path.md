# Everything an agent writes is on the Path, and the State is one fold of it

Supersedes docs/adr/0007. A Chronicle, the Director's plan, the World's move and a fold of The Story So Far are entries
on the Path like the player's Moves (docs/adr/0003). A Scene's end appends them after `scene_closed`, in order:
`chronicle`, `director_plan` when due, `world_moved`, `story_folded` when due. A chosen Gap appends `world_moved` right
after the Move. The State is the reducer over the Path and nothing else: the facts (Moments from the page and
happenings off it, each with who knows it), Lives, Threads, Bonds, what he knows of people, the calendar, the plan,
The Story So Far, the curve, the brief and the reactions.

ADR 0007 hung records off the Path so the head stayed the player's while agents wrote in the background. That gave
every part of the Story two homes: the Path for what was played, records beside it for what was learned. Each reader
had to look up the records on the Path; each edit, Rewind or new Path had to agree with them; and an agent asked for
the Story got whichever pieces its reader remembered to fetch. The Director planned from a one-line summary because
nothing else reached it.

Now nothing runs in the background (docs/adr/0016): a Scene's end is steps in turn, and the player waits for them. So
an agent's entry can move the head, and there is one truth.

## Consequences

- Rewind, Try another way, Redo and edits re-derive every fact with no clean-up: an entry off the Path is out of the
  State.
- Agents read the State through lenses (`host/src/context/lens.ts`): omniscient for the Director and the Weaver, the
  author's for the Writer, each character's own for the Actor, and the player's for the phone.
- Stories made before contract 21 are not read; they are made again from their Story File.
