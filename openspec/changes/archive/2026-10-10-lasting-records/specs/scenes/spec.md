# Spec Delta

## MODIFIED Requirements

### Requirement: People stay in a Scene until they go

Who is in a Scene SHALL change only when someone comes in or goes: a Reply that brings nobody in and sends nobody
away SHALL have everyone who was there still there, with what they remember. Whoever goes SHALL be out of the Scene
for the Replies after, and Focus on someone who goes SHALL clear.

Someone the Reply shows coming into the Scene, or already there, SHALL be in the Scene from that Reply on, whether
or not the plan named them. Someone the Reply only mentions SHALL not be.

#### Scenario: Meera stays on the toy train
- **GIVEN** Meera is in the Scene with Focus on her
- **WHEN** the player's Move brings nobody in and sends nobody away
- **THEN** Meera is still in the Scene for the Reply
- **AND** the Reply's Actor is given Meera and what she remembers

#### Scenario: Meera gets off at Barog
- **GIVEN** Meera is in the Scene with Focus on her
- **WHEN** the Move is "At Barog I watch her climb down to the jeep"
- **THEN** Meera is out of the Scene for the Replies after, and Focus is off

#### Scenario: Crabbe and Goyle at her heels
- **GIVEN** Draconia walks back up the lane with only Pansy named in the Scene
- **WHEN** the Reply has Crabbe and Goyle a step behind her the whole way
- **THEN** Crabbe and Goyle are in the Scene from that Reply on, and what happened on the lane is remembered by them
  too

#### Scenario: A name mentioned is not a person present
- **WHEN** Draconia says "Father will hear of this" in a Reply
- **THEN** Lucius Malfoy is not in the Scene
