# Proposal

## Why

The first change plays a Scene that never ends, never moves time, and has no one deciding what it is for: the Actor
writes each Reply alone, so it plans, remembers and voices at once, and the player has to push everything along.
The **Writer** is the Scene's author (docs/adr/0004): it reads every Move before the Actor replies, frames each Scene,
says what happens next, and brings the Scene to its close. With it come the player's controls over a Scene: **Focus**,
**Linger**, End scene, and **Redo** with a **Direction**.

## What Changes

- The **Writer** runs after every Move and before the Actor, on a fast model (Sonnet by default). It frames each
  Scene (title, place, time, who, the value that turns, three to five beats, what ending looks like), judges each
  beat narrowly, writes the Beat Note the Actor reads, calls the Scene on (continue, land, end), rates its intensity,
  judges whether an Arc moved, and moves the clock. When a Move leaves the Scene or skips ahead, the Writer frames
  the next one, and the Story follows straight into it.
- The engine counts what the Writer must not be trusted to count: how long the beat in play has been in play (four
  exchanges, then it is made to happen) and how many exchanges have passed with no Arc moving (three, then the Scene
  moves on or closes), both suspended while Linger is on.
- A Scene ends in the three ways the specs give. A Scene the Story closes, or the player ends, opens the **Day
  View**, which in this change says where and when the Player Character is, counts down to Landmarks, and takes the
  next Move; Meanwhile and Happenings arrive with the Weaver.
- **Focus** and **Linger**, set from the Scene screen, reach both the Writer and the Actor.
- **Redo** writes the latest Reply again, optionally with a Direction. A Direction reaches the Writer only, never the
  Story; one the player asks to remember, or that recurs, becomes a line of **Taste**.
- Each job's model is set on the Mac (`fantasia models`) until the Models screen arrives.
- Two rough edges from the first change: the latest Reply hidden under the keyboard, and the Story list asked for
  twice on opening.

Not in this change: Redo on another provider's model (it needs the Codex and Antigravity runners, which arrive with
the Models screen), editing, Rewind and Try another way, Meanwhile, Happenings and the Gap, and the Chronicler.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None: this change builds requirements of `scenes`, `day-view` and `long-run` as they are specified. tasks.md lists
which. `.openspec.yaml` sets `skip_specs`.

## Impact

- host: the Writer agent and its prompt; new entry kinds; the engine's turn gains the Writer's step; new commands on
  the link (end scene, Focus, Linger, Redo) and a Day View; `fantasia models`.
- protocol: contract 2. The Scene view gains Focus, Linger and the Day View once the Scene has closed;
  new requests.
- android: End scene, Focus by tapping a Portrait, Linger, Redo with a Direction, the Day View.
