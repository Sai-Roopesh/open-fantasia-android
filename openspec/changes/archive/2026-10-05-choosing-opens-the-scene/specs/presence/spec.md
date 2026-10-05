# Spec Delta

## MODIFIED Requirements

### Requirement: Between Scenes is quiet, and shows progress

Between Scenes, one line SHALL say what is under way, and the **Day View** SHALL fill in as each part is ready. A
**Move** at the **Day View**, a choice or the player's own, SHALL open the next **Scene** at once: the **Move** shows
straight away, the **Gap** first, under a card that says when the **Scene** is, when the choice set a time, and one
line saying the **Scene** is being written. The card SHALL take the **Scene**'s title, place and **Portrait**s when the
**Scene** has opened, and a phone that comes back mid-wait SHALL show the same.

#### Scenario: The World moves on
- **WHEN** the player ends a Scene
- **THEN** a single line says the Scene is being recorded and the World is moving on, until the Day View is ready

#### Scenario: The next Scene is being written
- **GIVEN** the Night Train's Day View at 9:05 am
- **WHEN** the player chooses Skip to later, This evening, and writes "I ride on to Shimla, go to the interview at eleven, and come out not sure of anything."
- **THEN** the Scene opens at once with that Move, under a card that says Friday 6:00 pm and that the Scene is being written
- **AND** the card takes the Scene's title, place and Portraits when the Scene has opened
