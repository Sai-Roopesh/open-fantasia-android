# Spec Delta

## ADDED Requirements

### Requirement: The Director can bring someone new into the Story

The **Director** SHALL be able to bring a new person into the Story when it plans a **Stretch**, with their name and
who they are. From that plan onward on that **Path**, they SHALL be among the Story's people: named, played,
remembered, and shown on the World screen once he has met them. A person already in the Story SHALL not be brought in
again.

#### Scenario: A new person stays
- **GIVEN** the Director brings in Elspeth Vane, a seventh-year who runs the Hogsmeade duelling club
- **WHEN** the player meets her, and she comes up again three Stretches later
- **THEN** she is the same person, with what passed between them remembered

#### Scenario: Not on another Path
- **GIVEN** Elspeth Vane was brought in by the plan after Scene 12
- **WHEN** the player goes back to Scene 10 and plays another way
- **THEN** she is not among the Story's people on that Path, until a plan there brings her in

## MODIFIED Requirements

### Requirement: Opening a Story returns exactly where the player left

One tap on a **Story** SHALL return to exactly where the player left it, mid-**Scene** or at the **Day View**. When
the player has been away more than a day, a dismissible "Previously" card SHALL say where the Story stands, from what
the Story already keeps: when they left mid-Scene, The Story So Far's newest paragraph and the Scene they are in, where
and with whom; when they left at the Day View, the Scene that closed; and how long ago they last played. A Scene's end
that finishes later is not play. Opening the Story SHALL never wait for the card to be written. Once
dismissed, the card SHALL stay gone until the player has been away more than a day again.

#### Scenario: Back after a night away
- **GIVEN** the player stopped mid-Scene with Hermione and returns 30 hours later
- **WHEN** they open the Story
- **THEN** they are in that Scene at its latest Reply, with a "Previously" card above it

#### Scenario: Back the same evening
- **GIVEN** the player stopped mid-Scene with Hermione and returns three hours later
- **WHEN** they open the Story
- **THEN** they are in that Scene at its latest Reply, with no "Previously" card

#### Scenario: Back to a Day View
- **GIVEN** the player ended "After curfew", stopped at the Day View, and returns two days later
- **WHEN** they open the Story
- **THEN** the Day View has a "Previously" card saying what happened in "After curfew"

#### Scenario: Dismissing the card
- **GIVEN** the "Previously" card is above the latest Reply
- **WHEN** the player dismisses it, leaves, and opens the Story again without playing
- **THEN** the card does not come back
