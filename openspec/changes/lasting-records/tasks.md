# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds:
- `living-world`:
  - Moments are remembered from one record: One bad part does not lose the Scene; A Scene that could not be
    recorded does not block the rest.
  - Where things stand between him and each person is kept: A turn in the classroom; A Bond read in a later Scene.
- `outside-the-scene`:
  - The World screen shows what the Player Character knows: What he knows stays short after many Scenes; Between
    you.
  - Backstage shows everything else: A gap in the record.
- `scenes` › People stay in a Scene until they go: Crabbe and Goyle at her heels; A name mentioned is not a person
  present.
- `story-file` › A Story File sets up every part of a Story: A Bond to start from.

## 0. Words and screens

- [x] 0.1 Add **Bond** to CONTEXT.md, and write `docs/adr/0009-a-bond-is-its-own-record.md` (amends 0006). Verify:
  `openspec validate --all --strict`, and the specs use the term as the glossary spells it.
- [ ] 0.2 Draw BETWEEN YOU on `docs/design/Person.dc.html` and THE RECORD on `Backstage.dc.html`, and add them to
  the README's table. The player approves them before any phone code.

## 1. Records that degrade, never vanish

- [ ] 1.1 `Checked<T>` with `value`, `fatal` and `dropped`, and `answerWithOneRepair` keeping the better answer
  (design decision 3). Repair tests: a fatal answer is asked again; a partly-bad answer is repaired, and if still
  partly bad its good parts are kept with the drops listed.
- [ ] 1.2 Test first, then build: `living-world › Moments are remembered from one record › One bad part does not
  lose the Scene`:
  - the Chronicler's check drops part by part (quotes, Moments, names, known, bond and told rows);
  - the known limit is 60 words, and the repair message says words;
  - a too-long line twice keeps the old line and the Scene's Moments and summary.
- [ ] 1.3 Test first, then build: `› A Scene that could not be recorded does not block the rest`:
  - a `record_gap` record;
  - `dueChronicle` skips a Scene that failed until another Scene has ended, and gives up after three attempts;
  - the engine records due Scenes in order until none is due;
  - two later Scenes are recorded, and the failed one is tried after them.
- [ ] 1.4 The same part-by-part checks for the Weaver (names not in the Story) and the Director (unknown or missing
  Arc rows), each with a test that a partly-bad answer is kept with its drops.

## 2. Bonds

- [ ] 2.1 The Story File's `bond` (story-file.schema.json, import). Test first: `story-file › A Story File sets up
  every part of a Story › A Bond to start from`, on the host: `bondsOn` has her standing before any Scene.
- [ ] 2.2 Test first, then build: `living-world › Where things stand between him and each person is kept › A turn
  in the classroom`:
  - `bonds` in the Chronicler's schema, prompt and `CHRONICLER.md`;
  - `story/bonds.ts` `bondsOn`;
  - standing at most 40 words and a turn at most 25;
  - a scripted chronicle adds a turn and updates the standing; another Path is unchanged.
- [ ] 2.3 Test first, then build: `› A Bond read in a later Scene`: the Writer's and the Actor's next calls in a
  Scene with Draconia carry her standing and latest three turns; the Director's carries every Lead's Bond.
- [ ] 2.4 A live check: after a played Scene in which Draconia's standing with him changes, the real Chronicler
  writes a turn and a standing within the limits, and the line for what he knows stays within 60 words. Run with
  `npm run test:real`.

## 3. Presence follows the page

- [ ] 3.1 Test first, then build: `scenes › People stay in a Scene until they go › Crabbe and Goyle at her heels`:
  - `<shown_not_here>` in the Writer's task, and its rule in `WRITER.md`;
  - the Chronicler accepts names on the Scene's page;
  - a scripted Reply naming Crabbe and Goyle, and a Writer that then lists them, leave them in `here`, and a
    Moment naming them is kept.
- [ ] 3.2 Test first, then build: `› A name mentioned is not a person present`: Lucius named in a Reply is offered
  in `<shown_not_here>`, but is not in the Scene unless the Writer names him.

## 4. The link and the phone

- [ ] 4.1 Contract 17 in `link.schema.json` and `contract.json` (design decision 7). Regenerate, and verify both
  sides compile.
- [ ] 4.2 Views and routes:
  - `between` on the World view and person detail;
  - `record` on Backstage;
  - the retry route and `fantasia record`;
  - link tests and CLI tests;
  - test first: `outside-the-scene › The World screen shows what the Player Character knows › What he knows stays
    short after many Scenes`.
- [ ] 4.3 Test first, then build: `outside-the-scene › … › Between you`, on the phone: the Person page section, built
  to `Person.dc.html`, as a shared check on the JVM and the device.
- [ ] 4.4 Test first, then build: `outside-the-scene › Backstage shows everything else › A gap in the record`: on the
  host, the view and Retry; on the phone, THE RECORD built to `Backstage.dc.html`, as a shared check.

## 5. Together

- [ ] 5.1 Update `examples/malfoy-problem/story.yaml` with Bonds for Draconia and Hermione to start from, and check
  it imports in a throwaway home.
- [ ] 5.2 Run `scripts/scenarios.mjs --strict`, the host suite and lint, the Android JVM and device suites, and
  `openspec validate --all --strict`, and verify all pass.
- [ ] 5.3 With the player's agreement, replace The Malfoy Problem on the Mac with the new import. Play two Scenes
  with Draconia on the phone over adb, then check her Bond, what he knows (60 words or fewer), The record (empty),
  and the Chronicler's calls (none failed).
