# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds:
- `outside-the-scene › The World screen shows what the Player Character knows`: A secret stays out of the World
  screen; What he knows grows with a Scene.
- `story-file › A Story File sets up every part of a Story`: What he knows of someone, and what they really are.

## 1. What he knows

- [x] 1.1 Test first, then build: `story-file › A Story File sets up every part of a Story › What he knows of someone,
  and what they really are`:
  - `known` in `story-file.schema.json` and the reducer;
  - an import test that keeps `whoTheyAre` and `known` apart;
  - regenerate the types;
  - the scenario's test, whose THEN needs the World screen, is written with 2.3.
- [x] 1.2 The `known_set` entry, `engine.setKnown` (between Replies only, the head moves, phones told), and
  `fantasia known <story> <person> <words>`; engine and CLI tests
- [x] 1.3 The Chronicler's `known` rows (design decision 2):
  - the task gives each person's earlier line;
  - CHRONICLER.md on writing from the Scene only;
  - the check refuses a row for someone not in the Scene, two rows for one person, or a row for the Player Character;
  - agent tests on a scripted model.
- [x] 1.4 Meanwhile `about` (decision 3): the Weaver's schema, task and check; the fallback for older lines by the
  names they hold; Weaver tests

## 2. The World on the Mac

- [ ] 2.1 Contract 14: `WorldView` in `link.schema.json` and `contract.json`; regenerate and verify both sides compile
- [ ] 2.2 Test first, then build: `outside-the-scene › The World screen shows what the Player Character knows › What he
  knows grows with a Scene`:
  - `views/world.ts` (decisions 1, 4 and 5) and `GET /stories/{id}/world`;
  - an engine test where a scripted Chronicler adds the inkwell, and the line shows it "From Scene N".
- [ ] 2.3 Test first, then build: `outside-the-scene › The World screen shows what the Player Character knows › A
  secret stays out of the World screen`:
  - a link test where Quirrell's `whoTheyAre` holds the secret, and nothing in `GET /world` says it;
  - a live Chronicler test: a Scene with Quirrell in it, and a judge looking for the secret in his line.
- [ ] 2.4 Places marked where he has been, the Calendar's Landmarks and Happenings with countdowns, the Leads first, a
  Group as one, people he knows nothing of left out; view tests

## 3. The phone

- [ ] 3.1 The World screen to World.dc.html and the person page to Person.dc.html (decision 7), and World in the
  Scene's header. Shared checks on the JVM and the device for both scenarios as the phone shows them, and previews
  compared with the designs
- [ ] 3.2 The World kept for reading without the Mac; the kept-copy test extended, and the shared "The Mac is asleep"
  check opens the World screen

## 4. The Night Train

- [ ] 4.1 `known` for each person in `examples/night-train/story.yaml`, as Ishaan knows them at the start; the test
  Story Files' people get theirs
- [ ] 4.2 With the player's OK, `fantasia known` for each person on the Night Train being played on this Mac

## 5. Together

- [ ] 5.1 Run `scripts/scenarios.mjs`, the host suite, the Chronicler's live tests, the Android JVM and device suites,
  and `openspec validate --all --strict`, and verify all pass
- [ ] 5.2 On the phone: open the World screen from the Night Train and read Meera's page; play a Scene with her and see
  what Ishaan knows grow
