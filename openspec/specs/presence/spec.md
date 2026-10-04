# Presence

## Purpose

How the app feels while the Story is being written, where it works, and what happens when something cannot be
done.

## Requirements

### Requirement: Replies stream in

A Reply SHALL appear word by word as it is written.

#### Scenario: Watching a Reply arrive
- **WHEN** the player sends a Move
- **THEN** the Reply's first words appear before it is finished, and the rest follows as it is written

### Requirement: The player can always write

The player SHALL be able to type the next Move at any time, including while a Reply is still arriving.

#### Scenario: Typing during a Reply
- **GIVEN** a Reply is still streaming in
- **THEN** the player can type in the composer, and sends once the Reply is complete

### Requirement: Between Scenes is quiet, and shows progress

Between Scenes, one line SHALL say what is under way, and the Day View SHALL fill in as each part is ready.

#### Scenario: The World moves on
- **WHEN** the player ends a Scene
- **THEN** a single line says the Scene is being recorded and the World is moving on, until the Day View is ready

### Requirement: The phone buzzes for two things only

When the app is not open, the phone SHALL notify the player when a Reply is ready or when a Day View is ready, and
for nothing else.

#### Scenario: A Reply finishes while the phone is locked
- **GIVEN** the player sent a Move and locked the phone
- **WHEN** the Reply is finished
- **THEN** the phone shows one notification that the Reply is ready

### Requirement: Nothing fails silently

When something cannot be done, the place the player is looking SHALL say what failed and offer Retry or another
model, and nothing the player wrote SHALL be lost.

#### Scenario: A model is down
- **GIVEN** the Actor's model fails while writing a Reply
- **THEN** the Scene shows that the Reply failed, with Retry and another model
- **AND** the player's Move is still there

### Requirement: The phone finds the Mac on any shared network

The phone SHALL find the Mac on whatever network they share, with nothing to set up after pairing once. Nothing
SHALL be built for playing without the Mac nearby.

#### Scenario: A new network
- **GIVEN** the phone was paired with the Mac at home
- **WHEN** both are on a hotel's Wi-Fi
- **THEN** the phone reaches the Mac without the player entering anything

### Requirement: What has been seen can be read without the Mac

Without the Mac, the player SHALL still be able to open any Story and read everything already seen, and a Move
SHALL wait for the Mac with the app saying so.

#### Scenario: The Mac is asleep
- **GIVEN** the Mac is asleep
- **WHEN** the player opens a Story
- **THEN** its Scenes, Journal and World screen can be read
- **AND** the composer says the Mac is unreachable

### Requirement: The Mac keeps working while the phone is locked

Work under way SHALL carry on with the phone locked or the app closed.

#### Scenario: Ending a Scene and locking the phone
- **WHEN** the player ends a Scene and locks the phone at once
- **THEN** the Day View is ready when they next open the app
