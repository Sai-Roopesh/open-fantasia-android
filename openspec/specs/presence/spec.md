# Presence

## Purpose

How the app feels while the Story is being written, where it works, and what happens when something cannot be
done.

## Requirements

### Requirement: The player can always write

The player SHALL be able to type the next Move at any time, including while a Reply is being written or checked.

#### Scenario: Typing during a Reply
- **GIVEN** a Reply is being written
- **THEN** the player can type in the composer, and sends once the Reply has appeared

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

### Requirement: The phone buzzes for two things only

When the app is not open, the phone SHALL notify the player when a Reply is ready or when a Day View is ready, and
for nothing else. While one is being written, a silent note SHALL say so and SHALL give way to the notification
when it is ready.

#### Scenario: A Reply finishes while the phone is locked
- **GIVEN** the player sent a Move and locked the phone
- **WHEN** the Reply is finished
- **THEN** the phone shows one notification that the Reply is ready

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

### Requirement: The phone finds the Mac on any shared network

The phone SHALL find the Mac on whatever network they share, with nothing to set up after pairing once, trying every
address the Mac has given it. Nothing SHALL be built for playing without the Mac nearby.

#### Scenario: A new network
- **GIVEN** the phone was paired with the Mac at home
- **WHEN** both are on a hotel's Wi-Fi
- **THEN** the phone reaches the Mac without the player entering anything

#### Scenario: A network that keeps them apart
- **GIVEN** the Mac gave the phone its address on a private network both are on, when they paired
- **WHEN** the Wi-Fi they share does not let them see each other
- **THEN** the phone reaches the Mac at that address without the player entering anything

### Requirement: What has been seen can be read without the Mac

Without the Mac, the player SHALL still be able to open any Story and read everything already seen, and a Move
SHALL wait for the Mac with the app saying so, and SHALL be sent once the Mac is back.

#### Scenario: The Mac is asleep
- **GIVEN** the Mac is asleep
- **WHEN** the player opens a Story
- **THEN** its Scenes, Journal and World screen can be read
- **AND** the composer says the Mac is unreachable

### Requirement: The Mac keeps working while the phone is locked

Work under way SHALL carry on with the phone locked or the app closed.

#### Scenario: Ending a Scene and locking the phone
- **WHEN** the player ends a Scene and locks the phone at once
- **THEN** the Day View is ready when they next open the app

### Requirement: A Reply arrives checked and whole

A Reply SHALL appear once it has been written and checked, whole. While the player waits, one line SHALL say what is
under way: what is being looked up, the Reply being written, or the Reply being checked.

#### Scenario: Watching a Reply come
- **WHEN** the player sends a Move
- **THEN** one line says the Reply is being written, then that it is being checked, and the Reply appears whole

#### Scenario: Looking something up
- **GIVEN** the Writer looks up how Hermione learned his secret before it plans the Reply
- **THEN** the line says it is looking back, before it says the Reply is being written
