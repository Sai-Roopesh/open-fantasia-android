# Spec Delta

## MODIFIED Requirements

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
