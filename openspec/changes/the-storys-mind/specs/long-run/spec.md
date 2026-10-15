# Spec Delta

## MODIFIED Requirements

### Requirement: The Director shapes the long run around Arcs and Landmarks

The **Director** SHALL shape the Story into **Stretches** that build, peak and rest around the **Arcs** and
**Landmarks**, each the next step of the current **Act** of the **Outline**. A Stretch is three to six days of story
time. Its plan SHALL say:
- what it builds toward, and its phase;
- the Scenes that matter in it, two to five, each with its day and time, its place, who is there and what it is for;
- the step each Arc may take in it;
- the move each **Lead** makes in it.

The Director SHALL know the Story's people and places, and SHALL name only the Story's people in a Scene that
matters; anyone else there is left unnamed. The Director SHALL know the **Engagements** ahead of the Player Character. A Scene that matters about something he has
arranged SHALL be that Engagement, at its time and place, and never a second meeting beside it.

The Director SHALL plan a new Stretch when the last one's days have passed or its Scenes have been played or passed
by, when a Scene has peaked, when a Landmark has passed, or when the player has gone off the plan: its next Scene that
matters passed without him. The Director SHALL know The Story So Far and the Scenes that mattered in the recent
Stretches, and SHALL plan none of the same shape again. It SHALL plan before the World moves on at a
Scene's end, so that what comes next follows the plan. The plan SHALL reach the Story only through the **Writer** and
the **Weaver**, and SHALL be visible only Backstage.

#### Scenario: The plan stays Backstage
- **WHEN** the Director plans the next Stretch
- **THEN** its plan appears in Backstage and nowhere in the Scene, the Day View, the World screen or the Journal

#### Scenario: A stretch that has not run its course
- **GIVEN** the Director planned a Stretch from Monday to Sunday, building toward the flying test on Saturday, with
  three Scenes that matter
- **WHEN** the first of them, on Tuesday, ends without peaking
- **THEN** the Director plans nothing new, and the Day View leads with the Stretch's next Scene

#### Scenario: A Scene that matters he arranged
- **GIVEN** he told Draconia to meet him in the library at ten on Saturday, and it was recorded
- **WHEN** the Director plans a Scene that matters about the debt with her
- **THEN** it is the library at ten on Saturday, and the Day View offers it once, as the Story's pick
- **AND** no second meeting with her about it is planned

#### Scenario: Only the Story's people
- **GIVEN** the Story has no librarian among its people
- **WHEN** the Director plans a Scene that matters in the library
- **THEN** everyone the Scene names is one of the Story's people, and the plan is not sent back for a name

#### Scenario: Off the plan
- **GIVEN** the Stretch's next Scene that matters is Draconia at breakfast on Monday
- **WHEN** the player skips to Tuesday instead
- **THEN** the Director plans again from where the Story now stands

#### Scenario: Not the same week twice
- **GIVEN** the last three Stretches each had Hermione at the library's end table
- **WHEN** the Director plans the next Stretch
- **THEN** no Scene that matters in it puts Hermione at the library's end table

### Requirement: Taste is short, readable and the player's

**Taste** SHALL hold at most ten lines of lasting lessons for each Story, and at most ten for the player, about how
they like to read, which every Story starts with. A lesson SHALL go to the player's own only when it is about how they
like to read and not about one **World**. A Story's Taste SHALL belong to the Story, not to a **Path**: a **Redo** or
another Path SHALL never lose it. The player SHALL be able to read, edit and delete every line. Everything that writes
for the Story SHALL read both.

#### Scenario: Deleting a lesson
- **GIVEN** Taste has the line "keep Ron in the background"
- **WHEN** the player deletes it
- **THEN** later Scenes no longer keep Ron in the background on that account

#### Scenario: Rewording a lesson
- **GIVEN** Taste has the line "keep Ron in the background"
- **WHEN** the player rewords it to "keep Ron in the background unless he's needed"
- **THEN** later Scenes read the new words, and the old ones are gone from Taste

#### Scenario: A lesson outlives its Redo
- **GIVEN** the player redid a Reply with the Direction "never write her as a first-timer", to be remembered
- **WHEN** the player plays on along the Reply that was written again
- **THEN** Taste has the lesson, and later Scenes keep to it

#### Scenario: The player's own Taste in a new Story
- **GIVEN** the player's own Taste says "don't decide what my character feels"
- **WHEN** they start The Night Train to Kalka for the first time
- **THEN** its Scenes keep to that line before anything is learned in it

## REMOVED Requirements

### Requirement: Something new every Stretch
**Reason**: Forcing something new into every Stretch, with no direction to serve, filled the months before the
Philosopher's Stone with strangers and threats that led nowhere.
**Migration**: A new person, threat, mystery or place enters only as a setup the Outline means to pay off
(the-outline: Nothing enters without a payoff); the Outline's turns keep something always moving.
