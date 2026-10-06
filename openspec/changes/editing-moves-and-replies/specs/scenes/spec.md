# Spec Delta

## MODIFIED Requirements

### Requirement: The latest Reply has its actions in view

The latest Reply SHALL always show **Copy**, **Redo**, **Edit** and **Try another way** without a menu. A
long-press on any earlier Reply or Move SHALL offer Copy, **Rewind** to here, Try another way from here, and Edit.
On a **Move**, Rewind to here and Try another way from here SHALL act on the moment before that **Move**.

#### Scenario: Copying the latest Reply
- **WHEN** the player taps Copy on the latest Reply
- **THEN** the Reply's text is on the clipboard

#### Scenario: Holding an earlier Move
- **GIVEN** the player's Move "I sit at the other end of the sofa" has a Reply after it
- **WHEN** the player holds that Move
- **THEN** Copy, Rewind to here, Try another way from here and Edit are offered
- **AND** Rewind to here goes back to the moment before that Move, with the Move and everything after it set aside

### Requirement: Editing

Editing the latest Move or Reply SHALL change it in place. Editing anything earlier SHALL carry the Story on from
the edit on a new **Path**, leaving what came after on the Path it was on. No edit SHALL happen while a **Reply** is
being written.

#### Scenario: Fixing a typo in the latest Reply
- **WHEN** the player edits "Hermoine" to "Hermione" in the latest Reply
- **THEN** the Reply reads "Hermione" and no new Path exists

#### Scenario: Fixing the latest Move
- **GIVEN** the latest Move reads "I sit at the other end of the sofa" and has its Reply
- **WHEN** the player edits it to "I sit at the far end of the sofa"
- **THEN** the Move reads "I sit at the far end of the sofa", its Reply is as it was, and no new Path exists

#### Scenario: Editing an earlier Move
- **GIVEN** the player is ten exchanges past a Move
- **WHEN** they edit that Move
- **THEN** a new Path carries on from the edited Move
- **AND** the ten exchanges after it remain on the Path they were on
