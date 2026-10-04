# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Existing requirements this change builds, in part:
- `stories`: A Story File becomes a Story whole; Home shows where every Story stands (the mid-Scene case); Opening a
  Story returns exactly where the player left (without the "Previously" card, which needs Scene records); Story
  time stands still while the player is away.
- `scenes`: A Move can contain anything (the Draconia scenario); The Reply never writes the Player Character;
  Thoughts stay private; Every Scene opens with a title card (the card); The latest Reply has its actions in view
  (Copy).
- `presence`: Replies stream in; The player can always write; Nothing fails silently.

## 1. Repository and toolchains

- [x] 1.1 Create `host/` as a TypeScript package on Node 22 with Vitest, ESLint and `tsc --noEmit`, and verify `npm test` runs an empty suite and `npm run typecheck` passes
- [x] 1.2 Create `android/` as a Gradle project (AGP 9.0.1, Kotlin 2.3.20, Gradle 9.1.0, compileSdk 36, minSdk 30, Compose BOM 2026.03.01) with one empty Compose screen, and verify `./gradlew assembleDebug testDebugUnitTest` succeeds
- [x] 1.3 Create `protocol/` with a `generate` script that turns its JSON Schemas into `host/src/protocol/` types and `android/.../protocol/` classes, and verify a sample schema generates both and both compile
- [x] 1.4 Add `scripts/scenarios.mjs`, which lists every scenario in `openspec/specs` and every test that names one, and fails when a test names a scenario that does not exist; verify it fails on a test naming a made-up scenario

## 2. The contract

- [x] 2.1 Write the Story File schema (format version 1) covering every part the story-file spec lists, and verify a hand-written minimal Story File and a full one both validate
- [x] 2.2 Write the link's request, response, view and event schemas (pairing, stories list, Scene view, Move, Retry, the event stream, errors with trace ids, the contract version header), and verify generated types compile on both sides

## 3. The tree of entries

- [x] 3.1 Create the SQLite store (`stories`, `entries`, `paths`, `states`, `calls`, `traces`, `devices`) with entries that cannot be updated, and verify a test that tries to change an entry fails
- [x] 3.2 Write the reducer for `story_set_up`, `scene_opened`, `move` and `reply`, and verify unit tests of each case against the State they produce
- [x] 3.3 Work out the State on a Path from the nearest saved state, saving at each `scene_opened` and every 50 entries, and verify that deleting every saved state and replaying gives the same State

## 4. Story Files (story-file)

- [x] 4.1 Test first, then build: `story-file › A Story File is one folder › A folder with its Portraits` and `› An unknown version`
- [x] 4.2 Test first, then build: `story-file › A Story File sets up every part of a Story › A small Story File`
- [x] 4.3 Test first, then build: `story-file › People are referred to by name › Two people with one name`
- [x] 4.4 Test first, then build: `story-file › An import is checked whole and taken in whole › Several problems at once` and `› A file with no problems`
- [x] 4.5 Test first, then build: `story-file › Importing never touches another Story › Importing the same file twice`
- [x] 4.6 Test first, then build: `stories › A Story File becomes a Story whole › The Harry Potter Story is imported` (on the host: the Story and its opening Scene exist) and `› A file names a Lead who is not in it`

## 5. The Actor

- [x] 5.1 Build the `ModelCall` interface, its scripted fake, and the record of every call in `calls`, and verify a test reads back the exact request and answer of a fake call
- [x] 5.2 Build the Claude pool on the Agent SDK with warm `startup()` handles keyed by model and system prompt, and verify with one real call (opt-in suite) that words stream, the answer is stored, and the stored request's system prompt is exactly the one sent
- [x] 5.3 Build the Actor's prompt (the stable system prompt and the Scene message), and verify a unit test that the system prompt is byte-identical across two Moves in one Scene
- [x] 5.4 Real-model tests (opt-in suite): `scenes › Thoughts stay private › An unspoken thought` passes three runs out of three, judged by a second model. `scenes › The Reply never writes the Player Character › Hermione asks a question` is written and judged on agency (the line the player chose); it passes only when the Actor has real Moments in their original words, so it becomes a gate of the change that builds the Chronicler and Moments (docs/adr/0006)

