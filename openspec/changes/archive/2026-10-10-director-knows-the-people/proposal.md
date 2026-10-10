# Proposal

## Why

The Director is not told who is in the Story. On the phone checks it planned Scenes with "Madam Pince", who is not one
of The Malfoy Problem's people. Before `play-check-fixes`, it also wrote "Madam Hooch" and "Professor McGonagall".
Each time, the name was left out and the Director was asked again, costing 30 to 70 seconds at a Scene's end. The
Writer is given the Story's people and places, and is told to leave walk-ons unnamed. The Director is given neither.

## What Changes

- **The Director's system prompt carries the Story's people and places**, in the Writer's form. They are the same on
  every call, so the prompt cache still hits.
- **DIRECTOR.md** says to name only the Story's people in a Scene, and to leave anyone else there unnamed.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `long-run`, The Director shapes the long run around Arcs and Landmarks: the Director knows the Story's people and
  places, and names only its people.

## Impact

- **Host:** `agents/director.ts` `storyPrompt`, and `agents/DIRECTOR.md`. Nothing stored changes, and the phone is
  unchanged.
