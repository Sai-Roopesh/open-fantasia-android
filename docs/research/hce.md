# The Hybrid Continuity Engine in the earlier versions (research, 15 October 2026)

How the player's two earlier Open Fantasia builds kept continuity, for the design of the new memory system. Read
together with `memory.md` (what other systems do) and `malfoy-memory-audit.md` (what the current build keeps of one
real Story). Everything here was read without changing anything in the sources. Claims are tied to files and commits;
inferences of mine are marked **(inference)**.

**Sources.**
- **Web**: `/Users/sairoopesh/Documents/projects/Open-Fantasia` (Next.js and Supabase), 159 commits from 5 April to
  16 June 2026, HEAD `944b1d7`. Paths below without a prefix are in this repo.
- **Android**: `/Users/sairoopesh/Downloads/open-fantasia-android` (Kotlin app plus a Node "Mac Host" in
  `tools/continuity-worker`), 62 commits from a 26 June 2026 baseline (`ec8c390`, "existing working state") to
  3 October 2026 (`4051dfb`), 33 committed ADRs and an untracked 34th. Paths prefixed `android:`.
- **Legacy backup**: `/Users/sairoopesh/Backups/open-fantasia-legacy-2026-10-04` holds a single file,
  `phone-database-2026-10-04.db`, the Android app's Room database on the day the current repo was started. It is not a
  third code version; it is evidence of what the Android build stored (section 7).

"HCE" is the web build's name. The Android build deliberately dropped it (its CONTEXT.md lists "HCE" under *Avoid* for
Continuity Snapshot, Continuity Update and Continuity Engine) but its snapshot is the same `DurableMemorySnapshot`
shape, grown.

---

## 0. The lineage at a glance

| Generation | When (commit) | What memory was | Who wrote it, when | What the reply model saw of the transcript |
|---|---|---|---|---|
| W1 "continuity-first" | 6 Apr 2026 (`98ac872`) | `chat_state_snapshots`: `scenario_state`, `relationship_state`, `rolling_summary`, `user_facts[]`, `open_loops[]`, `scene_goals[]`; 8 Apr added `resolved_loops[]`, `narrative_hooks[]` (`f0c6dd3`) | A "reconciliation" call per turn, queued in `background_jobs` and drained by cron; made inline on 18 Apr (`de48180`) | The whole branch transcript |
| W2 "hybrid memory" | 23 Apr (`894c352`) | `chat_turn_snapshots` per turn: `story_summary`, `scene_summary`, `last_turn_beat`, `relationship_state`, capped lists (`user_facts` ≤8, `active_threads` ≤5, `resolved_threads` ≤5, `next_turn_pressure` ≤3, `scene_goals` ≤5) | One reconciliation call per turn, inline, over the last 10 turns (temperature 0.2, 700 output tokens) | Last 4 turns |
| W3 HCE Phase 1 | 23 May (`6c0ef50`) | Seven normalised "bi-temporal" tables (`world_entities`, `world_entity_facts`, `world_relationships`, `world_locations`, `world_location_edges`, `world_entity_placements`, `world_narrative_threads`) plus summaries on `world_snapshots` | Extraction → validation → reflection on a separate "brain" model, per turn, over the last 15 turns; a "defragmentation" pass every 10th turn | Last 4 turns |
| W4 HCE on JSONB | 30 May (`e7f05b6`, `2216ecb`) to the last web commit, 16 Jun | One `DurableMemorySnapshot` JSONB blob per turn, applied by a pure reducer and written in one upsert | Same pipeline as W3 | Last 4 turns |
| A1 Android, HCE port | 26 Jun to 8 Aug 2026 (`ec8c390`) | The W4 snapshot, ported to Kotlin | The same pipeline on the phone, per turn, in a background coroutine, on a direct-API brain model | Last 15 exchanges |
| A2 Android, checkpoints | 19 Jul (`2bf6d72`) to 3 Oct 2026 | A grown Continuity Snapshot, rendered for the reply model as prose (the "Dossier"), plus, from 2 Oct, a Director's Story Plan | A Mac Host job at a blocking checkpoint every 7, then 15, exchanges, on a subscription CLI model (Codex, Claude or Gemini) | Last 15 exchanges |

Sections 1 to 5 describe W4, the HCE as it last ran on the web, and note where W1 to W3 differed. Section 6 is the
Android build.

---

## 1. What the HCE stored

### 1.1 The snapshot (`src/lib/types.ts:233-340`)

One row per committed turn in `world_snapshots` (`turn_id` primary key, `thread_id`, `branch_id`,
`based_on_turn_id`, `world_state jsonb`, `version`, `is_full_materialization`, timestamps;
`WorldSnapshotRecord`, `types.ts:253-263`). `world_state` is a full `DurableMemorySnapshot`, not a delta:

```
metadata:        current_turn_id, narrative_timestamp (free text, e.g. "Late evening, Day 3"),
                 transition_type (continuation | scene_transition | time_skip), version
spatial_state:   current_location {id, name, description, environmental_modifiers[]} | null   (derived)
                 adjacent_locations [{id, name}]                                              (derived)
                 known_locations   [{id, name, description, environmental_modifiers[]}]
                 edges             [{edge_id, from_location_id, to_location_id, is_bidirectional}]
                 entity_placements [{entity_id, entity_name, location_id, location_name, micro_position}]
entity_state[]:  entity_id, canonical_name, entity_type (character | npc | creature | object | group),
                 aliases[], is_present, primary_emotion, emotion_intensity (1-10), emotion_catalyst,
                 knowledge_boundary[{id, body}], traits[{id, body}], goals[{id, body}],
                 secrets[{id, body}], abilities[{id, body}], possessions[{id, body}]
relational_state[]: relationship_id, source_entity_id/name, target_entity_id/name,
                 relationship_type (social | romantic | familial | professional | adversarial | alliance | other),
                 dynamic_status (free text)
narrative_state: story_summary (8-12 sentences), scene_summary (3-5), last_turn_beat (1-2),
                 active_threads [{thread_id, objective, status (open | blocked | resolving | resolved),
                                  dependencies[]}],
                 resolved_threads [string]
```

The empty snapshot is `buildEmptyDurableSnapshot` (`src/lib/domain/world-snapshot.ts:6-31`). `current_location` and
`adjacent_locations` are recomputed after every apply from the first `character`-type entity's placement
(`world-state-reducer.ts:57-92`), so "where we are" is the roleplay character's location.

### 1.2 Records kept beside the snapshot

- **Timeline events** (`chat_timeline_events`): `title`, `detail`, `importance` 1-5, `event_type` (beat, reveal,
  betrayal, discovery, combat, scene_change, time_skip, relationship_shift, emotion_shift, spatial_move), `turn_id`,
  `affected_entity_ids`, `affected_relationship_ids`. Written by the extractor only for "a genuinely notable beat"
  (`state-extraction.ts:194-197`), plus importance-2 bookkeeping rows for branch creation, branch switching and the
  starter (`src/lib/services/branch-service.ts:41-50, 72-81`, `generation-service.ts:708-718`).
- **Pins** (`chat_pins`), section 4.
- **The transcript** (`chat_turns`), kept whole.

### 1.3 What the shape did not hold

- **No provenance.** No fact, relationship or thread cites the turn or the words it came from. Facts are
  `{id, body}` only. The W3 tables had `valid_from_turn_id` and `invalidated_at_turn_id`; W4 dropped both.
- **No history inside a snapshot.** An `invalidate` deletes: facts are filtered out
  (`world-state-reducer.ts:182-188`), an invalidated entity is removed along with its relationships and placements
  (`:160-170`), and a resolved thread survives only as its objective string in `resolved_threads` (`:305-326`). The
  only history is the chain of per-turn full copies.
