# Design

## Context

See proposal.md and docs/reviews/2026-10-09-the-malfoy-problem.md, causes 5–7.

**How it works today (host):**
- **The Chronicler's answer.** After each Scene the Chronicler returns `summary`, `moments`, `told` and `known`.
  `checkChronicle` gathers every problem into one list. Any problem refuses the whole answer;
  `answerWithOneRepair` asks once more, and if that also fails the work is dropped.
- **What is due.** `dueChronicle` returns the earliest Scene on the Path not yet summarised. So a Scene that keeps
  failing is chosen again at every trigger, and no later Scene is ever reached.
- **What he knows.** `knownOn` takes the newest line per person: from the Story File, `known_set`, `person_set`, or
  a chronicle's `known`.
- **Who is in a Scene.** It is the Writer's `here`, worked out from `comes_in` and `goes`. The Chronicler's names in
  `there` and `to` must be in that list, or in the opening's `who`.
- **Recall.** It carries the last day's Scene summaries, the end of the last Scene, and five Moments ranked by
  weight and recency.

No compatibility is kept: stored payload shapes may change, and the player replays from the start.

## Goals / Non-Goals

**Goals:**
- No Scene goes unrecorded because one part of its record was bad. No failure blocks later Scenes, and every
  failure is visible.
- A memory of each relationship that stays the same size in a prompt across a four-year run.
- Presence and the page agree.

**Non-Goals:**
- **When background work runs.** Cause 10 belongs to the chapters change.
- **The Writer's checks.** A Writer failure already fails the turn visibly, with Retry. Its checks stay strict.
- **Meaning-based search over Moments.** ADR 0006 still holds: rank by presence, weight and recency.

## Decisions

**1. A Bond is its own record (host; new ADR 0009, amending 0006).**
- **Where it is written.** The Chronicler's answer gains `bonds`: for each person in the Scene whose standing with
  the Player Character this Scene changed, `{ who, standing, turn }`:
  - `standing` is where things stand now, at most 40 words, as he has seen it;
  - `turn` is what changed in this Scene, at most 25 words.
- **How it is read.** `story/bonds.ts` `bondsOn(mac, head)` reads them from the chronicles on the Path, in order:
  `Map<who, { standing, turns: { text, scene }[] }>`. The standing is always the newest; turns accumulate, each one
  line.
