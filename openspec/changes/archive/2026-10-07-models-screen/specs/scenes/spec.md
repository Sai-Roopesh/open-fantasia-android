# Spec Delta

## MODIFIED Requirements

### Requirement: Redo, with a Direction and another model if wanted

**Redo** SHALL write the latest **Reply** again, optionally with a **Direction** and optionally on a different model
for that one **Reply**, chosen from the models the Models screen offers. A **Direction** SHALL shape what comes next
and SHALL never appear in the **Story**. A **Direction** that recurs, or that the player asks to remember, SHALL become
a line of **Taste**.

#### Scenario: A Direction that is not remembered
- **WHEN** the player Redoes with the Direction "you're leaning too much into Ron, move on"
- **THEN** the new Reply moves away from Ron
- **AND** the Direction's words appear nowhere in the Story

#### Scenario: Remember this
- **WHEN** the player Redoes with the Direction "don't dwell on school procedure" and ticks "remember this"
- **THEN** Taste gains a line saying so, and later Scenes honour it

#### Scenario: Redo on another model
- **GIVEN** the Story's Actor is Opus 5.5
- **WHEN** the player Redoes the latest Reply on GPT 6.1 Sol
- **THEN** that Reply is written by GPT 6.1 Sol, and the next Reply is written by Opus 5.5 again
