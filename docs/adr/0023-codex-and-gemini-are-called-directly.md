# 0023: Codex and Gemini are called directly, and every call keeps the bytes it sent

Date: 17 November 2026. Status: implemented. Amends 0005.

## Problem and evidence

Codex felt like a different writer from Claude, and nobody could say why, because the host kept what it meant to
send and never what was sent. A recording proxy between `codex app-server` and the ChatGPT backend, on the host's own
combined-writing request for The Night Train to Kalka, showed it:

- `instructions` was empty. The host's system prompt arrived as one developer message among several.
- Codex added 13,112 characters to the host's 10,111: a catalogue of 21 skills (spreadsheets, PDFs, image generation,
  a task tracker), a prompt making the model the root of an agent team, the Mac user's global AGENTS.md, the date, and
  a JavaScript `exec` tool. `features.skip_host_skill_discovery` did not keep the skills out.
- `text.verbosity` was `low`. The Reply was 108 words.

Antigravity's `agy` has no system-prompt option, so the system prompt led the user's message, and it offered no Story
lookups at all. Each provider was reached through a tool built for coding, and each tool decided part of the request.

## Decision

Codex and Gemini are called on the endpoints their own tools call, with the sign-in those tools already keep:

- Codex: `https://chatgpt.com/backend-api/codex/responses` with the ChatGPT token in `~/.codex/auth.json`.
  `instructions` is the host's system prompt; `store: false`; Story lookups are function calls answered by the host;
  web search is the backend's own `web_search` tool; `text.verbosity` is `high` for prose the player reads.
- Gemini: the Antigravity gateway, `https://daily-cloudcode-pa.googleapis.com/v1internal:streamGenerateContent`, with
  the Google token Antigravity keeps in the keychain. The system prompt is `systemInstruction`; Story lookups are
  function calls (the gateway cannot combine them with Google Search in one request, so these calls do not search the
  web); a JSON answer uses `responseSchema`, converted from the host's JSON Schema.

Both bodies are built by pure functions from one `Conversation` (`src/models/wire.ts`). A test sends the same request
through both and fails if any string in either body is not the host's own (prompts, tools, schema) or one of a short
list of named protocol constants. Whatever a provider's tool might add can no longer reach a model unseen.

Every call made by a direct runner keeps the exact bodies it sent in `calls.wire`. "Why does this model write like
that" is answered by reading what it read.

When a token has expired or is refused, the call goes to the provider's tool instead (`codex app-server`, `agy`),
which renews the sign-in as it works; any other failure is reported as it is. Listing models still goes through the
tools. Claude is unchanged: it was not signed in to Claude Code on the Mac this was built on, and is the next to
capture and compare.

## Verified

On 17 November 2026, from this Mac, on the real accounts: the combined-writing request through `Models.call` returned
valid JSON from both providers with the system prompt in its system slot; a full turn through the Engine wrote 574
words on GPT 5.6 Sol and 455 on Gemini 3.8 Flash at the Full length, each in one call, with its bytes kept.

## Consequences

- These endpoints are not public APIs. They change without notice, and Google's terms already forbid this use of
  Antigravity (0005). When one breaks, the fallback keeps the Story playable on the old path while it is mended.
- The Antigravity token lasts an hour and is renewed by Antigravity or `agy`, not by the host. A Mac that only runs
  the host falls back to `agy` when the token has lapsed.
- `NODE_EXTRA_CA_CERTS` is needed where a proxy re-signs TLS, as it is for every other Node call the host makes.
