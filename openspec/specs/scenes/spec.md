# Scenes

## Purpose

A **Scene** is played **Move** by **Reply**: the player co-writes the Story, the **Actor** plays everyone else, and
the **Writer** keeps the Scene going somewhere. This capability covers playing, ending and correcting Scenes.

## Requirements

### Requirement: A Move can contain anything, and what it says has happened

A Move SHALL be able to contain the Player Character's words, actions and thoughts, what other people do, what
happens around them, time passing, or going somewhere else. Whatever a Move says SHALL be treated as having
happened, even when it has someone act against type or contradicts something established, and the Reply SHALL
carry on from it.

#### Scenario: The player writes Draconia's action
- **WHEN** the Move is "I go to the pitch and nobody is there, then suddenly Draconia yanks me from behind and pins me to the stands"
- **THEN** the Reply begins from Draconia holding him there, in her voice

#### Scenario: A time skip in a Move
- **GIVEN** the clock stands at 4:00 pm
- **WHEN** the Move is "after an hour, I'm still sitting on her broom, holding on"
- **THEN** the clock stands at 5:00 pm or later, and the Reply picks up there

### Requirement: The Reply never writes the Player Character

A Reply SHALL never decide what the Player Character says, chooses, does on purpose, thinks or feels, now or in
anything the Story has not shown. The people in the Scene MAY see the Player Character and say how they look to
them, and the narration MAY keep plain physical continuity, such as two people going still together. A Reply SHALL
stop where it is the player's turn.

#### Scenario: Hermione asks a question
- **GIVEN** the Reply has Hermione ask the Player Character why he kissed her
- **THEN** the Reply ends with her question unanswered, and decides nothing he says, chooses, does on purpose, thinks or feels

#### Scenario: Others may describe him
- **GIVEN** the Player Character has not slept
- **WHEN** Hermione says "you look like you haven't slept"
- **THEN** that is allowed: it is how he looks to her, not a decision for him

### Requirement: Thoughts stay private

What a Move gives as the Player Character's thoughts SHALL never be heard by anyone in the Story; people SHALL
react only to what was said aloud or done where they could see it.

#### Scenario: An unspoken thought
- **WHEN** the Move is "I smile at her. (I can't believe she bought that.)"
- **THEN** in the Reply she reacts to the smile, and nobody shows any sign of having heard the thought

### Requirement: A Scene ends in one of three ways

A Scene SHALL end when a Move goes elsewhere or skips ahead, when the Story brings it to a close, or when the
player ends it. A Move that goes elsewhere SHALL lead straight into the next Scene, with no Day View between. A
Scene the Story closes or the player ends SHALL open the **Day View**.

#### Scenario: Walking out of a Scene
- **GIVEN** a Scene in the Gryffindor common room
- **WHEN** the Move is "I go to my room; Harry, Ron and Neville are playing a board game"
- **THEN** a new Scene opens in the dormitory with its title card, and the Reply plays it
- **AND** no Day View appears

#### Scenario: The Story closes a Scene
- **WHEN** a Reply brings the Scene to its close
- **THEN** the Day View opens after it

#### Scenario: The player ends a Scene
- **WHEN** the player taps End scene after a Reply
- **THEN** the Scene is closed at that Reply and the Day View opens

### Requirement: Every Scene opens with a title card

A Scene SHALL open with a title card showing its title, its place, the day and time, and the people there with
their Portraits. Earlier Scenes on the Path SHALL fold into one-line summaries that open on a tap.

#### Scenario: The title card
- **GIVEN** the player opens a Story in the Scene "After curfew" in the Common room on Friday at 9:40 pm, with Hermione there
- **THEN** the title card shows "After curfew", "Common room", "Friday · 9:40 pm" and Hermione's Portrait

#### Scenario: Scrolling back
- **GIVEN** the player is in Scene 14
- **THEN** Scenes 1 to 13 appear above it as one-line summaries
- **AND** tapping Scene 13's summary shows that Scene in full

### Requirement: Focus keeps a Scene close to one person

The player SHALL be able to **Focus** on one person in the Scene with one tap on their Portrait. While Focus is on,
the Replies SHALL stay close beside that person, mostly in their words, actions and thoughts, and nobody new SHALL
enter unless a Move brings them in. Without Focus, anyone present SHALL be able to speak, and someone SHALL enter
only as the Writer planned. A Scene that opens with one other person SHALL start focused on them, and Focus SHALL
clear when the Scene ends.

#### Scenario: A private moment stays private
- **GIVEN** Focus is on Hermione in the common room
- **WHEN** the player makes five Moves that bring nobody in
- **THEN** no one else enters, and the Replies are hers

