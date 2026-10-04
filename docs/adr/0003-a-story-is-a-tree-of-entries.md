# A Story is a tree of entries; a Path is a pointer

Every change to a Story is an entry that is never altered once written, with a parent: a Move, a Reply, a Scene
opening or closing, a Beat Note, a Chronicle, a Weaver turn, a Director plan, an edit. A **Path** is a named pointer
to an entry. Everything the player sees on a Path (the clock, the World, who knows what, the Scene, the Arcs) is
worked out by replaying the entries from the root to that pointer, with the worked-out state saved at each Scene's
end so a replay never starts from the beginning. The store is SQLite: entries keep a pointer to their parent, and
a recursive query walks a Path. No graph database.

The first app kept versions of each kind of record in its own table and chose between them with "which branch can
see this" rules, written separately for plans, pins, snapshots and timeline beats; branching and Rewind were fragile
because each copy of that rule drifted. Here Rewind moves a pointer, Try another way adds a pointer, edits are new
entries, and the clock follows the Path because it is worked out from it.

## Consequences

- Prompts can be built from the Path itself. What comes before the current moment never changes, so the start of
  every prompt stays byte-identical and the providers' prompt caches hit; Paths that share early history share
  those caches.
- Summaries of Scenes, days and chapters are entries too, so a new Path inherits its ancestors' summaries without
  recomputing them.
- Changing what an entry means later needs a replay rule for old entries, or a rebuild from the Story File; the
  saved states can always be thrown away and worked out again.
