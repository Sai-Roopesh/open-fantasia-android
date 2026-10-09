# Spec Delta

## MODIFIED Requirements

### Requirement: The World screen shows what the Player Character knows

The World screen SHALL show People (Portrait, what the Player Character knows of them and what he has heard of
them), Places, and a Calendar of Landmarks and the Happenings the Player Character knows of with countdowns, and
SHALL show nothing the Player Character does not know. What he knows of someone SHALL start from what the Story File
says he knows when the Story begins, and SHALL grow with each Scene they are in, from what happened in it; what he
has heard SHALL come from Meanwhile, marked as seen, told or rumour. Someone he knows nothing of SHALL not be listed.

What he knows of someone SHALL stay short, at most 60 words, rewritten as a whole and never added to at the end. A
person's page SHALL also show **Between you**: their **Bond**, where things stand and the turns that brought it there,
newest first, each turn with its Scene.

#### Scenario: A secret stays out of the World screen
- **GIVEN** Quirrell serves Voldemort, and the Player Character does not know it
- **THEN** Quirrell's entry on the World screen says nothing of it

#### Scenario: What he knows grows with a Scene
- **GIVEN** all Roopesh knows of Hermione is that she is a Gryffindor first-year
- **WHEN** a Scene ends in which she noticed the inkwell and asked him for a reason
- **THEN** her entry on the World screen says she noticed the inkwell, from that Scene

#### Scenario: What he knows stays short after many Scenes
- **GIVEN** fifteen Scenes with Draconia, each of which showed him something new about her
- **THEN** what he knows of her is still at most 60 words, and the detail is in Between you and the Journal

#### Scenario: Between you
- **WHEN** the player opens Draconia's page
- **THEN** it shows where things stand between them, and the turns that brought it there, the newest first

### Requirement: Backstage shows everything else, only when visited

**Backstage** SHALL show what happened off-screen day by day, every Life, the Threads and how far each has moved,
what the Director is building toward, and the Writer's beats for the current Scene. Nothing from Backstage SHALL
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
