# Spec Delta

## MODIFIED Requirements

### Requirement: Anything can be edited or created in the app

The player SHALL be able to edit, and create new, any part of a running Story from the app: people (who they are, how
they talk, what they are after, Portrait), places, Groups and who is in them, Leads, the Player Character, Arcs,
Landmarks, the Premise, the Style, the reply length, **Taste** and the time. An edit SHALL apply from that moment
onward on the current Path, and SHALL leave earlier moments and other Paths unchanged. Everyone in the Story SHALL be
reachable for editing from the World screen without the World screen itself showing anyone the Player Character does
not know, and editing a person SHALL show them as the Story keeps them, what nobody knows included.

The **Player Character** SHALL be edited as the person they are; who the player plays SHALL never change mid-Story.
The time SHALL only be moved on, never back, and the **World** SHALL catch up over the time passed as it does over a
**Gap**. A **Landmark** whose time the World has already passed on a Path SHALL stay as it was on that Path, and a
Landmark SHALL only be set to a time after where the World stands.

#### Scenario: A Landmark is moved on one Path
- **GIVEN** the betrothal Landmark is set for Year 3 on two Paths
- **WHEN** the player moves it to the end of Year 2 on one of them
- **THEN** that Path brings it about at the end of Year 2
- **AND** the other Path still has it in Year 3

#### Scenario: A new person is created in the app
- **WHEN** the player creates Theodore Nott in the app, with a description and an uploaded Portrait
- **THEN** he is in the Story's people from that moment on the current Path, and can appear in Scenes

#### Scenario: Fixing someone mid-Story
- **GIVEN** Meera's description says she is from Mumbai, and the player meant Pune
- **WHEN** the player changes it in the app during Scene 9
- **THEN** the Scenes from then on on that Path write her as from Pune
- **AND** Scene 8, read back, is as it was

#### Scenario: Moving the clock on
- **GIVEN** the Day View is waiting on Saturday at 7:40 am
- **WHEN** the player moves the clock on to Sunday at 9:00 am
- **THEN** the Day View is waiting on Sunday at 9:00 am, with nothing on before then among its choices
- **AND** once the player has chosen, what happened in the World between Saturday and Sunday is in Backstage

#### Scenario: The clock never goes back
- **GIVEN** the Scene is on Friday at 9:40 pm
- **WHEN** the player tries to set the clock to Friday at 8:00 pm
- **THEN** nothing changes, and the app says the clock only moves on

#### Scenario: A Landmark the World has passed
- **GIVEN** the Halloween feast Landmark happened on this Path in Scene 6
- **WHEN** the player tries to move it to the following week
- **THEN** nothing changes, and the app says it has already happened on this Path

#### Scenario: A place is added mid-Story
- **WHEN** the player adds the Room of Requirement, with a description, during Scene 12
- **THEN** it is among the World screen's places from then on on that Path, and Scenes can be set there
- **AND** another Path has no such place
