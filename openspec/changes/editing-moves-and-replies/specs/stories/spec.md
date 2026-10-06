# Spec Delta

## MODIFIED Requirements

### Requirement: Claude can edit a Story as the player can

Every edit the app offers SHALL also be possible through commands on the Mac, and SHALL land the same way: from
that moment onward on the **Path** the player is on. A phone showing the **Story** SHALL show an edit made through
the Mac's commands as it shows its own.

#### Scenario: Claude adds a person mid-Story
- **GIVEN** the player is in Scene 20 of a Story
- **WHEN** Claude adds Luna Lovegood with a Portrait through the Mac's commands
- **THEN** she is among the Story's people on the phone from Scene 20 onward on that Path
- **AND** she is absent from earlier moments and from other Paths

#### Scenario: Claude fixes a typo through the Mac
- **GIVEN** the phone is showing a Scene whose latest Reply reads "Hermoine"
- **WHEN** Claude edits that Reply to read "Hermione" through the Mac's commands
- **THEN** the phone shows the Reply reading "Hermione" without the player doing anything, and no new Path exists
