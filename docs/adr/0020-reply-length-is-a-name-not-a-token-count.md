---
status: accepted
---

# Reply Length is a name, not a token count

CONTEXT.md has always defined Reply Length as "an intention about visible story text only", with
_Avoid: Max tokens, token budget, output cap_. The column was `max_output_tokens: Int`.

One integer therefore meant two incompatible things: how much prose a person wants to read, and where a
provider severs the stream. `ReplyBudget` is the evidence — a module whose whole purpose is to pull those
apart again at the last moment, after the schema pushed them together at the first.

The authored value is now a name: `Terse`, `Measured`, `Full`, `Expansive`, `Unbounded`. The transport
ceiling is derived from it by whichever adapter needs one, and is never stored, never authored, and never
part of a Roleplay Context. ADR-0006 already said the ceiling is an adapter capability rather than story
context; the schema simply did not agree.

## Why words, and why last

The directive is stated in words. Paragraphs are elastic and a model sizes them to taste: measured across
738 committed replies, "roughly 3-4 paragraphs" produced 2,536 characters of Claude Sonnet prose, about
430 words, because its paragraphs run 600 to 800 characters. A word count is a unit the request and the
reply agree on.

It is also the last thing read before generation. It used to sit before the player's prose inside a block
of controls, in a request of 96,500 tokens, and then withdraw its own authority in its second clause —
"a target for pacing, not a hard cap" — while `<response_contract>` separately asked the model to finish
"rather than cutting the scene short". Two instructions arguing, both losing. The disclaimer is gone, the
completion rule now says the target is where a reply ends rather than a limit to write past, and the
block moved after the prose. That costs nothing: the current user message is never cached.

`<show_not_tell>` gained one line, because it was teaching the opposite of what the target asked. All
four of its worked examples are long, and demonstration outweighs instruction, so it now says outright
that length is not part of the lesson and a shorter reply using the same technique is a correct one.

## Calibration

Models do not answer a length request identically, and the gap is large enough to matter: doubling the
old budget moved Gemini from 1,463 to 2,273 characters and Claude Sonnet from 1,971 to only 2,536. A
single number stated to every model is a number wrong for most of them, so `ReplyLengthCalibration` holds
a per-model factor between the authored intention and the sentence a model reads.

Every factor is 1.0 today, deliberately. Those measurements were taken under a directive phrased in
paragraphs and cannot be carried across to one phrased in words without measuring again. Fitting a factor
from data gathered under a different instruction would be a guess wearing the costume of a measurement.
The seam exists, the method is recorded, and the numbers wait for evidence.

## Consequences

- `max_output_tokens` is gone from `chat_threads`, migrated to `reply_length` by reading each stored
  budget as the intention it stood in for.
- The settings slider shows names and word targets. There is no token budget on screen because there is
  no token budget stored.
- `ReplyBudget` keeps only the job it should always have had: reasoning headroom for providers whose
  completion budget includes hidden thought.
