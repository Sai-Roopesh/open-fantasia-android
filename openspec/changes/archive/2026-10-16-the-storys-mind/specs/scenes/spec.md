# Spec Delta

## ADDED Requirements

### Requirement: Every Reply is checked before it is read

The **Editor** SHALL read every Reply before the player does, against what the Story has established: its **Rules**,
what each person present knows and believes, the clock, what is true now, and what only the player may decide. It
SHALL set small slips right itself, send a real break back to be written again once, and, if it still breaks, show the
Reply with a note saying what is wrong.

#### Scenario: The ribbon's story
- **GIVEN** Draconia said in Scene 18 that the ribbon was her grandmother's
- **WHEN** a Reply has her say she bought it in Paris
- **THEN** the player reads that it was her grandmother's

#### Scenario: Deciding for him, caught
- **WHEN** a Reply says what the Player Character feels about Hermione
- **THEN** it is written again without it before the player reads it

#### Scenario: The clock kept
- **GIVEN** a Reply narrated midnight
- **WHEN** the next Reply is written
- **THEN** it does not go back to half past ten

#### Scenario: A break that will not go
- **GIVEN** a Reply that still has a person act on what they could not know after it is written again
- **THEN** the player sees the Reply with a note saying so, and can Redo it

### Requirement: A long Scene is recorded as it goes

A **Scene** SHALL be carried word for word while it is under a size limit of about thirty exchanges. Past it, the
Scene so far SHALL be recorded as a finished Scene is, once, and from then on carried as that record with its latest
exchanges word for word; any earlier passage SHALL stay readable to the **Writer**. The Writer SHALL close a Scene that
has become another one.

#### Scenario: Thirty exchanges in
- **GIVEN** a Scene in the secret suite has run past thirty exchanges
- **WHEN** the next Move is sent
- **THEN** the Scene so far is recorded first, and what was decided at its start still holds in the Reply

#### Scenario: A Scene that has become another
- **GIVEN** a long Scene in the dorm in which they have left for the Astronomy Tower and a different night has begun
- **WHEN** the next Move is answered
- **THEN** the dorm Scene closes and a new Scene opens with its own title card
