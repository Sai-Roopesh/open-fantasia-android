# Spec Delta

## MODIFIED Requirements

### Requirement: Anything can be edited or created in the app

The player SHALL be able to edit, and create new, any part of a running Story from the app: people (who they are, how
they talk, what they are after, Portrait), places, Groups and who is in them, Leads, the Player Character, Arcs,
Landmarks, the Premise, the Style, the reply length, **Taste** and the time. An edit SHALL apply from that moment
onward on the current Path, and SHALL leave earlier moments and other Paths unchanged. Everyone in the Story SHALL be
reachable for editing from the World screen without the World screen itself showing anyone the Player Character does
not know, and editing a person SHALL show them as the Story keeps them, what nobody knows included.

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

### Requirement: Portraits are real images

Every person's **Portrait** SHALL be a real image, curated by Claude when the Story is made or uploaded by the player
from the phone. The app SHALL never draw one. An uploaded Portrait SHALL be a JPEG, PNG or WebP image of at most 10
MB, and SHALL replace the person's Portrait from that moment onward on the current Path.

#### Scenario: Uploading a Portrait
- **WHEN** the player uploads an image from the phone for Daphne Greengrass
- **THEN** it is her Portrait everywhere she appears
