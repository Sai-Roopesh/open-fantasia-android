# 0022 — Shared Directions and one writing pass

Date: 10 November 2026. Status: implemented.

## Problem and evidence

The provider switch exposed actual integration differences. Claude had working Story search and passage-reading
callbacks; Codex prompts described those tools without exposing them. A Redo's original instruction reached a
separate Writer, while its Actor received a short generated Beat Note. Subsequent Replies did not receive a
reliable list of the original instructions. Character voice examples were stored but omitted from writing
context. Retrying a failed Editor could regenerate a draft that had already succeeded.

A historical sample of 333 successful Codex calls contained 106 Writer, 111 Actor and 110 Editor calls, versus
only three Director calls. Writer requests represented 42.3% of recorded input characters and Editor requests
28.6%. These are request-size measurements, not subscription quota charges. 103 of 110 Editor results were clean,
three applied corrections and four requested rewriting. The independent check remains useful; the redundant
creative handoff was the first call to remove. No writing model or effort setting was reduced.

## Decision

The ordinary turn is now **one combined writing generation → one independent Editor check**. The Story's selected
Actor model and effort produce both the complete prose and structured Scene metadata. Metadata describes the
Reply instead of becoming a short script passed to another model. Director, Weaver and Chronicler remain event
or checkpoint jobs rather than extra calls on each ordinary Reply. The old Writer job is no longer offered as
an active model setting; historical settings and interrupted old turns remain readable.

Every nonempty Redo Direction is saved verbatim beside the Story, atomically with the Redo entry. It is independent
of Path, survives restarts and appears in a protected `active_directions` section for writing, checking and
planning. Chronicler recording deliberately excludes these instructions: directions are not evidence of events.
The latest correction wins over stale plans; situation-specific corrections retain their scope rather than
requiring the same situation everywhere. The rejected Reply is supplied as noncanonical revision context.

Backstage exposes the complete list with edit, archive and restore controls. There is no ten-item eviction or
Remember checkbox. Instructions are not silently shortened into a lossy preference budget. If the protected
section exceeds its explicit 24,000-token limit, generation reports that it needs shortening or archiving rather
than silently omitting instructions. Exact words, prior edits and archived notes remain stored. New Replies no
longer create inferred global Taste. Existing manually maintained Taste remains supported.

Migration recovers Directions from all Redo entries, including abandoned Paths. It retains matched legacy
model-inferred Taste paraphrases as inactive history so they cannot keep applying after the original Direction is
archived. Raw Redo corrections do not force a deep Director replan at each Scene end; explicit Backstage steering
still can. Answering a planning note does not deactivate its instruction.

A draft, its chosen model, rewrite count and instruction snapshot are saved before checking. An Editor failure
or worker restart reuses the saved draft. A requested rewrite is saved before its second check, and the one-rewrite
limit survives retries. Edits to Directions during generation take effect on the next generation, so the writer
and checker of one draft see a consistent instruction snapshot. Historical unfinished Beat Notes without a draft
can still complete through the old prose-only recovery path.

## Provider integration

Codex now receives native app-server dynamic tools for path-scoped, read-only Story search and passage retrieval.
Only the named Story tools are dispatched, with the existing lookup budget and selected Path head. Unsupported
requests receive explicit errors. Writing threads disable inherited coding workflows, host skills, MCP servers,
personal apps and unrelated native tools through per-thread configuration; the user's global Codex configuration
is untouched. Optional web search remains available to jobs that request it. This uses the installed Codex
app-server experimental dynamic-tool protocol, verified against its generated types and a real retrieval call.
See [the app-server reference](https://learn.chatgpt.com/docs/app-server).

Providers without interactive Story-tool callbacks receive deterministic local evidence selected from the
current Move, with no additional model call. Their sent prompt explicitly says interactive lookups are unavailable.
This is a fallback, not equivalent to interactive retrieval. Codex and Claude retain native tool use.

Native Codex token-usage events and Claude result usage are stored with calls and displayed in traces when
available. Historical calls remain marked unavailable rather than guessed. Known persistent authentication
failures bypass repeated attempts for fifteen minutes and use the configured fallback; transient failures keep
normal retry behavior. Claude query handles and abort listeners are cleaned up on error as well as success, and
failed authentication does not trigger prewarming.

## Continuity and scene control

Only the player's End Scene action ends a Scene (ADR 0021). Long Scenes now record repeatedly as they grow: each
checkpoint extends the cumulative account, while extracting new Moments and facts only from unrecorded passages.
Earlier passages remain retrievable. The most recently closed Scene's remembered Moments are available when the
next Scene opens. Relevant character voice examples now reach the writing model, labeled as cadence examples
rather than remembered events. The CLI prompt inspector displays the actual combined-writing and saved-draft
Editor requests instead of the removed handoff.

## Data and delivery

No Stories, Paths or played entries are removed. Migration adds side-table fields and draft storage; state shape
9 invalidates only the derived cache so it can be rebuilt from unchanged entries. A complete SQLite backup was
created before implementation and another is made immediately before server deployment. The rewritten NBA
series retains its identity, Paths and played progress. Protocol 24 is retained for additive compatibility;
existing Android builds can still play, while the rebuilt APK adds Direction editing, archiving and restoring.

## Validation

All 634 host tests, TypeScript checking and lint passed. Regression coverage includes two-call normal turns, exact Direction persistence and migration, Path/restart
survival, archived aliases, rejected draft context, durable Editor-only retry, instruction snapshots, repeated
long-Scene checkpoints, provider failure handling and native Codex tool dispatch/usage. Android build and 205
unit tests passed. Live checks used isolated data, never appended a turn to the played NBA Story: Codex searched
and read an exact saved passage; a high-effort writing-and-checking turn received all eleven recovered Directions
and completed in exactly two successful calls. These checks establish integration, not a guarantee that every
creative response will match the player's taste or that subscription quota savings equal call-count savings.


## Deployment verification

The LaunchAgent was gracefully restarted with this implementation. HTTPS is listening on port 8765 and honors
contract 24; an unauthenticated request returns the expected pairing error. After migration, all 5,927 played
entries matched their predeployment SHA-256 and all 80 Path heads matched the backup. The rewritten NBA Story has
eleven active exact Directions. SQLite integrity checks passed. The fresh full backup is
`/Users/sairoopesh/Library/Application Support/Open Fantasia/backups/architecture-deploy-20261110-054656/fantasia.db`.

The updated Android APK is `android/app/build/outputs/apk/debug/app-debug.apk`. It is built and checked; no phone
was connected for installation. Install it for the new Direction controls. The server-side writing, retrieval,
retry and manual Scene behavior are already active for existing clients.
