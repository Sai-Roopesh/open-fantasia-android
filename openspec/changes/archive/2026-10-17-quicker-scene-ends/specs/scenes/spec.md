## MODIFIED Requirements

### Requirement: Linger holds the moment

While **Linger** is on, the Story SHALL stop pushing the Scene along: no beat SHALL be forced, nothing SHALL close or
leave the Scene but the player's End scene, and time SHALL move only as the moment does, while everything still
answers the player's Moves. A Move that goes somewhere or skips ahead SHALL go on in the same Scene. Linger SHALL clear
when the Scene ends or the player turns it off.

#### Scenario: Lingering with Hermione
- **GIVEN** Linger is on in the common room with Hermione
- **WHEN** eight exchanges pass with no beat happening
- **THEN** no beat is forced and the Scene stays open

#### Scenario: Lingering never leaves the Scene
- **GIVEN** Linger is on in the common room with Hermione
- **WHEN** the Move is "We walk down to the lake and talk until the sun comes up"
- **THEN** the same Scene goes on at the lake, with no new title card and no Scene's end, until the player taps End scene

### Requirement: A long Scene is recorded as it goes

A **Scene** SHALL be carried word for word while it is under a size limit of about thirty exchanges. Past it, the
Scene so far SHALL be recorded as a finished Scene is, once, and from then on carried as that record with its latest
exchanges word for word; any earlier passage SHALL stay readable to the **Writer**. The Writer SHALL close a Scene that
has become another one, unless Linger is on.

#### Scenario: Thirty exchanges in
- **GIVEN** a Scene in the secret suite has run past thirty exchanges
- **WHEN** the next Move is sent
- **THEN** the Scene so far is recorded first, and what was decided at its start still holds in the Reply

#### Scenario: A Scene that has become another
- **GIVEN** a long Scene in the dorm in which they have left for the Astronomy Tower and a different night has begun
- **WHEN** the next Move is answered
- **THEN** the dorm Scene closes and a new Scene opens with its own title card

### Requirement: A Scene ends when a Move leaves it or the player ends it

A Scene SHALL be one thing happening between its people, with a purpose. It SHALL end only when a Move skips ahead or
turns to something else, or when the player ends it; the Story SHALL never close a Scene on its own, even once its
purpose has turned. A Move that goes somewhere while the same thing goes on between the same people SHALL keep the
Scene, with the place changing. A Move that turns to something else SHALL lead straight into the next Scene, with no Day
View between. End scene SHALL ask the player to confirm, and a Scene the player ends SHALL open the **Day View**.

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
- **WHEN** the player taps End scene after a Reply, and confirms
- **THEN** the Scene is closed at that Reply and the Day View opens

#### Scenario: End scene asks first
- **WHEN** the player taps End scene by accident
- **THEN** the phone asks "End this Scene?", and Keep playing leaves the Scene open with nothing sent to the Mac
