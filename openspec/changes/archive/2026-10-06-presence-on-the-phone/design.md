# Design

## Context

See proposal.md for why. `MacConnection.read` tries the address that worked last, then the ones Bonjour (`NsdMacDiscovery`)
finds, and marks the Mac unreachable when none answers; `PairedMac` keeps only `lastAddress`. The pairing invite
carries every IPv4 address of the Mac, a Tailscale one included when Tailscale is up. The phone follows a Story
through one server-sent event stream that retries every half second while the app is open, and stops when it is
not (`FantasiaModel.pause`). Nothing is kept on the phone but the pairing and the dismissed Previously cards.

## Goals / Non-Goals

**Goals:**
- Reach the Mac at any address it has ever given, without the player doing anything.
- Read everything already seen with the Mac asleep, and lose no Move written meanwhile.
- One notification when a Reply or a Day View is ready with the app away, a silent one while it waits, nothing else.

**Non-Goals:**
- Playing without the Mac (the spec rules it out); push through a third party (the player chose not to).
- The World screen's part of "The Mac is asleep": the World screen is a later change, and reads the same kept copy
  when it comes.

## Decisions

**1. Every address (android).** `PairedMac` gains `knownAddresses`: the invite's addresses at pairing, then every
address a request succeeds on, newest first, at most eight; an address discovery reports but that never answers is
not kept. `read` tries the last that worked,
then discovery, then the rest known. A stored pairing from before is read with its `lastAddress` as the only one.

**2. A kept copy of what was read (android).** `ReadCache` keeps the JSON of every successful read (the Stories, each
Story's Scene view, each earlier Scene, the Journal) in the app's private files, keyed by what was asked. When no
address answers, `read` answers from it, marked as kept; the model shows the Mac unreachable as it does now. Backstage
is not kept: it is read only when visited, and only from the Mac.

**3. The waiting Move (android).** With the Mac unreachable, Send keeps the Move as waiting ("Sends when the Mac is
back"), and the stream's reconnection sends it, once, after the view is read again: if the Story moved on meanwhile,
the Move goes back to the composer with the reason, never sent twice.

**4. The watch (android).** When the app goes to the background with a Reply under way, a Move waiting for its Reply,
or the World moving on after End scene, `ReplyWatch`, a short foreground service, follows that Story's stream with a
silent ongoing notification ("The Night Train to Kalka: the Reply is being written") on a low channel. On the Reply,
or on the Day View being ready, it posts one notification on a default channel ("The Reply is ready", "The Day View
is ready") that opens the Story, and stops. It stops silently when the app comes back, after three minutes, or on a
failure, which the app shows when opened. Android 13 and later ask for the notification permission the first time a
Move is sent; without it nothing is shown and the Mac's work is unaffected.

**5. The Mac (host).** Ending a Scene, then closing its stream at once, leaves the Weaver and the Chronicler running;
a test proves the Day View is ready on the next read.

## Risks / Trade-offs

- [The kept copy grows] → One entry per thing read, replaced on each read; earlier Scenes are small; a Story's
  entries are removed when it is no longer listed by the Mac.
- [The watch outlives a long Reply] → After three minutes it stops quietly; the Reply is waiting in the app.
- [A waiting Move meets a Story that moved on] → It is never sent blind: the head is read first, and a stale Move
  returns to the composer.
