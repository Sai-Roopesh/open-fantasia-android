# Spec Delta

## MODIFIED Requirements

### Requirement: Moments are remembered from one record

A **Moment** SHALL be recorded once, in its original words, with who was there and who knows of it. Everyone who
was there SHALL remember it from that one record, in its original words, when it matters to the Scene they are in.

Every Scene SHALL be recorded. Part of a record the Story cannot use, such as a Moment whose words are not on the
page or a line far longer than asked, SHALL be left out and noted. The rest SHALL be kept. What the Mac can set right
itself SHALL be set right, not left out, and the agent SHALL not be asked again for it: a person named with their
title is the Story's person, and a mark the record cannot carry is cleared. A Scene whose record could not be made
SHALL not hold up the record of the Scenes after it, and SHALL be recorded later, in order, until it is recorded or
given up after three tries.

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

#### Scenario: Named with a title
- **GIVEN** the Story has Rolanda Hooch and Minerva McGonagall
- **WHEN** the plan's flying lesson names "Madam Hooch" and "Professor McGonagall"
- **THEN** the Scene that matters has Rolanda Hooch and Minerva McGonagall in it, and nothing is left out or asked
  again

#### Scenario: Set right, not asked again
- **GIVEN** no Lead has a move to make off-screen
- **WHEN** the World's record marks Harry's evening in the common room as his move
- **THEN** it is kept as an ordinary happening, and the World is not asked again

#### Scenario: A line a little long is kept
- **WHEN** the record's turn with Draconia comes back 29 words long, where 25 were asked
- **THEN** it is kept as written
