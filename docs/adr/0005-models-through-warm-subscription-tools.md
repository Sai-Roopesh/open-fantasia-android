# Models are reached through warm subscription tools, from a TypeScript host

The host is written in TypeScript and reaches every model through the player's own subscriptions, keeping a
process warm rather than starting one per call:

- **Claude** through the Claude Agent SDK, with a small pool of pre-started processes per kind of call, signed in
  with the one-year `claude setup-token` token. Anthropic documents this use of a subscription as personal use.
- **Codex** through one long-running `codex app-server` process over JSON-RPC, many conversations in one process.
  It is the only Codex path that streams text.
- **Google** through the Antigravity CLI. Its terms forbid using the service "in connection with products not
  provided by us", and Google has suspended accounts for it; the player accepted that risk on 4 October 2026.

The phone app is Kotlin. The contract between them is defined once as a schema, and the Kotlin types are generated
from it.

The first host started a fresh CLI process for every call, paying start-up time on each one. The Agent SDK's warm
processes exist only for TypeScript and Python, so a Kotlin host shared with the phone (considered for one language
and a shared reducer) would have gone back to a process per call. Rust was considered for speed and rejected: model
calls take seconds and the host's own work takes milliseconds.

## Consequences

- Every agent call draws on the same Claude and ChatGPT limits as the player's own use; the Models screen is how
  the player spreads the load.
- The SDK and the CLIs change weekly or daily, and a new model can need a newer SDK. Versions are pinned and
  upgraded on purpose.
- The Antigravity path can break or be cut off without notice.
