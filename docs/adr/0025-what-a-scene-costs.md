# 0025: What a Scene costs, measured, and what the measurement changed

Date: 17 November 2026. Status: implemented. Follows 0023 and 0024.

## Why

The Story had grown by addition: a rule, an agent or a record for each problem, and nothing taken away. Before
redesigning anything, one Scene of The Malfoy Problem was played and ended on the real models (GPT 5.6 Sol through
the direct transport of 0023; the Actor at high effort, every other job at medium) with every call's time and
tokens kept. Decisions below follow the numbers, including the ones that say to leave something alone.

## What a Scene costs

A Reply is one call (0024): 63 to 108 seconds, 15,000 to 29,000 input tokens, about 4,000 output tokens of which
about 60% is reasoning.

A Scene's end is four calls, one after another:

| Step | First Scene's end | An ordinary Scene's end |
| --- | --- | --- |
| Chronicler | 135 s, 21k in, 7.3k out | 89 s, 19k in, 4.8k out |
| Director: the Outline | 265 s, 100k in, 13.7k out (the Story's first, deep, 4 lookups) | 20 s, 20k in, 1.0k out (focused) |
| Director: the Stretch | 103 s, 38k in, 5.4k out | 85 s, 22k in, 4.6k out (the player went off the plan) |
| Weaver | 20 s, 28k in, 0.9k out | 130 s, 24k in, 7.1k out (a night passed) |
| Total | 8.7 minutes, 187k in, 27k out | 5.4 minutes, 85k in, 17.5k out |

An ordinary Scene's end costs about as much as four or five Replies.

## What was wrong, and is changed

1. **The prompt cache was not being read.** Every Reply re-read its whole prompt: 4,096 of about 16,000 input
   tokens came from the cache, on every Reply. Two causes.
   - The Codex backend reads its cache only for a request that names a session. An identical 11,000-token request
     sent three times was read uncached three times; with a `session-id` header, 10,880 tokens came from the cache
     on the second and third. The direct runner now sends one, the same for every call with the same model and
     system prompt.
   - Who is here, the Scene's purpose and its beats were written above the Scene's words, and the beats change
     with every Reply; a cache is read only up to the first changed byte. They now follow the Scene's words, in
     `<scene_now>`. A test holds each Reply's request to begin with everything the last one had, through the
     Scene's words.

   Afterwards, on the same Story: 12,672 of 18,020, then 12,672 of 20,485, and with an unchanged request 21,248 of
   21,369. The backend still misses now and then (one Reply in three in the first run), which the host cannot
   control.
2. **A call's usage was its last request's.** A call that looks things up makes several requests and each is
   billed. Direct runners now keep the sum, as four numbers that mean the same for every provider.
3. **The old Writer job was still there.** `writeBeat` and WRITER.md, 2,883 words describing a two-model handoff
   that 0022 removed, were reached only by tests. They are deleted, and those tests now exercise the writing call
   that runs. Two prompt helpers nothing called are deleted with them.
4. **Gemini could not take the larger jobs directly.** The gateway refused the Chronicler's and the Weaver's
   schemas ("too many states for serving"), and twice answered "no capacity" for a few seconds. A refused schema
   is now asked for in words, as `agy` always did, and remembered; no capacity is asked again after 2, 6 and 15
   seconds.

## What was measured and left alone

- **The Director after every Scene.** The focused pass is 20 seconds. The cost is in the first Outline, which
  happens once, and in a new Stretch, which is planned when the player leaves the plan. Neither is every Scene.
- **Gemini 3.8 Flash for the Chronicler and the Weaver.** The same Scene's end replayed with both on Flash took
  298 seconds against 324, and the record was worse by the host's own check: 18 quoted items were not on the page
  they cited, and 2 Moments were kept where GPT 5.6 Sol kept 5 with nothing dropped. Not recommended.
- **Writing the Reply outside JSON.** 0024 measured no gain in length.

## For the player to decide

Effort is the player's setting (0008). The same Move, written twice at each effort by GPT 5.6 Sol:

| Effort | Seconds | Reasoning tokens | Words |
| --- | --- | --- | --- |
| high | 96, 112 | 3,908, 4,631 | 699, 753 |
| medium | 53, 60 | 1,258, 1,921 | 709, 866 |
| low | 35, 38 | 319, 319 | 829, 935 |

Medium halves the wait. Whether the writing is as good is the player's to read; the six Replies are in
`docs/research/effort-comparison-2026-11-17.md` for that.

The same ordinary Scene's end, replayed with the Chronicler, the Director and the Weaver at low effort instead of
medium, took 210 seconds against 324 and wrote 11,200 output tokens against 17,500. By the host's own checks the
record was as complete: 5 Moments, 2 Bond turns and 5 lines of what he knows, nothing dropped; a Stretch of 3
Scenes; 9 Lives and 9 things that happened. One Scene is one sample, and the checks cannot tell a duller plan
from a sharper one.

## Consequences

- The cache numbers are GPT 5.6 Sol's on one account on one day. Claude is unmeasured: it was not signed in.
- `<scene_now>` moves where an agent reads who is here. No reading of the Replies written since found a
  difference, and none was measured.
