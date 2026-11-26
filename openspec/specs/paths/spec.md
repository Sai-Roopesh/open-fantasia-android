# Paths

## Purpose

A Story is a tree of **Paths**. Going back, trying something else and starting again never lose anything, and
everything in the Story follows the Path the player is on.

## Requirements

### Requirement: Try another way from any Reply

**Try another way** SHALL start a new Path at any Reply, leaving the Path the player was on exactly as it was.

#### Scenario: Following the lantern
- **GIVEN** the player is with Hermione at the lantern at 11:47 pm
- **WHEN** they Try another way and follow the lantern into the forest for three Scenes, then switch back
- **THEN** they are with Hermione at 11:47 pm, with nothing on that Path changed
- **AND** the forest Path is still there

### Requirement: Everything belongs to the Path

The clock, the day, where everyone is, what everyone knows, the World, the Arcs, the Leads, the Groups and every
edit SHALL belong to the Path they happened on, and switching Paths SHALL switch all of them at once.

#### Scenario: Two clocks
- **GIVEN** one Path stands on Tuesday afternoon and another on Saturday night
- **WHEN** the player switches from the first to the second
- **THEN** the clock, the Day View and the World screen all show Saturday night

### Requirement: Rewind sets aside, never destroys

**Rewind** to an earlier moment followed by a new Move SHALL set what came after aside as a **Path** of its own. Paths
the player never returns to SHALL be clearable in one tap: Clear SHALL remove only the Paths that **Rewind** set aside
and the player never opened, and never a Path they played on.

#### Scenario: Going back and carrying on
- **GIVEN** five exchanges after a Reply
- **WHEN** the player Rewinds to that Reply and makes a different Move
- **THEN** the five exchanges are on a Path of their own in the Paths screen

#### Scenario: Clearing what was set aside
- **GIVEN** two Paths set aside by Rewind, one of which the player has since opened, and a Path they tried another way on and left
- **WHEN** the player taps Clear Paths you never went back to
- **THEN** only the set-aside Path they never opened is gone, and the other two are still in the Paths screen

### Requirement: The Paths screen

One screen SHALL show the Story as a tree of Scene cards with every fork and the current **Path** highlighted.
Tapping a Path SHALL return to its latest moment, and Paths SHALL be renameable and deletable there. Deleting SHALL
ask once, and SHALL never be offered for the Path the player is on.

#### Scenario: Returning by the Paths screen
- **WHEN** the player taps a Path in the Paths screen
- **THEN** they are at that Path's latest moment

#### Scenario: Deleting a Path
- **GIVEN** the player is on Main and "Following the lantern" is another Path
- **WHEN** they delete "Following the lantern" and confirm
- **THEN** it is gone from the Paths screen, Main is as it was, and Main offers no Delete

### Requirement: Starting again from the beginning

A Path SHALL be able to start from the Story's opening, with the same World, Premise, Leads, Arcs and Style as the
Story File set up.

#### Scenario: Re-experiencing the Story
- **WHEN** the player starts a Path from the beginning
- **THEN** they are in the opening Scene, with the setup as the Story File made it, and every other Path untouched

### Requirement: A Path changes only between Replies

Try another way, Rewind, returning to a **Path**, starting again and deleting SHALL happen only while no **Reply** is
being written: while one is, the **Story** SHALL refuse them with the reason and leave every **Path** as it was.

#### Scenario: Rewinding while a Reply is written
- **GIVEN** a Reply is being written
- **WHEN** the player Rewinds to an earlier Reply
- **THEN** the Story says a Reply is being written and stays where it is
