---
status: accepted
---

# An engine proves its capability before it is offered

Each Continuity Engine runs a real schema-constrained job through its exact execution path before the
Mac Host advertises it. An engine that fails is not offered, and a checkpoint naming it is refused at
submission with the reason rather than queued for a run that cannot complete.

Installation probing asked only whether an executable answered `--version`. That establishes almost
nothing a Continuity Update depends on. Antigravity passed it, accepted a checkpoint, ran, and returned
`no output produced — a tool required the "read_file" permission that headless mode cannot prompt for,
so it was auto-denied` — minutes of waiting to discover something knowable in seconds. The same gap
would hide a signed-out account, a model the subscription cannot reach, or structured output that no
longer parses.

The preflight is deliberately the smallest job that still exercises everything: the real binary, the
real flags, the real sandbox, the real model, and a schema-constrained response the host parses. It is
per adapter, because what can fail is a property of the CLI rather than of the Continuity Draft
contract, and because keeping the difference local is what stops one adapter's quirk becoming everyone's
problem.

It has a real limit, and the limit matters. A preflight proves the path the host controls; it cannot
promise that a large job will not reach for a tool the sandbox denies. Antigravity passes preflight
today and still failed a full Continuity Update for exactly that reason. So the adapter also tells that
CLI plainly that it is running without tools and that every call will be denied, and translates the
resulting error into a message naming the cause. Preflight makes the knowable failures fast; it does not
turn an unknowable one into a guarantee.

## Considered Options

- Granting broad tool permissions would stop the denial, at the cost of giving a headless agent file
  and command access it has no reason to hold for a job delivered complete in its prompt.
- Probing lazily on the first real checkpoint would avoid slowing startup, but it moves the discovery
  back into the run a person is waiting on, which is the problem.
- Trusting the CLI's own health command would test that CLI's opinion of itself rather than the path
  Open Fantasia actually uses, which is where the failures have been.

## Consequences

Host startup costs one small model call per engine — measured at about seven seconds for Codex and
twenty-two for Antigravity — in exchange for the host's advertised state being true. `/v2/health`
reports which engines are available and why the others are not, so an unavailable engine is visible
rather than inferred from a failure. A CLI upgrade re-proves health on the next restart, which the
contract guard already triggers whenever a contract file changes.
