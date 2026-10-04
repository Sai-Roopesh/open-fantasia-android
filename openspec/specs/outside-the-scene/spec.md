# Outside the Scene

## Purpose

Four places the player can go without leaving the Story: the World screen and the Journal, which show only what
the Player Character knows; Backstage, which shows everything else; and the Models screen.

## Requirements

### Requirement: The World screen shows what the Player Character knows

The World screen SHALL show People (Portrait, who they are, what the Player Character knows and has heard of
them), Places, and a Calendar of Landmarks and the Happenings the Player Character knows of with countdowns, and
SHALL show nothing the Player Character does not know.

#### Scenario: A secret stays out of the World screen
- **GIVEN** Quirrell serves Voldemort, and the Player Character does not know it
- **THEN** Quirrell's entry on the World screen says nothing of it

### Requirement: The Journal reads the Story back

The **Journal** SHALL list every Scene on the current Path with its one-line summary and the full Scene a tap away,
together with what the Player Character heard Meanwhile, in order.

#### Scenario: Reading back
- **WHEN** the player opens the Journal and taps Scene 3
- **THEN** Scene 3 is shown in full

### Requirement: Backstage shows everything else, only when visited

**Backstage** SHALL show what happened off-screen day by day, every Life, the Threads and how far each has moved,
what the Director is building toward, and the Writer's beats for the current Scene. Nothing from Backstage SHALL
appear in the Scene, the Day View, the World screen or the Journal.

#### Scenario: Quirrell's nights, Backstage
- **WHEN** the player opens Backstage for Saturday night
- **THEN** it shows what Quirrell did that night

### Requirement: One Models screen

One screen SHALL list every job (the **Actor**, the **Writer**, the **Chronicler**, the **Weaver** and the
**Director**) with the model doing it, chosen from every model Claude, Codex and Antigravity offer. The Actor's
model SHALL be settable per Story on the same screen.

#### Scenario: Moving the Weaver to Codex
- **WHEN** the player sets the Weaver to GPT 6.1 Sol
- **THEN** the next Weaver work runs on GPT 6.1 Sol

#### Scenario: A Story's own Actor
- **WHEN** the player sets the Actor for "The Malfoy Problem" to Opus 5.5
- **THEN** that Story's Replies are written by Opus 5.5, whatever the other Stories use
