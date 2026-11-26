# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds:
- `stories › Anything can be edited or created in the app`:
  - A Landmark is moved on one Path;
  - Moving the clock on;
  - The clock never goes back;
  - A Landmark the World has passed;
  - A place is added mid-Story.
- `long-run`:
  - Arcs are built toward, never resolved on a schedule: An Arc is dropped;
  - Style is the player's own words: Changing the Style mid-Story; Changing the reply length;
  - Taste is short, readable and the player's: Rewording a lesson.

## 0. The screens

- [x] 0.1 The player approves `docs/design/Story.dc.html`, `StoryEdit.dc.html` and the chevron on the Scene header's
  title (drawn with this proposal), or the drawings change until they do. No phone code before this.

## 1. Edits on the Path

- [x] 1.1 The nine entries and the reducer (design decision 1), and the checks in `engine/story.ts` (decision 2):
  - an engine test for each refusal;
  - a reducer test that each entry changes only its own part of the State.
- [x] 1.2 Test first, then build: `long-run › Style is the player's own words › Changing the Style mid-Story` and
  `› Changing the reply length`:
  - `engine.setStyle` and `engine.setReplyLength`;
  - the Actor's and the Writer's next calls carry the new Style and length;
  - calls for the Reply before the edit carried the old ones;
  - another Path keeps the old ones.
- [x] 1.3 A live check, with the real Actor: after the Style gains "keep the humour dry and British", a Reply judged
  by a second model reads as dry and British, beside the same Move's Reply before the change. Run it with the other
  live checks, and keep it out of the default suite.
- [x] 1.4 Test first, then build: `stories › Anything can be edited or created in the app › A Landmark is moved on one
  Path` and `› A Landmark the World has passed`:
  - `engine.setLandmark` and `dropLandmark`;
  - a betrothal at Day 760 on two Paths is moved to Day 700 on one;
  - with fake models, a span over Day 700 brings it about on that Path, and the other Path's Calendar still has it at
    Day 760;
  - moving the Halloween feast after the Weaver has passed it is refused with the reason, and nothing is written.
- [x] 1.5 Test first, then build: `› Moving the clock on` and `› The clock never goes back`:
  - `engine.setClock`;
  - at a Day View on Saturday 7:40 am, moving to Sunday 9:00 am makes the Day View's time Sunday 9:00 am and drops
    the Happenings before it from its choices;
  - after a choice, the Weaver's record covers Saturday to Sunday and shows in Backstage;
  - setting Friday 8:00 pm in a Scene on Friday 9:40 pm is refused, and the head does not move.
- [x] 1.6 Test first, then build: `› A place is added mid-Story`:
  - `engine.setPlace`;
  - the World view's places include the Room of Requirement from Scene 12 on that Path;
  - the Writer's next call names it among the places;
  - it is absent at Scene 11 and on another Path.
- [x] 1.7 Test first, then build: `long-run › Arcs are built toward, never resolved on a schedule › An Arc is dropped`:
  - `engine.setArcs`;
  - the Writer's, Weaver's and Director's next calls no longer list the dropped Arc;
  - the State at Scene 14, and another Path, still have it.
- [x] 1.8 Test first, then build: `long-run › Taste is short, readable and the player's › Rewording a lesson`:
  - `engine.rewordTaste`;
  - the Writer's next call reads the new words in the line's place, and Taste no longer has the old ones.
- [x] 1.9 `engine.setPremise` and `engine.setWorld`:
  - a test that every agent's next call reads the new words;
  - each of the nine entries tells phones `path_changed` (`views/scene.ts`), with a test.

## 2. The link and the Mac's commands

- [x] 2.1 Contract 16 (design decision 4) in `link.schema.json` and `contract.json`. Regenerate, and verify both
  sides compile.
- [x] 2.2 `views/story.ts` and the routes:
  - link tests for `GET /stories/{id}/story`, including a Landmark marked passed and `world_stands`;
  - a test for each `PUT` and `POST`, including a refusal with its reason and a stale head.
- [x] 2.3 The commands (design decision 5), with a CLI test each:
  - `fantasia premise`, `style` (with `--add`), `length`, `arc`, `landmark`, `place`, `world`, `clock` and `taste`;
  - each says what changed or why not;
  - a phone watching is told.

## 3. The phone

- [x] 3.1 The Story screen, built to `Story.dc.html`, opened from the header title's chevron:
  - `StoryScreen.kt`;
  - `FantasiaModel` state and loading, and `FantasiaLink`, `LinkClient` and `MacConnection` calls;
  - edits are off while a Reply is written or the Mac is unreachable;
  - a JVM test that each call sends the head the phone saw.
- [x] 3.2 The editor sheet, built to `StoryEdit.dc.html`, for each kind of edit:
  - shared checks on the JVM and the device for "A Landmark is moved on one Path", "Changing the Style mid-Story",
    "Changing the reply length", "An Arc is dropped" and "A place is added mid-Story", as the phone does them;
  - a check that a refusal ("That time has passed on this Path.") shows in the sheet with the words kept;
  - a check that "Moving the clock on" shows the Day View at the new time.
- [x] 3.3 Backstage: tapping a Taste line opens the sheet holding it. A shared check for "Rewording a lesson" as the
  phone does it.
- [x] 3.4 Previews of The Story and the sheet, compared side by side with `Story.dc.html` and `StoryEdit.dc.html`.
  Fix what differs.

## 4. Together

- [x] 4.1 Run `scripts/scenarios.mjs`, the host suite and lint, the Android JVM and device suites, and `openspec
  validate --all --strict`. Verify all pass, with no scenario of this change untested.
- [x] 4.2 On the phone, over adb, on a separate Path of the Night Train, switched back and deleted afterwards:
  - change the Style;
  - set the reply length to Short;
  - move a Landmark;
  - add a place;
  - move the clock on;
  - reword a Taste line.

  Then play one Move and read the Reply against the new Style and length, and send the screenshots.
