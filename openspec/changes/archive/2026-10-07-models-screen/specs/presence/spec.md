# Spec Delta

## MODIFIED Requirements

### Requirement: Nothing fails silently

When something cannot be done, the place the player is looking SHALL say what failed and offer Retry or another
model, and nothing the player wrote SHALL be lost. Another model SHALL run the job that failed on the chosen model
for that one try, and SHALL change no setting.

#### Scenario: A model is down
- **GIVEN** the Actor's model fails while writing a Reply
- **THEN** the Scene shows that the Reply failed, with Retry and another model
- **AND** the player's Move is still there

#### Scenario: Another model for a failed Reply
- **GIVEN** Opus 5.5 is overloaded and the Reply failed
- **WHEN** the player chooses another model, GPT 6.1 Sol
- **THEN** the Reply is written by GPT 6.1 Sol
- **AND** the next Reply is written by Opus 5.5 again

#### Scenario: Another model for the World
- **GIVEN** the Weaver's model failed and the World could not move on
- **WHEN** the player chooses another model, Sonnet 5.5
- **THEN** the World moves on with Sonnet 5.5, and the Day View is ready