- **No time on facts.** Story time is one free-text `narrative_timestamp` on the whole snapshot. Nothing records
  when a fact became true or stopped being true.
- **No quotes.** Nothing keeps original words except the transcript.
- **No beliefs separate from truth.** `knowledge_boundary` lists what an entity knows; a false belief has nowhere to
  go except as a fact body that happens to be false.
- **No "who knows" on a fact.** Knowledge is filed per entity, so one secret known by three people is three
  separately worded facts, or one.
- **No size limits.** No list is capped, and `resolved_threads` only grows.

W2 was the opposite trade: every list was capped in the prompt (`userFacts` "at most 8", `activeThreads` "at most
5", and so on) and the model was told to "Drop stale or repetitive threads instead of carrying them forward forever"
(`git show 894c352:src/lib/ai/roleplay-prompt.ts`, reconciliation prompt). It stayed small by forgetting.

---

## 2. When and how it updated

### 2.1 Trigger and timing

- **Every committed turn**: a normal send, a regenerate or user rewrite, an assistant edit, and the starter opening.
  The stream's `onFinish` calls `commitThenMaterialize` (`src/lib/services/generation-service.ts:45-88`), which
  commits the turn and then **awaits** `materializeSnapshotForTurn` inside the request.
- **A missing head snapshot** is materialised before the next generation only when no snapshot is reachable at all
  (`src/lib/services/generation-runtime.ts:70-90`). Otherwise the head falls back to the newest ancestor snapshot
  (`src/lib/services/thread-reader.ts:92-100`). So a turn whose materialisation never finished (a timed-out request,
  a failed write) never gets its own snapshot, and the next reply is written against the older one. The next turn's
  extraction also starts from it and catches up only because the missed turn is inside its 15-turn window.
- **The docs disagree with the code.** `docs/workflows.md` §8, `AGENTS.md` and `README.md` say materialisation runs
  in the background with Next's `after()`. That was true for under an hour: `627eb06` (6 June, 10:37) moved it to
  `after()` because the inline second LLM call kept the Vercel function open past its timeout and aborted the
  client's stream; `8465240` (11:29 the same day) reverted it "so it can't be skipped by an immediate next turn",
  blaming the refresh symptom on a stale client bundle. `88c7e00` had already rewritten the docs, and they were
  never corrected.
- **Earlier timing.** W1 queued reconciliation as background jobs drained by Vercel cron, and the composer was
  blocked while a head snapshot was pending; after stalls (`7f8ca20`, `7771cdf`) it went inline on 18 April
  (`de48180`: "new turns do not depend on a cron worker or queue drain finishing later").

### 2.2 The pipeline (`src/lib/services/continuity-service.ts:97-217`)

1. Load all turns and the reachable path; return early if this turn already has a snapshot (idempotent,
   `:116-120`).
2. Find the nearest ancestor snapshot in one `turn_id IN (...)` query (`:122-140`), else start empty.
3. Take the last **15** committed turns (`CONTEXT_WINDOW_TURNS`, `:25`) as `USER:` / `ASSISTANT:` text, or every
   committed turn on a defragmentation turn (`:142-145`). The text comes from `toTranscriptMessages`, which drops
   hidden user inputs such as the starter seed (`src/lib/domain/turn-projections.ts:15-55`).
4. `runContinuityExtraction` (`src/lib/ai/continuity.ts:78-132`): extract, validate, maybe reflect, strip.
5. `applyExtractionToSnapshot` in memory (`src/lib/domain/world-state-reducer.ts:111-340`).
6. One `upsert_world_snapshot` RPC (`src/lib/data/world-state.ts:64-88`; SQL at
   `supabase/migrations/0001_baseline.sql:942`).
7. Insert timeline events, resolving `NEW:` references and dropping anything that is not a UUID (`:44-88`).
8. On any exception, write a **carry-forward**: the previous snapshot unchanged, `version + 1`, and `last_turn_beat`
   set to the placeholder "The latest exchange shifted the scene." (`:183-216`).

### 2.3 The model

- The thread's **brain** model: `chat_threads.brain_connection_id` and `brain_model_id`, falling back to the roleplay
  connection and model (`generation-runtime.ts:56-68`). The brain lane was added in W3 (`0002_hce_rebuild.sql`) and
  given a picker in `cae049f` (26 May).
- In practice the player ran replies on DeepSeek and the HCE on Mistral: `627eb06` describes a turn as "deepseek
  generation + commit + mistral materialization"; `d2c9346` names Mistral Large; the README's eval example uses
  `mistral-medium-latest`. Providers were BYOK API keys (Google, Groq, Mistral, OpenRouter, Ollama, DeepSeek;
  `types.ts:5-12`).

### 2.4 Extraction (`src/lib/ai/state-extraction.ts`)

- **Call**: AI SDK `generateText` with `Output.object(extractionOutputSchema)`, temperature 0.15,
  `maxOutputTokens` 8000 (`:292-301`); if structured output is missing, strip code fences and parse the text
  (`:303-329`).
- **Input**: system prompt (`buildExtractionSystemPrompt`, `:144-213`, about 5,300 characters) and one user message
  holding `<Current_State>` (the previous snapshot as indented JSON) and `<Latest_Transcript>` (`:215-228`).
- **Task**: "produce a minimal set of state mutation operations that capture EXACTLY what changed in the latest
  narrative turn", although the transcript is 15 turns.
- **Output** (`:124-138`):
  - `transition_type`;
  - `story_summary`, `scene_summary` and `last_turn_beat`, **rewritten every turn**;
  - `narrative_timestamp`;
  - arrays of operations: `entity_mutations` (add, update, invalidate), `fact_mutations` (add, invalidate),
    `relationship_mutations` (add, update, invalidate), `location_mutations` (add, update),
    `location_edge_mutations` (add, invalidate), `placement_mutations` (move), `narrative_thread_mutations` (add,
    update, resolve);
  - `timeline_events`.
- **References**: existing records by id; new ones by `NEW:<canonical_name>` within the same response (`:184-187`).
- **Rules worth noting** (`:199-211`): never hallucinate beyond "the literal text"; "When information is revealed TO
  a character (not by them), add a knowledge fact to that character's entity"; always emit a `move` when someone
  moves; emit emotion updates; keep operations minimal; do not echo `Current_State`.

### 2.5 Validation (`src/lib/ai/state-validator.ts`)

Referential only. It checks that every `update` or `invalidate` names an id present in the snapshot, that new
references use `NEW:` and that a placement's destination exists (`:8-180`). Nothing checks that a change is supported
by the transcript, that a fact is new rather than reworded, or that two facts contradict. Each mutation is judged
alone (`validateAndPartition`, `:189-213`); the whole extraction is marked for reflection when more than half of its
operations are invalid (`:277`).

### 2.6 Reflection (`src/lib/ai/state-reflector.ts`)

When `shouldReflect`, the same brain model gets a "CORRECTION PASS" (`:51-82`): the numbered validation errors, its
previous output, the snapshot and the transcript, at temperature 0.1 and 8000 tokens (`:86-93`). If the corrected
output still fails, invalid operations are stripped (`continuity.ts:116-128`). With 50% or fewer invalid, they are
stripped without reflection. Reflection only ever fixed references; it never rechecked content.

### 2.7 The reducer (`src/lib/domain/world-state-reducer.ts`)

- Pure: `structuredClone` of the previous snapshot, ids injected (`:111-118`).
- **Entities**: an `add` whose lower-cased name already exists is merged into the existing entity (`:128-139`); this
  was the fix for duplicates in `336afe3` ("Bug 4"). Aliases do not count, so "Draco" and "Draconia Malfoy" stay
  two people **(inference)**.
- **Facts**: appended to the bucket for their type (`:174-181`). No deduplication.
- **Relationships**: directed source → target; `add` always creates a new one, even if the pair already has one
  (`:193-205`).
- **Placements**: a `move` replaces the entity's placement (`:273-286`). Nobody is ever un-placed except by
  invalidation.
- **Threads**: `resolve`, or an `update` to `resolved`, moves the objective string into `resolved_threads`
  (`:289-326`).
- **Summaries and metadata**: overwritten from the extraction (`:329-335`).

### 2.8 Defragmentation

- **When**: every 10th committed turn on the path (`DEFRAG_EVERY = 10`, `continuity-service.ts:26, 36-38`).
- **What**: the extraction prompt gains a "Full re-materialization mode" section (`state-extraction.ts:267-285`):
  verify every record against the transcript, "PRESERVATION IS THE DEFAULT", do not remove threads "just because
  they weren't mentioned recently", "Add missing state that was dropped by previous incremental extractions", make
  `story_summary` comprehensive, and "Think of this as an AUDIT, not a rewrite".
- **Input**: the **entire** committed transcript (`:144`), so its cost grows with the Story without limit. At the
  Malfoy Problem's size (about 147k tokens of Moves and Replies at Scene 19) one pass would exceed a 128k-token
  context window **(inference)**.
- The snapshot is stored with `is_full_materialization = true`. The pass can only add and amend; it is still a single
  model call with the same referential validation.

### 2.9 Calls and cost per turn

| Call | When | Input | Output cap |
|---|---|---|---|
| Reply (`streamText`) | Every turn | System prompt with the whole snapshot + 4 turns + the new message | The thread's `max_output_tokens` |
| Extraction | Every committed turn | ~5.3k-character instructions + the whole snapshot + 15 turns | 8,000 tokens |
| Reflection | When more than half the operations are invalid | All of the above + the previous output | 8,000 tokens |
| Defragmentation | Every 10th turn, in place of extraction | Instructions + snapshot + the **whole** transcript | 8,000 tokens |

So every turn paid for at least two model calls, and the snapshot was sent twice, once to each model. No token counts
or costs for the HCE were ever recorded: `chat_turns` stores usage for replies only.

---

## 3. How the state reached the roleplay model each turn

### 3.1 The system prompt, in order (`src/lib/ai/roleplay-prompt.ts:78-188`)

| # | Section | Contents | Changes |
|---|---|---|---|
| 1 | `<role_objective>` (`:79-84`) | "You are roleplaying as X"; play a proactive co-protagonist; never write for the user; "The recent transcript already contains the exact last scene beats" | Never |
| 2 | `<story_setting>` (`:87-92`) | The character's `story` field, if set | When the sheet is edited |
| 3 | `<character_persona>` (`:95-98`) | Personality, appearance, writing style, behaviour rules, boundaries | When the sheet is edited |
| 4 | `<user_persona>` (`:99-101`) | The user's persona, if one is set | When switched |
| 5 | `<director_notes>` (`:103-110`) | Per-thread instructions (added `5148668`, 16 June) | When edited |
| 6 | `<core_directives>` (`:112-121`) | "You are bound absolutely by the constraints in `<durable_state>`"; COGNITIVE BOUNDARY; AFFECTIVE OVERRIDE; SPATIAL ENFORCEMENT; treat every field as "hard programmatic constraints" | Never |
| 7 | `<example_conversations>` (`:123-125`) | The sheet's examples | When edited |
| 8 | `<response_contract>` (`:127-139`) | React first, one new beat per reply, no repetition, at most one question, never write for the user, finish sentences | Never |
| 9 | `<continuity_and_variation>` (`:145-157`) | Anti-repetition rules; "Build forward from durable_state.narrative_state.last_turn_beat … never reopen anything listed in resolved_threads" | Never |
| 10 | `<durable_state>` (`:160-172`) | `JSON.stringify(snapshot, null, 2)`: **the whole snapshot**, ids and all | Every turn |
| 11 | `<pins_timeline>` (`:174-186`) | "Pinned branch facts:" and "Recent high-importance timeline beats:" | When pins or beats change |

The messages after the system prompt are the last **4** committed turns as real user and assistant messages,
including hidden starter seeds (`RECENT_SCENE_TURN_WINDOW = 4`, `turn-projections.ts:4, 168-176`), then the new user
message (`generation-service.ts:142-147`). A regenerate builds the prompt from the **parent** turn's snapshot and the
turns before the replaced one (`:309-337`).

### 3.2 Always included, selected, budgets

- **Always, whole**: the snapshot. There is no selection by scene, presence, relevance or recency, and no size
  budget. Everything the extractor ever added and never invalidated is sent on every turn.
- **Selected**: timeline beats, importance ≥3, the five newest on the active branch, oldest first
  (`src/lib/ai/generation-helpers.ts:48-56`, ordered newest-first by `thread-reader.ts:45-63`). So the beats are
  pure recency.
- **Pins**: every active pin on the active branch, newest first, no cap (`thread-reader.ts:65-84`).
- **Raw transcript**: 4 turns. Older prose reached the model only through `story_summary` (8-12 sentences for the
  whole Story), `scene_summary`, the facts and five beats.
- **Earlier generations**: W1 sent the full transcript with labelled lines of state (`git show
  98ac872:src/lib/ai/roleplay-prompt.ts`). W2 sent `<durable_memory>` (story summary, relationship, user facts,
  resolved threads) and `<current_scene>` (scene summary, last beat, active threads, next-turn pressure, scene goals)
  as prose bullets, with the same 4-turn window (`git show 894c352:src/lib/ai/roleplay-prompt.ts`). W3 switched to
  the JSON dump.

### 3.3 Knowledge boundaries and secrets

**One model, given everything, told to respect boundaries.** Every entity's `secrets` and `knowledge_boundary` are
inside the same `<durable_state>` that one model reads while voicing every character and NPC. Nothing is filtered by
who is speaking or who is present. The only protection is the instruction "COGNITIVE BOUNDARY: Under no circumstances
may an entity act upon, reference, or hint at information absent from their specific knowledge_boundary in the state
JSON" (`roleplay-prompt.ts:116`). `memory.md` section 5 reviews the research on why models apply this kind of
filtering badly (Perceptions to Beliefs, SimpleToM, TimeChara). The Android build reached the same conclusion from
practice: characters answered the player's unvoiced thoughts, and the extractor filed those thoughts as other
people's knowledge (android: `docs/adr/0028-the-unspoken-is-the-players-alone.md`).

### 3.4 Prompt caching

`cae049f` moved the examples and the response contract ahead of the state "to maximize prompt prefix cache hits", and
`083dc12`, `52e5094` and `5148668` kept every later addition in the static part. But `<durable_state>` is
regenerated every turn and sits in the system prompt, and the 4-turn window slides, so everything after section 9 is
new on every turn **(inference)**. Caching could only ever cover the static instructions and the character sheet.

---

## 4. Pins

### 4.1 Web

- **What**: a short fact the player saves from a message. The message's "Pin fact" control opens a sheet ("Save a
  branch-local memory") prefilled with the whole message text for the player to cut down
  (`src/components/chat/chat-workspace.tsx:240-241`, `src/components/chat/chat-action-ui.tsx:42-49`).
- **Limits**: a body of 1 to 500 characters (`src/lib/validation.ts:13, 62-65`); only from a turn on the visible
  active path (`src/lib/services/pin-service.ts:16-22`).
- **Storage**: `chat_pins` with `thread_id`, `branch_id`, `turn_id`, `body` and `status` (`src/lib/data/pins.ts`).
  "Remove" sets `status` to `resolved` rather than deleting (`:45-67`).
- **Use**: every active pin on the active branch whose turn is still reachable (`thread-assembly.ts:40-45`) goes into
  every reply's `<pins_timeline>` verbatim, after the snapshot, as "Pinned branch facts". The **extractor never sees
  pins**: they are not in its input, so a pinned fact never became state.
- **A defect**: pins and timeline rows are listed by `branch_id = active branch` (`thread-reader.ts:45-84`), and
  `create_branch_from_turn` copies neither. A fork therefore loses every pin and beat made on its parent, even those
  on turns the two branches share. The Android build named this and fixed it as "Branch-valid Side State".

### 4.2 Android

- **What**: "A fact the player pins to a Roleplay Exchange from the chat, in their own words, trimmed from that
  exchange's reply" (android: `CONTEXT.md`, Pin). `chat_pins {id, thread_id, branch_id, turn_id, body, status
  active|inactive}` (android: `app/src/main/java/com/example/open_fantasia/data/local/entity/RoomEntities.kt:337-357`);
  `addPin` and `removePin` in `ui/chat/ChatViewModel.kt:883-914`; removal keeps the row.
- **Branch-valid**: filtered by the branch's lineage, not by exact `branch_id` (`resolveLineageState`,
  `data/local/dao/ChatDao.kt:589`), carried onto the clone when an exchange is edited, and frozen while a checkpoint
  holds the branch.
- **Reply prompt**: a "Pinned:" list inside `<pinned>`, after the Dossier and before the timeline beats
  (android: `app/src/main/java/com/example/open_fantasia/domain/reducer/PromptBuilder.kt:173-178`).
- **Continuity Engine**: unlike the web build, every update receives the pins' bodies
  (android: `tools/continuity-worker/compiler.mjs:450`), though `PROMPT.md` never says what to do with them. The
  Director does not receive them.
- **Use**: the backup database holds **0 pins**, and the web build's live database is not available to count. Pins
  existed in both builds from the start and appear never to have become part of how the player played
  **(inference)**.

---

## 5. What worked, what broke, what changed

### 5.1 Chronology of fixes and reversals (web)

| Date | Commit | What happened |
|---|---|---|
| 8 Apr | `f0c6dd3`, `9352636` | Repetition loops: "Rename 'Active threads to develop' to contextual labels that don't drive the model to re-raise resolved topics"; reconciler told to "aggressively resolve loops when the user has answered". The memory's own open-loop lists were making the model re-raise things. |
| 14-18 Apr | `7f8ca20`, `7771cdf`, `de48180` | Continuity stalls from the queued reconciler; moved inline. |
| 23 Apr | `894c352` | W2: summaries plus capped lists, 4-turn window, and the only quality eval ever written (5.4). |
| 23 May | `6c0ef50` | W3: the seven-table HCE. Stubbed the eval. |
| 23 May | `914b96c` | PR review: 9 "critical/major" fixes in the first day, including `t_expired` written as a UUID in six places, `NEW:` double-prefixing, and invalid mutations "leaking" into the database. |
| 24 May | `d8ef018` | Facts given ids. Before this the prompt told the model facts "do not have explicit IDs in the snapshot … If you cannot reference a fact_id, do not emit an invalidate", so **no fact could ever be invalidated**. |
| 24 May | `d2c9346` | "HCE not working on production": an empty encryption key made every extraction fall back to carry-forward; Mistral Large could not do structured output for discriminated-union schemas (`NoOutputGeneratedError`); JSON truncated at 2,000 output tokens, raised to 8,000. Verified with "9 entities tracked, 8 facts, 4 relationships, 9 locations, 6 narrative threads, 5 timeline events". |
| 25 May | `336afe3` | "7-bug failure cascade": one missing ancestor snapshot "poisons the entire chain"; placements were never invalidated (wrong key); duplicate entities from repeated `add`; known locations failing validation; the reflector never shown edge errors; errors logged as `[object Object]`. |
| 26 May | `cae049f` | DeepSeek, the separate brain model, prompt reordered for caching. |
| 30 May | `035e499`, `2f00dd8`, `e7f05b6`, `2216ecb` | W4: tables replaced by one JSONB blob per turn (section 5.2). |
| 2 Jun | `ff327f9` | After the switch to service-role auth, every turn RPC was rejected (`auth.uid()` was null), so no turn committed and "the HCE Continuity Inspector showed empty". Added `scripts/backfill-snapshots.ts`. |
| 6 Jun | `627eb06`, `8465240` | Background `after()`, then back to inline (2.1). |
| 6-16 Jun | `083dc12`, `52e5094` | More anti-repetition text: the reply model "keeps remixing its previous reply". The first version had examples "lifted from one live scene" that "leaked scene content into every character's prompt". |

### 5.2 Why the seven-table model was replaced

From `2f00dd8`, `e7f05b6` and the reducer's header (`world-state-reducer.ts:101-110`):

- **No atomicity.** Applying one turn was "~30 sequential, transaction-less writes to 7 normalized tables", so a crash
  mid-apply left the world half-written. The 7-bug cascade (`336afe3`) shows those partial states happening.
- **Branching needed copying.** Rows were scoped by `(thread_id, branch_id)` and a fork had to run
  `copyWorldStateToBranch`. Keying snapshots by `turn_id` gave "transparent ancestor-snapshot sharing with full
  divergence isolation".
- **Reads were many queries**, one per table, and a missing parent snapshot meant an O(n) walk of round trips.
- **The bi-temporal design was not real (inference from the code).** The materialiser read only current rows
  (`.is("invalidated_at_turn_id", null)` per table, `git show 336afe3:src/lib/ai/state-materializer.ts`), and
  `updateEntity` and `updateRelationship` overwrote in place. There was no way to read the world as of an earlier
  turn, so a regenerate from a parent turn read the head's state. `valid_from_turn_id` and `t_expired` were written
  and never queried.
- **Turns piled up.** Rewrites left their replaced turns behind: "live DB had 66 turns for ~15 real ones". The JSONB
  change added `commit_turn(p_replace_turn_id)` so a replaced turn and its snapshot are deleted.

The price of the JSONB fix was that history inside a snapshot went away: invalidation now deletes, and provenance
went with the tables.

### 5.3 How much it was actually used

The backfill when the tables were dropped found **15 snapshots** in the live database ("15/15 snapshots backfilled",
`035e499`), and `ff327f9` says no turn could commit for a time after 30 May. The web HCE was never run on a long Story,
so its scaling problems in 5.6 are read from the code, not observed. The Android build is where they were measured
(section 6).

### 5.4 Evaluation

- **The only eval** (`894c352`, `src/lib/ai/evals/hybrid-memory-eval.ts`, run by `pnpm eval:hybrid-memory`)
  compared a baseline (full transcript plus the old prompt) with W2 (memory plus 4 turns) on **three fixtures** of
  four turns each ("Do not reopen answered questions", "Break out of repetitive emotional circling", "Push the plot
  forward under active pressure"; `hybrid-memory-fixtures.ts`). A model judge scored forward progress,
  non-repetition, continuity retention and character consistency from 1 to 5. It tested repetition and pacing on
  four-turn scenes, not memory over a long Story.
- **No results were committed.**
- **HCE Phase 1 replaced it with a stub** that throws "Hybrid memory evals are not yet implemented. This is planned
  for Phase 3." (`hybrid-memory-eval.ts:40-48`, unchanged at HEAD). Phase 3 never came.
- **The unit tests** cover the reducer's mechanics (`world-state-reducer.test.ts`: `NEW:` resolution, purity,
  invalidation cascade, thread resolution), the empty snapshot, the prompt's section order, and the 4-turn window
  (`generation-helpers.test.ts:99`). Nothing tests what was extracted, whether a reply honoured it, or whether a
  secret leaked.
- `scratch/test-hce-detailed.ts` and `scratch/test-mistral*.ts` are one-off scripts against the live database used
  while debugging extraction.

### 5.5 What worked

- **Per-turn full snapshots keyed by turn** made branching, regenerate and rewind correct at once: a regenerate
  reads its parent's snapshot, a rewind deletes later turns and their snapshots cascade, and a fork shares ancestor
  snapshots with no copying.
- **A pure reducer with injected ids**, testable without a model or a database, and one atomic write.
- **Validation that drops bad operations** instead of failing the turn, with a correction pass when most of them are
  bad.
- **`NEW:` names** let one response create an entity and refer to it.
- **Name-based merging** of a re-added entity or location.
- **The structured-output fallback**, which made several providers usable.
- **The inspector**: the player could see the summaries, entities, emotions, relationships, location, threads,
  beats and pins (`docs/workflows.md` §12).

### 5.6 What broke, by kind

1. **Extraction was fragile and failed quietly.** Schema features some providers cannot decode, truncated JSON, and
   environment errors all fell through to carry-forward, a snapshot identical to the last apart from a placeholder
   beat. The player saw no difference except a frozen world (`d2c9346`: "causing the entire HCE pipeline to crash to
   deterministic fallback"). The Android build rejected carry-forward on principle: "it makes continuity truth
   conditional on delivery luck" (android: `docs/adr/0008-the-continuity-engine-never-handles-identifiers.md`).
2. **Referential mistakes were the main failure**, and they came from asking a model to copy ids: unknown ids, a fact
   that could not be invalidated, duplicates from repeated `add`, placements never cleared. The Android build later
   measured the cost (an 8.5-minute engine run discarded for one mistyped UUID) and removed ids from what the model
   sees (section 6).
3. **Everything merged and nothing left.** Facts appended forever, relationships could be added twice, and the
   defragmentation prompt forbade removing anything not clearly contradicted. On the Android build, with the same
   merge-only rules (and an identity bug, 6.5), one thread reached 304 entity records, and the reply prompt became
   88% state and 2.3% instructions (android: `docs/adr/0010-…`, `0018-…`). Android's own diagnosis: "A memory with no
   consolidation rule becomes a landfill".
4. **Summary drift.** `story_summary` was rewritten from the last summary plus 15 turns on every turn: the recursive
   summarisation whose error rates `memory.md` section 4 cites. It was also the only carrier of anything older than
   15 turns that was not a fact.
5. **The JSON was presented as law.** "Treat every field in `<durable_state>` as hard programmatic constraints",
   "The JSON state is absolute truth" and "Characters can only move to adjacent locations", over a world graph that
   was extracted from prose and certainly incomplete **(inference)**. An emotion recorded three turns ago became a
   constraint on the next reply.
6. **Repetition was a constant complaint**, fixed four times with prompt text (`9352636`, `083dc12`, `52e5094` and
   the response contract). W1 to W2 found that the memory's own lists (open loops, hooks) drove re-raising.
7. **Latency.** The extraction's input was the whole snapshot plus 15 turns and its output could reach 8,000 tokens.
   Inline, it kept the request open long enough to hit the Vercel timeout (`627eb06`); in the background it could be
   skipped by the next turn (`8465240`). The web build never resolved this.
8. **Defragmentation grew with the Story**: the whole transcript every ten turns.
9. **Documentation drifted from code.** `docs/data-model.md:188` still says "continuity materialization runs in the
   background (via `after()`)", and the hand-maintained database types still listed dropped tables (`2216ecb`).

---

## 6. The Android build: how the continuity worker differed

### 6.1 Two phases

- **A1, the HCE on the phone (26 June to 8 August).** The baseline commit is the web W4 pipeline ported to Kotlin;
  its extraction prompt still opens "You are the Hybrid Continuity Engine (HCE) state extractor".
  - `ChatViewModel.materializeSnapshotForTurnInBackground` ran after every reply in a background coroutine, so it
    never blocked the chat (`git show ec8c390:app/src/main/java/com/example/open_fantasia/ui/chat/ChatViewModel.kt`,
    lines 615-700).
  - Inputs and settings: the thread's brain model on a direct API, temperature 0.15 (0.1 for reflection), the last 28
    messages plus the new turn (15 exchanges, as on the web).
  - Defragmentation over the whole history once 9 incremental snapshots had passed since the last full one
    (`shouldDefragment`, lines 598-614).
  - On failure, carry-forward.
  - `0c450cc` (8 August) deleted it as unreachable: "21 unit tests were asserting against logic nothing could
    reach".
- **A2, checkpoints on the Mac (from 19 July, `2bf6d72`).**
  - Why: cost. ADR-0001 chose a Mac-side worker "without paid in-app HCE calls", running Codex on the player's
    subscription only when a request exists (android: `docs/adr/0001-event-driven-continuity-checkpoint-worker.md`).
  - Transport: at first the worker watched the phone over ADB; then Tailscale (ADR-0002); then one host shared by
    continuity, roleplay and portraits (ADR-0004).
  - Cadence: every 7th exchange at first (`2bf6d72` CONTEXT.md), then every 15th
    (android: `app/src/main/java/com/example/open_fantasia/domain/model/BranchHistory.kt:179`, `CADENCE = 15`).

### 6.2 What it stored at the end

`DurableMemorySnapshot` (android: `app/src/main/java/com/example/open_fantasia/domain/model/DurableMemorySnapshot.kt:11-104`),
one JSON row per checkpointed exchange in `world_snapshots(turn_id, thread_id, world_state, version)`:

- `metadata`: `current_turn_id`, `version`.
- `spatial_state`: `current_location`, `adjacent_locations`, `known_locations`, `entity_placements`. There are no
  edges.
- `entity_state[]`:
  - identity: `entity_id`, `canonical_name`, `entity_type`, `person_id` (the link to a Person in the Story),
    `aliases`;
  - `account`, the compacted prose of up to 4,000 characters (6.5);
  - `voice_samples`, up to 10 verbatim spoken lines;
  - current state: `is_present`, `primary_emotion`, `emotion_intensity` (0-100), `emotion_catalyst`;
  - five fact buckets of `{id, body}`: `knowledge_boundary`, `traits`, `secrets`, `abilities`, `possessions`.
- `relational_state[]`: as on the web.
- `narrative_state`: `story_summary` (up to 20,000 characters), `scene_summary` (8,000), `last_turn_beat` (4,000).

Beside it, as "Branch-valid Side State" read through the branch's lineage: timeline beats (at most 7 per update,
anchored to the snapshot that wrote them), pins and the Director's `story_plans`. Who is in the Story is
`thread_people`, not the snapshot. The Story Clock is kept per exchange on `chat_turns`, from what each reply reports.

**Removed from the web shape, and why:**
- `goals`, `narrative_timestamp` and `transition_type`: "the engine records and never plans" (ADR-0031);
  wants moved to the Director's Agendas and time to the Story Clock.
- `active_threads` and `resolved_threads`: ADR-0023 (6.5).
- Location `edges`: only the engine ever read them back to itself (ADR-0033).
- Fields added in A2 and removed again: a `cast_roster` with provenance, `manual_locks` and evidence (ADR-0014,
  ADR-0032), and a `salience` map (ADR-0010, removed by ADR-0033).

### 6.3 The pipeline

1. **Checkpoint (phone).** `createCheckpointIfDue` runs inside the commit transaction
   (android: `data/local/dao/ChatDao.kt:311-326`). The row in `continuity_checkpoint_requests` freezes the engine,
   the baseline and the People sent. The lineage is then read-only until a snapshot is accepted and the Director
   has planned. An early update can be asked for (`requestEarlyCheckpoint`, `:329`), and an edit at or before the
   Baseline forces one (ADR-0015). A Rewind never needs one, because the nearest reachable snapshot plus the retained
   exchanges after it is already correct (ADR-0013).
2. **Request.** `ContinuityProtocol.buildRequest` (android: `data/continuity/ContinuityProtocol.kt:101-123`) sends
   the People, Notes, the Opening, active pins, the baseline snapshot and **only the exchanges after the Baseline**
   (ADR-0016). It is POSTed to the Mac Host over Tailscale and polled every 10 seconds.
3. **Engine (Mac).** The host is `tools/continuity-worker/host-server.mjs`, a LaunchAgent. It drives headless CLIs
   on the player's subscriptions: Codex `gpt-5.6-terra`, `gpt-6.1-sol`, `gpt-6-sol` and `gpt-5.5` at high effort,
   Antigravity `gemini-3.6-flash:high` and Claude Code `opus:high` (`host-server.mjs:43-46`). Each call is isolated
   and stateless (ADR-0026), with a 30-minute timeout (`config.json`), and continuity jobs run one at a time.
4. **Prompt.** `PROMPT.md` (205 lines): "You author meaning. The Mac Host owns bookkeeping."
   - The task is built by `projectContinuityEvidence` (`compiler.mjs:413-507`): every object carries a readable
     handle (`vera`, `vera.secrets.1`), exchanges are cited as `"#12"`, and "There are no other identifiers anywhere
     in this task".
   - Output is a **Continuity Draft** (`draft.schema.json`):
     - `narrative`: the three summaries, always rewritten whole;
     - `scene`: a complete replace-set of who is present, where and feeling what;
     - `operations`: `describe_entity`, `assert_fact` (which can amend a fact by handle), `relate`,
       `describe_location`, `compact_entity`, and removals (`retract_fact`, `retire_entity`, `remove_relationship`,
       `forget_location`) that must cite `#n` or `superseded`;
     - up to seven `timeline_events`.
   - The prompt also asks for a **register**: "Say what happened", "One claim per fact", "Do not restate … amend it in
     place", "Length follows content".
   - It states the Unspoken: the player's unvoiced thoughts are recorded "as the player's own", never as anyone
     else's knowledge.
