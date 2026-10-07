# Design

## Context

See proposal.md for why. Every model call goes through `Models.call` (host `models/model-call.ts`), which records it
and hands it to a `ModelRunner` per provider; `fantasia serve` builds only `ClaudeRunner` (Agent SDK 0.3.289, a warm
process per call, `effort` passed through). `ModelChoice` already allows `claude | codex | antigravity` and an
optional effort. The Writer, the Chronicler and the Weaver read their model from `models.json` in the Mac's folder on
every call (`jobModels`); the Actor comes from the Story File (`state.actor`, default Opus 5.5) and cannot be changed
after import. A failed turn is kept in memory (`failures`: the head, the reason, the trace) and shown as
`TurnState { kind: failed }`; a failed World likewise (`worldFailures`). Retry and Retry World take no model.

On this Mac today: `codex` 0.160.0, whose `app-server` speaks JSON-RPC over stdio and lists seven models through
`model/list` (GPT-6.1-Sol, GPT-6-Astra, GPT-6-Sol, GPT-6-Luna and three GPT-5.6, each with its efforts, from low to
ultra); `agy`, whose `agy models` lists fourteen ids, the effort folded into the id (`gemini-3.8-flash-high`), and
whose print mode takes `--model`, `--effort`, `--json-schema` and stream-json in and out. Claude's SDK lists its
models through `supportedModels()`, each with the efforts it supports.

## Goals / Non-Goals

**Goals:**
- Any job on any model the player's three subscriptions offer, chosen on the phone, reaching the next call.
- A way out of a failed Reply or World that does not change a setting.
- Redo on another model for one Reply.

**Non-Goals:**
- The Director's work: it is listed and keeps its model; the Director itself is a later change.
- Choosing models per Path or per Scene: the Actor is per Story, everything else per Mac.
- Balancing load automatically, or falling back to another model without the player choosing it.

## Decisions

**1. Settings belong to the Mac, not the Story (host; ADR 0008).** `models.json` gains the Director and an `actors`
map from Story id to a `ModelChoice`. A Story's Actor is that entry, or its Story File's `actor` when it has none. It
is not an entry on the tree, so it does not move with Paths or Rewind, and every Path of a Story is written by the same
Actor. What actually wrote a Reply is recorded with it, as today (`reply.model`). Writes go through a temp file and a
rename; reads stay per call, so the next call takes a change with nothing restarted.

**2. Codex (host).** `CodexRunner` keeps one `codex app-server` child per Mac, started on first use and again after it
exits. It sends `initialize`, then for each call `thread/start` with:
- `ephemeral: true`;
- `baseInstructions` set to the system prompt, replacing Codex's own;
- `sandbox: "read-only"` and `approvalPolicy: "never"`;
- an empty working folder of its own.

It then sends `turn/start` with the prompt, the model, the effort and `outputSchema` when the call has a schema. It
streams `item/agentMessage/delta` to the caller and returns the agent message when `turn/completed` arrives. A failed
turn, an `error` notification, the process exiting, or the signal aborting fails the call, in words naming Codex and
the model. Calls run side by side, one thread each. An approval request from the server is declined: the agents use
no tools.

**3. Antigravity (host).** `AntigravityRunner` starts `agy` ahead of each call, as Claude's are started:
- flags: `--print=` (an empty prompt: the message comes on stdin), `--input-format stream-json`,
  `--output-format stream-json`, `--model <id>`, `--disable-slash-commands` and `--sandbox`;
- an empty working folder of its own.

When the call comes it writes one message, `{"event":"user","message":{"role":"user","content":…}}`, and closes the
input. The content is the system prompt, then the prompt, then, for a call with a schema, the schema and "answer with
one JSON object and nothing else". It streams each `step_update` of an `agent_response` step's `text_delta`, and
answers with the final `result.response`. A `result` whose status is not `SUCCESS`, or a process that ends without
one, fails the call with `agy`'s own words. Each process answers one call, then the next is started for the same
model.

The id is the model and the effort together: the catalog shows `gemini-3.8-flash` with low, medium and high, and the
runner asks for `gemini-3.8-flash-high`.

Confirmed against `agy` on 6 October 2026:
- `--json-schema` is not used. With it, `agy` answers in prose, then fills the schema in a second step with a summary
  of its own work rather than the answer.
- `agy` has no system-prompt flag, and adds about 20,000 tokens of its own agent instructions to every call.

