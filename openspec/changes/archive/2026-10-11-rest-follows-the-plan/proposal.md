# Proposal

## Why

The player could not go on after Scene 9 of The Malfoy Problem. The Scene peaked, and the Director planned a rest
Stretch. The Weaver's check then held two rules at once:
- after a peak, the pick must be a quiet Happening, marked `quiet`;
- with a Stretch, the pick must be its next Scene that matters.

The spec makes them one rule: after a peak, the pick is one of the rest Stretch's quiet Scenes. The check and the
prompt still put them as two. The Weaver answered one and then the other, both answers were refused twice over, and the
World never moved on. The Day View stayed empty.

## What Changes

- **After a peak with a next Scene that matters,** the pick is that Scene. The Director planned it as the rest, so the
  check marks it quiet itself (ADR 0012) and asks nothing more.
- **After a peak with no next Scene,** the pick is a quiet Happening, as now.
- **The Weaver's prompt** says only the rule that applies.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `long-run`, Rest is deliberate: a scenario for the rest the Director planned.

## Impact

- **Host:** `agents/weaver.ts`, the check and the prompt. Once the Mac restarts, it moves the stuck World on.