#### Scenario: A Move brings someone in
- **GIVEN** Focus is on Hermione
- **WHEN** the Move is "Ron stumbles down the stairs in his pyjamas"
- **THEN** Ron is in the Scene and the Reply plays him

#### Scenario: Focus starts and clears by itself
- **GIVEN** a Scene opens with only Draconia besides the Player Character
- **THEN** Focus is on Draconia
- **AND** when that Scene ends, the next Scene starts with no Focus unless it too opens with one other person

### Requirement: People stay in a Scene until they go

Who is in a Scene SHALL change only when someone comes in or goes: a Reply that brings nobody in and sends nobody
away SHALL have everyone who was there still there, with what they remember. Whoever goes SHALL be out of the Scene
for the Replies after, and Focus on someone who goes SHALL clear.

#### Scenario: Meera stays on the toy train
- **GIVEN** Meera is in the Scene with Focus on her
- **WHEN** the player's Move brings nobody in and sends nobody away
- **THEN** Meera is still in the Scene for the Reply
- **AND** the Reply's Actor is given Meera and what she remembers

#### Scenario: Meera gets off at Barog
- **GIVEN** Meera is in the Scene with Focus on her
- **WHEN** the Move is "At Barog I watch her climb down to the jeep"
- **THEN** Meera is out of the Scene for the Replies after, and Focus is off

### Requirement: Only what matters earns time

The Story SHALL give time to a moment when an **Arc** is moving or the **Premise** is happening, and SHALL let such
moments breathe. It SHALL say logistics and procedure in a line, tell routine stretches as a short montage, and
leave business that touches no Arc off the page. When three exchanges pass with no Arc moving and **Linger** is
off, the Story SHALL move the Scene on or bring it to a close. A beat that has been in play for four exchanges SHALL
be made to happen.

#### Scenario: Procedure does not take over
- **GIVEN** Draconia's argument with Snape about her bed touches no Arc
- **WHEN** the Player Character finds them in the hospital wing
- **THEN** the Reply gives the argument a line and stays with what is moving between her and the Player Character

#### Scenario: A stalled Scene moves on
- **GIVEN** three exchanges in a row in which no Arc moved, and Linger is off
- **THEN** the next Reply moves the Scene to its next beat or brings it to a close

### Requirement: Linger holds the moment

While **Linger** is on, the Story SHALL stop pushing the Scene along: no beat SHALL be forced, the Scene SHALL not
close on its own, and time SHALL move only as the moment does, while everything still answers the player's Moves.
Linger SHALL clear when the Scene ends or the player turns it off.

#### Scenario: Lingering with Hermione
- **GIVEN** Linger is on in the common room with Hermione
- **WHEN** eight exchanges pass with no beat happening
- **THEN** no beat is forced and the Scene stays open

### Requirement: The latest Reply has its actions in view

The latest Reply SHALL always show **Copy**, **Redo**, **Edit** and **Try another way** without a menu. A
long-press on any earlier Reply or Move SHALL offer Copy, **Rewind** to here, Try another way from here, and Edit.

#### Scenario: Copying the latest Reply
- **WHEN** the player taps Copy on the latest Reply
- **THEN** the Reply's text is on the clipboard

### Requirement: Redo, with a Direction and another model if wanted

**Redo** SHALL write the latest Reply again, optionally with a **Direction** and optionally on a different model
for that one Reply. A Direction SHALL shape what comes next and SHALL never appear in the Story. A Direction that
recurs, or that the player asks to remember, SHALL become a line of **Taste**.

#### Scenario: A Direction that is not remembered
- **WHEN** the player Redoes with the Direction "you're leaning too much into Ron, move on"
- **THEN** the new Reply moves away from Ron
- **AND** the Direction's words appear nowhere in the Story

#### Scenario: Remember this
- **WHEN** the player Redoes with the Direction "don't dwell on school procedure" and ticks "remember this"
- **THEN** Taste gains a line saying so, and later Scenes honour it

#### Scenario: Redo on another model
- **GIVEN** the Story's Actor is Opus 5.5
- **WHEN** the player Redoes the latest Reply on GPT 6.1 Sol
- **THEN** that Reply is written by GPT 6.1 Sol, and the next Reply is written by Opus 5.5 again

### Requirement: Editing

Editing the latest Move or Reply SHALL change it in place. Editing anything earlier SHALL carry the Story on from
the edit on a new **Path**, leaving what came after on the Path it was on.

#### Scenario: Fixing a typo in the latest Reply
- **WHEN** the player edits "Hermoine" to "Hermione" in the latest Reply
- **THEN** the Reply reads "Hermione" and no new Path exists

#### Scenario: Editing an earlier Move
- **GIVEN** the player is ten exchanges past a Move
- **WHEN** they edit that Move
- **THEN** a new Path carries on from the edited Move
- **AND** the ten exchanges after it remain on the Path they were on
