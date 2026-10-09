# Spec Delta

## MODIFIED Requirements

### Requirement: Off-screen time is resolved only as far as it reaches the player

The Weaver SHALL write what happened off-screen only where it will reach the player or change something they will
meet, and SHALL leave a Life that touches nothing the player will meet unchanged. Over a span of days it SHALL move
the **Leads**, the Threads and the Landmarks, write each Lead's off-screen move for the **Stretch**, and let ordinary
days pass without listing them. A span of under an hour with nothing on in it SHALL move nothing.

#### Scenario: Nothing written that no one will meet
- **GIVEN** the Hufflepuff Quidditch Group's Life touches nothing the Player Character will meet this week
- **WHEN** the week passes off-screen
- **THEN** their Life is unchanged

#### Scenario: Five days, told in a few lines
- **WHEN** five days pass between Scenes
- **THEN** what happened lists what reached him or will, with each Lead's move among it, and no ordinary meal or
  lesson is listed

#### Scenario: Twenty minutes with nothing on
- **GIVEN** a Scene ends at 8:00 am, and the next is chosen for 8:20 am with nothing on before it
- **THEN** the World is not moved for those twenty minutes
