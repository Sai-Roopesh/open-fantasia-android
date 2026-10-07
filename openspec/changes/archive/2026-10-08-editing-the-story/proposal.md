# Proposal

## Why

Once a **Story** is running, only its people, **Leads**, **Groups**, **Portraits** and the deletion of a **Taste**
line can be changed. ADR 0002 rests on everything being editable in the app and through Claude on the Mac, and
`stories › Anything can be edited or created in the app` names the rest: places, the **Arcs**, the **Landmarks**,
the **Premise**, the **Style**, the reply length, Taste and the time. Two scenarios are unbuilt because of it:
- `stories › Anything can be edited or created in the app › A Landmark is moved on one Path`;
- `long-run › Style is the player's own words › Changing the Style mid-Story`.

This is the other half of editing, after editing-people. On 7 October 2026 the player chose three things:
- **The phone screen.** No screen for these is drawn, so this change draws one, "The Story", for the player to
  approve, and builds it as drawn.
- **The Player Character.** Editing them means editing who they are, which their person page already does. Who the
  player plays never changes mid-Story.
- **The time.** The clock can be moved on, never back. The World catches up as it does over a Gap.

## What Changes

- **Edits are entries on the Path (host).** Each lands from that moment onward on the current Path, between Replies,
  and phones are told as with any change:
  - `premise_set`, `style_set` and `reply_length_set`;
  - `arcs_set`: the Arcs as a whole;
  - `landmark_set` and `landmark_dropped`: a Landmark created, moved or rewritten, or taken out;
  - `place_set`: a place or institution created or rewritten;
  - `world_set`: what the World is, and its history;
  - `clock_set`: the clock moved on, and which weekday Day 1 was.

  Taste lines are reworded with the `taste_set` that deleting one already writes.
- **Checks that keep the Story whole (host).**
  - A Landmark the World has already passed on this Path stays where it was. A Landmark can only be set to a time
    after where the World stands.
  - The clock only moves forward.
  - A blank Premise or Style, a second place with the same name, or a reply length that is not Short, Medium or Full
    is refused, with the reason.
- **The Mac's commands (host).** `fantasia premise`, `style`, `length`, `arc`, `landmark`, `place`, `world`, `clock`
  and `taste` make the same edits, so Claude can make them too.
- **The link (protocol, host).** Contract 16:
  - `GET /stories/{id}/story`: everything the Story screen shows, as it stands on the current Path;
  - a `PUT` for each edit, each taking the head the phone saw and answering with the Story screen as it now stands.
- **The phone (android).**
  - **The Story** (`docs/design/Story.dc.html`), opened from the Story's title in the Scene's header. It shows the
    Premise, the Style with the reply length beside it, the Arcs, the Landmarks with when each falls, what the World
    is, its places and institutions, and the time.
  - **The Story's editor** (`docs/design/StoryEdit.dc.html`): one sheet for each kind of edit.
  - **Backstage**: tapping a Taste line rewords it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `stories`, Anything can be edited or created in the app:
  - says how the time and the Landmarks may be edited;
  - scenarios for moving the clock on, a clock that never goes back, a Landmark the World has passed, and a place
    added mid-Story.
- `long-run`:
  - Arcs are built toward, never resolved on a schedule: a scenario for an Arc dropped mid-Story;
  - Style is the player's own words: a scenario for changing the reply length;
  - Taste is short, readable and the player's: a scenario for rewording a lesson.

## Impact

- **Host:**
  - `story/entries.ts` and `story/reducer.ts` (the new entries);
  - `engine/engine.ts` and a new `engine/story.ts` (the checks);
  - `views/story.ts` and `link/server.ts` (the view and routes);
  - `views/scene.ts` (the new entries tell phones `path_changed`);
  - `cli/commands.ts` and `cli/main.ts` (the commands).
- **Protocol:** `link.schema.json` and `contract.json` move to 16.
- **Android:**
  - `StoryScreen.kt` and `StoryEditor.kt` (new), the Scene header and Backstage;
  - `FantasiaModel.kt`, `FantasiaLink.kt`, `LinkClient.kt` and `MacConnection.kt`.
- **Design:** `docs/design/Story.dc.html` and `StoryEdit.dc.html` (new), the README's table, and `canvas.json`.
- **Tests:**
  - engine, CLI and link tests for every edit and each scenario;
  - shared checks on the JVM and the device;
  - a live check that a Reply after the Style change reads as the Style says;
  - the on-phone check done over adb.
