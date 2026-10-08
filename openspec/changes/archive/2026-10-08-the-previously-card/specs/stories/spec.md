# Spec Delta

## MODIFIED Requirements

### Requirement: Opening a Story returns exactly where the player left

One tap on a **Story** SHALL return to exactly where the player left it, mid-**Scene** or at the **Day View**. When
the player has been away more than a day, a dismissible "Previously" card SHALL say where the Story stands, from what
the Story already keeps: the Scene so far when they left mid-Scene, or the Scene that closed when they left at the Day
View, and how long ago they last played. Opening the Story SHALL never wait for the card to be written. Once
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
