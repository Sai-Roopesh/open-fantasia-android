# Proposal

## Why

Four of the `presence` scenarios are untested and three are unbuilt. The phone never buzzes: a player who sends a
Move and locks the phone has to keep checking. It keeps nothing to read without the Mac, so a sleeping Mac means an
empty app. And it remembers only the one address of the Mac that last worked, plus what local discovery finds, so on
a network that keeps devices apart (a hotel's Wi-Fi) it cannot reach the Mac even though the Mac gave it its Tailscale
address when they paired. On 6 October nothing reached the Mac from the phone for hours.

## What Changes

- The phone remembers every address the Mac has given it (at pairing, and each one discovery finds or that works)
  and tries them all, the last that worked first, so a private network such as Tailscale is always a way through.
- What the phone has read it keeps: the Stories, each Scene view, earlier Scenes opened, the Journal. Without the Mac
  it shows what it kept, says the Mac is unreachable, and a Move written then waits and is sent when the Mac is back.
- While a Reply or a Day View is being written and the app is not open, a silent notification says so; when it is
  ready, one notification with sound replaces it. Nothing else ever notifies. Decided by the player: a quiet "being
  written" note, then a buzz, rather than checking back every fifteen minutes or a push through Google.
- The Mac carrying on with the phone locked is proved by a test; it already does.
- No contract change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `presence`: The phone buzzes for two things only (the quiet note while it waits); The phone finds the Mac on any
  shared network (every address it was given, a scenario for a network that keeps devices apart); What has been
  seen can be read without the Mac (a Move written then is sent once the Mac is back).

## Impact

- Android: `PairingStore.kt` and `MacConnection.kt` (every address), a kept copy of what was read
  (`ReadCache.kt`), `FantasiaModel.kt` (the waiting Move), a short foreground service with two notification
  channels (`ReplyWatch.kt`), `AndroidManifest.xml` (the notification permission and the service).
- Host: one engine test for a Scene ended and its stream closed at once.
- Tests: JVM tests for addresses, the kept copy and the watch; shared checks on the JVM and the device.
