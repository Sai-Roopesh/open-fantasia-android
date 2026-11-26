# Design

## Context

See proposal.md for why. The decisions were taken with the player one by one and are kept in docs/research/design.md
(21 decisions) against docs/goal.md; the evidence is docs/research/memory.md (research), docs/research/hce.md (the
player's earlier Hybrid Continuity Engine) and docs/research/malfoy-memory-audit.md (48 continuity items in the real
Story). Constraints that shape the approach:

- Everything a Story knows is an entry on its Path and the State is one fold of it (docs/adr/0015); one queue per Story
  runs the Scene's end in steps, failing visibly with Retry (docs/adr/0016). Both stay.
- Every agent today gets one prompt and answers once with no tools (`host/src/models/claude.ts`: `tools: []`,
  `maxTurns` 1 to 3). The Claude Agent SDK can run tools, including web search and fetch and in-process custom tools;
  Codex can search the web; Antigravity cannot be assumed to run tools.
- The audit's numbers: about 7.7k tokens of play per Scene, 3.5M tokens for the whole Story at this pace; today the
  Actor's memory is a flat 3.2k tokens and keeps 7 of 48 items.
- No backwards compatibility: The Malfoy Problem is rebuilt from its own text (decision 19), not migrated.

## Goals / Non-Goals

**Goals:**
- Every Reply is written from who each person is now, what they know and believe, what is true, and the Outline,
  with nothing that matters forgotten, and is checked before the player reads it.
- Every Scene's end leaves the truth current and the Outline reconsidered, so the World and the Director always act
  from the big picture.
- Every record can be traced to the words it came from, and the whole truth rebuilt from the text.

**Non-Goals:**
- A separate agent per character (rejected in docs/adr/0017).
- Automatic retrieval before every Reply; agents ask when they need something (docs/adr/0018).
- Sharing a Story's truth between Stories; only the player's own Taste crosses Stories.
- A comparison of Fable 5.1 against Opus 5.5 (the player declined it).

## Decisions

### 1. The truth is a set of records folded from the Path (host)

