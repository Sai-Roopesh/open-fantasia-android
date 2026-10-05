# Design

## Context

The phone app (android/) has a working Home, pairing, Scene and first Day View, built by Codex from the specs with
Material defaults. The approved screens are in docs/design, with their decisions and look in its README. The Mac
already sends almost everything the screens show; a few things are drawn apart that the contract sends as one string.

## Goals / Non-Goals

**Goals:**
- Home, pairing, the Scene, its arriving and failed states, Redo, and the Day View's first form, as drawn.
- The look in one place on the phone, so later screens reuse it rather than restyle.

**Non-Goals:**
- Screens and controls for things not built yet; each change adds its own entry points to its drawn screen.
- A different app structure: the screens stay Compose views over the Mac's Scene view (docs/adr/0001).

## Decisions

### The look lives in one theme (android)

One theme file holds the colours, the two typefaces and the shapes from docs/design/README.md, as Material 3 colour
and type roles plus named colours for what Material has no role for (seen, told, rumour; prose). Every screen takes
its colours and type from it. Literata and Manrope come through the Compose Google Fonts provider, which the phone's
Play services fetch and cache; until they arrive, Compose falls back to the system serif and sans. Bundling the font
files was the alternative; the provider keeps the app small and needs no files in the repository.

### What the Mac sends apart (protocol, host)

Contract 3. The screens show some values in two places that the contract sends as one string, and the phone should
not take strings apart:
- `StorySummary.detail`: the line under the standing. Mid-Scene: the clock as people say it and who is there by first
  name ("Friday 9:52 pm · with Hermione"); at the Day View: how many Scenes have been played on the Path ("3 Scenes
  played").
- `StorySummary.standing` at the Day View: "Sunday 7:40 am · choosing where to go" (openspec stories: Home shows where
  every Story stands). Mid-Scene it stays "Scene 14 · After curfew".
- `DayView.day` and `DayView.time`, beside `at_label`: "Sunday", "7:40 am".
- `Countdown.when`, beside `label`: "3 days", "Tomorrow", "Today at 8:30 pm".

How long ago a Story was played is worked out on the phone from `updated_at`, since it depends on when it is looked
at.

### Names on the phone (android)

The screens call people by first name (the Portraits' captions, the Move bubbles, "What does Roopesh do?"). The phone
takes the first word of the name the Mac sends, and the full name stays the accessibility label.

### The composer during a Reply (android)

`presence: The player can always write`: while a Reply arrives, the composer takes text and keeps it; Send waits until
the Reply is done and says so under the composer. Nothing is sent automatically.

### Tests (android)

The Compose checks assert what the player sees. Where the approved screens change words a test looked for ("Day View"
is no longer a heading; "Linger off" becomes a Linger chip), the test is changed to the drawn words in the same task
that changes the screen, and says what it proves as before; no check is dropped.

## Risks / Trade-offs

- [Fonts fetched at first run] → the system fallback is readable; the provider caches after the first fetch.
- [Drawn screens show controls not built yet] → left out until their change, as the README's table says.
