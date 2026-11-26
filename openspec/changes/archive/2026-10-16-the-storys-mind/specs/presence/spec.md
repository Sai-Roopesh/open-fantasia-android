# Spec Delta

## ADDED Requirements

### Requirement: A Reply arrives checked and whole

A Reply SHALL appear once it has been written and checked, whole. While the player waits, one line SHALL say what is
under way: what is being looked up, the Reply being written, or the Reply being checked.

#### Scenario: Watching a Reply come
- **WHEN** the player sends a Move
- **THEN** one line says the Reply is being written, then that it is being checked, and the Reply appears whole

#### Scenario: Looking something up
- **GIVEN** the Writer looks up how Hermione learned his secret before it plans the Reply
- **THEN** the line says it is looking back, before it says the Reply is being written

## MODIFIED Requirements

### Requirement: The player can always write

The player SHALL be able to type the next Move at any time, including while a Reply is being written or checked.

#### Scenario: Typing during a Reply
- **GIVEN** a Reply is being written
- **THEN** the player can type in the composer, and sends once the Reply has appeared

### Requirement: Between Scenes is quiet, and shows progress

Between Scenes, one line SHALL say which step of a **Scene**'s end is under way: recorded, the **Outline** reconsidered
(saying when the **Director** is rethinking an **Act**), the **World** moving on, The Story So Far written. Each step
SHALL start only when the one before it has finished, and the **Day View** SHALL show its choices once every step is done. A
**Move** at the **Day View**, a choice or the player's own, SHALL open the next **Scene** at once: the **Move** shows
straight away, the **Gap** first, under a card that says when the **Scene** is, when the choice set a time, and one
line saying the **Scene** is being written. The card SHALL take the **Scene**'s title, place and **Portrait**s when the
**Scene** has opened, and a phone that comes back mid-wait SHALL show the same.

#### Scenario: The World moves on
- **WHEN** the player ends a Scene
- **THEN** a single line says each step in turn, until the Day View is ready with its choices

#### Scenario: The next Scene is being written
- **GIVEN** the Night Train's Day View at 9:05 am
- **WHEN** the player chooses Skip to later, This evening, and writes "I ride on to Shimla, go to the interview at eleven, and come out not sure of anything."
- **THEN** the Scene opens at once with that Move, under a card that says Friday 6:00 pm and that the Scene is being written
- **AND** the card takes the Scene's title, place and Portraits when the Scene has opened

#### Scenario: An Engagement fills in
- **GIVEN** a Scene ended in which Hermione said she would be at the library's end table at seven
- **WHEN** the Day View shows its choices
- **THEN** the library at seven is already among them: the Scene was recorded before the World moved on

#### Scenario: Rethinking a year
- **GIVEN** a Scene ended that turned the Story
- **WHEN** the Director re-plans the current Act deeply
- **THEN** the line says it is rethinking Year One, until the World moves on

## REMOVED Requirements

### Requirement: Replies stream in
**Reason**: Every Reply is checked by the Editor before the player reads it (docs/adr/0019); words that arrive before
the check could be wrong and change under the player.
**Migration**: A Reply arrives checked and whole, with one line saying what is under way while it is written.
