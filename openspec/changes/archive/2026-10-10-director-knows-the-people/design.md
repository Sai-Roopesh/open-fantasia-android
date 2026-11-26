# Design

## Context

- **The Director's system prompt** (`agents/director.ts` `storyPrompt`) has the story, the Player Character and the
  Leads.
- **The Writer's system prompt** also has `<places>`, `<institutions>` and `<people>`: each person's name, aliases,
  who they are and what they are after.
- **The Director's check** leaves out a name that is not in the Story. That costs a second call (ADR 0012).

## Goals / Non-Goals

**Goals:**
- The Director names only the Story's people.

**Non-Goals:**
- **Adding people to a Story when a plan needs them.** The Story File holds who is in the Story.
- **Changing the check.** It stays as it is: a name not in the Story is still left out.

## Decisions

**1. The same people and places as the Writer (host).** `storyPrompt` gains `<places>` and `<people>`. Each person is
given by name, aliases and who they are. What they are after is left out, because the Director plans from Arcs and
Bonds, not from each person's wants. The section is the same on every call, so it stays in the cached system prompt
(docs/adr/0005).

**2. DIRECTOR.md, `who`.** Name only people from `<people>`, by their names there; anyone else in the Scene is left
unnamed ("the librarian"), as the Writer does.

## Risks / Trade-offs

- **[A longer system prompt.]** About fifty people at a line each. It is cached, so it costs once per cache window,
  not once per call.

## Migration Plan

None.
