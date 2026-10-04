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
matters now, with the Story's own pick first. A Happening the Player Character is expected at SHALL always be
marked "You're expected".

#### Scenario: A summons is marked
- **GIVEN** McGonagall has summoned the Player Character to her office at 9:00
- **THEN** that Happening is marked "You're expected"

### Requirement: The player chooses where to be

The player SHALL be able to Go to a Happening, Follow someone, Go somewhere, Write their own Move, Skip to later
(this evening, tomorrow, the weekend, or the next Landmark), or Let the Story choose. Choosing SHALL open the next
Scene with its title card.

#### Scenario: Following someone
- **WHEN** the player chooses Follow and picks Hermione
- **THEN** the next Scene opens wherever Hermione is going next, with her in it

#### Scenario: Letting the Story choose
- **WHEN** the player taps Let the Story choose
- **THEN** the next Scene opens on the Story's own pick

### Requirement: The Gap is the player's, and everything in it goes on without them

Choosing something later than now SHALL ask "What did you do in the Gap?". Whatever the player writes SHALL be
what the Player Character did and SHALL become part of the Story; left blank, they SHALL have spent it quietly
where they were. Every Happening in the **Gap** SHALL go on without them.

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

### Requirement: Missing something has consequences

A Happening the Player Character missed SHALL go on as it would have without them. When they were expected, their
absence SHALL be noticed and answered by the people involved. What they missed SHALL reach them only as the Story
would let it: told, overheard, or seen in what changed.

#### Scenario: McGonagall answers the absence
- **GIVEN** the Player Character skipped McGonagall's 9:00 summons
- **WHEN** he next meets McGonagall
- **THEN** she knows he did not come, and acts on it

### Requirement: Lead absence is felt, not counted

A **Lead** SHALL be able to be away for days when the World gives a reason, and their absence SHALL show in the
Story when it makes sense. When two Scenes in a row have had no Lead, the Story's own pick SHALL lean toward one.

#### Scenario: Two Scenes without a Lead
- **GIVEN** the last two Scenes had no Lead in them
- **THEN** the Story's own pick at the next Day View is a Happening with a Lead in it
