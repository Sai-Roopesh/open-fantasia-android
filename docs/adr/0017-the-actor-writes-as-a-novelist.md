# The Actor writes as a novelist: it knows what the people present know and believe, and is told their limits

The Actor is shown everything about the people in the Scene, their secrets and history included, with what each of
them knows, believes and does not know stated plainly. A check after each Reply catches a person saying or acting on
what they could not know. This replaces giving the Actor only what the people present know.

Hiding what a person does not know from the model that writes them kept secrets, and made characters forget. In The
Malfoy Problem, after 19 Scenes, the latest Reply was written with 7 of 48 continuity items intact
(docs/research/malfoy-memory-audit.md): Draconia was still told only her parents and Dumbledore knew Roopesh's power,
Hermione's history with him never reached her, and she was written as a first-timer. A novelist knows everything and
writes people who know less. A model given a person's belief in plain words ("Draconia believes only her parents know;
Hermione knows too") plays it far more faithfully than one left to infer it (docs/research/memory.md, SimpleToM).

The player's earlier Hybrid Continuity Engine also gave one model everything, but as a 96,500-token dump of state per
Reply, and guarded secrets by an instruction alone (docs/research/hce.md). This decision keeps the one model and drops
both: the Actor gets a bounded slice for the Scene, in prose, and leaks are checked, not only forbidden.

## Considered Options

- Blinding the Actor to what the people present do not know (the design until now). Rejected: it causes the forgetting.
- A separate agent per character, composed into one Reply. Rejected: several model calls per Reply, and no single
  prose voice.

## Consequences

- The character lens becomes a statement of limits, not a filter. Who knows what, and what each believes, must be
  kept as plainly as the facts themselves.
- Every Reply is checked for a leak; a leaking Reply is set right or written again.
