# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds, all in `stories`:
- Claude can edit a Story as the player can: Claude adds a person mid-Story.
- Anything can be edited or created in the app: A new person is created in the app; Fixing someone mid-Story.
- Leads are the player's to choose: A newcomer becomes a Lead; The Story never promotes anyone.
- Groups are the player's to arrange: Goyle starts to matter.
- Portraits are real images: Uploading a Portrait.

## 1. Edits on the Path

- [x] 1.1 The four entries and the reducer (design decision 1), and the person check (decision 2); engine tests for
  each refusal
- [x] 1.2 Test first, then build: `stories › Anything can be edited or created in the app › Fixing someone mid-Story`:
  - `engine.setPerson`;
  - the Writer's prompt after the edit says Pune;
  - the State at Scene 8 still says Mumbai;
  - another Path is unchanged.
- [x] 1.3 Test first, then build: `stories › Leads are the player's to choose › A newcomer becomes a Lead` and `› The
  Story never promotes anyone`:
  - `engine.setLead`;
  - the Weaver and the Writer read the new Lead;
  - five scripted Scenes with Neville leave the Leads as they were, and no view offers to change them.
- [x] 1.4 Test first, then build: `stories › Groups are the player's to arrange › Goyle starts to matter`
  (`engine.setGroup`; a Scene where Goyle saves him leaves him in the Group)
- [x] 1.5 What the Player Character knows, set through `person_set` (decision 3); `story/known.ts` tests

## 2. Portraits

- [x] 2.1 Test first, then build: `stories › Portraits are real images › Uploading a Portrait`:
  - the image route, the store and `portrait_set`;
  - link tests: the Portrait everywhere she appears from then on, the earlier Portrait at an earlier moment, and a
    refusal for the wrong type, too large, or bytes that are not the type they say.

## 3. The link and the Mac's commands

- [x] 3.1 Contract 15 (decision 5) in `link.schema.json` and `contract.json`; regenerate, and verify both sides compile
- [x] 3.2 `views/people.ts`, the people and group routes; link tests, including a refusal with its reason and a
  stale head
- [x] 3.3 Test first, then build: `stories › Claude can edit a Story as the player can › Claude adds a person
  mid-Story`:
  - `fantasia person` with `--portrait` in Scene 20;
  - she is in the people from then on, on that Path;
  - she is absent at an earlier entry and on another Path;
  - a phone watching is told.

  Then `fantasia lead`, `group` and `portrait`, with CLI tests.

## 4. The phone

- [x] 4.1 Everyone in the Story from the World screen's "+", and the person page's Edit, Lead switch and Group picker
  (decision 7). Shared checks on the JVM and the device for "A newcomer becomes a Lead" and "Goyle starts to matter"
  as the phone does them
- [x] 4.2 Test first, then build: `stories › Anything can be edited or created in the app › A new person is created in
  the app` on the phone: Add a person, the editor, and a Portrait from `PortraitPicker`. A shared check, and a JVM
  test that the upload sends the image's bytes and type
- [x] 4.3 Replace Portrait on the person page; a shared check for "Uploading a Portrait" as the phone does it;
  previews compared with Person.dc.html and World.dc.html

## 5. Together

- [x] 5.1 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, and `openspec validate --all
  --strict`, and verify all pass
- [x] 5.2 On the phone, over adb, on a separate Path of the Night Train switched back afterwards:
  - add a person with a Portrait, make them a Lead, and put Uncle Bhalla in a new Group;
  - see each on the World screen and Everyone;
  - send the screenshots.
