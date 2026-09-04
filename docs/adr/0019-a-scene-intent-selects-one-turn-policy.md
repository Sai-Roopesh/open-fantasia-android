---
status: accepted
---

# A Scene Intent selects one turn policy

The prompt carried a single turn policy and fired it on every reply, whatever was happening. It required
a new element each time and offered "an event that intrudes on the scene" as a way to supply one. The
response contract separately required a fresh plot beat in every reply. The variation rules forbade
re-playing an emotional beat that had already landed. Ten open objectives arrived as authoritative
state, and the standing order to advance one made them read as ten obligations.

Held together, a quiet scene was not discouraged; it was unreachable. There was no legal move meaning
"stay here and go deeper", so the model did the only thing available and rang a phone. Switch the phone
off and another phone rings, because the instruction that produced the first one is still there.

A Scene Intent — `Dwell`, `Develop`, `Escalate`, `Close` — selects exactly one policy, and the policies
are mutually exclusive by construction. That is the point of an enum rather than another line of
guidance. A note asking for calm, appended beneath a standing order to escalate, is one more instruction
competing in a prompt that already contradicts itself. This one does not compete. It replaces.

The intent is chosen per reply and carried until changed, held on the branch beside the Active Speaker,
because both are decisions about the same scene. Existing branches start at `Develop`: the closest
honest reading of a thread written under the old policy is that it kept moving, but the licence to
interrupt is now something a person asks for rather than something every reply carries.

## What moved, and why it had to

`<drive_this_turn>` becomes `<this_turn>` and renders one of four directives.

The variation rules split. Almost all of them are about not repeating yourself and hold under any
intent, so they stay in the cacheable prefix. One does not. Forbidding a landed feeling from being
re-staged is sound advice against padding and precisely wrong during an intimate scene, where staying
with a feeling *is* the content rather than a repetition of it. Under `Dwell` that rule is replaced by
one about deepening, so the intent-dependent rules render with the turn policy in `<variation_rules>`
and the rest stay where they were.

Open threads gain a framing line rather than a filter. Under `Dwell` and `Close` they are context and
must not be advanced; under `Develop` at most one may surface; under `Escalate` one may be advanced and
none must be. Nothing is hidden from the model — a thread it cannot see is a thread it can contradict —
so what changes is whether the list reads as available material or as work owed.

## Consequences

- Four exclusive policies exist where one unconditional one did, and tests assert that exactly one
  renders and that only `Escalate` carries a licence to interrupt.
- A person can ask for a quiet beat without arguing with the prompt, which is the whole of the fix.
- The Scene itself is still implicit. Intent is branch-scoped rather than attached to a bounded span of
  exchanges with its own place and present cast, because detecting where one scene ends needs per-reply
  state the architecture does not have yet. Recorded as deferred, not as absent.
