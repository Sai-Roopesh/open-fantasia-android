# Spec Delta

## MODIFIED Requirements

### Requirement: One Models screen

One screen, reached from Home, SHALL list every job (the **Actor**, the **Writer**, the **Chronicler**, the **Weaver**
and the **Director**) with the model doing it, chosen from every model Claude, Codex and Antigravity offer, each with
the efforts that model supports. The **Actor**'s model SHALL be settable per **Story** on the same screen; a **Story**
without its own takes the one its Story File names. A change SHALL reach the next work of that job, and SHALL stay
until it is changed again. When a provider cannot be asked what it offers, the screen SHALL show the models it last
offered and say it could not be reached.

#### Scenario: Moving the Weaver to Codex
- **WHEN** the player sets the Weaver to GPT 6.1 Sol
- **THEN** the next Weaver work runs on GPT 6.1 Sol

#### Scenario: A Story's own Actor
- **WHEN** the player sets the Actor for "The Malfoy Problem" to Opus 5.5
- **THEN** that Story's Replies are written by Opus 5.5, whatever the other Stories use

#### Scenario: A setting outlasts the Mac restarting
- **GIVEN** the player set the Writer to Gemini 3.8 Flash at high effort
- **WHEN** the Mac's host is restarted
- **THEN** the Models screen still shows the Writer on Gemini 3.8 Flash, high, and the next Writer work runs on it
