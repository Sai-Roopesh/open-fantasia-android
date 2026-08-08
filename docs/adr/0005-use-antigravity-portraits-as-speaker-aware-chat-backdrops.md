---
status: accepted
---

# Use Antigravity portraits as speaker-aware chat backdrops

Open Fantasia will replace its phone-side Pollinations portrait generation with durable Portrait Generation Jobs executed by the existing Mac Host. Gemini 3.6 Flash High orchestrates Antigravity's managed Nano Banana image tool; Android remains the authority for portrait ownership, source identity, acceptance, and display.

Every existing Primary Character receives one migration replacement, but the current portrait remains visible until a technically valid replacement is atomically accepted. New Primary Characters generate automatically, and changes to name, appearance, core persona, or visual style create a new versioned Portrait Brief. Manual regeneration remains available and no Pollinations fallback exists.

Generated master and thumbnail files are staged under immutable source-version filenames. Android revalidates the current Portrait Brief identity before staging, then atomically swaps the database pointers and accepts the Portrait Generation Job in one transaction. Only after that transaction succeeds may superseded files be removed; a stale or partially written replacement can never overwrite the accepted Character Portrait.

Character Portraits are cinematic 9:16 masters intended to fill the entire chat screen edge to edge. Android stores a compressed 1080×1920 WebP master and derives thumbnail crops locally. The Chat Backdrop follows the Active Speaker, falls back to the Primary Character when a Cast Portrait is unavailable, and uses a fixed readability scrim with translucent message and control surfaces. A per-thread switch and dimness control allow local presentation adjustment.

Cast Portraits are branch-scoped and generated lazily when a Cast Member becomes the Active Speaker. Their Portrait Brief comes from the branch-valid Cast Profile rather than a new transcript scan. Known appearance and manual locks are binding. The Portrait Engine may artistically complete unspecified visual details from role and personality, but those choices remain visual-only and are never written into the Continuity Snapshot or treated as story facts.

Portrait jobs never block roleplay or continuity. The shared Antigravity lane orders queued work as Continuity Updates, Roleplay Generation Jobs, then Portrait Generation Jobs, without preempting active work. Invalid output receives one corrective attempt under a ten-minute watchdog. Failure retains the existing portrait and offers Retry.

Mac-side prompts and image bytes are deleted after Android acknowledges an atomically stored result; unacknowledged portrait content expires after twenty-four hours. The phone migration removes obsolete per-thread HCE configuration and the unused in-app extraction path because the app-wide Continuity Engine is now authoritative.

## Considered Options

- Keeping Pollinations as fallback would make portrait quality, privacy, and failure behavior unpredictable.
- Sending transcripts for Cast Portraits would duplicate HCE work and expose irrelevant narrative prose.
- Blocking Cast Portraits until every appearance field is known would make speaker-aware backdrops unavailable for many legitimate discovered characters.
- Running portraits concurrently with immediate Antigravity work would increase quota contention for a non-blocking visual feature.
