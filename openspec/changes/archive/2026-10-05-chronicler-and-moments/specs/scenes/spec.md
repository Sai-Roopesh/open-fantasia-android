# Spec Delta

## ADDED Requirements

### Requirement: People stay in a Scene until they go

Who is in a Scene SHALL change only when someone comes in or goes: a Reply that brings nobody in and sends nobody
away SHALL have everyone who was there still there, with what they remember. Whoever goes SHALL be out of the Scene
for the Replies after, and Focus on someone who goes SHALL clear.

#### Scenario: Meera stays on the toy train
- **GIVEN** Meera is in the Scene with Focus on her
- **WHEN** the player's Move brings nobody in and sends nobody away
- **THEN** Meera is still in the Scene for the Reply
- **AND** the Reply's Actor is given Meera and what she remembers

#### Scenario: Meera gets off at Barog
- **GIVEN** Meera is in the Scene with Focus on her
- **WHEN** the Move is "At Barog I watch her climb down to the jeep"
- **THEN** Meera is out of the Scene for the Replies after, and Focus is off