5. **Compile.** `compileContinuityDraft` (`compiler.mjs:535-988`), deterministic with no model, applies the draft
   to the baseline:
   - it assigns every id, protects Person entities and cascades removals;
   - it reports typed defects: recoverable ones drop an operation, fatal ones fail the update. `thin_world_state`
     flags a draft that names people but records nothing about them.
   - `runContinuityAttempts` (`host-lib.mjs:137-237`) allows two attempts, the second a repair of the stored draft
     with its defects (ADR-0011). `snapshot-validator.mjs` checks the result.
6. **Accept (phone).** Kotlin re-validates the same invariants independently (`ContinuityProtocol.kt:125`).
   `acceptCheckpoint` (`ChatDao.kt:270`) stores the snapshot and beats and queues a Director run. A failed update
   leaves the checkpoint in force. Degraded snapshots are never accepted.
7. **Director** (from 2 October, ADR-0031, `tools/continuity-worker/DIRECTOR.md`). On the same engine: four
   "Directions", three critics, one Story Plan (Agendas, two or three Pressures, a Calendar, up to three
   Contingencies, a Fact Sheet, new People). It reads the snapshot, the last 4 exchanges and the plan's outcome so
   far.

### 6.4 How the state reached the reply model

`PromptBuilder.render` (android: `app/src/main/java/com/example/open_fantasia/domain/reducer/PromptBuilder.kt:343-382`)
renders one total `RoleplayContext` (ADR-0014):

