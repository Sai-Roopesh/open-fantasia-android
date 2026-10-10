# Spec Delta

## MODIFIED Requirements

### Requirement: Up to four Happenings

The Day View SHALL offer at most four **Happenings**, each with its time, its place, who will be there and why it
matters now, with the Story's own pick first. The Story's own pick SHALL be the **Stretch**'s next Scene that
matters, even when it is days away, shown with its day. Choosing it SHALL pass the days between as a **Gap**, with
what he learned in them in **Meanwhile**. Every **Engagement** ahead of the Player Character SHALL be offered among
them. When there are more than four, the pick and the Engagements he is expected at before it SHALL be kept, and the
rest SHALL give way, the furthest off first. A Happening the Player Character is expected at SHALL always be marked
"You're expected".

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

### Requirement: Missing something has consequences

A Happening the Player Character missed SHALL go on as it would have without them. When they were expected, their
absence SHALL be noticed and answered by the people involved. What they missed SHALL reach them only as the Story
would let it: told, overheard, or seen in what changed. An **Engagement** whose time passes while he is elsewhere is
missed, whether the time passed in a **Gap** or in a **Scene** he was playing.

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

## ADDED Requirements

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
