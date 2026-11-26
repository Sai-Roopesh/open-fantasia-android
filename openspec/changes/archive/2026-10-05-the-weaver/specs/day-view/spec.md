# Spec Delta

## ADDED Requirements

### Requirement: The Day View opens when the Player Character is next free to choose

The **Day View** SHALL open at the moment the Player Character is next free to choose where to be: the time the
**Scene** ended, or, when it ended late and he would go to bed, the next morning. Story time SHALL never go back, and
the **World** SHALL have moved on to that moment before the Day View shows it. A player who wants the night writes a
Move inside the Scene that goes there.

#### Scenario: A Scene ends in the afternoon
- **GIVEN** the Scene "Flying lesson" ends at 5:20 pm on Thursday
- **WHEN** the Day View opens
- **THEN** it is Thursday 5:20 pm

#### Scenario: A late Scene ends
- **GIVEN** the Scene "After curfew" ends at 11:05 pm on Friday
- **WHEN** the Day View opens
- **THEN** it is Saturday morning
- **AND** Meanwhile can say what the Player Character learned overnight and on waking, and nothing he could not know
