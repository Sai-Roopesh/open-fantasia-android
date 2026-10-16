## ADDED Requirements

### Requirement: A Scene ends when a Move leaves it or the player ends it

A Scene SHALL be one thing happening between its people, with a purpose. It SHALL end only when a Move skips ahead or
turns to something else, or when the player ends it; the Story SHALL never close a Scene on its own, even once its
purpose has turned. A Move that goes somewhere while the same thing goes on between the same people SHALL keep the
Scene, with the place changing. A Move that turns to something else SHALL lead straight into the next Scene, with no Day
View between. A Scene the player ends SHALL open the **Day View**.

#### Scenario: Walking out of a Scene
- **GIVEN** a Scene in the Gryffindor common room
- **WHEN** the Move is "I go to my room; Harry, Ron and Neville are playing a board game"
- **THEN** a new Scene opens in the dormitory with its title card, and the Reply plays it
- **AND** no Day View appears

#### Scenario: Walking somewhere together keeps the Scene
- **GIVEN** a Scene in the Great Hall in which Hermione wants to know where he went on Wednesday
- **WHEN** the Move is "I go to the library with Hermione"
- **THEN** the same Scene goes on in the library, the place shown changes, and no new title card opens

#### Scenario: The Story never closes a Scene
- **GIVEN** a Scene whose purpose has turned: Draconia has said what she came to say
- **WHEN** the Reply lands it
- **THEN** the Scene stays open with the composer ready, and no Day View opens until the player ends the Scene or a
  Move leaves it

#### Scenario: The player ends a Scene
- **WHEN** the player taps End scene after a Reply
- **THEN** the Scene is closed at that Reply and the Day View opens

## REMOVED Requirements

### Requirement: A Scene ends in one of three ways

**Reason**: The Story no longer closes a Scene on its own; the player decides when a Scene is over.
**Migration**: Replaced by "A Scene ends when a Move leaves it or the player ends it". Scenes the Story closed before
this change stay closed as they were.
