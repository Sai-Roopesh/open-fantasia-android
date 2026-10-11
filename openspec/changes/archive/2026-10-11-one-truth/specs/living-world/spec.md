# Spec Delta

## ADDED Requirements

### Requirement: Every agent knows the Story So Far

After every **Scene**, **The Story So Far** SHALL tell that Scene, and every agent SHALL be given it before it does any
work. The newest Scenes SHALL be told a paragraph each; older Scenes SHALL be gathered into a recap of their week, and
older weeks into chapters, so it stays short however long the Story runs. It SHALL say only what was on the page or in
**Meanwhile**, and invent nothing. It SHALL follow the **Path**: going back to an earlier Scene finds it as it stood
there.

#### Scenario: The Director knows what happened
- **GIVEN** in Scene 4 Hermione confronted him about the light on the train, and he lied to her
- **WHEN** the Director plans the Stretch after Scene 9
- **THEN** it is given the confrontation and the lie, not only Scene 4's title

#### Scenario: Short after two hundred Scenes
- **GIVEN** two hundred Scenes have been played
- **THEN** The Story So Far tells the last few Scenes a paragraph each, the weeks before them as recaps, and the rest
  as chapters, and stays within a few pages

#### Scenario: Back to an earlier Scene
- **GIVEN** the player goes back to Scene 6 and plays another way
- **THEN** every agent on that Path is given The Story So Far as it stood after Scene 5, and nothing from the Scenes
  left behind

## MODIFIED Requirements

### Requirement: Moments are remembered from one record

A **Moment** SHALL be recorded once, in its original words, with who was there and who knows of it. Everyone who
was there SHALL remember it from that one record, in its original words, when it matters to the Scene they are in.

Every Scene SHALL be recorded. Part of a record the Story cannot use, such as a Moment whose words are not on the
page or a line far longer than asked, SHALL be left out and noted. The rest SHALL be kept. What the Mac can set right
itself SHALL be set right, not left out, and the agent SHALL not be asked again for it: a person named with their
title is the Story's person, and a mark the record cannot carry is cleared. A Scene whose record could not be made
SHALL stop that Scene's end, with the reason and Retry, and nothing after it SHALL run without it.

#### Scenario: Draconia remembers the station
- **GIVEN** the Moment at the Hogsmeade station where the Player Character saved Draconia
- **WHEN** a later Scene brings up the life debt with Draconia
- **THEN** her Replies draw on what was actually said and done at the station

#### Scenario: One bad part does not lose the Scene
- **GIVEN** a Scene in which Draconia floated in his arms, and the record's line for what he knows of her comes back
  too long twice
- **THEN** that Scene's Moments and summary are kept, and what he knew of her before stays as it was

#### Scenario: A Scene that could not be recorded does not block the rest
- **GIVEN** the record of the library Scene could not be made, on its model or on the second one
- **THEN** the Scene's end stops at the record, says why, and offers Retry; the World does not move on without it
- **WHEN** the player taps Retry and the record is made
- **THEN** the Scene's end goes on from there, and the next Scene is recorded in its turn

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

### Requirement: Characters know only what they could know

A person in a Scene SHALL know their backstory, what they lived through, and what they were told or saw, and
nothing else. No Reply SHALL have a character act on something only absent people know. Everything the Story keeps about what happened
SHALL say who knows it, and each character SHALL be played from what they know.

#### Scenario: Hermione does not know about the egg
- **GIVEN** only Hagrid, Ron and Harry know about the dragon egg
- **WHEN** Hermione is alone with the Player Character
- **THEN** nothing she says or does shows knowledge of the egg

#### Scenario: What happened behind her back
- **GIVEN** off-screen, Draconia had his name taken off the Charms seating plan, and only Neville saw
- **WHEN** Hermione is in the next Scene with him
- **THEN** she does not know of it, unless Neville or he tells her on the page
