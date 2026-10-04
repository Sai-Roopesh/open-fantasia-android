# Design

## Context

After the first change, a turn is: write the Move, ask the Actor, stream the Reply, write it. The Scene has a title
card from its opening entry and nothing else: no purpose, no beats, no end, and a clock that never moves. Stories are
trees of entries (docs/adr/0003); the engine is the only writer (docs/adr/0004); models are reached through the
Claude pool (docs/adr/0005). A Writer prompt drafted in the first Open Fantasia's repository
(`tools/continuity-worker/agents/WRITER.md`) is the starting point for this one, adapted to what was decided since.

## Goals / Non-Goals

**Goals:**
- The Writer as a step of every turn, with its answer checked by code and recorded as an entry.
- Scenes that begin, turn and end, in the three ways the specs give, with the clock moving.
- Focus, Linger, End scene and Redo with a Direction, end to end.
- A Day View that holds the place between Scenes and takes the next Move, ready for the Weaver to fill.

**Non-Goals:**
- Redo on Codex or Antigravity models; Meanwhile, Happenings and the Gap; Moments; the Director; Paths.
- Showing the Writer's plan anywhere the player plays: it belongs to Backstage, which comes later.

## Decisions

### The turn: Move, Writer, Actor

```
Move ─► Writer ─► [Scene opened] + Beat Note ─► Actor (streams) ─► Reply ─► [Scene closed]
```

The Move is written first, so nothing the player wrote is lost if the Writer fails (host). The Writer then reads the
Scene with the Move in it and answers once. Its answer is checked (below), repaired once with the problems named,
and written as a `beat_note` entry, after a `scene_opened` entry when the answer opens a Scene. The Path's head moves
as each entry is written, so every entry the phone has been sent is on the Path. A Writer that fails twice leaves the
Move as the head, and Retry runs the Writer again; an Actor that fails leaves the Beat Note as the head, and Retry
runs only the Actor, with the note already written.

*Alternative:* the Writer after each Reply, while the player types (ADR-0034's first idea). Rejected in docs/adr/0004:
a note written before the Move cannot answer it, and only the Writer can tell that a Move has left the Scene.

### What the Writer answers

One structured answer per turn, through the Agent SDK's JSON-schema output:

| Field | Meaning |
|---|---|
| `leaves_scene` | the Move went somewhere else or skipped ahead, so this Scene is over |
| `frame` | the Scene's title, place, purpose (a value that turns) and exit; required when a Scene opens, or when the open Scene has no plan yet (a Story File's opening), whose title and place are kept |
| `here` | who is in the Scene for the next Reply besides the Player Character, by their names in the Story |
| `beats` | three to five, each `done`, `in_play`, `pending` or `skipped`; exactly one in play unless all are done or skipped |
| `note` | the Beat Note: what happens next or what someone else does, at most 40 words |
| `call` | `continue`, `land` (bring it to its turn) or `end` (this Reply closes it) |
| `intensity` | 1 routine, 2 something at stake, 3 a value turning, 4 a confrontation or revelation, 5 a change that cannot be undone |
| `arc_moved` | whether an Arc moved, or the Premise happened, in the exchange just played |
| `clock` | the Story time the next Reply begins, never earlier than now; a new Scene begins then |
| `taste` | on a Redo with a Direction: a lasting lesson to keep, when the player asked to remember it or it recurs; otherwise null |

The host checks: the answer against its schema; the note's length; the beats' count and states; that a frame is there
when one is needed; that `here` names people in the Story and never the Player Character; that while Focus is on,
nobody joins `here` unless the Move names them; that while Linger is on, the call is `continue`; that a stalled Scene
moves (below); that `clock` is a time and not earlier than the clock; that `taste` comes only from a Direction, and
always when the player asked to remember it; and that nothing in the frame, the beats or the note decides for the
Player Character, with the deciding-verbs check carried over from the first Open Fantasia's host (`decidesForPlayer`)
and ported to TypeScript (host). A refused answer's call is kept with why it was refused.

### What code counts, not the Writer

Two counts are read from the Path, the way the clock is, so a Redo or a Rewind counts right with no state of its own:

- **beat in play for**: how many Beat Notes in a row in this Scene have had the same beat in play. At four, the
  Writer's task says that beat happens now.
- **exchanges without an Arc moving**: how many Beat Notes in a row in this Scene have `arc_moved` false. At three,
  the task says to move to the next beat or close the Scene.

