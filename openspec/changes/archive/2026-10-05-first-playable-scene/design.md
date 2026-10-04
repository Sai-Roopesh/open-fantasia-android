# Design

## Context

A new repository with nothing in it but the glossary, the product specs and ADRs 0001–0006. The Mac has Node 22,
the Claude Code CLI (2.1.280), Codex (0.160), Java 21 and the Android SDK (platform 36); the phone is reached over
wireless adb for installs. The Android toolchain that is known to build on this Mac is AGP 9.0.1, Kotlin 2.3.20,
Gradle 9.1.0, Compose BOM 2026.03.01, compileSdk 36, minSdk 30.

## Goals / Non-Goals

**Goals:**
- The foundations every later change builds on, each in its final shape: the tree of entries, Paths, the reducer,
  the engine's turn loop, the Claude pool, the contract and its code generation, the link, the trace log.
- One opening Scene playable end to end on the phone.

**Non-Goals:**
- Any agent other than the Actor, and anything that needs one (Beat Notes, Scene endings, the Day View, Moments).
- More than one Path per Story, Rewind, editing, Redo.
- Reading offline (the phone's cache) and notifications.
- Codex and Antigravity: the Models screen and the other providers arrive with the agents that use them.

## Decisions

### The repository: three parts, one contract

```
host/       TypeScript on Node 22: the Mac server and the `fantasia` command        (host)
protocol/   JSON Schema: the contract, and the Story File format                    (protocol)
android/    Kotlin and Jetpack Compose: the thin client                              (android)
```

The contract is written as JSON Schema files in `protocol/`, and both sides are generated from it: TypeScript types
with `json-schema-to-typescript`, Kotlin `@Serializable` classes with `quicktype --framework kotlinx`. The schema is
the one place a field is added. *Alternatives:* OpenAPI with openapi-generator (heavy, and its Kotlin output drags in
a client we do not want); TypeScript as the source with schemas exported (the Kotlin side would then depend on a TS
build). The host validates every request against the same schemas with Fastify's built-in validator, so a request
the schema refuses never reaches the engine.

### The store: SQLite, a tree of entries, saved states

SQLite through `better-sqlite3` (synchronous, mature; Node 22's built-in `node:sqlite` is still experimental),
one database file at `~/Library/Application Support/Open Fantasia/fantasia.db`, Portraits beside it as files.

| Table | Holds |
|---|---|
| `stories` | id, title, created_at |
| `entries` | `seq` (global order), id, story_id, parent_id, kind, payload (JSON), created_at; never updated |
| `paths` | id, story_id, name, head_entry_id, created_at; the one table whose rows change, and only their head |
| `states` | entry_id, the State worked out at that entry (JSON); a cache, safe to delete |
| `calls` | every model call: trace id, story, agent, model, the exact request, the answer, timings, error |
| `traces` | every request from the phone: trace id, what was asked, outcome |
| `devices` | paired phones: id, name, hash of their token |

A Path's entries come from a recursive query from its head to the root (ADR-0003). The State at an entry is the
nearest saved state among its ancestors, with the entries after it applied by the **reducer**: a pure function
`apply(state, entry) → state` with one case per entry kind. States are saved at every `scene_opened` and every
50 entries, so a replay never walks far. Because states are a cache, the reducer can change and the cache be
dropped and rebuilt.

Entry kinds in this change: `story_set_up` (the Story File's content), `scene_opened` (its title card and opening
prose), `move` (the player's text), `reply` (the text and the call that wrote it). A failed Reply is not an entry:
it is a failed call in `calls`, and the Path's head stays on the Move, which is why nothing the player wrote is
lost and Retry needs no clean-up.

### The engine: one turn at a time per Path

The engine is the only code that writes entries. A turn is: check the Path is idle and its head is what the phone
saw; write the `move` entry; ask the Actor; stream its words out as they come; write the `reply` entry and move the
Path's head. A Path holds an in-memory turn lock, and a Move that arrives during a turn is refused with a reason
(the mac-link spec). Every step runs under the request's trace id. Later changes add agents to the turn as steps
of a dependency graph (ADR-0004); this change has one step.

### The Actor and the Claude pool

The Actor's call has two parts. The **system prompt** changes only when the Story's setup does: who the Actor is
writing for, what it must never do (decide anything for the **Player Character**; let anyone hear a thought), the
**Style**, the **World**, the **Premise**, and who the people in the Scene are. The **message** carries the Scene so
far, word for word, and the latest Move. Keeping the system prompt byte-identical across a Scene is what lets
Claude's prompt cache hit (ADR-0005).

Claude is called through `@anthropic-ai/claude-agent-sdk`, with `startup()` handles kept warm: a pool keyed by
(model, system prompt), one ready handle per key, refilled as soon as one is used. Each handle runs one call with
`tools: []`, `maxTurns: 1`, `persistSession: false`, `settingSources: []`, `includePartialMessages: true` (for the
streamed words), a fixed empty working directory outside any git repository, and `CLAUDE_CODE_OAUTH_TOKEN` from the
Mac's keychain. Every call's exact request and answer go into `calls`. The pool is behind a `ModelCall` interface
with a fake that returns scripted text, so every scenario test runs without a model.

### The link: HTTPS with a pinned certificate, commands and a live stream

Fastify serves HTTPS with a self-signed certificate made on first run. The pairing QR code carries the Mac's id,
its addresses and port, a one-time pairing code (ten minutes), and the certificate's fingerprint, which the phone
pins: the phone trusts that certificate and no other, so a hotel network can neither read nor impersonate the Mac.
Pairing exchanges the code for a device token (256 random bits); the Mac stores only its hash, and every request
carries it.

- **Commands** are plain JSON over HTTPS: `POST /pair`, `GET /stories`, `GET /stories/{id}/scene`,
  `POST /stories/{id}/moves`, `POST /stories/{id}/retry`.
- **The live stream** is one server-sent event stream per open Story, `GET /stories/{id}/events`. Every event carries
  the `seq` of the newest entry it reflects. Entry events (`scene_opened`, `move`, `reply`) are replayed from the
  store after a reconnect, starting after the phone's `Last-Event-ID`; a Reply still being written is sent first
  as its text so far, then word by word. That is how a dropped connection loses nothing and repeats nothing.
  *Alternative:* WebSockets, which need their own reconnection and catch-up logic; SSE has both in the protocol and
  can be watched with `curl` while troubleshooting.
- **Discovery:** the Mac advertises `_openfantasia._tcp` over Bonjour with its id in the TXT record; the phone looks
  for that id with Android's `NsdManager`, and falls back to the last address that worked.
- **Versions:** both sides send the contract version in a header; a mismatch is answered with its own error, which
  the app shows as needing an update.

### The phone: a thin client of views

The phone never works out the State. The Mac answers with views shaped for screens (the home list; a Scene with its
title card and exchanges), and live events update those views. The phone is Kotlin, Compose and Material 3, OkHttp
with its SSE module, kotlinx.serialization, and Google's code scanner for the QR code (no camera permission screen).
Screens in this change: Pair, Home, Scene.

### The `fantasia` command

One command on the Mac for everything outside the phone: `fantasia serve` (run as a LaunchAgent, kept awake while
work is under way), `fantasia pair`, `fantasia import <folder>`, `fantasia trace <id>`, `fantasia stories`,
`fantasia show <story> [--entry <id>]`. It is also how Claude imports and, later, edits Stories (ADR-0002).

### Tests from scenarios

Each scenario this change builds gets one test, written first, named `<capability> › <requirement> › <scenario>`
and quoting the scenario's lines. The host's tests run on Vitest against the real store (a temporary database) and
the fake model call. The phone's view logic runs on JVM tests; its screens on Compose UI tests; one end-to-end test
drives the app on a device against `fantasia serve --fake-models`. A script lists every scenario in `openspec/specs`
and every test that names one, and fails when a test names a scenario that does not exist.

## Risks / Trade-offs

- [The Agent SDK's warm `startup()` handles may still prepend Claude Code's own identity to a custom system prompt]
  → Check a stored request from `calls` against the system prompt we sent, in the first real call.
- [A Claude subscription token can expire or be revoked] → The Actor's failure names the token as the likely cause,
  and `fantasia doctor` checks it.
- [Self-signed certificates and pinning add work on Android] → One custom trust manager, tested; the fingerprint is
  in the QR code, so there is no certificate to install.
- [Bonjour can be blocked on some networks] → Fall back to the last address that worked; `fantasia pair` can show the
  QR code again with new addresses.
- [Server-sent events through Android's doze] → The stream is only for the open Story; a phone that slept catches up
  from `Last-Event-ID` when it wakes.

## Migration Plan

None: nothing exists to migrate. The first Open Fantasia's host keeps running until the new one replaces it.
