# Tasks

## 1. Host

- [x] 1.1 Test first: "scenes › A Scene ends when a Move leaves it or the player ends it › The Story never closes a
  Scene" — a Writer that lands the Scene leaves it open, with no Scene's end and no Day View; rename the tests of the
  other three scenarios to the new requirement and drop the old "The Story closes a Scene" test.
- [x] 1.2 The Writer's format and WRITER.md: calls `continue` and `land`; the Actor's call lines without `end`; the
  engine's turn never closes a Scene; `SceneCall`, `SceneClosed.by` and `scene.closed` without "story"; the fake
  models; the tests that closed Scenes by the Writer's call.
- [x] 1.3 Contract 24: `closed_by` leaves the Day View and `end` leaves SceneCall; regenerate host and Android types.

## 2. Android

- [x] 2.1 The Day View offers no Redo; `ClosedBy` and its fixtures go; JVM suite green.

## 3. Finish

- [x] 3.1 CONTEXT.md (Scene, Day View) and the day-view spec's purpose; host suite and lint, Android JVM suite,
  `node scripts/scenarios.mjs --strict`, `openspec validate --all --strict`; restart the Mac's server between Scenes,
  install the phone app, archive, commit.
