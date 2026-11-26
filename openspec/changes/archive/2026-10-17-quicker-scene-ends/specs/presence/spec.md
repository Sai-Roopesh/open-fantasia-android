## MODIFIED Requirements

### Requirement: Between Scenes is quiet, and shows progress

Between Scenes, one line SHALL say which step of a **Scene**'s end is under way: recorded, the **Outline** reconsidered
(saying when the **Director** is rethinking an **Act**), the **World** moving on, The Story So Far written. The record
SHALL come first. When no new Stretch is due, the Outline and the World SHALL then be worked on side by side, the line
saying the earliest step still under way; when the Director plans the next Stretch, the World SHALL move on after it, to
live out its moves. The Story So Far SHALL be written once both are done. The **Day View** SHALL show its choices once every
step is done. A **Move** at the **Day View**, a choice or the player's own, SHALL open the next **Scene** at once: the
**Move** shows straight away, the **Gap** first, under a card that says when the **Scene** is, when the choice set a
time, and one line saying the **Scene** is being written. The card SHALL take the **Scene**'s title, place and
**Portrait**s when the **Scene** has opened, and a phone that comes back mid-wait SHALL show the same.

#### Scenario: The World moves on
- **WHEN** the player ends a Scene
- **THEN** a single line says each step in turn, until the Day View is ready with its choices

#### Scenario: The Outline and the World side by side
- **GIVEN** a Scene has ended and been recorded, inside a Stretch that has not run its course
- **WHEN** the Director reconsiders the Outline
- **THEN** the World moves on at the same time, from the Outline as it stood, and the Day View is ready once both are done

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
