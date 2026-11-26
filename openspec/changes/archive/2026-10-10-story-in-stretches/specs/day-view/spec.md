# Spec Delta

## MODIFIED Requirements

### Requirement: Up to four Happenings

The Day View SHALL offer at most four **Happenings**, each with its time, its place, who will be there and why it
matters now, with the Story's own pick first. The Story's own pick SHALL be the **Stretch**'s next Scene that
matters, even when it is days away, shown with its day. Choosing it SHALL pass the days between as a **Gap**, with
what he learned in them in **Meanwhile**. A Happening the Player Character is expected at SHALL always be marked
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

### Requirement: The player chooses where to be

The player SHALL be able to Go to a Happening, Follow someone, Go somewhere, Write their own Move, Skip to later
(this evening, tomorrow, the weekend, next week, or the next Landmark), or Let the Story choose. Choosing SHALL open
the next Scene with its title card.

#### Scenario: Following someone
- **WHEN** the player chooses Follow and picks Hermione
- **THEN** the next Scene opens wherever Hermione is going next, with her in it

#### Scenario: Letting the Story choose
- **WHEN** the player taps Let the Story choose
- **THEN** the next Scene opens on the Story's own pick

#### Scenario: Skipping a week
- **WHEN** the player skips to next week
- **THEN** the next Scene opens a week on, and Meanwhile says what he learned in it

## REMOVED Requirements

### Requirement: Lead absence is felt, not counted

**Reason**: Any Lead satisfied it, so the Lead the Premise is about could be absent indefinitely while Harry, always
there, kept the rule quiet (docs/reviews/2026-10-09-the-malfoy-problem.md, cause 8). Counting Scenes without a Lead
is replaced by the Director giving every Lead a move each Stretch.

**Migration**: `long-run › Leads act every Stretch` and `day-view › A Lead away still acts`. The test for "Two
Scenes without a Lead" is retired with this requirement.

## ADDED Requirements

### Requirement: A Lead away still acts

A **Lead** SHALL be able to be away for days when the World gives a reason, and their absence SHALL show in the Story
when it makes sense. A Lead away SHALL still act: what they do off-screen in a **Stretch** SHALL be written, and SHALL
reach the Player Character as Meanwhile, as something found or as a consequence.

#### Scenario: Away, but not idle
- **GIVEN** Draconia has gone home for the weekend after her father's letter
- **WHEN** the Day View opens on Monday
- **THEN** Meanwhile can say what reached him of what she did, and nothing he could not know
