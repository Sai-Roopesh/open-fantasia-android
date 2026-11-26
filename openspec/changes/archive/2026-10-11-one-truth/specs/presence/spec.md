# Spec Delta

## MODIFIED Requirements

### Requirement: Between Scenes is quiet, and shows progress

Between Scenes, one line SHALL say which step of a **Scene**'s end is under way: recorded, the next **Stretch** planned,
the **World** moving on, The Story So Far written. Each step SHALL start only when the one before it has finished,
and the **Day View** SHALL show its choices once every step is done. A
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

### Requirement: Nothing fails silently

Every job SHALL have a second model, tried once when its own fails or runs too long. When something still cannot be
done, the place the player is looking SHALL say what failed and offer Retry or another model, and nothing the player
wrote SHALL be lost; nothing that depends on it SHALL run without it. Another model SHALL run the job that failed on the chosen model
for that one try, and SHALL change no setting.

#### Scenario: A model is down
- **GIVEN** the Actor's model fails while writing a Reply
- **THEN** the Scene shows that the Reply failed, with Retry and another model
- **AND** the player's Move is still there

#### Scenario: Another model for a failed Reply
- **GIVEN** Opus 5.5 is overloaded and the Reply failed
- **WHEN** the player chooses another model, GPT 6.1 Sol
- **THEN** the Reply is written by GPT 6.1 Sol
- **AND** the next Reply is written by Opus 5.5 again

#### Scenario: Another model for the World
- **GIVEN** the Weaver's model failed and the World could not move on
- **WHEN** the player chooses another model, Sonnet 5.5
- **THEN** the World moves on with Sonnet 5.5, and the Day View is ready

#### Scenario: A step at a Scene's end fails
- **GIVEN** the Director's model and its second model both fail while planning the next Stretch
- **THEN** the Scene's end stops there: the World does not move on without the plan, and the line says the Director
  failed and why, with Retry and another model
- **WHEN** the player taps Retry
- **THEN** the Scene's end goes on from the Director, and the steps before it are not run again

#### Scenario: The second model steps in
- **GIVEN** the Weaver's model is down
- **WHEN** a Scene ends
- **THEN** the World moves on, written by the Weaver's second model, and nothing asks the player
