# Design

## Context

See proposal.md for why. The Story is a tree of entries that are never changed; a Path is a row pointing at its head
entry, and one Path per Story is current (docs/adr/0003). The State, the Day View, the World and every background
record are read from the head along its Path (docs/adr/0007), so they already belong to the Path. What is missing is
everything that creates, moves between and removes Paths, and any way for the phone to show them. Today only the
importer makes a Path ("Main"), and `paths` has `name`, `head_entry_id`, `is_current` and timestamps. The phone follows
one Story's live stream from the last event it saw; it has no idea which Path that was.

## Goals / Non-Goals

**Goals:**
- Every Path change is one small transaction on the Mac, refused while a Reply is being written, and announced to
  every phone following the Story.
- The Mac lays out the Paths screen's tree; the phone draws rows (docs/adr/0001).
- The phone builds `LongPress.dc.html` (without Edit) and `Paths.dc.html` as drawn.

**Non-Goals:**
- Editing a Reply or a Move, and the Path it starts (Editing).
- The World screen's part of "Two clocks"; this change proves the clock and the Day View, which exist.
- Moving or copying entries: a Path change only moves or makes pointers.

## Decisions

**1. Path changes are pointer changes (host).** Try another way makes a new current Path whose head is the chosen
Reply's entry. Rewind makes a new Path at the current head (what came after) and moves the current Path's head back to
the chosen entry, so the Path the player is on keeps its name. Returning to a Path makes it current. Starting again
makes a new current Path at the Story's first entry. Deleting removes the row; the entries stay, as entries always do,
reachable from any other Path that shares them. Each is one SQLite transaction, so two Paths are never current at once.
Rewinding at the opening prose or the latest Reply is allowed for the first and refused for the second (nothing comes
after it).

**2. What a Path card needs is stored on the Path (host).** New columns: `origin` (main, tried, set_aside, beginning),
`forked_at` (the entry it branched from, null for Main and the beginning), `opened` (it has been current at least once;
false only for a Path that Rewind set aside until the player opens it) and `named` (the player renamed it). An existing
store gains them in place, guarded by `PRAGMA table_info`, with Main's defaults. Clear removes Paths with origin
set_aside that were never opened. The played time is the existing `updated_at`, which every move of the head sets.

**3. The Mac lays out the tree (host, protocol).** `GET /stories/:id/paths` answers rows in reading order, each with a
depth: `scenes` (a run of Scenes every Path in the group shares, folded: "Scenes 1 – 12 · Friday 6:10 pm"), `fork` (the
Scene where the group's Paths part: "Scene 13 · Friday 8:05 pm · The troll"), and `path` (a card). The rows come from
the longest shared run of entries among a group of Paths, splitting the group by the entry that follows it, and
recursing with one more depth; a group of one is a card. A card has a label ("MAIN · YOU ARE HERE", "FROM SCENE 13 ·
TRIED ANOTHER WAY", "SET ASIDE AT SCENE 14", "FROM THE BEGINNING"), a title (the player's name for it, or its newest
Scene: "Scene 14 · After curfew"), a detail ("3 Scenes · Saturday 1:15 am") and `played_at`, which the phone says as
"played 2 days ago" the way it says the Previously card's time. Rename is offered for every card; Delete for every card
but the current one.

**4. Commands (host, protocol).** `POST /stories/:id/paths` with `{ from, after }` tries another way from entry
`from`; with `{ from: null, after }`, starts again from the beginning. `POST /stories/:id/rewind` with `{ to, after }`.
`POST /stories/:id/paths/:path/open`, `POST /stories/:id/paths/:path/rename` with `{ name }`,
`DELETE /stories/:id/paths/:path`, and `POST /stories/:id/paths/clear`. Each answers with the head the Story now
stands on and a trace, and refuses a stale `after`, a Reply being written (`busy`, as End scene does), an entry that is
not a Reply on the Path, and deleting the current Path.

**5. A `path_changed` event, and the stream knows its Path (host, protocol, android).** Every command that changes
the current Path emits `path_changed` with the newest entry's seq; the phone reads the Scene again, as it does after
`scene_opened`. A phone opens the stream with the Path it is showing (`?path=`); when that is no longer the current
Path, the first event it gets is `path_changed`, so a phone that was away when the Path changed does not apply another
Path's events.

**6. The long-press menu and the Paths screen (android).** A Reply passage, the opening prose included, gets
`combinedClickable` with a long press opening a sheet as drawn: the Reply's first lines, then Copy, Rewind to here
(not on the latest Reply), Try another way from here, and the line under them. The same menu works in an earlier
Scene being read. The Scene's header gains a "Paths" word button that opens `PathsScreen`, a model screen state beside
the past Scene, drawing the Mac's rows: indented by depth, folded runs, fork cards, Path cards with Rename and Delete,
then Start again from the beginning and, when there is anything to clear, Clear Paths you never went back to. Rename
and Delete's confirmation are small sheets in the drawing's sheet style. While a Reply is being written the menu's
Path actions and the Paths screen's are disabled, as End scene is.

**7. Contract version 9.** New: `PathsView`, `PathRow`, `PathCard`, `TryAnotherWayRequest`, `RewindRequest`,
`RenamePathRequest`, the `path_changed` event kind, and the stream's `path` parameter. Both sides are generated, and
the phone and the Mac are installed together.

## Risks / Trade-offs

- [A background Chronicler or Weaver call finishes for a head the player has left] → Records hang off entries, not
  the current Path (docs/adr/0007), so they land on the Path they belong to and show when the player returns.
- [Deleting a Path the player wanted] → Delete asks once and names the Path; the current Path cannot be deleted.
- [A long Story makes the tree slow to lay out] → It is one pass per group over entries already cached by the
  States; measured in the host tests with a 60-Scene Story.
- [The phone still holds a Day View or an opening card from the old Path] → `path_changed` always reloads the whole
  Scene view, which carries both.

## Migration Plan

The store gains four columns in place with Main's defaults; nothing else is rewritten. Regenerate the contract, build
and install the phone with the Mac restarted on the same commit. Rolling back is reinstalling the version 8 pair; the
extra columns are ignored by it.
