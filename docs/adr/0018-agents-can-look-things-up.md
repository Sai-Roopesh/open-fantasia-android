# Agents can look things up: in the Story, and on the web

The agents that plan and record (the Director, the Weaver, the Chronicler) and the Writer, before a Reply, can look
things up while they work: search the Story, read a past Scene or a person's history in full, and research on the web
(the source books, a character in canon, the setting, the period). Each step has a limit on lookups and time. The Actor
looks nothing up; it writes from what the Writer gathered, so a Reply streams without pausing.

Until now every agent got one fixed prompt and answered in a single turn with no tools. It could not check anything,
so it filled gaps by inventing: the Director, planning the months before the Philosopher's Stone, brought in strangers
and threats with no setup and no payoff, and could not read what Year Two holds in the books. The player would rather
wait for a better story than read a fast, thin one (docs/goal.md, 7).

## Considered Options

- Code choosing what each agent sees, with no lookups (the design until now). Rejected: code cannot know what a plan or
  a Reply will need, and the agents invent what they are not given.
- Automatic retrieval before every Reply. Rejected as the main way: in the player's earlier app it fired on 96% of
  turns and two A/B tests showed it made no difference (docs/research/hce.md). An agent asking when it knows it needs
  something is different, and is measured before it is kept.

## Consequences

- Agents that use tools run on providers that support them (Claude; Codex for the web); a job set to a model without
  tools runs without them.
- Lookups are part of a step's record: what was searched and read is kept with the call, so a plan can be explained.
- Planning is worked, not answered: when the Director writes an Act in detail (when a Story starts, and when an Act
  ends), it works through many steps, on the order of twenty: reading the Story, researching, drafting, testing the
  draft against everyone's Lives and the setups already planted, and revising. Recording and smaller revisions take
  fewer steps.
