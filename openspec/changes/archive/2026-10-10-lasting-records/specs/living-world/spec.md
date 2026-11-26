# Spec Delta

## MODIFIED Requirements

### Requirement: Moments are remembered from one record

A **Moment** SHALL be recorded once, in its original words, with who was there and who knows of it. Everyone who
was there SHALL remember it from that one record, in its original words, when it matters to the Scene they are in.

Every Scene SHALL be recorded. Part of a record the Story cannot use, such as a Moment whose words are not on the
page or a line that is too long, SHALL be left out and noted. The rest SHALL be kept. A Scene whose record could not
be made SHALL not hold up the record of the Scenes after it, and SHALL be recorded later, in order, until it is
recorded or given up after three tries.

#### Scenario: Draconia remembers the station
- **GIVEN** the Moment at the Hogsmeade station where the Player Character saved Draconia
- **WHEN** a later Scene brings up the life debt with Draconia
- **THEN** her Replies draw on what was actually said and done at the station

#### Scenario: One bad part does not lose the Scene
- **GIVEN** a Scene in which Draconia floated in his arms, and the record's line for what he knows of her comes back
  too long twice
- **THEN** that Scene's Moments and summary are kept, and what he knew of her before stays as it was

#### Scenario: A Scene that could not be recorded does not block the rest
- **GIVEN** the record of the library Scene could not be made
- **WHEN** the next Scene ends
- **THEN** it is recorded, and the library Scene is tried again after it, and recorded

## ADDED Requirements

### Requirement: Where things stand between him and each person is kept

For each person the **Player Character** has history with, the Story SHALL keep a **Bond**. It has two parts:
- where things stand between them now, in a few lines, as he has seen it;
- the turns that brought it there, each one line, dated by its Scene.

A Scene that changes what is between them SHALL add a turn and update where things stand. Nobody's secret feelings
SHALL be written into a Bond. Everything that writes a Scene with that person in it SHALL read their Bond.

#### Scenario: A turn in the classroom
- **GIVEN** Draconia's Bond says she bills him for the slap and keeps him on her terms
- **WHEN** a Scene ends in which she floated in his arms and ordered him to put her down, and did not thank him
- **THEN** her Bond has a turn for that Scene, and where things stand says she let him hold her before she
  remembered to refuse it

#### Scenario: A Bond read in a later Scene
- **GIVEN** Draconia's Bond with that turn
- **WHEN** a Scene with her opens a week later
- **THEN** the Writer and the Actor are given where things stand and the latest turns, and her Replies keep to them
