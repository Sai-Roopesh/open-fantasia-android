# Design

## Context

`agents/weaver.ts` checks the pick twice. Against the Stretch: the pick is the next Scene that matters. After a peak:
the pick has `quiet` true. The prompt states both.

## Decisions

**1. One rule (host).** After a peak, when there is a next Scene that matters, the Stretch rule decides the pick, and
the check sets `quiet` true on it. After a peak with no next Scene, the quiet rule stands as it is. The prompt's peak
line is said only when there is no next Scene. That is set right, not asked again (ADR 0012).

*Rejected:* demanding both of the model. It is what failed, and the Director already made the Scene a rest.

## Risks / Trade-offs

- **[The Director plans a rest Scene with something at stake.]** DIRECTOR.md already says a rest Stretch's Scenes are
  quiet. The Weaver offers the Scene the Director planned either way.
