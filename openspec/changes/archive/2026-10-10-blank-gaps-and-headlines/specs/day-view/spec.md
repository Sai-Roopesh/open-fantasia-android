# Spec Delta

## MODIFIED Requirements

### Requirement: The Gap is the player's, and everything in it goes on without them

Choosing something later than now SHALL ask "What did you do in the Gap?". Whatever the player writes SHALL be
what the Player Character did and SHALL become part of the Story; left blank, they SHALL have spent it quietly:
where they were, when the Gap ends the same day, and going about their days, when it runs past a night. Every Happening in the **Gap** SHALL go on without them, and the Gap SHALL list them in time order. A
choice the Mac cannot take SHALL keep what the player wrote in the **Gap**, with the reason.

#### Scenario: Skipping a summons
- **GIVEN** it is 7:40 am, McGonagall expects the Player Character at 9:00, and Draconia is in the hospital wing at 11:00
- **WHEN** the player goes to the hospital wing at 11:00 and leaves the Gap blank
- **THEN** he spent the morning quietly where he was
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

#### Scenario: A blank week
- **GIVEN** he is in the Three Broomsticks on Friday night
- **WHEN** the player skips to next week and leaves the Gap blank
- **THEN** the Gap says he goes about his days quietly, and nowhere says he spent the week in the Three Broomsticks
