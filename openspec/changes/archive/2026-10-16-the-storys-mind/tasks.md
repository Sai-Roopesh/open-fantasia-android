# Tasks

Every scenario's test is written first, named `<capability> › <requirement> › <scenario>`, and watched fail before the
code that passes it. A test is never changed to make code pass. Tests of removed requirements go with them.

## 1. Ground

- [x] 1.1 Update openspec/config.yaml's context (seven agents, the Editor, the Outline) and docs/design/README.md for the
  new screens; verify `openspec validate --all --strict`.
- [x] 1.2 Protocol contract 23: a Reply's turn step (looking back, writing, checking) and the Editor's note; no Reply
  deltas; the Scene's end `rethinking`; Backstage's Outline, Lives by tier, steering notes, truth items with sources,
  How it's going's Editor counts; steering-note and the player's Taste requests; the Editor job; Story File `rules`.
  Regenerate host and Android types; verify `npm run -s generate` and both builds compile.

## 2. The truth (host)

- [x] 2.1 Entries and State for the six kinds of truth item, each with id, opening Scene, source passage and closing
  Scene; the reducer applies changes and closes by id, never deletes. Test first: "the-truth › Nothing is deleted ›
  A betrothal broken" (the reducer's half; the prompt's half in 3.1).
- [x] 2.2 Who each person is now and what they know and believe, folded from records. Tests first: "the-truth › Who
  each person is now is kept › Not her first-week self", "the-truth › What each person knows and believes is kept ›
  Who knows his secret", "› A wrong belief held".
- [x] 2.3 Between any two people, with turning points and keepsakes; the Bond for the World screen derived from it.
  Tests first: "the-truth › Where things stand between any two people is kept › Two rivals", "› The first kiss, years
  later"; keep the living-world Bond scenarios and outside-the-scene's Between you passing.
- [x] 2.4 What is true now, Rules and Names. Tests first: "the-truth › What is true now is kept › The contract's
  clauses", "› A deadline coming", "the-truth › Rules hold › A power's limits", "the-truth › What is named stays named
  › The Auror's name".
- [x] 2.5 Lives in tiers by relevance worked out from play, promotable. Tests first: "living-world › Everyone has a
  Life › A life apart from him", "› Rising from a line"; keep "› A Group lives as one".

## 3. Prompts in four layers (host)

- [x] 3.1 The lenses render layers 1 to 4 in prose with size limits, slowest-changing first, the time moved to layer 4;
  the Actor's layer 2 states each person's knowledge and beliefs, and a closed truth that is mentioned reads as ended.
  Tests: layer order and limits on The Malfoy Problem test file; extend "the-truth › Nothing is deleted › A betrothal
  broken" to the prompt; "living-world › Characters know only what they could know › Hermione does not know about the egg" and
  "› What happened behind her back" stay passing.
- [x] 3.2 The Story So Far folds along Acts; Act accounts checked against their Scenes. Tests first: "living-world ›
  Every agent knows the Story So Far › Short after two hundred Scenes", "› An account that leaves out a turn"; keep
  "› The Director knows what happened" and "› Back to an earlier Scene".

## 4. Agents in steps, with tools (host)

- [x] 4.1 `runAgent` with a tool loop, turn and time budgets per job, lookups kept with the call, and running without
  tools on a model that has none. Tests: a scripted runner using story tools; budget exhaustion; a no-tools model.
- [x] 4.2 Story tools (search the Story with full-text search, read a Scene, a person's history, between two people,
  a Rule, a Name) and web search and fetch on the Claude runner. Tests: each tool against a ledger Story.

## 5. The Outline (host)

- [x] 5.1 Outline and Stretch records; the Director writes the first Outline when a Story starts, deep and with
  research. Tests first: "the-outline › Every Story has an Outline to its end › The first Outline", "› A small
  Story's Outline", "the-outline › The Outline is woven from Lives › Draconia's own year".
- [x] 5.2 Setups and payoffs. Tests first: "the-outline › Nothing enters without a payoff › A stranger with a
  purpose", "› A setup kept"; delete the test of the removed long-run "Something new every Stretch".
- [x] 5.3 Revision after every Scene, focused or deep. Tests first: "the-outline › The Outline is reconsidered after
  every Scene › An ordinary Scene", "› A Scene that turns the Story", "› Not between exchanges", "› Someone grows
  close".
- [x] 5.4 Stretches as steps of the current Act. Tests first: "the-outline › Each Stretch is the next step of the
  current Act › No villain from nowhere"; keep every long-run "The Director shapes the long run around Arcs and
  Landmarks" scenario passing.
- [x] 5.5 Deep planning worked through with research. Test first: "the-outline › The Director plans by working the
  plan through › Year Two from the books".
