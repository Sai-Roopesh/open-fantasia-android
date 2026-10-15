# Spec Delta

## MODIFIED Requirements

### Requirement: A Story's changes reach the phone live and in order

While the phone has a Story open, every change to it on the Mac SHALL reach the phone as it happens, in the order it
happened, including each step of a Reply under way (looking back, writing, checking) and the Reply itself once it has
been checked (docs/adr/0019).

#### Scenario: A Reply arrives live
- **WHEN** the Mac starts writing a Reply
- **THEN** the phone shows each step of it as it happens, in order, and the Reply whole once it is checked
