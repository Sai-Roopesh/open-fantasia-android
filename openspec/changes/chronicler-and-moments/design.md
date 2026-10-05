# Design

## Context

After the Writer change, a turn is Move, Writer, Actor. The Actor reads the system prompt (style, world, the Player
Character, the people here, the Scene's title card) and the current Scene word for word; it reads nothing from
earlier Scenes, and nothing records what happened in them. Earlier Scenes show on the phone with an empty summary.
ADR-0004 gives the Chronicler its place (each Scene end, and every twelve exchanges, in the background), ADR-0006
says what memory is (one record of Moments in original words, recalled with a cap), and ADR-0003 makes Chronicles
entries. The first change's real-model run showed the Actor inventing Roopesh's past when it had none to draw on, and
inventing nothing in two runs once given two real shared Moments.

## Goals / Non-Goals

**Goals:**
- The Chronicler, recording each Scene's summary, its Moments in the words the Moves and Replies used, who was there,
  and who was later told.
- Recall: the Actor and the Writer read the Moments that matter to the people present, capped, and only what someone
  present could know.
- The rule that only the player's Moves make facts about the Player Character, held by code at the point of
  recording.
- Earlier Scenes' summaries on the phone, each opening its Scene in full.

**Non-Goals:**
- Chapter summaries (the Director), meaning-based search, Backstage, the Journal, Meanwhile and the Weaver.
- Recording what happens in Scenes the Player Character is not in: there are none until the Weaver.

## Decisions

### Chronicles hang off the Path (host, docs/adr/0007)

A Chronicle is an entry of kind `chronicle` whose parent is the last entry it covers. No Path points at it, so the
Chronicler never moves the head the player's next Move is written against. A Path sees every Chronicle whose parent is
on it, so a Redo that takes a Reply off the Path takes the Chronicle about it off too, and a new Path inherits its
ancestors' Chronicles. The reducer never meets them; recall looks them up beside the Path. The alternative, writing
Chronicles onto the Path, would refuse the player's next Move as stale whenever the Chronicler finished while they
typed.

### What the Chronicler records (host)

One structured answer per run, through the Agent SDK's JSON-schema output, on Claude Sonnet 5.5 by default
(`fantasia models chronicler …`):

| Field | Meaning |
|---|---|
| `summary` | when the Scene has ended: one line, at most thirty words, of what happened in it; otherwise null |
| `moments` | up to five Moments, each with `what` (a line saying what it was), one to three `quotes`, `there` and `weight` |
| `quotes` | the Moment in its original words: the entry it is in (by its label in the prompt, `E1` …) and the exact words |
| `there` | who was there besides the Player Character, who is in every Scene the Chronicler sees |
| `weight` | how much it mattered: 1 in passing, 2 noticed, 3 something between people shifted, 4 a turn, 5 never to be forgotten |
| `told` | when someone told someone else about an earlier Moment: which Moment, to whom, in which entry |

The Chronicler reads the Scene's entries since the last Chronicle on the Path, each labelled, the Scene's title card,
the Story's people, and the Moments known to someone in the Scene, each with an id, so it can see one being told.

The host checks every answer and repairs once, the way it checks the Writer's:
- every quote is word for word in the entry it names, once whitespace and curly quotes are made plain; what is stored
  is the entry's own text;
- a quote taken from a Reply that decides something for the Player Character (the deciding-verbs check) is refused:
  a Reply's words about him are not his (living-world: Only the player makes facts about the Player Character); his
  own Move can be quoted freely;
- `what` may say what the Player Character did only when one of the Moment's quotes is from a Move;
- names are people in the Story, never the Player Character, and `there` names people who were in the Scene;
- `told` names a Moment the prompt listed and people who were in the Scene;
- the summary is there exactly when the Scene has ended.

### When it runs (host)

The engine keeps one background queue per Story. After any turn or command, it looks at the current Path and queues
what is due: a Scene that has ended (closed, or left by a Move that opened the next) and is not chronicled to its end
gets a run with its summary; an open Scene with twelve or more exchanges since its last Chronicle gets a run without.
Nothing waits on the queue: a Move is never held up, and a failed run is kept with its call and tried again the next
time it is due. `fantasia serve` queues what is due for every Story when it starts.

### Recall (host)

ADR-0006's prompt, minus what later agents add:
- the current Scene word for word, as now;
- the end of the last Scene (its last Move and Reply) when the current one has just begun from a Move;
- the summaries of the Scenes on the Path in the last day of Story time before this Scene;
- at most five Moments, from Scenes before this one, that someone present was there for or was told of. They are
  ranked by weight, by how many of the people present know them, and by how recent they are (each Scene back counts
  for less), and shown oldest first, each with its Scene and who of the people present knows it.

The Actor reads Moments only as their original words, never the Chronicler's `what`, so nothing the Chronicler
paraphrased can become what someone says happened; the Writer reads both. All of it changes only when the Scene, its
people or the Chronicles do, so it goes in the system prompt and the prompt cache still hits.

### The phone (protocol, android)

Contract 3. Earlier Scenes in the Scene view carry their summaries; `GET /stories/{id}/scenes/{number}` answers with
one earlier Scene on the current Path in full. Tapping an earlier Scene's summary opens it.

### Inspecting it (host)

`fantasia moments <story>` lists the Moments on the current Path: Scene, weight, what, who was there, who was told,
and the quotes.

## Risks / Trade-offs

- [The Chronicler misses a Moment that matters, or weighs one wrongly] → recall degrades gracefully: the Scene word
  for word and the summaries still carry the last day; the real-model gates test the Moments that matter most.
- [Quotes rarely match word for word] → normalising whitespace and quote marks, and one repair naming the quote that
  did not match; measured in the real-model runs.
- [Recall misses what matters, as ADR-0006 warns] → the ranking is code and can be tuned from what `fantasia moments`
  shows; meaning-based search waits until that is shown to fail.
- [The Scene that just ended is chronicled while the next one's first Reply is written] → that Reply has the end of
  the last Scene word for word; its Moments arrive for the Replies after.
