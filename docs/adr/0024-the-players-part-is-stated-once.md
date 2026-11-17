# 0024: The player's part is stated once, Replies are not edited by default, and length is a target

Date: 17 November 2026. Status: implemented. Amends 0019 and goal 6.

## Problem and evidence

Characters would not lay a hand on the player's character. The line protecting the player was written five times,
each a little wider: goal 6 ("nothing decides what the Player Character says, does, thinks or feels"), the Actor
("tell nothing from inside him: never what he sees, notices or feels"), the Actor's last line, the Editor ("has him
act on purpose… however small"), and a check in code. The check counted "she forces Ishaan back", "makes Ishaan let
go" and "Ishaan goes pale" as deciding for him, and sent the Reply back to be written again.

Every Reply waited for a second model. By 0022's own sample the Editor found something in 7 of 110 Replies and took
28.6% of all input characters to do it.

Replies were short. The same request on Full, sent directly (0023):

| Length line | GPT 5.6 Sol | Gemini 3.8 Flash |
| --- | --- | --- |
| "up to about six hundred words" (as it was) | 247 | 259 |
| "write about six hundred words" | 621 | 514 |
| the same, with the prose outside JSON | 617 | 452 |

The ceiling was the cause. Writing the prose inside JSON was not, so the combined call keeps its schema.

## Decision

1. **The player's part is stated once**, in `src/agents/deciding.ts`, beside the check that holds a Reply to it:
   only the player writes what the Player Character says, chooses, thinks and feels; everything else can happen to
   him and lands, and the Reply writes where it leaves him. The Actor's instructions and the Editor's definition are
   both rendered from it. The check no longer counts what other people do to him, or his body's reactions, as his.
2. **No model reads a Reply before the player by default.** The check in code still reads every Reply, for nothing,
   and a draft that writes his part is written again once. `fantasia editor on` brings the Editor back for a Mac
   that wants it; its clock, name and knowledge checks are unchanged when it is on.
3. **Length is a target**: about two, four or six hundred words for Short, Medium and Full.

## Consequences

- A wrong date or a name slip now reaches the player when the Editor is off. Redo is the remedy, as it is for
  everything else the player does not like.
- A Reply rewritten after the check in code is written by the Actor's own call, not the combined one, as it was when
  the Editor sent one back.
- The scenarios written for an edited Reply turn the Editor on in their harness; the default path has its own tests.