**4. What each provider offers (host).** `catalog.ts` asks each provider when `fantasia serve` starts and then every
hour:
- Claude through a warm query's `supportedModels()`, using `resolvedModel` over an alias;
- Codex through `model/list`, leaving out hidden models;
- Antigravity through `agy models`, grouped by the effort suffix.

Each model has an id, a name as the phone shows it ("Opus 5.5", "GPT 6.1 Sol", "Gemini 3.8 Flash"), its efforts and
its default effort. The last good list of each provider is kept in `catalog.json` in the Mac's folder. A provider that
cannot be asked shows that list, marked unreachable, with the reason. A provider never asked successfully shows none,
and says why (not signed in, not installed).

**5. The link (protocol, host).** Contract 12:
- `GET /models` returns `ModelsView`:
  - every Story with its Actor and whether it is the Story's own;
  - each job with what it does and its model;
  - each provider with whether it was reached, why not, and its models.
- `PUT /models/jobs/{job}` takes a `ModelChoice`.
- `PUT /stories/{id}/actor` takes a `ModelChoice`, or null to go back to the Story File's.
- `RedoRequest` and `RetryRequest` gain an optional `model`. `RetryWorldRequest` is new, with an optional `model`.
- A failed `TurnState` gains `job`: the Writer or the Actor. A World failure is always the Weaver's.

A choice the provider does not list, while its list is known, is refused with a reason. The names the phone shows
come from the catalog, so the phone never formats ids.

**6. One try on another model (host).** A turn carries the model for each of its jobs, taken when it starts: from the
settings, or from what the Redo or Retry named:
- Redo's model is the Actor's for that turn only, and is kept on the `redo` entry, so a restarted Mac writes that
  Reply on it too.
- Retry's model goes to the job that failed: the Writer's or the Actor's.
- Retry World's model goes to the Weaver: the World waits on nothing else, the Chronicler working on its own.

Nothing is written to `models.json`, so the next turn is back on the settings.

**7. The phone (android).** Four pieces, each built as drawn:
- `ModelsScreen.kt`, reached from Home's Models button (`Main.dc.html`), built to `Models.dc.html`:
  - "THE ACTOR · EACH STORY ITS OWN", one row per Story;
  - "EVERY STORY": Writer, Chronicler, Weaver and Director, each with its line and its model.
- Tapping a row opens its picker in place: a radio chip per model under each provider's label, then "EFFORT" chips
  for what the chosen model supports. A pick is sent at once and the row shows it when the Mac confirms. An
  unreachable provider's chips are shown disabled under its label, with the reason.
- `RedoSheet.kt` gains "Written by" (`Redo.dc.html`): a dropdown, first "<Actor> · this Story's Actor", then every
  other model "· just this Reply", each at its default effort.
- The failure card's "Another model" (`SceneFailed.dc.html`), and the World failure's, opens the same picker in a
  sheet. Choosing retries on it.

The model list comes from `GET /models`, read when the screen or a sheet opens.

**8. The command line (host).** `fantasia models` prints every job, every Story's Actor and what each provider
offers. `fantasia models <job> <provider> <model> [effort]` and `fantasia models actor "<Story>" <provider> <model>
[effort]` set them; any provider the catalog knows is accepted.

## Risks / Trade-offs

- [Codex or `agy` change their protocol] → The runners are built against codex-cli 0.160.0 and the `agy` installed on
  6 October 2026, and upgrades are made on purpose (ADR 0005); a change shows as a failed call in the provider's own
  words, with "Another model" beside it, and the runner's fake is updated with the runner.
- [Codex's agent runs a tool] → Read-only sandbox, approvals declined, an empty folder, and its own instructions
  replaced; a call that ends without an agent message fails rather than returning tool output.
- [`agy` has no system prompt, and brings 20,000 tokens of its own] → The system prompt leads the one message; each
  Antigravity call starts slower and draws more of its quota than Claude's or Codex's. That is the price of reaching
  it at all, and the Models screen is where the player decides it is worth it.
- [`agy` answers JSON in prose] → The answer is checked against the schema by the caller, as every provider's is, so
  a malformed one fails the call instead of reaching the Story.
- [Antigravity's terms] → Accepted by the player on 4 October 2026 (ADR 0005); nothing runs on it unless chosen.
- [A model is listed but the account cannot use it] → The call fails with the provider's words, and "Another model"
  is right there.