Both are left out of the task while Linger is on (openspec scenes: Linger holds the moment). The stall is also
checked: at three, an answer that judges no Arc moved must put a later beat in play, finish the beats, or call `land`
or `end`, or it is repaired. The beat cap is said to the Writer and left to it, since only the next Reply can show
whether the beat happened.

### Scenes in the tree

- A Scene opens with a `scene_opened` entry carrying its frame. When a Move opened it (from the Day View, or by
  leaving the last Scene), the entry names that Move as where the Scene starts, and the Scene's entries are read from
  there: the Move belongs to the Scene it opened.
- A Scene closes with a `scene_closed` entry, saying how: the Story closed it (`call: end`, written after that Reply)
  or the player did (End scene). A Scene left by a Move needs no closing entry; the next opening ends it.
- Focus and Linger are entries (`focus_set`, `linger_set`) on the Path, so they follow Rewind and branches. The
  reducer clears both when a Scene closes or another opens, and a Scene that opens with exactly one other person
  starts focused on them.
- Taste lines come from the Beat Notes that carry one, at most ten on a Path; an eleventh drops the oldest.
- A Redo is an entry too (`redo`), written under the Move whose Reply is redone (below).

### Redo

Redo writes a `redo` entry under the Move whose Reply is redone, holding the Direction and whether to remember it,
and moves the head to it at once: the old Reply, its Beat Note and any Scene it opened or closed stay in the tree, on
no Path. The turn then runs from there as any turn does, and Retry after a failure finds the Direction on the Path. A
Direction goes into the Writer's task only, never into the Actor's prompt or the Story. With "remember this", the
Writer is asked for the lasting lesson, which its Beat Note carries as a Taste line; it also sees the Directions given
earlier on the Path, and offers a lesson when one recurs. Redo applies to the latest Reply that answers a Move, while
it is the head or the Story closed the Scene with it.

### The link

Contract 2 (protocol). The Scene view gains Focus, Linger, the Day View once the Scene has closed, and
`last_event_id`, the stream position it reflects, including the words of a Reply under way, so a phone that reads the
Scene again mid-Reply resumes without repeating a word. Its `seq` is the newest entry in the Story, so a view read
after a Redo is never older than what the phone holds. Every change to the Story is an entry with its own event:
`scene_closed`, `focus_set`, `linger_set` and `redo` join `scene_opened`, `move` and `reply`; the Beat Note has no
event, since it belongs to Backstage. A Reply's events are numbered after the entry it follows. After `scene_opened`,
`scene_closed` and `redo` the phone reads the Scene again. End scene, Focus, Linger and Redo are commands like Move,
each refused with a reason while a Reply is being written or a Move waits for one.

### The Actor's prompt

The system prompt still changes only when the Scene does (docs/adr/0005); it already carries the Scene's title
and place. Per turn, after the Move, it adds: the time, the Beat
Note, what the call means for this Reply (`land`: bring the Scene toward its turn; `end`: close it on this beat,
with someone else's closing moment), Focus (stay close beside that person; nobody new comes in unless the Move
brings them), Linger (force nothing; let the moment breathe) and Taste, which everything that writes for the Story
reads (openspec long-run). The beats, the purpose and the frame's exit are never sent to the Actor.

### The Day View, first form

When the current Scene has closed, the Scene view says so and carries a Day View: the day and time as people say
it, where the Player Character is, and countdowns to the next Landmarks. Its composer takes a Move, which opens the
next Scene through the Writer's frame. The Weaver later adds Meanwhile, the Happenings and the Gap to the same view
(protocol, android).

### Models for each job

`~/Library/Application Support/Open Fantasia/models.json` holds the model for each job other than the Actor, which
is each Story's own. `fantasia models` shows and sets them. The Writer defaults to Claude Sonnet 5.5.

## Risks / Trade-offs

- [The Writer adds a model call in front of every Reply] → Sonnet on a warm process, and a short answer; measured
  on the phone in task 8.
- [The Writer misjudges a beat or an Arc] → the counts are code, so a wrong judgement costs at most a few exchanges;
  the real-model tests check the judgements that matter most.
- [Structured output is checked and re-asked by the SDK, not constrained] → the host checks every answer itself and
  repairs once.
- [A Move that both answers the Scene and leaves it, such as a goodbye on the way out] → the Writer frames the next
  Scene, and the Reply plays the new place; the goodbye is in the Move, which the new Scene starts with.
