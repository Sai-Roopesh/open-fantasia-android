---
status: accepted
---

# Direction is the player's, and the engine stops inventing it

The Continuity Engine was asked for `open_thread` — objectives, meaning statements about what *should*
happen. That is authorship of intent, and it is the one thing a model reading a transcript is worst at.
A model good at "what is true" and bad at "what matters" marks everything.

Measured on one thread: **36 active threads, every one flagged `status: "active"`, zero dependencies.**
Sampling six, five were not objectives at all but restated plot — "The twins' claim that they never
fought over Roopesh has broken", "Roopesh handed Avni the one piece of leverage she never had". The
engine had nothing meaningful to put in a field labelled *objective*, so it wrote recap there.

The prompt then handed that recap to the Roleplay Model as work to advance. So it spent turns
re-litigating beats that had already finished, which is a plausible source of the circling that a person
using this app has complained about since the beginning.

`active_threads` and `resolved_threads` cost 32,008 characters — roughly 8,000 tokens — of a prompt that
already carried a 9,201-character Story Summary which `PROMPT.md` *requires* to state "what is
unresolved". The thread list was a second, worse copy of a field that already existed.

So both go: the operations, the snapshot fields, the prompt sections, the Inspector panel. Nothing is
lost, because the Story Summary holds it in prose with the causal chain intact, which is the form it
should always have had.

## What replaces it

Nothing, on the engine's side. Direction moves to the person.

A **Story Direction** is a short list of what the player wants to happen next, typed by them, ticked off
when it lands. It completes a shape the architecture already had at every other horizon:

| horizon | who decides |
|---|---|
| this reply | the player — Scene Intent |
| this reply, rewritten | the player — Revision |
| tone throughout | the player — Director Notes |
| where the story goes next | the player — Story Direction |

The model never directs at any level. It writes, and it records what happened.

## Why it is framed as direction rather than material

Engine-authored threads were hedged into "available material" for a precise reason: nobody chose them,
so treating them as obligations let a model invent work and then demand it of itself. A want the player
wrote does not need that hedge. Declining to serve it would just be the app refusing what it was asked.

Three limits keep it from becoming a railroad, which is the failure ADR-0019 exists to prevent:

- The player's prose this turn outranks anything listed. If they went somewhere else, follow them there.
- Scene Intent still decides whether this reply moves the story at all; a want does not survive `Dwell`.
- A want says where the story should get to, never when, and is never named aloud as a goal.

A want can also be ticked off, which is the mechanism the engine's version most conspicuously lacked:
nothing could ever resolve one, which is how thirty-six accumulated.
