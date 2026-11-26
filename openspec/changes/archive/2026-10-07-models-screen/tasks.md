# Tasks

Each scenario task writes its test first, watches it fail, then builds what passes it. Tests are named
`<capability> › <requirement> › <scenario>` and quote the scenario. A test is never changed to make code pass.

Scenarios this change builds:
- `outside-the-scene › One Models screen`: Moving the Weaver to Codex; A Story's own Actor; A setting outlasts the
  Mac restarting.
- `scenes › Redo, with a Direction and another model if wanted`: Redo on another model.
- `presence › Nothing fails silently`: Another model for a failed Reply; Another model for the World.

## 1. Settings and the contract

- [x] 1.1 `models.json` keeps the Director and an Actor per Story, written whole through a temp file; a Story's Actor
  is its own setting or its Story File's; host unit tests, including an old `models.json` without either still read
- [x] 1.2 Contract 12 in `protocol/schemas/link.schema.json` and `contract.json`:
  - `ModelsView`, `PUT /models/jobs/{job}`, `PUT /stories/{id}/actor`;
  - `model` on `RedoRequest` and `RetryRequest`, and a new `RetryWorldRequest`;
  - `job` on a failed `TurnState`.

  Regenerate the host and Kotlin types, and verify both compile.

## 2. Reaching Codex and Antigravity

- [x] 2.1 `CodexRunner` over one `codex app-server`, built to design decision 2, tested against a fake app server
  script that speaks the same JSON-RPC:
  - streamed deltas and the final message;
  - a schema answer;
  - a failed turn, and the process dying mid-call;
  - an abort;
  - two calls side by side;
  - an approval request declined.
- [x] 2.2 Confirm `agy`'s stream-json input and output against `agy` itself with one short prompt, and write down the
  event shapes in the runner's test fake
- [x] 2.3 `AntigravityRunner` as decision 3, tested against a fake `agy`: deltas, a schema answer, a failure, an
  abort, and the effort folded into the id
- [x] 2.4 `fantasia serve` builds all three runners; a live check (`test/real/providers.test.ts`, run by
  `npm run test:real`, outside the suite) sends each provider a short prompt and the Weaver's schema, and verify it
  passes on this Mac

## 3. What each provider offers

- [x] 3.1 `catalog.ts` as decision 4, tested with fake providers:
  - names as the phone shows them;
  - efforts, and Antigravity's grouped by its suffix;
  - hidden models left out;
  - the last good list kept in `catalog.json` and shown marked unreachable when a provider cannot be asked;
  - a provider never reached says why.
- [x] 3.2 `GET /models`, `PUT /models/jobs/{job}`, `PUT /stories/{id}/actor` (null goes back to the Story File's),
  and a choice the catalog does not list refused with a reason; link tests

## 4. The Mac's jobs on the chosen models

- [x] 4.1 Test first, then build: `outside-the-scene › One Models screen › Moving the Weaver to Codex` (engine test:
  set the Weaver through the link, end a Scene, the Weaver's call goes to Codex GPT 6.1 Sol)
- [x] 4.2 Test first, then build: `outside-the-scene › One Models screen › A Story's own Actor` (two Stories; only "The
  Malfoy Problem"'s Replies go to Opus 5.5, and its Reply records it)
- [x] 4.3 Test first, then build: `outside-the-scene › One Models screen › A setting outlasts the Mac restarting`
  (set the Writer to Gemini 3.8 Flash high, start a new host on the same folder, `GET /models` shows it and the next
  Writer call uses it)
- [x] 4.4 Test first, then build: `scenes › Redo, with a Direction and another model if wanted › Redo on another
  model`:
  - the Redo's Reply is written by GPT 6.1 Sol and records it;
  - the next Reply goes to Opus 5.5;
  - a Redo interrupted by a restart is written on GPT 6.1 Sol.
- [x] 4.5 Test first, then build: `presence › Nothing fails silently › Another model for a failed Reply`:
  - the failure names the Actor's job;
  - Retry on GPT 6.1 Sol writes the Reply;
  - the next Reply goes to Opus 5.5;
  - a Writer failure retried on another model runs the Writer on it.
- [x] 4.6 Test first, then build: `presence › Nothing fails silently › Another model for the World` (the Weaver
  fails, Retry World on Sonnet 5.5 moves the World on, and the setting is unchanged)
- [x] 4.7 `fantasia models` prints the jobs, each Story's Actor and the catalog, and sets a job or a Story's Actor on
  any provider; CLI tests

## 5. The phone

- [x] 5.1 The Models screen to `Models.dc.html`, from Home's Models button (`Main.dc.html`):
  - the Actor per Story, and the jobs with their lines;
  - the picker in place with provider labels and effort chips;
  - an unreachable provider's chips disabled with its reason.

  Shared checks on the JVM and the device for "Moving the Weaver to Codex" and "A Story's own Actor" as the phone
  sees them, and a preview compared with the design.
- [x] 5.2 Redo's "Written by" to `Redo.dc.html`: the Actor first, every other model "· just this Reply". Shared check
  that the Redo request carries the model.
- [x] 5.3 "Another model" on the failed Reply (`SceneFailed.dc.html`) and on the World's failure: the picker in a
  sheet, then a Retry with the model. Shared checks for both scenarios as the phone sees them.

## 6. Together

- [x] 6.1 Run `scripts/scenarios.mjs`, the host suite, the Android JVM and device suites, `npm run test:real -- test/real/providers.test.ts` and
  `openspec validate --all --strict`, and verify all pass
- [x] 6.2 On the phone:
  1. Set the Weaver to GPT 6.1 Sol and end a Scene; see the Day View.
  2. Redo a Reply on Gemini 3.8 Flash; see the next Reply back on the Actor.
  3. Set the Night Train's Actor to another model and send a Move.
