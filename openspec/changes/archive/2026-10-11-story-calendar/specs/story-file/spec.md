# Spec Delta

## MODIFIED Requirements

### Requirement: A Story File sets up every part of a Story

A Story File SHALL be able to set up: the Story's title; the **World** (its places, institutions and history); the
people, each with who they are, how they talk, what they are after, their Portrait, their **Group** if any, what
the **Player Character** knows of them when the Story begins, and their **Bond** with him when they already have
history; the **Leads**; the **Player Character**; the **Premise**; the **Arcs**; the **Landmarks** with their times;
the **Threads**, each with where it stands; the **Style**; the reply length; the **Actor**'s model; the clock's
starting day and time and the date of the Story's first day; the daily routine, such as classes on weekday mornings; the player's
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

#### Scenario: A Story on a calendar
- **GIVEN** a Story File whose first day is Sunday 1 September 1991 and whose clock starts on Day 6 at 21:40
- **WHEN** it is imported
- **THEN** the Story begins on Friday 6 September 1991 at 9:40 pm
