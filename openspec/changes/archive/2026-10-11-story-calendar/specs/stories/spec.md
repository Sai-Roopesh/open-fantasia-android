# Spec Delta

## ADDED Requirements

### Requirement: Story time is told as dates

When a Story has a calendar, everyone who reads its time SHALL read it as a date: the agents as a weekday, day,
month and year with the time, such as "Friday 6 September 1991, 9:40 pm"; the player as the weekday and date on the
Day View, such as "Friday 6 September", and the weekday and time elsewhere. No agent SHALL be shown a day number,
and agents SHALL answer with dates, which the Story turns into its own times. A Story with no calendar SHALL say its
days by number.

#### Scenario: The Director plans on dates
- **GIVEN** a Story whose first day is Sunday 1 September 1991, now Friday 6 September at 9:40 pm
- **WHEN** the Director plans the next Stretch
- **THEN** it is told today is Friday 6 September 1991, picks each Scene that matters from the Stretch's dates, and
  each lands on the date it picked

#### Scenario: An arrangement made for a date
- **GIVEN** the same Story, and Draconia says on the page "Saturday the fourteenth, eight o'clock, the owlery"
- **WHEN** the Chronicler records it as 1991-09-14 20:00
- **THEN** the Engagement is on Saturday 14 September 1991 at 8:00 pm

#### Scenario: The Day View says the date
- **GIVEN** the same Story, now Saturday 7 September at 7:30 am
- **WHEN** the player is at the Day View
- **THEN** it says "Saturday 7 September"
