# Spec Delta

## MODIFIED Requirements

### Requirement: The phone buzzes for two things only

When the app is not open, the phone SHALL notify the player when a Reply is ready or when a Day View is ready, and
for nothing else. While one is being written, a silent note SHALL say so and SHALL give way to the notification
when it is ready.

#### Scenario: A Reply finishes while the phone is locked
- **GIVEN** the player sent a Move and locked the phone
- **WHEN** the Reply is finished
- **THEN** the phone shows one notification that the Reply is ready

### Requirement: The phone finds the Mac on any shared network

The phone SHALL find the Mac on whatever network they share, with nothing to set up after pairing once, trying every
address the Mac has given it. Nothing SHALL be built for playing without the Mac nearby.

#### Scenario: A new network
- **GIVEN** the phone was paired with the Mac at home
- **WHEN** both are on a hotel's Wi-Fi
- **THEN** the phone reaches the Mac without the player entering anything

#### Scenario: A network that keeps them apart
- **GIVEN** the Mac gave the phone its address on a private network both are on, when they paired
- **WHEN** the Wi-Fi they share does not let them see each other
- **THEN** the phone reaches the Mac at that address without the player entering anything

### Requirement: What has been seen can be read without the Mac

Without the Mac, the player SHALL still be able to open any Story and read everything already seen, and a Move
SHALL wait for the Mac with the app saying so, and SHALL be sent once the Mac is back.

#### Scenario: The Mac is asleep
- **GIVEN** the Mac is asleep
- **WHEN** the player opens a Story
- **THEN** its Scenes, Journal and World screen can be read
- **AND** the composer says the Mac is unreachable
