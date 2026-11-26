# Spec Delta

## Purpose

How the phone and the Mac find each other, pair once, exchange what the player does, and keep the phone's view of
a Story in step with what happens on the Mac, without losing anything across a dropped connection.

## ADDED Requirements

### Requirement: Pairing happens once, by QR code

The Mac SHALL show a QR code when asked to pair, and scanning it with the phone SHALL pair them. After pairing, the
phone SHALL reach the Mac with nothing more to enter, and the Mac SHALL refuse anything from a phone that has not
paired with it.

#### Scenario: First pairing
- **WHEN** the player runs the pairing command on the Mac and scans the QR code it shows with the phone
- **THEN** the phone lists the Mac's Stories

#### Scenario: An unpaired phone
- **WHEN** a device that never paired sends a Move to the Mac
- **THEN** the Mac refuses it and nothing changes

### Requirement: The phone finds the Mac on the network they share

The phone SHALL find the paired Mac on whatever network they share, by itself, including after either moves to a
different network.

#### Scenario: The Mac's address changes
- **GIVEN** the Mac's network address changed since pairing
- **WHEN** the player opens the app on the same network
- **THEN** the phone reaches the Mac without the player entering anything

### Requirement: Every request is answered or refused with a reason

Every request from the phone SHALL be answered, or refused with a reason the player can read. Every answer and
every refusal SHALL carry a trace id that the app shows with any failure and that the Mac can look up.

#### Scenario: A refused Move
- **GIVEN** a Reply is still being written
- **WHEN** the phone sends another Move
- **THEN** the Mac refuses it with a reason and a trace id, and the app shows the reason

#### Scenario: Looking up a failure
- **GIVEN** the app showed a failure with its trace id
- **WHEN** that trace id is looked up on the Mac
- **THEN** the Mac shows what was asked, what happened, and any model call involved

### Requirement: A Story's changes reach the phone live and in order

While the phone has a Story open, every change to it on the Mac SHALL reach the phone as it happens, in the order it
happened, including a Reply arriving word by word.

#### Scenario: A Reply arrives live
- **WHEN** the Mac starts writing a Reply
- **THEN** the phone shows its words as they are written, in order

### Requirement: A dropped connection loses nothing

When the connection drops and returns, the phone SHALL receive every change it missed, in order, before any new
one, and SHALL show the Story exactly as it stands on the Mac.

#### Scenario: Wi-Fi drops mid-Reply
- **GIVEN** the connection drops while a Reply is being written and returns after the Reply is finished
- **THEN** the phone shows the whole finished Reply and everything after it, with nothing missing or repeated

### Requirement: The phone and the Mac agree on what they speak

The phone and the Mac SHALL each say which version of their shared contract they speak, and a mismatch SHALL be
reported to the player as a version mismatch, never as a broken Story.

#### Scenario: An old app
- **GIVEN** the Mac speaks a newer contract than the app
- **WHEN** the app connects
- **THEN** the app says it needs updating to match the Mac
