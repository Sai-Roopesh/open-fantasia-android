# Proposal

## Why

Nothing runs yet. The first change is a thin slice through every layer: a Story File made with Claude is imported
on the Mac, the phone pairs with the Mac, and the player plays the opening Scene, with Replies streaming in. It
proves the foundations every later change builds on: the tree of entries and Paths (docs/adr/0003), the engine and
the warm Claude pool (docs/adr/0004, docs/adr/0005), and the phone-to-Mac contract. Building them once, under one
working Scene, is cheaper than discovering their mistakes five capabilities later.

## What Changes

- A monorepo with three parts: `host/` (TypeScript, the Mac server), `android/` (Kotlin, Jetpack Compose) and
  `protocol/` (the contract, defined once, with Kotlin types generated from it).
- On the Mac: the Story store as a tree of entries with Paths; the reducer that works out the State on a Path;
  importing a Story File; the Actor, writing Replies on a pool of warm Claude processes; the HTTP and live-event
  link to the phone; a `fantasia` command for importing, pairing and inspecting.
- On the phone: pairing by QR code, finding the Mac on the network, the home screen, and the Scene screen with the
  title card, Moves, Replies streaming in, Copy on the latest Reply, and a visible failure with Retry.
- The Writer, Focus, Linger, the Day View, the Chronicler, the Weaver, the Director, Paths beyond the first, editing
  and the other screens are later changes. This change plays a single opening Scene.

## Capabilities

### New Capabilities
- `story-file`: the contract between Claude and the app for setting a Story up: what a Story File holds, how it is
  checked, and how it is taken in whole or refused whole.
- `mac-link`: how the phone and the Mac find each other, pair once, exchange commands, and keep the phone's view of
  a Story in step with live events, without losing any across a dropped connection.

### Modified Capabilities

None. This change builds part of `stories`, `scenes` and `presence` as they are specified; their requirements do
not change. The parts it builds are listed in tasks.md.

## Impact

- New: `host/`, `android/`, `protocol/`, and a `fantasia` command on the Mac.
- The Mac needs Node 22 and a Claude subscription token from `claude setup-token`.
- Nothing from the first Open Fantasia is reused or touched.