- [x] 5.6 Steering notes beside the Story. Tests first: "the-outline › The player sees and steers the Outline ›
  Steering a year's end", "› A note over play".

## 6. The Scene's end (host)

- [x] 6.1 Chronicler → Director (focused, then deep when due) → Weaver → Folder at an Act's end, with the step line and
  `rethinking`. Tests first: "presence › Between Scenes is quiet, and shows progress › Rethinking a year"; keep "› The
  World moves on", "› The next Scene is being written", "› An Engagement fills in".
- [x] 6.2 The Weaver lives out Lives and the Outline; a skipped span is lived as the Move asked. Tests first:
  "living-world › Off-screen time is resolved only as far as it reaches the player › A month skipped as asked"; keep
  its other scenarios.
- [x] 6.3 A long Scene recorded as it goes; the Writer closes a Scene that became another. Tests first: "scenes › A
  long Scene is recorded as it goes › Thirty exchanges in", "› A Scene that has become another".

## 7. A Reply: Writer, Actor, Editor (host)

- [x] 7.1 The Writer plans in steps with lookups and hands the Actor its plan and gathered passages. Test first:
  "presence › A Reply arrives checked and whole › Looking something up".
- [x] 7.2 The Actor writes as a novelist; the Reply is sent whole. Tests first: "presence › A Reply arrives checked
  and whole › Watching a Reply come", "presence › The player can always write › Typing during a Reply"; delete the
  test of the removed "Replies stream in".
- [x] 7.3 The Editor: fixes in place, one rewrite, a note when it still breaks. Tests first: "scenes › Every Reply is
  checked before it is read › The ribbon's story", "› Deciding for him, caught", "› The clock kept", "› A break that
  will not go", "living-world › Characters know only what they could know › A slip caught before it is read".

## 8. Taste, the Story File, Models (host)

- [x] 8.1 Taste, brief, reactions and steering notes beside the Story; the player's own Taste. Tests first: "long-run
  › Taste is short, readable and the player's › A lesson outlives its Redo", "› The player's own Taste in a new Story";
  keep "› Deleting a lesson", "› Rewording a lesson", and the brief and reaction scenarios.
- [x] 8.2 Story File `rules`; The Malfoy Problem's starting Rules. Test first: "story-file › A Story File sets up every
  part of a Story › Rules to start from"; keep its other scenarios.
- [x] 8.3 The Editor job and the new default models. Tests first: "outside-the-scene › One Models screen › The
  defaults", "› The Folder on Haiku"; keep its other scenarios.
- [x] 8.4 Backstage's view: the Outline, Lives by tier, steering notes, truth with sources, How it's going. Tests first:
  "the-truth › Nothing is deleted › Where it came from", "outside-the-scene › Backstage shows everything else, only
  when visited › How it's going"; keep its other scenarios.

## 9. The phone (android)

- [x] 9.1 Drawings first: Backstage.dc.html (Outline, Lives, notes, truth with sources), SceneWriting.dc.html
  (looking back, writing, checking, the Editor's note), MovingOn.dc.html (rethinking), Models.dc.html (Editor),
  StoryEdit.dc.html (the player's own Taste).
- [x] 9.2 Build them on contract 23, with shared UI checks named by scenario for the presence, outside-the-scene and
  long-run scenarios above; verify `./gradlew -q assembleDebug assembleDebugAndroidTest testDebugUnitTest`.

## 10. Live, rebuild, and finish

- [x] 10.1 Live tests on real models (FANTASIA_REAL_MODELS=1): a Scene's end with a focused and a deep Outline revision,
  a Reply with a lookup and an Editor fix, an Act account; verify they pass.
- [x] 10.2 `fantasia rebuild`: a new Path keeping every Move and Reply, the new Scene's end after each Scene, skipped
  spans lived as asked, the old Path kept, mentions of events that no longer happened listed. Test first: "the-truth ›
  A Story's truth can be rebuilt from its own text › Rebuilt from the page".
- [x] 10.3 Back up the store and restart the host on the new code. The player chose to start The Malfoy Problem fresh
  instead of rebuilding it (2026-10-15): it is imported again from its Story File, and the old one is kept as it was.
  `fantasia rebuild` stays, resumable with `--from`; on a copy of the store it ran to Scene 4 and found that a Scene a
  Move opened lost its start on the new Path, now fixed. The store is backed up in backups/before-the-storys-mind-* and
  backups/before-new-code-*.
- [x] 10.4 Drop the unused `after` from BriefRequest and ReactionRequest (contract 23, host and phone). Host suite, lint and the Android JVM suite green (the device suite is not run on the player's phone, at their request); `node scripts/scenarios.mjs --strict` and `openspec
  validate --all --strict` pass; archive the change.
