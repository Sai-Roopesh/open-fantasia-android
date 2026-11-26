# Spec Delta

## MODIFIED Requirements

### Requirement: The Director shapes the long run around Arcs and Landmarks

The **Director** SHALL shape the Story into **Stretches** that build, peak and rest around the **Arcs** and
**Landmarks**. A Stretch is about a week of story time. Its plan SHALL say:
- what it builds toward, and its phase;
- the Scenes that matter in it, two to five, each with its day and time, its place, who is there and what it is for;
- the step each Arc may take in it;
- the move each **Lead** makes in it.

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

### Requirement: Rest is deliberate

After a Scene that peaked, with a confrontation, a revelation or a change that cannot be undone, the next **Stretch**
SHALL be a rest: its Scenes that matter SHALL be quiet ones, and the Story's next pick SHALL be one of them. A Scene
peaked when the **Writer** rated it at that height; a quiet Scene is one where nothing is at stake, though the people
in it still want what they want.

#### Scenario: A quiet pick after a peak
- **GIVEN** the Scene where Draconia chose the Player Character in front of her House just ended
- **THEN** the Story's own pick at the Day View is a quiet Happening

## ADDED Requirements

### Requirement: Arcs keep pace with the run

The **Director** SHALL keep a roadmap of where each **Arc** should stand by each coming **Landmark**, from the whole
run of the Story. It SHALL revise the roadmap as the Story goes. Each Stretch's step for an Arc SHALL be as large as
reaching the next point on the roadmap needs, never as small as possible by rule, and never beyond what the Arc's
slow burn allows by that point.

#### Scenario: Four years of romance, paced
- **GIVEN** a Story whose romance Arc must run four years, with the Halloween troll eight weeks away
- **WHEN** the Director plans a Stretch in the first month
- **THEN** its roadmap says where Draconia should stand with him by Halloween, and the Stretch's step moves her
  toward it

#### Scenario: The roadmap follows the player
- **GIVEN** the roadmap expected a first public claim by Halloween
- **WHEN** the player's Moves bring it about in the second week
- **THEN** the next Stretch's roadmap moves its later points on from there, and does not hold the Arc back to wait
  for its dates

### Requirement: Leads act every Stretch

Every **Stretch** SHALL give each **Lead** a move about the **Player Character**: something they do, toward him, about
him or about someone near him. It is made in one of the Stretch's Scenes, or off-screen. A Lead SHALL not be put into
every Scene to make it. A move made off-screen SHALL happen in the **World**, be recorded with who knows of it, and
reach him as **Meanwhile**, as something found, or as a consequence he meets.

#### Scenario: Jealousy acted on
- **GIVEN** Draconia saw him hold Hermione in the Great Hall
- **WHEN** the next Stretch is planned
- **THEN** Draconia's move in it acts on that, on screen or off: she claims him, or moves against Hermione

#### Scenario: A move made off-screen reaches him
- **GIVEN** a Stretch in which Draconia has no Scene with him
- **WHEN** its days pass
- **THEN** Backstage shows what she did about him that week, and he learns of it as someone would tell it or as
  something he finds
