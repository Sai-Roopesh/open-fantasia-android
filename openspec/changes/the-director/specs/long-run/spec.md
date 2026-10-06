# Spec Delta

## MODIFIED Requirements

### Requirement: The Director shapes the long run around Arcs and Landmarks

The **Director** SHALL shape the Story into stretches that build, peak and rest around the **Arcs** and
**Landmarks**, and its plan SHALL be visible only Backstage. It SHALL plan a new stretch when the last one has run
its course or a Scene has peaked, and at no other time. The plan SHALL reach the Story only through the **Writer**,
as what this stretch builds toward and the one step each **Arc** may take in it.

#### Scenario: The plan stays Backstage
- **WHEN** the Director plans the next chapter
- **THEN** its plan appears in Backstage and nowhere in the Scene, the Day View, the World screen or the Journal

#### Scenario: A stretch that has not run its course
- **GIVEN** the Director planned a stretch of four Scenes building toward the flying test
- **WHEN** the second of them ends without peaking
- **THEN** the Director plans nothing new, and the next Scene is planned toward the flying test

### Requirement: Rest is deliberate

After a Scene that peaked, with a confrontation, a revelation or a change that cannot be undone, the Story's next
pick SHALL be a quiet one. A Scene peaked when the **Writer** rated it at that height; a quiet pick is a Happening
where nothing is at stake.

#### Scenario: A quiet pick after a peak
- **GIVEN** the Scene where Draconia chose the Player Character in front of her House just ended
- **THEN** the Story's own pick at the Day View is a quiet Happening
