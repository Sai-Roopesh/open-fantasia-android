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

Someone the Reply shows coming into the Scene, or already there, SHALL be in the Scene from that Reply on, whether
or not the plan named them. Someone the Reply only mentions SHALL not be.

#### Scenario: Meera stays on the toy train
- **GIVEN** Meera is in the Scene with Focus on her
- **WHEN** the player's Move brings nobody in and sends nobody away
- **THEN** Meera is still in the Scene for the Reply
- **AND** the Reply's Actor is given Meera and what she remembers

#### Scenario: Meera gets off at Barog
- **GIVEN** Meera is in the Scene with Focus on her
- **WHEN** the Move is "At Barog I watch her climb down to the jeep"
- **THEN** Meera is out of the Scene for the Replies after, and Focus is off

#### Scenario: Crabbe and Goyle at her heels
- **GIVEN** Draconia walks back up the lane with only Pansy named in the Scene
- **WHEN** the Reply has Crabbe and Goyle a step behind her the whole way
- **THEN** Crabbe and Goyle are in the Scene from that Reply on, and what happened on the lane is remembered by them
  too

#### Scenario: A name mentioned is not a person present
- **WHEN** Draconia says "Father will hear of this" in a Reply
- **THEN** Lucius Malfoy is not in the Scene

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
On a **Move**, Rewind to here and Try another way from here SHALL act on the moment before that **Move**.

#### Scenario: Copying the latest Reply
- **WHEN** the player taps Copy on the latest Reply
- **THEN** the Reply's text is on the clipboard

#### Scenario: Holding an earlier Move
- **GIVEN** the player's Move "I sit at the other end of the sofa" has a Reply after it
- **WHEN** the player holds that Move
- **THEN** Copy, Rewind to here, Try another way from here and Edit are offered
- **AND** Rewind to here goes back to the moment before that Move, with the Move and everything after it set aside

### Requirement: Redo, with a Direction and another model if wanted

**Redo** SHALL write the latest **Reply** again, optionally with a **Direction** and optionally on a different model
for that one **Reply**, chosen from the models the Models screen offers. A **Direction** SHALL shape what comes next
and SHALL never appear in the **Story**. A **Direction** that recurs, or that the player asks to remember, SHALL become
a line of **Taste**.

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

Editing the latest Move or Reply SHALL change it in place, and an edited latest **Move** SHALL be answered by a new
**Reply**. Editing anything earlier SHALL carry the Story on from the edit on a new **Path**, leaving what came after on
the Path it was on. No edit SHALL happen while a **Reply** is being written.

#### Scenario: Fixing a typo in the latest Reply
- **WHEN** the player edits "Hermoine" to "Hermione" in the latest Reply
- **THEN** the Reply reads "Hermione" and no new Path exists

#### Scenario: Fixing the latest Move
- **GIVEN** the latest Move reads "I sit at the other end of the sofa" and has its Reply
- **WHEN** the player edits it to "I sit at the far end of the sofa"
- **THEN** the Move reads "I sit at the far end of the sofa", a new Reply answers it, and no new Path exists

#### Scenario: Editing an earlier Move
- **GIVEN** the player is ten exchanges past a Move
- **WHEN** they edit that Move
- **THEN** a new Path carries on from the edited Move
- **AND** the ten exchanges after it remain on the Path they were on

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

### Requirement: A Scene ends when a Move leaves it or the player ends it

A Scene SHALL be one thing happening between its people, with a purpose. It SHALL end only when a Move skips ahead or
turns to something else, or when the player ends it; the Story SHALL never close a Scene on its own, even once its
purpose has turned. A Move that goes somewhere while the same thing goes on between the same people SHALL keep the
Scene, with the place changing. A Move that turns to something else SHALL lead straight into the next Scene, with no Day
View between. A Scene the player ends SHALL open the **Day View**.

#### Scenario: Walking out of a Scene
- **GIVEN** a Scene in the Gryffindor common room
- **WHEN** the Move is "I go to my room; Harry, Ron and Neville are playing a board game"
- **THEN** a new Scene opens in the dormitory with its title card, and the Reply plays it
- **AND** no Day View appears

#### Scenario: Walking somewhere together keeps the Scene
- **GIVEN** a Scene in the Great Hall in which Hermione wants to know where he went on Wednesday
- **WHEN** the Move is "I go to the library with Hermione"
- **THEN** the same Scene goes on in the library, the place shown changes, and no new title card opens

#### Scenario: The Story never closes a Scene
- **GIVEN** a Scene whose purpose has turned: Draconia has said what she came to say
- **WHEN** the Reply lands it
- **THEN** the Scene stays open with the composer ready, and no Day View opens until the player ends the Scene or a
  Move leaves it

#### Scenario: The player ends a Scene
- **WHEN** the player taps End scene after a Reply
- **THEN** the Scene is closed at that Reply and the Day View opens
