# Proposal

## Why

There is no World screen. The player cannot look up who someone is, what they have heard of them, where the
places are, or what is coming, so they have to remember it or scroll back. The scenario `outside-the-scene › A secret
stays out of the World screen` is unbuilt, and so is the World screen part of `presence › The Mac is asleep`.

The Story keeps no account of what the Player Character knows of anyone. Each person's `who_they_are` holds their
backstory, secrets included, and so cannot be shown. On 7 October 2026 the player chose where that account comes from:
- a `known` line per person in the Story File, for what he knows when the Story begins;
- kept up by the Chronicler after every Scene, for everyone who was in it;
- with what he has heard of them, from Meanwhile.

## What Changes

- **The Story File** gains `known` for each person: what the Player Character knows of them when the Story begins.
  `examples/night-train/story.yaml` and the test Story Files get theirs. A place's description is what anyone there
  would know, and the Story File spec now says so.
- **The Chronicler** writes, for each person in the Scene that ended, what the Player Character now knows of them.
  It writes this from what happened in the Scene and from what he knew before, never from their backstory.
- **The Weaver** says who each Meanwhile line is about (`about`), so what he has heard of someone can be found.
- **`fantasia known <story> <person> <words>`** sets what he knows of someone on a Story already being played, such
  as the Night Train on this Mac, as a `known_set` entry on the Path.
- **The Mac** gains `GET /stories/{id}/world`:
  - People, the Leads first: each Portrait, Group and what he knows of them, with the Scene it was last added to, and
    what he has heard (seen, told, rumour). People he knows nothing of are left out.
  - Places, with their descriptions, marking where he has been.
  - A Calendar of the Landmarks and the Happenings he knows of that are still ahead, each with its countdown.
- **The phone:**
  - a World screen to World.dc.html, with People, Places and Calendar;
  - a person page to Person.dc.html, read-only: Edit and Replace Portrait come with the editing change;
  - World in the Scene's header;
  - the World kept for reading without the Mac.
- **Contract 14:** `WorldView`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `outside-the-scene`: The World screen shows what the Player Character knows. It is said whose knowledge each part
  is, that people he knows nothing of are left out, and how it stays current; a scenario for the line growing after
  a Scene.
- `story-file`: A Story File sets up every part of a Story. Each person gains what the Player Character knows of them
  when the Story begins; a place's description is public.

## Impact

- Host:
  - `story/state.ts`, `story/reducer.ts` and `story/entries.ts` (`known` on a person, the `known_set` entry, `known`
    on a Chronicle);
  - `agents/chronicler.ts` and `CHRONICLER.md`, `agents/weaver.ts` and `WEAVER.md` (`about`);
  - `views/world.ts` and `link/server.ts`;
  - `cli/commands.ts` (`fantasia known`);
  - `storyfile/import.ts`.
- Protocol: `story-file.schema.json` (`known`), `link.schema.json` and `contract.json` to 14.
- Android:
  - `WorldScreen.kt` and the person page;
  - the header and routing in `SceneScreen.kt` and `FantasiaApp.kt`;
  - `FantasiaModel.kt`, `FantasiaLink.kt`, `LinkClient.kt`;
  - `MacConnection.kt`, to keep the World.
- Examples: `examples/night-train/story.yaml` gains `known` lines.
- Tests:
  - host tests for the view, the Chronicler's lines and the command;
  - a live Chronicler test that a secret stays out;
  - shared checks on the JVM and the device;
  - the kept copy.
