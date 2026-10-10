# Spec Delta

## MODIFIED Requirements

### Requirement: The Director shapes the long run around Arcs and Landmarks

The **Director** SHALL shape the Story into **Stretches** that build, peak and rest around the **Arcs** and
**Landmarks**. A Stretch is about a week of story time. Its plan SHALL say:
- what it builds toward, and its phase;
- the Scenes that matter in it, two to five, each with its day and time, its place, who is there and what it is for;
- the step each Arc may take in it;
- the move each **Lead** makes in it.

The Director SHALL know the **Engagements** ahead of the Player Character. A Scene that matters about something he has
arranged SHALL be that Engagement, at its time and place, and never a second meeting beside it.

The Director SHALL plan a new Stretch when the last one's days have passed or its Scenes have been played, when a
Scene has peaked, or when a Landmark has passed, and at no other time. It SHALL plan before the World moves on at a
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
