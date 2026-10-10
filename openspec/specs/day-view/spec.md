# Day View

## Purpose

Between a Scene the Story closed or the player ended and the next one, the **Day View** is where the player
chooses where to be. Time is linear: choosing one thing means not being at another.

## Requirements

### Requirement: The Day View says where and when the player is

The Day View SHALL open with the day, the time, where the Player Character is, and countdowns to the next
**Landmarks**.

#### Scenario: A countdown
- **GIVEN** it is Sunday and Draconia's flying test is a Landmark on Wednesday
- **THEN** the Day View shows "3 days to Draconia's flying test"

### Requirement: The Day View opens when the Player Character is next free to choose

The **Day View** SHALL open at the moment the Player Character is next free to choose where to be: the time the
**Scene** ended, or, when it ended late and he would go to bed, the next morning. Story time SHALL never go back, and
the **World** SHALL have moved on to that moment before the Day View shows it. A player who wants the night writes a
Move inside the Scene that goes there.

#### Scenario: A Scene ends in the afternoon
- **GIVEN** the Scene "Flying lesson" ends at 5:20 pm on Thursday
- **WHEN** the Day View opens
- **THEN** it is Thursday 5:20 pm

#### Scenario: A late Scene ends
- **GIVEN** the Scene "After curfew" ends at 11:05 pm on Friday
- **WHEN** the Day View opens
- **THEN** it is Saturday morning
- **AND** Meanwhile can say what the Player Character learned overnight and on waking, and nothing he could not know

### Requirement: Meanwhile shows only what the Player Character knows

**Meanwhile** SHALL list what happened while the Player Character was elsewhere, only as far as they could know
it, each item marked as seen, told or rumour. It SHALL never show anything they could not know.

#### Scenario: Quirrell's night stays hidden
- **GIVEN** Quirrell tested the third-floor door overnight and nobody saw him
- **THEN** Meanwhile says nothing about it
- **AND** Backstage shows it

#### Scenario: A rumour is marked as one
- **GIVEN** Lavender has been telling people Selwyn's bones broke one after another
- **AND** the Player Character could have heard it at breakfast
- **THEN** Meanwhile shows it marked as rumour

### Requirement: Up to four Happenings

The Day View SHALL offer at most four **Happenings**, each with its time, its place, who will be there and why it
matters now, with the Story's own pick first and the rest in time order. The Story's own pick SHALL be the
**Stretch**'s next Scene that matters, even when it is days away, shown with its day. Choosing it SHALL pass the days
between as a **Gap**, with what he learned in them in **Meanwhile**. Every **Engagement** ahead of the Player
Character SHALL be offered among them. When the next Scene that matters is an Engagement, it SHALL be offered once:
as the pick, at the Engagement's time and place, marked as the Engagement is. When there are more than four, the pick
and the Engagements he is expected at before it SHALL be kept, and the rest SHALL give way, the furthest off first. A
Happening the Player Character is expected at SHALL always be marked "You're expected".

#### Scenario: A summons is marked
- **GIVEN** McGonagall has summoned the Player Character to her office at 9:00
- **THEN** that Happening is marked "You're expected"

#### Scenario: The next Scene that matters is days away
- **GIVEN** it is Saturday morning, and the Stretch's next Scene that matters is Draconia cornering him after Charms
  on Thursday
- **THEN** the Day View's first offer is Thursday's, labelled "Thursday 10:00 am · in 5 days"
- **WHEN** the player chooses it
- **THEN** the days between pass, the next Scene opens on Thursday, and Meanwhile says what he learned since Saturday

#### Scenario: What he is expected at is never crowded out
- **GIVEN** five things are on before Thursday's Scene that matters, one of them McGonagall's summons at 9:00
- **THEN** the Day View offers four, and McGonagall's summons is among them, marked "You're expected"

#### Scenario: The Scene that matters is one he promised
- **GIVEN** he promised Hermione to meet her in the library at seven tonight, and the Stretch's next Scene that
  matters is that meeting
- **THEN** the Day View's first offer is the library at 7:00 pm with Hermione, the Story's pick, marked "You're
  expected", and it is offered once
- **WHEN** the player chooses it
- **THEN** the next Scene opens in the library at seven, and the meeting is kept

#### Scenario: In time order
- **GIVEN** it is Friday morning, he is expected in the library at 7:00 pm and at Charms at 9:00 am, and the Story's
  pick is Sunday's
- **THEN** the Day View offers Sunday's first, then Charms at 9:00 am, then the library at 7:00 pm

### Requirement: The player chooses where to be

The player SHALL be able to Go to a Happening, Follow someone, Go somewhere, Write their own Move, Skip to later
(this evening, tomorrow, the weekend, next week, or the next Landmark), or Let the Story choose. Choosing SHALL open
the next Scene with its title card. A time to skip to that is a week or more away SHALL say how many days away it is.

#### Scenario: Following someone
- **WHEN** the player chooses Follow and picks Hermione
- **THEN** the next Scene opens wherever Hermione is going next, with her in it

#### Scenario: Letting the Story choose
- **WHEN** the player taps Let the Story choose
- **THEN** the next Scene opens on the Story's own pick

#### Scenario: Skipping a week
- **WHEN** the player skips to next week
- **THEN** the next Scene opens a week on, and Meanwhile says what he learned in it

