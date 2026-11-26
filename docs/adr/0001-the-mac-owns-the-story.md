# The Mac owns the Story; the phone is a thin client

Every Story lives on the Mac: its store, the five agents that write it, and the code that decides when each one
runs. The phone shows the Story, sends the player's Moves and edits, and keeps a read-only copy of what the player
has already seen. It holds no Story of its own and builds no prompts.

The first Open Fantasia kept the Story on the phone and sent the Mac jobs to run. That split needed a protocol of
envelopes, polling, acknowledgements, frozen request hashes and branch locks, and the phone's database had to be
copied to the Mac to be read there. With five agents that hand work to each other after every Reply and every
Scene, that protocol would have become most of the system. The Mac already runs every model, and the player only
plays with the Mac nearby, so the phone gains nothing by owning the Story.

## Consequences

- No Move can be made while the Mac is unreachable; what has been seen can still be read.
- The phone talks to the Mac only on a network they share. Nothing is built for playing from elsewhere.
- Story Files, edits by the player and edits by Claude all arrive at the same place.
