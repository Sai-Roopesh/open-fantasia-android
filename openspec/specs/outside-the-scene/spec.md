# Outside the Scene

## Purpose

Four places the player can go without leaving the Story: the World screen and the Journal, which show only what
the Player Character knows; Backstage, which shows everything else; and the Models screen.

## Requirements

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

### Requirement: The Journal reads the Story back

The **Journal** SHALL list every Scene on the current Path with its one-line summary and the full Scene a tap away,
together with what the Player Character heard Meanwhile, in order.

#### Scenario: Reading back
- **WHEN** the player opens the Journal and taps Scene 3
- **THEN** Scene 3 is shown in full

### Requirement: Backstage shows everything else, only when visited

**Backstage** SHALL show what happened off-screen day by day, every Life, the Threads and how far each has moved,
what the Director is building toward, each Scene that matters in the Stretch in one short line, and the Writer's
beats for the current Scene. Nothing from Backstage SHALL
appear in the Scene, the Day View, the World screen or the Journal.

Backstage SHALL also show **The record**, each part of a record that was left out, with why; what each **Stretch**
brought that was new; and **How it's going**: how long Scene ends take, how often each job needed its second model or
a Retry, the pace of the recent Scenes, how often the Story's pick was taken, and the player's reactions.

#### Scenario: Quirrell's nights, Backstage
- **WHEN** the player opens Backstage for Saturday night
- **THEN** it shows what Quirrell did that night

#### Scenario: What the Director is building toward
- **GIVEN** the Director's plan builds toward the flying test on Wednesday
- **WHEN** the player opens Backstage
- **THEN** it says the Story is building toward the flying test on Wednesday, and that rest comes after it

#### Scenario: A gap in the record
- **GIVEN** a Scene's record was kept with a Moment left out, because its words were not on the page
- **WHEN** the player opens Backstage
- **THEN** The record lists that Scene, the Moment left out, and why

#### Scenario: The Stretch, a line each
- **GIVEN** the Director's Stretch has Charms on Monday as a Scene that matters
- **WHEN** the player opens Backstage
- **THEN** it lists Monday's Scene in one short line, such as "Charms: Flitwick pairs him with Draconia", and not the
  Director's note to the Writer

#### Scenario: How it's going
- **GIVEN** ten Scenes have been played
- **WHEN** the player opens Backstage
- **THEN** How it's going shows how long their Scene ends took, how often a job needed its second model, the pace of
  the ten Scenes, how often the Story's pick was taken, and the reactions given

### Requirement: One Models screen

One screen, reached from Home, SHALL list every job (the **Actor**, the **Writer**, the **Chronicler**, the **Weaver**,
the **Director** and the **Folder**), each with its model and its second model, with the model doing it, chosen from every model Claude, Codex and Antigravity offer, each with
the efforts that model supports. The **Actor**'s model SHALL be settable per **Story** on the same screen; a **Story**
without its own takes the one its Story File names. A change SHALL reach the next work of that job, and SHALL stay
until it is changed again. When a provider cannot be asked what it offers, the screen SHALL show the models it last
offered and say it could not be reached.

#### Scenario: Moving the Weaver to Codex
- **WHEN** the player sets the Weaver to GPT 6.1 Sol
- **THEN** the next Weaver work runs on GPT 6.1 Sol

#### Scenario: A Story's own Actor
- **WHEN** the player sets the Actor for "The Malfoy Problem" to Opus 5.5
- **THEN** that Story's Replies are written by Opus 5.5, whatever the other Stories use

#### Scenario: A setting outlasts the Mac restarting
- **GIVEN** the player set the Writer to Gemini 3.8 Flash at high effort
- **WHEN** the Mac's host is restarted
- **THEN** the Models screen still shows the Writer on Gemini 3.8 Flash, high, and the next Writer work runs on it

#### Scenario: The Folder on Haiku
- **GIVEN** the player has never set the Folder's model
- **THEN** the Models screen shows the Folder on Haiku 4.5, and the player can move it like any job