#### Scenario: A Landmark weeks away
- **GIVEN** it is Friday, and the next Landmark, the Halloween troll, is on a Thursday 48 days on
- **THEN** Skip to later offers it as "Thursday 7:00 pm · in 48 days", and next week as "Friday 7:30 am · in 7 days"

### Requirement: The Gap is the player's, and everything in it goes on without them

Choosing something later than now SHALL ask "What did you do in the Gap?". Whatever the player writes SHALL be
what the Player Character did and SHALL become part of the Story; left blank, they SHALL have spent it quietly
where they were. Every Happening in the **Gap** SHALL go on without them, and the Gap SHALL list them in time order. A
choice the Mac cannot take SHALL keep what the player wrote in the **Gap**, with the reason.

#### Scenario: Skipping a summons
- **GIVEN** it is 7:40 am, McGonagall expects the Player Character at 9:00, and Draconia is in the hospital wing at 11:00
- **WHEN** the player goes to the hospital wing at 11:00 and leaves the Gap blank
- **THEN** he spent the morning in his room
- **AND** McGonagall took the accounts without him and noticed his absence

#### Scenario: Filling the Gap
- **WHEN** the player goes to the hospital wing at 11:00 and writes "I spent the morning in the library reading about life debts"
- **THEN** that is what he did, and the Story can draw on it later

#### Scenario: Both, in turn
- **GIVEN** the player goes to McGonagall at 9:00 and that Scene ends at 9:40
- **THEN** the Day View returns at 9:40 with the hospital wing at 11:00 still ahead

#### Scenario: A choice that fails keeps the Gap
- **GIVEN** the player has written "I spent the morning in the library reading about life debts" in the Gap
- **WHEN** the Mac cannot take the choice
- **THEN** the Gap stays open with what he wrote, and says why

#### Scenario: What goes on without him, in time order
- **GIVEN** the Story's pick is on Sunday at 2:00 pm, and he is expected in the library on Saturday at 10:00 am
- **WHEN** the player skips to next week
- **THEN** the Gap lists Saturday's library first, then Sunday's

### Requirement: Missing something has consequences

A Happening the Player Character missed SHALL go on as it would have without them, at its own time and place. When
they were expected, their absence SHALL be noticed and answered by the people involved. What they missed SHALL reach
them only as the Story would let it: told, overheard, or seen in what changed. An **Engagement** whose time passes
while he is elsewhere is missed, whether the time passed in a **Gap** or in a **Scene** he was playing.

#### Scenario: McGonagall answers the absence
- **GIVEN** the Player Character skipped McGonagall's 9:00 summons
- **WHEN** he next meets McGonagall
- **THEN** she knows he did not come, and acts on it

#### Scenario: A summons he only heard of is still missed
- **GIVEN** Meanwhile told him McGonagall wants his account in her office at nine on Sunday
- **WHEN** the player skips to Sunday afternoon
- **THEN** McGonagall took the accounts without him and noticed he did not come

#### Scenario: Missed while in another Scene
- **GIVEN** he is expected in Draconia's library session at 7:30 pm
- **WHEN** a Scene in the common room runs from 7:00 pm to 8:15 pm
- **THEN** the library session went on without him, and Draconia noticed

#### Scenario: What he missed keeps its time
- **GIVEN** Draconia's library Scene was on Sunday at 2:00 pm
- **WHEN** the player skips to next week, and the World writes it going on without him on Saturday
- **THEN** it went on on Sunday at 2:00 pm, in the library

### Requirement: A Lead away still acts

A **Lead** SHALL be able to be away for days when the World gives a reason, and their absence SHALL show in the Story
when it makes sense. A Lead away SHALL still act: what they do off-screen in a **Stretch** SHALL be written, and SHALL
reach the Player Character as Meanwhile, as something found or as a consequence.

#### Scenario: Away, but not idle
- **GIVEN** Draconia has gone home for the weekend after her father's letter
- **WHEN** the Day View opens on Monday
- **THEN** Meanwhile can say what reached him of what she did, and nothing he could not know

### Requirement: What he has arranged is on

An **Engagement** SHALL be on the Day View from the moment it is recorded until it is kept, missed, called off or
past. A weekly Engagement SHALL be on at its next time each week until it is called off, and its card SHALL say which
day it repeats. An Engagement he agreed to or was summoned to SHALL be marked "You're expected"; one he was only
invited to SHALL not.

#### Scenario: A note under the door
- **GIVEN** Meanwhile shows him Draconia's note: "Library. Ten o'clock."
- **THEN** the Day View offers the library at ten, with Draconia, among its Happenings

#### Scenario: Wednesday evenings in the library
- **GIVEN** in Sunday's Scene Draconia set Wednesday evenings at half past seven in the library, and he said he
  would be there
- **THEN** every Day View until then offers Wednesday 7:30 pm in the library, marked "You're expected"
- **AND** after that Wednesday, the Day View offers the next Wednesday, until she calls it off

#### Scenario: An invitation, not a summons
- **GIVEN** Hermione said she would be at the library's end table if anyone wanted to do the Charms essay properly
- **THEN** the Day View offers the library with Hermione, and it is not marked "You're expected"

#### Scenario: Called off
- **GIVEN** Draconia's Wednesday sessions are on
- **WHEN** a Scene ends in which she tells him not to bother coming any more
- **THEN** the Day View no longer offers them
