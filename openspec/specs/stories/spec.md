# Stories

## Purpose

A **Story** is made with Claude outside the app as a **Story File** (docs/adr/0002) and lived in the app, where
everything in it stays editable. This capability covers taking a Story in, editing it, and finding it again.

## Requirements

### Requirement: A Story File becomes a Story whole

Importing a **Story File** SHALL create a Story with everything the file sets up: its **World** (places,
institutions, history), its people and **Groups**, each person's **Portrait**, the **Leads**, the **Player
Character**, the **Premise**, the **Arcs**, the **Landmarks**, the **Style**, the reply length, the **Actor**'s
model and the opening **Scene**. A file that is incomplete or contradicts itself SHALL be refused whole, with every
problem named, and no part of it created.

#### Scenario: The Harry Potter Story is imported
- **GIVEN** a Story File for "The Malfoy Problem" with 46 people, three Leads and an opening at a party
- **WHEN** it is imported on the Mac
- **THEN** the Story appears on the phone's home screen
- **AND** opening it lands in the opening Scene with its title card

#### Scenario: A file names a Lead who is not in it
- **GIVEN** a Story File whose Leads include "Ginny Weasley" but whose people do not
- **WHEN** it is imported
- **THEN** nothing is created
- **AND** the refusal names Ginny Weasley as a Lead with no person

### Requirement: Claude can edit a Story as the player can

Every edit the app offers SHALL also be possible through commands on the Mac, and SHALL land the same way: from
that moment onward on the **Path** the player is on.

#### Scenario: Claude adds a person mid-Story
- **GIVEN** the player is in Scene 20 of a Story
- **WHEN** Claude adds Luna Lovegood with a Portrait through the Mac's commands
- **THEN** she is among the Story's people on the phone from Scene 20 onward on that Path
- **AND** she is absent from earlier moments and from other Paths

### Requirement: Anything can be edited or created in the app

The player SHALL be able to edit, and create new, any part of a running Story from the app: people (who they are,
how they talk, what they are after, Portrait), places, Groups and who is in them, Leads, the Player Character,
Arcs, Landmarks, the Premise, the Style, the reply length, **Taste** and the time. An edit SHALL apply from that
moment onward on the current Path, and SHALL leave earlier moments and other Paths unchanged.

#### Scenario: A Landmark is moved on one Path
- **GIVEN** the betrothal Landmark is set for Year 3 on two Paths
- **WHEN** the player moves it to the end of Year 2 on one of them
- **THEN** that Path brings it about at the end of Year 2
- **AND** the other Path still has it in Year 3

#### Scenario: A new person is created in the app
- **WHEN** the player creates Theodore Nott in the app, with a description and an uploaded Portrait
- **THEN** he is in the Story's people from that moment on the current Path, and can appear in Scenes

### Requirement: Leads are the player's to choose

Any person SHALL be able to be made a **Lead**, or stop being one, with one toggle at any time, including someone
who arrives during the Story. The Story SHALL never suggest or change Leads on its own.

#### Scenario: A newcomer becomes a Lead
- **GIVEN** a person who first appeared in Scene 30
- **WHEN** the player toggles them to Lead
- **THEN** the Story treats them as a Lead from then on

#### Scenario: The Story never promotes anyone
- **GIVEN** the Player Character has spent five Scenes in a row with Neville, who is not a Lead
- **THEN** Neville is still not a Lead, and nothing suggests making him one

### Requirement: Groups are the player's to arrange

The player SHALL decide who is in which **Group**, and each person SHALL be in at most one. Everyone in the
**Cast** who is not in a Group SHALL be followed one by one. The Story SHALL never move anyone into or out of a
Group.

#### Scenario: Goyle starts to matter
- **GIVEN** Goyle is in the "Crabbe and Goyle" Group
- **WHEN** Goyle saves the Player Character's life in a Scene
- **THEN** Goyle is still in the Group until the player takes him out

### Requirement: Portraits are real images

Every person's **Portrait** SHALL be a real image, curated by Claude when the Story is made or uploaded by the
player from the phone. The app SHALL never draw one.

#### Scenario: Uploading a Portrait
- **WHEN** the player uploads an image from the phone for Daphne Greengrass
- **THEN** it is her Portrait everywhere she appears

### Requirement: Home shows where every Story stands

The home screen SHALL list every Story with where it stands on its current Path: the Scene being played or the
**Day View** waiting.

#### Scenario: Two Stories on the home screen
- **GIVEN** one Story mid-Scene in "After curfew" and another waiting at a Day View on Sunday at 7:40 am
- **THEN** the home screen shows "Scene 14 · After curfew" for the first
- **AND** "Sunday 7:40 am · choosing where to go" for the second

### Requirement: Opening a Story returns exactly where the player left

One tap on a Story SHALL return to exactly where the player left it, mid-Scene or at the Day View. When the player
has been away more than a day, a dismissible "Previously" card SHALL recap the last Scene from the summaries the
Story already keeps.

#### Scenario: Back after a night away
- **GIVEN** the player stopped mid-Scene with Hermione and returns 30 hours later
- **WHEN** they open the Story
- **THEN** they are in that Scene at its latest Reply, with a "Previously" card above it

### Requirement: Story time stands still while the player is away

Nothing in a Story SHALL move while the player is not playing it; Story time SHALL pass only through play.

#### Scenario: A week away
- **GIVEN** the player stopped on Saturday at 11:47 pm in the Story
- **WHEN** they open it a week later
- **THEN** it is still Saturday 11:47 pm, and nothing has happened since
