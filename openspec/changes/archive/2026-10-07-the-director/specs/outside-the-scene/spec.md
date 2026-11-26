# Spec Delta

## MODIFIED Requirements

### Requirement: Backstage shows everything else, only when visited

**Backstage** SHALL show what happened off-screen day by day, every Life, the Threads and how far each has moved,
what the Director is building toward, and the Writer's beats for the current Scene. Nothing from Backstage SHALL
appear in the Scene, the Day View, the World screen or the Journal.

#### Scenario: Quirrell's nights, Backstage
- **WHEN** the player opens Backstage for Saturday night
- **THEN** it shows what Quirrell did that night

#### Scenario: What the Director is building toward
- **GIVEN** the Director's plan builds toward the flying test on Wednesday
- **WHEN** the player opens Backstage
- **THEN** it says the Story is building toward the flying test on Wednesday, and that rest comes after it
