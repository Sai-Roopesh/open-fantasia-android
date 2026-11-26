# Design

## Context

- **The blank Gap's Move.** `engine/choosing.ts` writes the player's Move for a choice later than now. A Gap left blank
  becomes "I spend the time until then quietly in {the Scene's place}."
- **The phone's caption.** `GapSheet` says the same in its own words, from the Day View's place.
- **A planned Scene** has `for`: the turn it is built around, said author to author, for the Writer.
- **Backstage's Stretch.** `views/backstage.ts` shows `for` as each Scene's `purpose`.

## Goals / Non-Goals

**Goals:**
- A blank Gap never puts him somewhere for days.
- Backstage reads as drawn: one line per Scene that matters.

**Non-Goals:**
- **Where he lives.** No Story File change. A home for the Player Character was the other option, and the player
  chose against it.
- **Changing what the Writer reads.** The Writer still reads `for`.

## Decisions

**1. The day decides (host and android).** A Gap that ends on the same Story day as the Day View is spent where he
was. One that ends on a later day is spent going about his days, with no place:
- **The Move:** "I go about my days quietly until then."
- **The caption:** "Left blank, Roopesh goes about his days quietly."

Both sides compare Story days. The host compares the parsed days; the phone compares `storyMinute / 1440`, which it
already uses to pick out what is in the Gap.

*Rejected:* a length in hours. An evening to the next morning crosses a night, and that is what makes "where he was"
wrong.

**2. A headline for each Scene that matters (host).** The schema's Scene gains `headline`: one line of ten words or
fewer, in the author's shorthand, "Charms: Flitwick pairs him with Draconia". DIRECTOR.md asks for it on every Scene.
Backstage's `purpose` is the headline. No contract change.

Only Backstage reads the headline, so it is never worth a second call. A missing headline, or one past fifteen words,
is not kept, and Backstage falls back to `for`. That is set right, not asked again (ADR 0012). For the same reason it is
optional in the schema, so a plan without one is not refused.

## Risks / Trade-offs

- **[A Gap past midnight, inside one Scene's evening.]** "Goes about his days" for a skip from 11 pm to 1 am reads a
  little large. Skips land on waking or on a Happening, so this is rare.
- **[Plans stored before.]** They have no headline. Backstage shows `for`, as now, until the next plan.

## Migration Plan

None.