The Chronicler's record of a Scene and the Weaver's of a span carry six kinds of item: each person now (who they are,
feelings toward each person around them, what they want, what they hide, what they know, what they believe and
whether it is true), between two people (where it stands, turning points, keepsakes), what is true (agreements and
their terms, promises and deadlines, debts, threats, secrets with who knows, statuses), Rules, Names, and what happened
(the Scene's paragraph, Moments, off-page happenings). Every item has an id, the Scene it opened in, the passage it
came from (entry id and quoted words), and, once it stops being true, the Scene that closed it; nothing is deleted. A
record names items it changes or closes by their ids, so the reducer applies changes rather than replacing lists. The
State keeps them as maps by id; the lenses read the open ones and, when asked, the history. This replaces Bonds as the
Story's own record of a relationship; the Bond (Between you, as he has seen it) is derived from it for the World
screen.

*Alternatives:* one JSON snapshot rewritten each Scene, as the earlier engine did. Rejected: it lost history (an
invalidated fact was deleted) and had no sources (docs/research/hce.md).

### 2. The Outline is its own record on the Path (host)

The Director writes `outline_set` entries: the Acts (current in detail, next outlined, the rest sketched), each Close
person's and Mover's intentions for the current Act, the setups with their intended payoffs and state (planted, paid,
dropped), and the turn of the Act each Stretch serves. A Stretch plan (`director_plan`) names the turn and the Lives
each Scene that matters serves. Steering notes are the player's wishes, so they are kept beside the Story with the brief
(docs/adr/0020) and survive a Redo; Backstage shows each until the Director has answered it.

### 3. Lives in tiers by relevance (host)

Relevance is worked out in code after each Scene from play: time on the page with the Player Character, turning points
between them, mentions. The top band and the Leads are Close; the Director names Movers in the Outline and may promote
anyone. Close people get a full "now" from the Chronicler after any Scene they were in or affected by; Movers' "now" is
kept by the Weaver and their intentions by the Director; everyone else keeps a line until touched.

### 4. Agents run in steps with tools (host)

`runAgent` gains a tool loop: the Claude runner passes the job's tools and a turn budget to the Agent SDK; the final
answer is still the job's JSON format, checked as now. Story tools are an in-process tool server over the Path and the
State: search the Story (SQLite full-text search over passages and records, already supported by the store's
library), read a Scene in full, read a person's history, read between two people, read a Rule or a Name. Web tools are
the SDK's search and fetch. Each job has a budget of turns and time: the Writer a few lookups; the Chronicler and
Weaver a handful; the Director's focused revision a few, its deep planning on the order of twenty (docs/adr/0018).
What was searched and read is kept with the call. A job set to a model without tools runs without them. The second
model and fail-stop with Retry are unchanged.

*Alternatives:* code choosing what each agent sees. Rejected: code cannot know what a plan or Reply will need.

### 5. The Scene's end (host)

Chronicler (records the truth, may look up) → Director (focused revision; it says whether the Scene turned the Story,
and if so, or if an Act ended or a steering note waits, a deep re-plan of the current Act runs as its own step) →
Weaver (lives out Lives and the Outline to when he is next free; a month-long Gap is lived as the player's Move asked)
→ Folder (only when an Act ends: one account of the Act, checked by the Editor against its Scenes, sent back if a
turning point or name is missing, and each draft checked again, at most twice). The Scene's end reports each step, and "rethinking" when the deep step runs.

### 6. A Reply: Writer, Actor, Editor (host, protocol, android)

The Writer plans in steps with story lookups and web search, and hands the Actor its plan and the passages it
gathered. The Actor writes the Reply whole (the host may still stream from the model, but the phone is not sent
words). The Editor gets layers 1 and 2 and the Reply, and answers with fixes in place (dates, names, times) or a
rewrite note; a rewrite goes back to the Actor once, and a Reply still breaking is shown with the Editor's note. The
turn reports its step (looking back, writing, checking) to the phone.

### 7. Prompts in four layers (host)

Layer 1 the Story (instructions, Premise, Style, World, Rules) changes only with edits; layer 2 where things stand as
of the last Scene's end (The Story So Far, the current Act, the Lives and between-records of the people present,
what is true that touches them, the calendar, brief and Taste; for the Actor, each person's knowledge and beliefs as
plain statements); layer 3 the Scene; layer 4 the moment. Prose, never JSON; each layer has a size limit, tuned on The
Malfoy Problem. The current time moves from the top of the prompt to layer 4, so layers 1 and 2 are reused from the
provider's cache for every Reply in a Scene.

### 8. The Story So Far folds along Acts (host)

The current Act keeps a paragraph a Scene (oldest weeks fold only past about 10k tokens); a finished Act becomes one
account, 1,000 to 2,000 words, written by a strong model. Keepsakes live in between-records and never fold. A Scene
past about 20k tokens is recorded so far by the Chronicler once (a `scene_recorded` entry), and the prompt carries the
record and the latest exchanges.

### 9. Taste beside the Story (host, protocol, android)

A Story's Taste, brief, reactions and steering notes move to tables beside the Story; the player's own Taste to a table for the
player (docs/adr/0020). The Writer files a lesson to the player's own only when it is about how they read, not one
World.

### 10. Backstage and Models (protocol, android)

Backstage gains the Outline (Acts, turns, setups and their state, where each relationship is heading), Lives by tier,
steering notes with whether they have been answered, the truth with each item's source, and How it's going's new
counts. Models gains the Editor and the new defaults (Director Fable 5.1 high; Editor Sonnet 5.5; the rest Opus 5.5;
second models GPT 6.1 Sol). Screens built to new drawings: Backstage.dc.html (Outline, Lives, notes, truth),
SceneWriting.dc.html (looking back, writing, checking), MovingOn.dc.html (rethinking), Models.dc.html (Editor),
StoryEdit.dc.html (the player's own Taste).

### 11. Story File Rules (protocol, host)

The Story File gains `rules`, a list of lines; import records them as Rules opened at the Story's start. The Malfoy
Problem's file gets its starting Rules (Hogwarts as a university, everyone eighteen or older, his power hidden).

### 12. Rebuilding a Story from its own text (host)

`fantasia rebuild <story>` makes a new Path from the Story's opening that keeps every Move and Reply as played, in
order, and runs the new Scene's end after each Scene (Chronicler, Director, Weaver, and the Folder when an Act ends);
the old Path stays on the Paths screen. A span the player covered with a skip has its World lived out again from the
player's Move. Afterwards it lists mentions in later Scenes of off-page events that no longer happened, and the player
carries on from the new Path's head. The audit's 48 items are then checked against the layer 2 the Writer and Actor
would get for the next Reply (decision 20).

## Risks / Trade-offs

- [A Scene's end takes minutes, a deep re-plan up to about ten] → the step line says what is happening; deep runs only
  when the Scene turned the Story, an Act ends, or the player steers.
- [Replies take longer: lookups, the whole Reply, a check] → the player chose quality over speed (docs/goal.md, 7); the
  Writer's lookups have a budget; layers 1 and 2 are cached.
- [Who a person is now drifts as it is rewritten Scene after Scene] → every item points to its source; a rebuild from
  the text is always possible; the Story File's description is kept as the beginning.
- [The Editor sends back good Replies, or misses a leak] → its notes are kept and counted in How it's going; small
  slips are fixed in place rather than rewritten.
- [Prompts grow back into the earlier engine's 96k tokens] → each layer has a size limit, and the Writer looks up the
  rest rather than receiving it.
- [A model without tools] → its job runs without lookups; the second model is GPT 6.1 Sol, which can search the web.

## Migration Plan

1. Build host records, agents and steps; protocol contract 23; android screens.
2. Back up the store; restart the Mac's host only when the player is between Scenes, and say so first.
3. Rebuild The Malfoy Problem from its own text; check the 48 items; show the player the flagged mentions.
4. Rollback: the store backup, and the old Path, which the rebuild leaves in place.
