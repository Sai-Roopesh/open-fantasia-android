# Spec Delta

## MODIFIED Requirements

### Requirement: The Reply never writes the Player Character

A Reply SHALL never decide what the Player Character says, chooses, does on purpose, thinks or feels, now or in
anything the Story has not shown. The people in the Scene MAY see the Player Character and say how they look to
them, and the narration MAY keep plain physical continuity, such as two people going still together. A Reply SHALL
stop where it is the player's turn.

#### Scenario: Hermione asks a question
- **GIVEN** the Reply has Hermione ask the Player Character why he kissed her
- **THEN** the Reply ends with her question unanswered, and decides nothing he says, chooses, does on purpose, thinks or feels

#### Scenario: Others may describe him
- **GIVEN** the Player Character has not slept
- **WHEN** Hermione says "you look like you haven't slept"
- **THEN** that is allowed: it is how he looks to her, not a decision for him

### Requirement: Every Scene opens with a title card

A Scene SHALL open with a title card showing its title, its place, the day and time, and the people there with
their Portraits. Earlier Scenes on the Path SHALL fold into one-line summaries that open on a tap.

#### Scenario: The title card
- **GIVEN** the player opens a Story in the Scene "After curfew" in the Common room on Friday at 9:40 pm, with Hermione there
- **THEN** the title card shows "After curfew", "Common room", "Friday · 9:40 pm" and Hermione's Portrait

#### Scenario: Scrolling back
- **GIVEN** the player is in Scene 14
- **THEN** Scenes 1 to 13 appear above it as one-line summaries
- **AND** tapping Scene 13's summary shows that Scene in full