1. **System prompt, static part** (`:41-102`), in order: `<you>` (the two writers, the Unspoken, "Pick up from the
   effect of it"), `<setting>`, `<voice_card>` (the main character: who, Agenda, Convictions, loves and hates, Voice
   Samples, appearance), `<player>`, `<notes>`, `<facts>` (the Director's Fact Sheet), `<what_follows>`
   (Contingencies), and `<opening>` until the first snapshot exists.
2. **System prompt, continuity part** (`:162-192`), appended after it:
   - `<where_things_stand>`, the **Dossier**, prose rendered by code (`DossierRendering.kt`): WHERE; WHO'S HERE; NOT
     IN THE ROOM RIGHT NOW (or THE PEOPLE IN THIS STORY); BETWEEN THEM; THE STORY SO FAR; THE SCENE. Facts read as
     "Knows:", "Keeping to themself:", "Can:", "Has:"; emotion intensity becomes an adverb. No ids, versions or
     numbers. Each person present also carries the Director's Agenda for them ("After:", "In the middle of:", "Next
     move:", "Has to be:") and their last three lines ("Has said:") (`DossierRendering.kt:150-196`).
   - `<who_else>`: everyone else, as a line or a name.
   - `<pinned>`: pins, then timeline beats, oldest first.
   - `last_turn_beat` is **not** sent, since the reply model has that exchange verbatim (ADR-0033).
3. **Messages**: the last **15** exchanges as raw prose (`RoleplayContext.kt:34`, `MAX_TRANSCRIPT_EXCHANGES = 15`).
4. **The current message**: an optional `<speaker_profile>`, the player's prose, then `<whisper>` last: who speaks,
   the Pace, the clock, what is due, a Pressure's next sign, any Revision, the Reply Length, the Scene Report
   format, and three of the speaker's lines.

**What is selected.** The **Stage** (android: `domain/model/Stage.kt`, ADR-0018) is a deterministic projection
that decides **resolution, not membership**:
- People in the room get their complete record. The room comes from the newest Scene Report since the Baseline,
  otherwise from the snapshot.
- Everyone is described in full while all the People together come to 6,000 characters or less.
- Above that, people out of the room get one line each ("the wings", capped at 8,000 characters, demoting whoever
  was mentioned longest ago). Other entities tied to someone present get a line, and everyone else a name.
- Only relationships touching someone present are sent.
- "Nobody the story knows is left out, so a Roleplay Model can always call for a character it cannot currently see
  and can never invent a second one who already exists" (CONTEXT.md, Stage).
- Timeline: 32 beats, the 12 just behind the scene plus the strongest beat of each of 20 equal eras
  (`Stage.kt:51-61`).

There is no overall token cap; a Mac lane fails visibly above 768 KB (`host-lib.mjs:15`). In the backup database
the reply system prompts ran from 26.7k to 128.8k characters (average 61.4k), and the stored messages from the
transcript averaged 50.0k characters of JSON.

**Knowledge boundaries.** Still one model given everything about whoever is on stage, secrets included. What
changed is the framing: the JSON "COGNITIVE BOUNDARY" rule became prose, with each person's knowledge stated as what
they know, and the Unspoken stated as a fact about the story ("the people you play know only what they heard and
saw", `PromptBuilder.kt:62`). A visibility field on world events (`public`, `rumour`, `known`) appears only in the
untracked ADR-0034.

**Caching.** The continuity part changes only when an update is accepted, a pin changes or a reply reports a
different room. Everything that changes every reply sits in the whisper at the very end. The Active Speaker is kept
out of the projection so changing speaker leaves the system prompt byte-identical (ADR-0018).

### 6.5 What was measured

| Finding | Evidence |
|---|---|
| A Codex run of about 8.5 minutes was discarded for one mistyped UUID; "its blast radius was total" | android: ADR-0008, `58688ac`, `bc5e260` |
| Asking the engine to re-emit the whole snapshot failed three checkpoints running (two dropped Cast Seeds, one duplicate name). Draft plus compiler: ~555 s and failing → 192 s and passing; request 165 KB → 103 KB | `61a8a66`, ADR-0010 |
| The first draft named fifteen people and recorded nothing about them, which "still compiles, because omission legitimately means unchanged" | `61a8a66` (hence `thin_world_state`) |
| Identity minted from the per-update `request_id` turned 24 people into **304 entities**. The reply prompt reached **96,500 tokens, 88% state and 2.3% instructions**; four of the 304 were in the room | `f9767ef`, ADR-0010, ADR-0018 |
| The Stage cut the system prompt from 342,992 to about 162,700 characters | ADR-0018 |
| The engine rated 120 of 229 beats 5/5; a recency cap then sent beats 205-228 only, "so a betrayal a fifth of the way in was unreachable"; era ranking widened coverage to beats 3-228 | ADR-0018, `dbafe43` |
| "36 active threads, every one flagged active, zero dependencies"; five of six sampled were recap, not objectives; they cost 32,008 characters and were "a plausible source of the circling that a person using this app has complained about since the beginning" | ADR-0023, `93f3495` |
| Snapshot 306,574 characters at 535 exchanges, growing about 11,700 per update; the engine's input was 89% "the world it already wrote"; `story_summary` held 535 exchanges in 9,287 characters while `entity_state` took 169,044: "rewriting forces selection and merging never asks" | `docs/plans/memory-hierarchy.md`, `b868443` |
| One character reached 105 facts and 51,480 characters "to establish that she is protective and quick-tempered" | `b868443` |
| One `compact_entity` pass: `entity_state` 165,522 → 58,066; snapshot 306,574 → 164,487. Over twenty synthetic updates `entity_state` levels off at 14,113 while the control passes 111,589 | `b868443` |
| Sending the full lineage as evidence failed at 197 exchanges (`ARG_MAX`); 92% of it restated the Baseline; 790 KB → 241 KB once only post-Baseline exchanges were sent | ADR-0016 |
| Facts averaged 389 characters under prompt wording that read as quotas ("not permission to write little"), against 150 elsewhere; replaced by the register | `memory-hierarchy.md`, `dbafe43` |
| A schema typo made every Codex update fail for days; the app retried on Claude, "so the Codex lane looked unpopular rather than broken" | `c5056ad` |
| Recall over old exchanges (`f68039a`) fired on 96% of 2,040 replayed turns, a median of 75 exchanges back, a quarter on one shared word. Two A/B tests showed no effect on replies: "before investing in better retrieval, establish that recalled prose can move a reply at all". Removed | `2a8aaee`, `46efdf2`, ADR-0033 |
| A rule to bring something new into every reply "made a quiet scene unreachable" | `f9767ef`, ADR-0019 |
| 68 exchanges: 0 scenes closed, 56 replies carrying a Pressure sign; the untracked plan moves continuity to scene boundaries | android: `docs/adr/0034-…` (untracked) |
| "The architecture has changed about ten times, and each change left its predecessors in place"; rebuilt from an empty database on 2 October | ADR-0033, `1ae3114` |

**What held up by the end:**
- **Reliability.** After the draft and compiler, the preflights and the parity fixtures, every checkpoint and
  Director run in the backup succeeded first time (section 7).
- **Branching.** Rewind needed no update at all (ADR-0013), and side state followed the lineage.
- **Prompt size.** The Stage kept the reply prompt bounded by the scene rather than by the Story.
- **Consolidation.** Compaction made `entity_state` level off in the synthetic test.
- **Cost.** It moved to subscriptions, which was the reason for the whole design.

The price was latency, paid in long blocking holds.

### 6.6 The parity tests

- **`ContinuityEngineParityTest`** (android: `app/src/test/java/com/example/open_fantasia/data/continuity/ContinuityEngineParityTest.kt`,
  added in `f9767ef`) checks that the engines the phone offers are exactly the engines the host knows. It scrapes
  `host-server.mjs` for `CODEX_MODELS` and the `*_CONTINUITY_ENGINE` constants, and compares them with
  `MacHostPreferences.SUPPORTED_CONTINUITY_ENGINES`. It exists because an engine the host does not know would be
  frozen into a checkpoint and lock the lineage. It says nothing about snapshot quality.
- **`ContinuityValidationParityTest`**, with `tools/continuity-worker/parity.test.mjs`, runs the same 24 fixtures in
  `fixtures/validation/` through the Kotlin and JavaScript validators, so phone and host reach the same verdict
  (`005203e`).

### 6.7 The differences in one table

| | Web HCE (W4) and Android A1 | Android A2 |
|---|---|---|
| Cadence | Every turn | Every 15 exchanges, or on request, or after an edit that moves the Baseline; presence and clock refreshed every reply by the Scene Report (ADR-0021) |
| Blocking | Web: inline in the request; A1: background, never blocking | The lineage is read-only until the snapshot is accepted and the Director has run |
| On failure | Carry the old snapshot forward silently | Never accept a degraded snapshot; Retry, another engine, or Rewind |
| Model | A BYOK API "brain" model (Mistral, on the web) at temperature 0.15 | Frontier models at high effort through subscription CLIs, up to 30 minutes a call |
| Output | Mutations naming raw ids, plus `NEW:` names | A draft naming handles and `#n` ordinals; the compiler owns identity |
| Repair | A fresh reflection pass when more than half the operations are invalid | One repair of the stored draft, with typed defects |
| Validation | Referential, in one place | Two independent validators pinned by shared fixtures |
| Evidence | Last 15 turns, the whole transcript every 10th | Only what the Baseline does not cover |
| Consolidation | Defragmentation that may only add or amend | `compact_entity` on three host-chosen candidates, by size |
| Present scene | Merged, so someone who left stays placed | A replace-set: whoever is not named is absent |
| Reaching the reply model | The whole snapshot as JSON, "hard programmatic constraints" | A deterministic Stage rendered as prose, by presence |
| Planning | The extractor also wrote threads and objectives | The recorder never plans; a Director does |

---

## 7. The legacy backup

`phone-database-2026-10-04.db`, opened read-only, is the Android **v2** schema (Room `user_version` 4) from after
the 2 October rebuild. It holds one Story, played from 2 to 4 October 2026:

| | Count or measure |
|---|---|
| Committed exchanges | 71, every reply by `claude-code:opus-5.5:high` through the Mac Host; 70 stored a Scene Report and a clock |
| People | 53 |
| Snapshots | 4, at exchanges 15, 30, 45 and 60 |
| Checkpoints | 4 of 4 accepted on `codex:gpt-6.1-sol:high`, no retries, no failure text; 9.1, 9.1, 14.9 and 8.3 minutes from request to acceptance; 101-112 KB of People sent each time |
| Director runs | 6 of 6 accepted (1 start, 4 update, 1 edit); 5.3 to 12.3 minutes each |
| Story plans | 6, growing from 11.6k to 29.8k characters |
| Timeline beats | 28: 7 per update, always the maximum; importance 2: 3, 3: 6, 4: 15, 5: 4 |
| Pins | 0 |

| Snapshot | Exchange | JSON characters | `entity_state` | Entities (Persons) | Relationships | Facts | Voice lines | `story_summary` |
|---|---|---|---|---|---|---|---|---|
| v1 | 15 | 52,911 | 32,943 | 53 (46) | 21 | 81 | 56 | 6,008 |
| v2 | 30 | 77,240 | 46,120 | 56 (46) | 32 | 153 | 93 | 10,537 |
| v3 | 45 | 103,343 | 59,190 | 60 (47) | 41 | 219 | 136 | 16,096 |
| v4 | 60 | 113,188 | 67,541 | 63 (52) | 44 | 255 | 167 | 15,783 |

What it shows:
- **Growth.** The snapshot grew by 24,300, 26,100 and 9,800 characters at successive updates, and the facts more
  than tripled between exchanges 15 and 60. No entity had yet been compacted; the largest was 6,723 characters, just over the 6,000 threshold.
- **The summary.** `story_summary` reached 16,096 of its 20,000-character ceiling by exchange 45, then shrank
  slightly at exchange 60.
- **The hold.** Update plus Director held the chat for **about 14 to 27 minutes every 15 exchanges**.

---

## 8. For the new design

The current build already has several of the right answers: the Path as the only truth, the State as a reducer
(docs/adr/0015), memory written at a Scene's end by agents that are not the reply-writers, `knownTo` filtering
before the call, and Moments carrying quotes. What follows is what the two earlier builds add to that.

### What to carry into the new design

1. **State as of a point on the Path, and nothing else.** Per-turn snapshots (W4) and exchange-anchored snapshots
   (A2) made branching, regenerate and rewind correct at no cost. W3's "current rows" per branch could not answer
   what was true at an earlier turn. The reducer over the Path already gives this; keep every derived record
   derivable from a point.
2. **The model writes meaning; code owns identity.** Readable handles, a required `new:` prefix, citations by ordinal
   (or here by Scene and quote), and a deterministic compiler that assigns ids, cascades removals and reports typed
   defects (android ADR-0008, ADR-0010). The failures most often recorded in both builds came from a model copying
   identifiers or re-emitting data the host already owned.
3. **Two update rules, chosen per field.** Prose that is rewritten whole stays bounded by selection. Records that
   are merged need an explicit consolidation step, or they grow without limit ("rewriting forces selection and
   merging never asks"). A2's `compact_entity` is the pattern: the host picks a few candidates deterministically by
   size, the model folds facts into an account, nothing is retired into nothing, and a plateau test is the acceptance
   criterion.
4. **The present scene as a replace-set.** Whoever the recorder does not name is absent. Under merge, someone who
   walked out stays in the room until a model remembers to say otherwise.
5. **Evidence is what the record does not already cover.** Do not resend history the record already holds
   (android ADR-0016): it costs, and it grows with the Story.
6. **A deterministic projection that decides resolution, not membership.** Full detail for the people present,
   a line for the rest, a name for everyone else, so the reply model never invents a second copy of someone who
   exists. Give each section a budget with an owner that reports what it demoted (android ADR-0018). The current
   `BUDGET` counts in `lens.ts` are the same idea without the reporting.
7. **State rendered as prose for the reply model**, with no ids, version numbers or integers behind emotions (the
   Dossier). Keep the JSON for the code.
8. **A timeline spine plus a tail.** The strongest beat of each era plus the beats just behind the scene. Recency
   alone loses the middle; importance alone inflates.
9. **The Unspoken, stated in both places.** The reply-writer and the recorder each need to be told that only quoted
   words are heard and only visible action is seen (android ADR-0028). This is the same principle as `knownTo`.
10. **The recorder never plans.** Asking an extractor for objectives, threads or "next-turn pressure" produced recap
    labelled as goals, which the reply model then re-staged (web `9352636`, android ADR-0023). Planning belongs to
    the Director.
11. **Fail visibly, never carry forward silently.** A memory write that fails should stop and say so (android
    ADR-0008), with a failure report the player or Claude can read (android ADR-0029).
12. **Measure before building, and record negative results next to the code.** Android's Recall A/Bs, the
    compaction plateau and the blind Voice Shape replays are the model for the continuity suite proposed in
    `memory.md` section 5.
13. **One total context type with a completeness test**, so a section cannot be dropped silently. Android found its
    timeline resolved and then thrown away by a hard-coded `timeline = emptyList()` (ADR-0014).
14. **A cheap per-reply report between heavy updates.** A2's Scene Report kept presence and the clock current every
    reply while the snapshot updated every fifteen.
15. **Pins in the player's own words, valid by lineage, given to the recorder too.** But the Android backup holds
    none, so a correction tool should start from what the player actually does: Redos with a stated reason, as the
    Malfoy audit shows.

### What not to repeat

1. **Sending the whole state into every reply.** The web dumped the snapshot as JSON with no budget. Android
   reached 96,500 tokens a reply, 88% state and 2.3% instructions, before the Stage.
2. **Asking a model to reproduce host-owned data** (ids, the roster, the whole snapshot) and validating the result
   atomically. One slip discarded a run of eight to nine minutes.
3. **Silent fallbacks.**
   - The web carry-forward froze the world with only a placeholder beat to show for it.
   - A dead Codex lane was hidden by retries on Claude.
   - The docs said `after()` while the code awaited inline.
4. **Merge-only memory, and "audits" that may only add.** "PRESERVATION IS THE DEFAULT" with no consolidation
   produced 105 facts for one temper.
5. **A recursive summary as the only long-range memory.** The web's eight-to-twelve-sentence `story_summary`, and
   W2's capped lists that stayed small by forgetting. Summaries orient; the Path and its quotes are what get
   recalled (`memory.md`, "Keep the original words").
6. **Extracted threads, hooks and pressures fed back as work for the reply model.** In both builds they drove
   re-raising and circling.
7. **"Every reply must add a new beat."** The web's response contract still says it (`roleplay-prompt.ts:130`);
   Android found that the same instruction "made a quiet scene unreachable" (`f9767ef`, ADR-0019).
8. **Every character's secrets in one prompt, guarded only by an instruction.** "COGNITIVE BOUNDARY" in the web;
   on-stage secrets in the Android Dossier. Filter in data first, as the current lenses do.
9. **Extracted state framed as law.** "The JSON state is absolute truth" and adjacency-only movement over a world
   graph extracted from prose. Android deleted the edges as something "only the engine read back to itself".
10. **Recency-only or importance-only selection of beats**, and importance scales the recorder inflates.
11. **Putting the memory write on the reply's latency path, or holding the player for it too long.** The web's inline
    extraction hit the function timeout and its background version could be skipped. Android held the chat for 14
    to 27 minutes every 15 exchanges. The current build waits at a Scene's end (docs/adr/0016), so that wait needs a
    budget and a measurement.
12. **Retrieval before proof.** Recall fired on 96% of turns and did not change replies. Before adding relevance
    search (`memory.md` open question 1), show on a frozen Path that recalled material changes a Reply.
13. **Evidence that resends what the record covers, and defragmentation over the whole transcript.**
14. **Side state scoped to an exact branch id.** Web pins and beats vanished on a fork.
15. **Identity from anything per-update** (`request_id` gave 304 entities for 24 people), or **name-only merging**
    that ignores aliases.
16. **Machinery left in place after it stops acting.**
    - Bi-temporal columns that nothing queried.
    - An eval stubbed "for Phase 3" that never returned.
    - Android's "about ten" architecture changes, each leaving its predecessor behind (ADR-0033).
    - Hand-maintained types listing dropped tables.

    Every field should be traceable to something a model is sent or the player sees.
