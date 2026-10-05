# Proposal

## Why

Nobody in a Story remembers anything yet. The Actor reads the Scene in front of it and nothing before it, so a
Reply either forgets what happened between people or invents a past for them, the Player Character's included: the
first change measured Hermione "remembering" things Roopesh never said, and "Hermione asks a question" was left
waiting for this change as a result. The **Chronicler** is the agent that records what happened (docs/adr/0004), as
**Moments** in their original words, one record for everyone (docs/adr/0006). With it, people remember what they
were there for or were told, and nothing else.

## What Changes

- The **Chronicler** runs in the background when a Scene ends, and every twelve exchanges inside a long one. It never
  holds up a turn. It writes each Scene's one-line summary, marks the **Moments** that matter as quotes taken word
  for word from the Moves and Replies, says who was there and how much each mattered, and notes when someone tells
  someone else about an earlier Moment.
- Code checks every Moment against the entries it quotes: a quote that is not word for word in its entry is refused,
  and so is a Reply's line that decides something for the **Player Character**, because only the player's Moves make
  facts about him (docs/adr/0004).
- The Actor's prompt gains what ADR-0006 lists: the end of the last Scene when a new one begins, the summaries of the
  last day's Scenes, and at most five Moments that matter most to the people present, each only if someone present
  was there or was told. The Writer reads the same, so its beats can draw on the past.
- Earlier Scenes on the Scene screen show their summaries, and a tap opens one in full (scenes: Scrolling back).
- `fantasia moments` lists a Story's Moments with who knows each, until Backstage arrives.
- "Hermione asks a question" becomes a real-model gate, run against Moments the real Chronicler recorded.

Not in this change: chapter summaries for everything older than a day (they come with the Director), meaning-based
search (ADR-0006 adds it only if the ranking is shown to miss what matters), Backstage, the Journal screen, and the
Weaver's Meanwhile.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `living-world`: adds the requirement that only the player's Moves make facts about the Player Character, which
  ADR-0004 decided and no spec yet says.

## Impact

- host: the Chronicler agent and its prompt; a store of Moments, Scene summaries and who was told, kept beside the
  entries they quote (a new ADR); the engine's background jobs; recall in the Actor's and the Writer's prompts;
  `fantasia moments`; the Chronicler's model in `models.json`.
- protocol: contract 3. Earlier Scenes carry their summaries, and a new request reads one earlier Scene in full.
- android: an earlier Scene's summary opens that Scene in full.