## 6. A turn

- [x] 6.1 Test first, then build: `scenes › A Move can contain anything, and what it says has happened › The player writes Draconia's action` (the Move is an entry and the Reply follows it on the Path), with the fake Actor
- [x] 6.2 Test first, then build: `presence › Nothing fails silently › A model is down` (the Move stays the head, the failure is recorded with its trace id, and Retry writes the Reply)
- [x] 6.3 Test first, then build: `mac-link › Every request is answered or refused with a reason › A refused Move`
- [x] 6.4 Test first, then build: `stories › Story time stands still while the player is away › A week away` (nothing changes a Story without a request)

## 7. The link (mac-link)

- [x] 7.1 Test first, then build: `mac-link › Pairing happens once, by QR code › First pairing` (against the HTTP API) and `› An unpaired phone`
- [x] 7.2 Test first, then build: `mac-link › A Story's changes reach the phone live and in order › A Reply arrives live`
- [x] 7.3 Test first, then build: `mac-link › A dropped connection loses nothing › Wi-Fi drops mid-Reply`
- [x] 7.4 Test first, then build: `mac-link › The phone and the Mac agree on what they speak › An old app`
- [x] 7.5 Test first, then build: `mac-link › Every request is answered or refused with a reason › Looking up a failure` (through `fantasia trace`)
- [x] 7.6 Advertise the Mac over Bonjour with its id, and verify `dns-sd -B _openfantasia._tcp` finds it with the right id
- [x] 7.7 Serve HTTPS with a self-signed certificate made on first run, and verify a client pinned to its fingerprint connects and one pinned to another fingerprint is refused

## 8. The `fantasia` command

- [x] 8.1 Build `fantasia serve`, `pair`, `import`, `stories`, `show` and `trace`, and verify each against a temporary store in a test
- [x] 8.2 Install `fantasia serve` as a LaunchAgent that keeps the Mac awake while a turn is under way, and verify it starts at login and `fantasia doctor` reports it, the Claude token and the database

## 9. The phone

- [ ] 9.1 Test first, then build (on a device, against `fantasia serve --fake-models`): `mac-link › Pairing happens once, by QR code › First pairing`, scanning the QR code with Google's code scanner and pinning the certificate
- [ ] 9.2 Test first, then build: `mac-link › The phone finds the Mac on the network they share › The Mac's address changes`, with `NsdManager` and the last address that worked
- [ ] 9.3 Test first, then build: `stories › Home shows where every Story stands › Two Stories on the home screen` (the mid-Scene line for both)
- [ ] 9.4 Test first, then build: `scenes › Every Scene opens with a title card` (title, place, day and time, people with Portraits) as a Compose UI test
- [ ] 9.5 Test first, then build: `presence › Replies stream in › Watching a Reply arrive` and `presence › The player can always write › Typing during a Reply`
- [ ] 9.6 Test first, then build: `scenes › The latest Reply has its actions in view › Copying the latest Reply`
- [ ] 9.7 Test first, then build: `presence › Nothing fails silently › A model is down` on the phone (the failure, its trace id, and Retry)
- [ ] 9.8 Test first, then build: `stories › Opening a Story returns exactly where the player left` (mid-Scene, at the latest Reply)

## 10. Together

- [ ] 10.1 Write a real Story File for a short test Story with Claude, import it with `fantasia import`, pair the phone, and play five exchanges of its opening Scene on Opus 5.5; verify Replies stream, the Copy button works, and `fantasia trace` shows each call
- [ ] 10.2 Run `scripts/scenarios.mjs`, `npm test`, `./gradlew testDebugUnitTest connectedDebugAndroidTest` and `openspec validate --all --strict`, and verify all pass
