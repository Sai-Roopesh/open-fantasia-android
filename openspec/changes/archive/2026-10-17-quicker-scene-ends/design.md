# Design

## Context

Measured on the player's Complex Cases (2026-10-16): a Scene's end ran Chronicler 4–7½ min (Opus 4.8, high, 15–24k
characters out), Director focused 4 min (whole Outline, 29k), Director deep 5½ min (whole Outline again, 40k), Stretch
1¾ min (17k), Weaver 2¼ min (13k), one after another: 19–21 minutes. Output length and serial steps are the time.

## Decisions

1. **A focused revision is a set of changes.** Its format: `turned` (a line, or null), and only what changed: `turns`
   (new or changed turns of the current Act, by id), `turns_done` (ids that happened), `relationships` (by pair),
   `movers` (by person), `intentions` (by person), `setups` (by id; the existing settle keeps every setup left out),
   `promoted` (added). When `turned` is said, nothing else is written: the deep re-plan follows. The code applies the
   changes to the Outline as it stands.
2. **A deep re-plan rewrites only the Acts it changes.** `acts` holds the current Act in detail and any Act after it
   that changes; Acts it leaves out stay as they were (Acts before the current one drop as now); `ending` is null when it
   stands; `intentions` are the current Act's, whole; `setups` as in a focused revision. The first Outline, with none to
   change, is written whole.
3. **The Director's step and the Weaver run side by side after the record, when no new Stretch is due.** The Weaver
   lives out a Stretch's off-screen moves and Scenes, so when one is due it waits for the plan, as before. Otherwise both
   start from the State at the record, the Weaver against the Outline as it stood; the Director's entries are written
   first and the World's after them, so the Path reads in order. If the Director plans a Stretch after all (a deep
   re-plan calls for one), the early weave is set aside and the Weaver is asked again after the plan. The Folder comes
   after both. A step that fails stops the Scene's end as now; Retry runs what is owed.
4. **The line says the earliest step still under way** (record, Outline, World, The Story So Far), so the phone's single
   line still reads in order.
5. **The Chronicler's default is Opus 5.5 at medium effort**; the player's models.json is moved to it.
6. **Under Linger the Writer never leaves the Scene:** `leaves_scene` is set right to false (kept in `dropped`), the long
   Scene's "close it" task is not given, and a Move that goes somewhere moves the place within the Scene.
7. **End scene asks first**: a dialog, "End this Scene?", with Keep playing and End scene; only End scene sends it.

## Risks

- A patch the Director gets wrong (an unknown turn id) is set right or dropped by the check, as setups already are.
- The Weaver plans against the previous Outline for one span; the next span follows the new one.
