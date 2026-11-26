# Spec Delta

## MODIFIED Requirements

### Requirement: Arcs are built toward, never resolved on a schedule

Every Scene SHALL move at least one **Arc** a little, and no Arc SHALL be brought to an end because time is passing.
The player SHALL be able to add, rewrite or drop Arcs at any time.

#### Scenario: A slow burn stays slow
- **GIVEN** the Arc "Draconia comes round to Roopesh, slowly, against everything she was raised to be"
- **WHEN** twenty Scenes have passed
- **THEN** she has moved from insults toward slips and jealousy, and has not jumped ahead to declaring anything

#### Scenario: An Arc is dropped
- **GIVEN** the Arcs include "Harry and Roopesh become friends"
- **WHEN** the player drops it during Scene 15
- **THEN** the Scenes from then on on that Path no longer build toward it
- **AND** the Arcs at Scene 14, and on other Paths, still include it

### Requirement: Style is the player's own words

The **Style** SHALL be one piece of writing in the player's words, and everything that writes for the Story SHALL
read the same Style. Reply length (Short, Medium, Full) SHALL be set separately.

#### Scenario: Changing the Style mid-Story
- **WHEN** the player adds "keep the humour dry and British" to the Style
- **THEN** the Replies from then on are written that way

#### Scenario: Changing the reply length
- **GIVEN** the reply length is Full
- **WHEN** the player sets it to Short
- **THEN** the Replies from then on are short

### Requirement: Taste is short, readable and the player's

**Taste** SHALL hold at most ten lines of lasting lessons. The player SHALL be able to read, edit and delete every
line. Everything that writes for the Story SHALL read it.

#### Scenario: Deleting a lesson
- **GIVEN** Taste has the line "keep Ron in the background"
- **WHEN** the player deletes it
- **THEN** later Scenes no longer keep Ron in the background on that account

#### Scenario: Rewording a lesson
- **GIVEN** Taste has the line "keep Ron in the background"
- **WHEN** the player rewords it to "keep Ron in the background unless he's needed"
- **THEN** later Scenes read the new words, and the old ones are gone from Taste
