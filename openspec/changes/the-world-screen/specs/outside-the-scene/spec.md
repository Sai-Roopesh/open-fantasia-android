# Spec Delta

## MODIFIED Requirements

### Requirement: The World screen shows what the Player Character knows

The World screen SHALL show People (Portrait, what the Player Character knows of them and what he has heard of
them), Places, and a Calendar of Landmarks and the Happenings the Player Character knows of with countdowns, and
SHALL show nothing the Player Character does not know. What he knows of someone SHALL start from what the Story File
says he knows when the Story begins, and SHALL grow with each Scene they are in, from what happened in it; what he
has heard SHALL come from Meanwhile, marked as seen, told or rumour. Someone he knows nothing of SHALL not be listed.

#### Scenario: A secret stays out of the World screen
- **GIVEN** Quirrell serves Voldemort, and the Player Character does not know it
- **THEN** Quirrell's entry on the World screen says nothing of it

#### Scenario: What he knows grows with a Scene
- **GIVEN** all Roopesh knows of Hermione is that she is a Gryffindor first-year
- **WHEN** a Scene ends in which she noticed the inkwell and asked him for a reason
- **THEN** her entry on the World screen says she noticed the inkwell, from that Scene
