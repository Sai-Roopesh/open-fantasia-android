# Antigravity Portrait Backdrops Plan

## Outcome

Replace Pollinations with durable Mac Host portrait generation using Antigravity's managed image tool. Generate cinematic Primary Character and branch-scoped Cast Portraits, use the accepted Active Speaker portrait as an edge-to-edge Chat Backdrop, and remove obsolete per-thread HCE configuration.

## Locked Behavior

- Existing Primary Characters receive one automatic replacement. The previous portrait remains active until its replacement is accepted.
- New Primary Characters generate automatically. Name, appearance, core persona, visual style, engine identity, or prompt-version changes invalidate the Portrait Brief.
- Cast Portraits are generated lazily when a Cast Member is selected as Active Speaker.
- Cast Portrait Briefs use only the branch-valid Cast Profile. Known details and manual locks are binding; unspecified details may be completed artistically but never written back into continuity.
- Primary and Cast portraits use 9:16 composition. Android stores a 1080×1920 WebP master and derives square thumbnails locally.
- The Chat Backdrop fills the screen without corners, follows the Active Speaker, and falls back to the Primary Character or the current solid theme.
- Backdrop presentation is per thread: enabled by default with a 55% dimness value adjustable from 35–80%.
- Portrait work never blocks roleplay or continuity and never falls back to Pollinations.
- The Antigravity queue priority is Continuity, roleplay, then portraits. Active work is not preempted.
- Mac content is deleted after acknowledgement; unacknowledged portrait content expires after 24 hours.
- The app-wide Continuity Engine remains authoritative. Per-thread brain/HCE pickers, fields, and unused extraction code are removed.

## Phase 1: Prove the Image Boundary

1. Run a synthetic portrait request through the signed-in `agy` CLI using Gemini 3.6 Flash High and a fresh private project.
2. Determine the generated artifact path and stdout/stderr behavior without granting blanket filesystem or command permissions.
3. Validate supported output formats and actual dimensions.
4. Lock a deterministic host adapter contract that captures only image artifacts from the private request workspace.

## Phase 2: Extend the Mac Host

1. Add `portrait` as a third durable job type with immutable request identity, owner identity, Portrait Brief, source hash, prompt version, and requested output specification.
2. Add authenticated submit, status, result, acknowledgement, and supersession endpoints under the existing versioned host route.
3. Add a Portrait Engine adapter that invokes Gemini 3.6 Flash High, directs it to use the managed image tool, and captures the resulting artifact.
4. Reject missing, undecodable, animated, oversized, wrong-orientation, or suspiciously small results. Normalize accepted output to a bounded image payload and publish its SHA-256.
5. Allow one corrective attempt and enforce a ten-minute watchdog.
6. Schedule queued Antigravity work by Continuity, roleplay, portrait priority while preserving FIFO order within each class.
7. Delete acknowledged narrative/image files immediately and expire unacknowledged portrait content after 24 hours.

## Phase 3: Migrate Android Ownership

1. Back up and integrity-check the live database before installing the schema change.
2. Replace the old Pollinations task shape with a durable Portrait Generation Job recording subject type, character/thread/branch/cast identity, frozen Portrait Brief, source hash, host request identity, status, attempts, and timestamps.
3. Add Primary Character portrait metadata and branch-scoped Cast Portrait ownership without treating generated visual completion as Continuity Snapshot data.
4. Store new images under atomic versioned filenames. Decode and verify dimensions, hash, and format before switching the active database reference.
5. Generate square thumbnail derivatives locally and delete superseded files only after database acceptance.
6. Persist per-thread backdrop-enabled and dimness settings.
7. Remove per-thread brain connection/model columns and the unused phone-side HCE extraction path through an explicit non-destructive migration.

## Phase 4: Portrait Lifecycle

1. Build Primary Character Portrait Briefs from name, appearance, core persona, and visual style.
2. Build Cast Portrait Briefs from canonical name, appearance, role/background, personality, voice style, goals, evidence, provenance, and manual locks.
3. Never include transcripts, Continuity Summaries, relationships, API keys, transport metadata, or hidden branch content.
4. Queue one replacement for every existing Primary Character using a migration marker so app restarts cannot duplicate work.
5. Queue a Cast Portrait when a portrait-less Cast Member becomes Active Speaker. Use the Primary Character as backdrop until acceptance.
6. Supersede stale jobs when their source hash changes. Late results can never replace a newer portrait.
7. Retain the previous portrait through queueing and failure; expose Retry and Regenerate.

## Phase 5: Chat Presentation

1. Render the accepted backdrop as a fixed, edge-to-edge layer behind the chat Scaffold using crop scaling.
2. Apply a mild blur and a full-screen dark gradient, with stronger protection beneath the top bar, message composer, and controls.
3. Use approximately 62% assistant-bubble opacity, 68% user-bubble opacity, and 78% control opacity with subtle borders and unchanged high-contrast text.
4. Make the top bar, checkpoint cards, speaker controls, input, and action pills visually coherent with the backdrop.
5. Switch backdrop reactively when Active Speaker changes. Ensemble uses the Primary Character.
6. Add a Thread Settings backdrop switch and dimness slider; remove the redundant HCE picker from creation and settings.

## Verification

- Mac unit tests cover job priority, idempotency, stale supersession, timeout, corrective attempts, artifact validation, acknowledgement deletion, and 24-hour expiry.
- Android tests cover schema migration, one-time existing-character queueing, source hashing, atomic acceptance, stale rejection, Cast Profile brief construction, branch isolation, fallback selection, and settings persistence.
- Compose tests cover full-screen crop, no rounded image container, translucent surfaces, primary fallback, Active Speaker switching, Ensemble behavior, and disabled backdrops.
- A real synthetic Antigravity portrait validates the production adapter without touching story data.
- The final connected-phone cutover verifies database integrity and unchanged thread/turn/character counts before allowing migration-generated portrait jobs to run.
