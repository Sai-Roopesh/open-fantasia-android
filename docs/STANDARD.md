# Open Fantasia Engineering Standard

Two north stars govern every architectural and code decision:

1. **Fantastic roleplay prose** — vivid, grounded fiction, consistent character voice, airtight continuity and branch isolation, zero OOC leakage, zero false-positive censorship/rewrites.
2. **Minimal token cost** — 92%+ KV-cache hits across consecutive turns and shared prefixes across background agents, zero redundant LLM calls, lean prompts, direct provider transports.

Removing technical debt means **deleting** legacy layers, shims, and redundant abstractions — never piling wrappers on top of rot. Every rule below is enforced mechanically by `host/scripts/check.mjs` (`npm run check`) and unit/contract tests.

---

## 1. Architecture & Dependency DAG

`host/src/` is a strict acyclic directed graph. **Zero circular imports** are permitted.

Allowed downward layer order (a module may import from its own layer or earlier layers only, plus `protocol/generated` and `time.ts`):

1. `story/` — pure domain types, immutable entry definitions, pure reducer, relevance/day/outline/truth logic. Zero I/O, zero SQLite, zero model calls.
2. `store/` — SQLite persistence (`db.ts`, `tree.ts`, `states.ts`, `beside.ts`, `drafts.ts`), `mac.ts`, `home.ts`, `secrets.ts`, `trace.ts`.
3. `context/` — deterministic four-layer prompt assembly (`lens.ts`). Pure functions over `State`, `Beside`, and `Entry[]`.
4. `models/` — direct provider transports (`codex-direct.ts`, `antigravity-direct.ts`, `claude.ts`), `wire.ts`, `model-call.ts`, `catalog.ts`, `jobs.ts`, `runners.ts`. May not import `agents/` or `engine/`.
5. `agents/` — prompt definitions, `<scene_state>` / JSON parsers, validators, Story lookup tools (`tools/story.ts`), and `step.ts`.
6. `storyfile/` — Story File validation and import.
7. `engine/` — single-queue Story orchestrator, Path operations, Scene End sequencing.
8. `views/` — read-only projections for HTTP/SSE and CLI. Must not import `engine/` (receive pure callbacks or state snapshots).
9. `link/`, `cli/` — HTTP/SSE server, pairing/TLS/Bonjour, CLI commands.

## 2. Prompt & KV-Cache Invariants (Tested on Wire Bytes)

Every direct provider call (`codex-direct`, `antigravity-direct`) is verified by automated wire tests:

1. **Zero harness leakage**: the wire body contains only host-authored prompt text, tool specs, schema, and named protocol constants.
2. **Cross-agent Story Bible prefix sharing**: Layer 1 puts the immutable Story Bible (`<story>`, `<world>`, `<people>`, `<rules>`, `<named>`) **first**, followed by job-specific instructions (`COMPOSER.md`, `CHRONICLER.md`, `DIRECTOR.md`, `WEAVER.md`, `EDITOR.md`).
3. **Per-Story cache sharding**: `prompt_cache_key` / `session-id` is keyed by `(model, storyId)` when `storyId` is set (falling back to `(model, system)` only when `storyId` is null), so Composer, Chronicler, Director, and Weaver share the warmed Story Bible cache on the same model.
4. **Codex `developer` placement**: Codex requests send `instructions: ""` and place `conversation.system` in `input[0]` (`role: "developer"`) so both `gpt-6.2-*` and `gpt-6.1-*` hit 92%+ KV cache.
5. **Strictly append-only open-scene history**:
   - Turn 0 is byte-identical across consecutive turns of a Scene — including across Day View → Turn 2, mid-scene location/cast changes, and `Focus` / `Linger` toggles.
   - Mid-scene state deltas (`place`, `left`, significant time jumps) and active `Focus`/`Linger` cues attach to the current Move turn only when active/changed, never mutating Turn 0.
6. **Single-pass free-text Composer**: prose is never locked inside a JSON schema; `<scene_state>` is parsed forgivingly per field so one minor metadata glitch never discards valid updates or good prose.

## 3. Roleplay & Memory Invariants

1. **Player boundary**: characters may freely act on, touch, push, or confront `you`; only `you`'s spoken dialogue, choices, and inner thoughts/feelings are off-limits. Code checks must never false-positive on physical sensations landing on `you` or on multi-paragraph character dialogue.
2. **OOC isolation**: inline `director note:` / `author note:` / `OOC:` instructions are stripped from Moves before entering history, Chronicler passages, Editor checks, `read_scene`, and FTS5 `story_search`.
3. **Branch isolation**: Path-scoped state (`path_reactions`, `note_answers`) is strictly filtered by ancestor lineage; no global fallback table may leak across sibling Paths.
4. **No silent World skips**: multi-day or multi-hour in-scene time skips still weave off-screen World progression and Landmarks when the Scene closes.

## 4. Size, Complexity & Zero-Dead-Code Ratchet

Ratcheted in `host/scripts/ceilings.json` and enforced by `host/scripts/check.mjs`:

- **Cycles**: must stay at `0` once broken.
- **New files**: max `350` lines (excluding generated protocol files). Existing oversized files have explicit per-file ceilings that **only shrink**.
- **Total hand-written `host/src` LOC**: capped in `ceilings.json` and ratcheted downward as legacy code is deleted.
- **Forbidden legacy patterns**: once a legacy migration shim, dead module, or split-brain field is deleted, it is added to `forbidden` in `ceilings.json` so it can never be reintroduced.
- **Verification**: every change must pass `cd host && npm run check` (architecture gate + `tsc --noEmit` + `vitest run` + `eslint .`).
