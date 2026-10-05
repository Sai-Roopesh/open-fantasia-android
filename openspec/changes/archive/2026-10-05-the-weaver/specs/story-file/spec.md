# Spec Delta

## MODIFIED Requirements

### Requirement: A Story File sets up every part of a Story

A Story File SHALL be able to set up: the Story's title; the **World** (its places, institutions and history); the
people, each with who they are, how they talk, what they are after, their Portrait, and their **Group** if any; the
**Leads**; the **Player Character**; the **Premise**; the **Arcs**; the **Landmarks** with their times; the
**Threads**, each with where it stands; the **Style**; the reply length; the **Actor**'s model; the clock's starting
day and time and which weekday it is; and the opening **Scene** with its title, place, time, who is there and its
opening prose. The title, at least one person, the Player Character, the Premise, the Style and the opening Scene
SHALL be required; everything else MAY be left out.

#### Scenario: A small Story File
- **GIVEN** a Story File with only a title, two people, the Player Character, a Premise, a Style and an opening Scene
- **WHEN** it is imported
- **THEN** the Story is created with no Groups, Arcs or Landmarks, and plays its opening Scene

#### Scenario: A Story File with a Thread
- **GIVEN** a Story File with the Thread "the dragon egg in Hagrid's hut", where it stands "Hagrid is keeping it warm in the fire"
- **WHEN** it is imported
- **THEN** the Story's World has that Thread, standing where the Story File put it