- **Where a Bond starts.** It can start from the Story File: `PersonSetup` gains an optional `bond`, where things
  stand when the Story begins. The Malfoy Problem gives Draconia one ("she called him the word, he saved her, she
  owes him and calls him Stray") and Hermione one.
- **Considered, and rejected:**
  - Folding the relationship into the known line: that is what overflowed.
  - Per-character memories: ADR 0006 rejected them, because copies disagree.
  - A Bond is one record per pair, written only by the Chronicler, with no copy for each person.

**2. What he knows stays short (host).**
- **The limit.** `known` lines are at most 60 words. The prompt asks for the line "as it should read now, whole, in
  sixty words or fewer: who they are to him and what he has seen of them"; the history goes in the Bond.
- **The repair message says words:** "it is 98 words; say it in sixty or fewer".
- **If it is still too long,** the line is left out (decision 3), so the old one stands. It is never truncated by
  the Mac, since a cut line can lie.

**3. Checking part by part (host, `agents/repair.ts` and each check).** `Checked<T>` keeps its two outcomes, and its
usable one gains what it left out: `{ ok: true, value, dropped?: string[] } | { ok: false, problems }`. "Not ok" now means
nothing in the answer is usable (it does not match the schema). Anything less only drops the part, says why in
`dropped`, and keeps the rest. `answerWithOneRepair` asks again whenever an answer is unusable or left parts out,
naming every problem. It keeps whichever usable answer left out less, and fails only when no answer is usable. Only
an answer that is not used is marked refused in the calls. What was left out is stored on the record (`dropped:
string[]`), for Backstage.

**Applied to:**
  - **Chronicler:** a Moment with a bad quote loses the quote, and loses the Moment if no quote is left. A bad
    `there` or `to` name is removed. A bad or overlong known, bond or told row is dropped.
  - **Weaver:** a happening, Life, Thread or Meanwhile line naming someone not in the Story loses that name, or is
    dropped when it means nothing without it, as with Voldemort before he is in the people.
  - **Director:** a row for an Arc the Story does not have is dropped. A missing Arc row becomes "hold; let it
    settle".

**4. Nothing blocks, and gaps are backfilled (host, `engine/chronicling.ts`).**
- **A record of each failure.** A new background record `record_gap { scene, attempts, reason, givenUp }`, added to
  `RECORD_KINDS`, is written after each failed attempt. It hangs off the entry the record would have hung from.
- **What is due.** `dueChronicle` returns the earliest Scene that:
  - is unrecorded;
  - has not been given up (fewer than three attempts);
  - and, if it has failed before, has seen at least one Scene end since its last attempt, or the Mac has just started
    again (one fresh try each, for a failure while a model could not be reached).
- **Recording in order.** The engine's chronicle step records due Scenes in Path order, one call at a time, until
  none is due. Gaps are backfilled behind the newest Scene, and a stuck Scene costs at most three attempts, ever.
- **Retry.** `POST /stories/{id}/record/retry {scene}`, and its Mac command `fantasia record <story> --retry
  <scene>`, write a `record_gap` with zero attempts, which makes the Scene due again.

**5. Presence follows the page (host).**
- **The Writer's hint.** Each turn the Writer's task gets `<shown_not_here>`: people of the Story named in the last
  Reply who are not in `here`, matched by the name index, the Player Character left out. `WRITER.md` says to put
  in `comes_in` anyone the Reply shows in the Scene, and to leave out anyone it only mentions.
- **The Chronicler's names.** `there` and `to` accept anyone in `here` or the opening's `who`, and anyone named in
  the Scene's own entries. Someone named on the page is someone the Scene can be remembered by. The page settles
  it, not the plan.
- **Considered, and rejected:** adding every named person to `here` automatically. "Father will hear of this"
  would put Lucius in the Scene. The Writer reads the page and decides.

**6. Recall carries Bonds (host).**
- **Writer:** the Bond (standing and the last three turns) of each person here; for Leads, the Bond of every Lead.
- **Director:** the Bond of every Lead and of each person with five or more turns.
- **Actor:** the Bond of each person here, in a `<between>` section. A Bond is what passed in front of him, which
  the people present lived through too.
- The prompt size stays bounded: one standing and three turns per person.

**7. The link and the phone (protocol, android).** Contract 17:
- **The person:** `WorldPerson` and `PersonDetail` gain `between: { standing, turns: [{ text, scene_number,
  scene_title }] } | null`.
- **Backstage:** `BackstageView` gains `record: [{ scene_number, scene_title, state: "waiting" | "given_up",
  reason, dropped: string[] }]`, plus `RecordRetryRequest { after, scene_number }`.
- **The phone:**
  - **Person page (`Person.dc.html`):** a **BETWEEN YOU** section under WHAT YOU KNOW, with the standing in
    Literata, then the turns, each with "Scene 11 · Twenty-nine minutes".
  - **Backstage (`Backstage.dc.html`):** a **THE RECORD** section, shown only when something is in it. Each row
    gives the Scene, why it failed, and Retry for one given up.
  - Both are drawn first, for the player's approval.

## Risks / Trade-offs

- **[Turns accumulate over four years.]** The turns are read back three at a time, so prompts stay bounded. The
  Person page shows them all, the newest first.
- **[A Bond written from what he saw may understate her side.]** By design: her secret side is in who she is and in
  the Director's plan. The Bond is what passed between them.
- **[A record kept with dropped parts may be thinner.]** It is still far more than a lost Scene. The drops show in
  Backstage, and the next Scene's record can pick up what was missed.
- **[Name matching for `shown_not_here` can be wrong.]** It is only a hint. The Writer decides.

## Migration Plan

None kept. After this change, The Malfoy Problem is imported again from its updated Story File, with Bonds to start
from, and the player replays. That is with the player's agreement.
