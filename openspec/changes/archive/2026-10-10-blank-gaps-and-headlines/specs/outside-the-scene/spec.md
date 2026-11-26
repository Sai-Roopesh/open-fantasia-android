# Spec Delta

## MODIFIED Requirements

### Requirement: Backstage shows everything else, only when visited

**Backstage** SHALL show what happened off-screen day by day, every Life, the Threads and how far each has moved,
what the Director is building toward, each Scene that matters in the Stretch in one short line, and the Writer's
beats for the current Scene. Nothing from Backstage SHALL
appear in the Scene, the Day View, the World screen or the Journal.

Backstage SHALL also show **The record**: each Scene not yet recorded, and each part of a record that was left out,
with why. A Scene given up after three tries SHALL offer Retry.

#### Scenario: Quirrell's nights, Backstage
- **WHEN** the player opens Backstage for Saturday night
- **THEN** it shows what Quirrell did that night

#### Scenario: What the Director is building toward
- **GIVEN** the Director's plan builds toward the flying test on Wednesday
- **WHEN** the player opens Backstage
- **THEN** it says the Story is building toward the flying test on Wednesday, and that rest comes after it

#### Scenario: A gap in the record
- **GIVEN** the record of the library Scene was given up after three tries
- **WHEN** the player opens Backstage
- **THEN** The record lists the library Scene with why it failed, and Retry records it again

#### Scenario: The Stretch, a line each
- **GIVEN** the Director's Stretch has Charms on Monday as a Scene that matters
- **WHEN** the player opens Backstage
- **THEN** it lists Monday's Scene in one short line, such as "Charms: Flitwick pairs him with Draconia", and not the
  Director's note to the Writer
