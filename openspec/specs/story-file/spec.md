# story-file Specification

## Purpose
The contract between Claude and the app for setting a **Story** up: what a **Story File** holds, how it is checked,
and how it is taken in whole or refused whole.

## Requirements

### Requirement: A Story File is one folder

A Story File SHALL be one folder holding a single text document that sets the Story up and the **Portrait** images
that document names. A Story File SHALL declare the version of the Story File format it was written for, and an
import SHALL refuse a version it does not understand, naming the versions it does.

#### Scenario: A folder with its Portraits
- **GIVEN** a folder holding the setup document and 46 Portrait images it names
- **WHEN** it is imported
- **THEN** each person's Portrait is the image the document names for them

#### Scenario: An unknown version
- **WHEN** a Story File declares a format version the app does not understand
- **THEN** the import is refused, naming the version found and the versions understood

### Requirement: A Story File sets up every part of a Story

A Story File SHALL be able to set up: the Story's title; the **World** (its places, institutions and history); the
people, each with who they are, how they talk, what they are after, their Portrait, their **Group** if any, what
the **Player Character** knows of them when the Story begins, and their **Bond** with him when they already have
history; the **Leads**; the **Player Character**; the **Premise**; the **Arcs**; the **Landmarks** with their times;
the **Threads**, each with where it stands; the **Style**; the reply length; the **Actor**'s model; the clock's
starting day and time and which weekday it is; the daily routine, such as classes on weekday mornings; the player's
brief, what they want more of and less of; and the opening **Scene** with its title, place, time, who is there
and its opening prose. The title, at least one person, the Player Character, the Premise, the Style and the opening
Scene SHALL be required; everything else MAY be left out. Who a person is MAY hold what nobody knows; what the Player
Character knows of them, their Bond, and a place's description, SHALL be what he, or anyone there, would know.

#### Scenario: A small Story File
- **GIVEN** a Story File with only a title, two people, the Player Character, a Premise, a Style and an opening Scene
- **WHEN** it is imported
- **THEN** the Story is created with no Groups, Arcs or Landmarks, and plays its opening Scene

#### Scenario: A Story File with a Thread
- **GIVEN** a Story File with the Thread "the dragon egg in Hagrid's hut", where it stands "Hagrid is keeping it warm in the fire"
- **WHEN** it is imported
- **THEN** the Story's World has that Thread, standing where the Story File put it

#### Scenario: What he knows of someone, and what they really are
- **GIVEN** a Story File where Quirrell is a servant of Voldemort, and Roopesh knows him as the nervous Defence teacher
- **WHEN** it is imported
- **THEN** the Story keeps both, and the World screen shows only the nervous Defence teacher

#### Scenario: A Bond to start from
- **GIVEN** a Story File where Draconia's Bond says she called him the word on the train, he saved her twenty
  minutes later, and she owes him and calls him Stray
- **WHEN** it is imported and her page is opened
- **THEN** Between you shows that standing before any Scene is played

#### Scenario: A routine to build on
- **GIVEN** a Story File whose routine says lectures run on weekday mornings and Friday nights are at the Three
  Broomsticks
- **WHEN** the Director plans a Stretch
- **THEN** its Scenes that matter fall around the routine, and some of them break it

### Requirement: People are referred to by name

Everything in a Story File SHALL refer to a person by the name the file gives them. Every name a Story File uses
SHALL belong to exactly one person in it, and no two people SHALL share a name.

#### Scenario: Two people with one name
- **WHEN** a Story File has two people named "Weasley"
- **THEN** the import is refused, naming the duplicated name

### Requirement: An import is checked whole and taken in whole

An import SHALL check the whole Story File before creating anything, and SHALL either create the whole Story or
create nothing. A refusal SHALL name every problem found, each with where in the file it is, not only the first.

#### Scenario: Several problems at once
- **GIVEN** a Story File whose Lead "Ginny Weasley" is not among its people and whose Portrait for Hermione is missing from the folder
- **WHEN** it is imported
- **THEN** nothing is created
- **AND** the refusal names both problems and where each is

#### Scenario: A file with no problems
- **WHEN** a valid Story File is imported
- **THEN** the Story exists in full on the Mac and appears on the phone's home screen

### Requirement: Importing never touches another Story

Importing a Story File SHALL always create a new Story, and SHALL never change a Story that already exists, even one
made from the same file.

#### Scenario: Importing the same file twice
- **WHEN** the same Story File is imported twice
- **THEN** there are two separate Stories, and playing one leaves the other unchanged
