# One queue per Story: steps in turn, a second model, and stop with Retry

Supersedes the order and the failure policy in docs/adr/0010; its order of agents stands. A Story runs one thing at
a time. A Scene's end is steps in turn, each reading what the steps before it wrote: the **Chronicler**, the
**Director** when a plan is due, the **Weaver**, the **Folder** when The Story So Far is due a fold. A turn is the
Weaver over a chosen Gap, then the Writer, then the Actor. The Day View is ready when the Scene's end is done.

Each step:
1. calls its model with a timeout;
2. sends the answer back once, only when it is unusable (not in the format, or a truth check leaves nothing);
3. then tries the job's second model;
4. then stops, keeping which step failed and why.

Retry, with another model if the player picks one, goes on from the failed step. A Mac that starts goes on with every
Scene end that has not finished.

Background agents raced each other: the Weaver picked the next Scene before the Director planned, a record that
failed was left as a gap the Story went on without, and every agent saw a different moment of the Story. The player
said they would rather wait than have agents work blind.

## Considered Options

- Background records with retries (ADR 0007, 0010). Rejected: the races above.
- Going on without a failed step. Rejected: a World moved on without the plan, or a Director without the record, is
  the blindness this removes.
