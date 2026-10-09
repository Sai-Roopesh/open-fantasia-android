# Spec Delta

## MODIFIED Requirements

### Requirement: A Scene ends in one of three ways

A Scene SHALL be one thing happening between its people, with a purpose. It SHALL end when that purpose has turned and
the Story brings it to a close, when a Move skips ahead or turns to something else, or when the player ends it. A Move
that goes somewhere while the same thing goes on between the same people SHALL keep the Scene, with the place
changing. A Move that turns to something else SHALL lead straight into the next Scene, with no Day View between. A
Scene the Story closes or the player ends SHALL open the **Day View**.

#### Scenario: Walking out of a Scene
- **GIVEN** a Scene in the Gryffindor common room
- **WHEN** the Move is "I go to my room; Harry, Ron and Neville are playing a board game"
- **THEN** a new Scene opens in the dormitory with its title card, and the Reply plays it
- **AND** no Day View appears

#### Scenario: Walking somewhere together keeps the Scene
- **GIVEN** a Scene in the Great Hall in which Hermione wants to know where he went on Wednesday
- **WHEN** the Move is "I go to the library with Hermione"
- **THEN** the same Scene goes on in the library, the place shown changes, and no new title card opens

#### Scenario: The Story closes a Scene
- **WHEN** a Reply brings the Scene to its close
- **THEN** the Day View opens after it

#### Scenario: The player ends a Scene
- **WHEN** the player taps End scene after a Reply
- **THEN** the Scene is closed at that Reply and the Day View opens
