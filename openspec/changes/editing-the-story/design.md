# Design

## Context

See proposal.md for why. editing-people set the pattern this change follows:
- **Edits are Path entries.** Each moves the head between Replies against the head the phone saw, and tells phones
  `path_changed` (`views/scene.ts`).
- **Agents read the State on every call.** A change in the State reaches the next call with nothing else to do.
- **Two ways in.** The engine's `set*` functions are called by the link and by the Mac's commands alike.

What the State holds and who reads it:
- The Premise, Style, reply length, Arcs and Landmarks are fixed at import (`story_set_up`). The Writer, Weaver,
  Director and Actor read them.
- The clock moves only through play: each Beat Note's `clock`, which the Writer may not set earlier than now, and
  `scene_closed`, which moves it to when the Player Character is next free.
- **The World over time.** The Weaver moves the World over spans that run from where it last stood
  (`worldOn(...).until`) to the end of a Scene or a choice at the Day View. Every Landmark whose time falls in a span
  happens in it (`landmarksIn`). The Day View's countdowns and the World screen's Calendar show the Landmarks from
  the clock on.
- **Taste** has deletion only, through `taste_set` with the remaining lines. The Mac has no command for it.

No screen for any of this is drawn. Who the player plays, the Story's title and the Threads stay as they are (see
Non-Goals).

## Goals / Non-Goals

**Goals:**
- Every part of the Story named in the requirement, besides people, editable from the phone and the Mac's commands.
  Each lands from that moment onward on the current Path.
- Nothing an edit allows contradicts what already happened on the Path: no clock going back, and no Landmark that
  has happened happening again.
- The Story screen drawn first and approved by the player, then built as drawn.

**Non-Goals:**
- **Who the player plays** (the player's choice of 7 October 2026). The Player Character's person page already
  edits who they are.
- **The Story's title.** It belongs to the Story, not to a Path, and no scenario asks for it.
- **Threads and Lives.** They are the World's own, moved by the Weaver. Backstage shows them; the player does not
  set them.
- **Removing a place or an institution.** Scenes and the World refer to places by name. A place can be rewritten
  but not removed, as people are.
- **Renaming a Landmark or a place.** Happenings refer to a Landmark by name. A new name is a new Landmark; the old
  one can be dropped.

## Decisions

**1. Entries on the Path (host, `story/entries.ts`, `story/reducer.ts`).** Each moves the head between Replies and
tells phones `path_changed`:

| Entry | Payload | Reducer |
|---|---|---|
| `premise_set` | `{premise}` | replaces it |
| `style_set` | `{style}` | replaces it |
| `reply_length_set` | `{length: "short" \| "medium" \| "full"}` | replaces it |
| `arcs_set` | `{arcs: string[]}` | replaces them whole, as `taste_set` does Taste |
| `landmark_set` | `{landmark: {name, at, what}}` | replaces the one by that name, or adds it |
| `landmark_dropped` | `{name}` | takes it out |
| `place_set` | `{place: {name, description}, institution: boolean}` | replaces the one by that name in places or institutions, or adds it |
| `world_set` | `{summary, history}` | replaces both |
| `clock_set` | `{clock, dayOneWeekday}` | replaces both |

Rewording a Taste line writes `taste_set` with the line replaced in place.

- **Arcs are set whole.** An Arc has no name of its own: its words are what it is. A whole list says "add",
  "rewrite" and "drop" with one entry, and the phone already shows the list.
- **Landmarks and places are set one at a time.** They have names other things refer to.
- **Considered:** one `story_set` carrying any of the fields. Rejected, because the entries read back in
  `fantasia show` and the traces as what the player did.

**2. Checks before an entry is written (host, new `engine/story.ts`).** Each refusal is in words the phone shows:
- **Blank or wrong fields:**
  - a blank Premise or Style: "Say what the Story is for." / "Say how it is written.";
  - a blank Arc, or the same Arc twice: "An Arc needs words." / "That Arc is already there.";
  - a reply length other than short, medium or full: "Say Short, Medium or Full.".
- **Places:**
  - a blank name or description;
  - a place whose name is already an institution's, or the reverse: "X is already a place.".
- **Where the World stands** is the later of the clock and `worldOn(...).until`. Before that time, things on the
  Path have happened or are about to.
- **Landmarks:**
  - a blank name or what;
  - `at` not a Story time;
  - setting or dropping one whose time is not after where the World stands: "X has already happened on this Path.";
  - an `at` that is not after where the World stands: "That time has passed on this Path.";
  - dropping one the Story does not have: "The Story has no Landmark called X.".
- **The clock:**
  - not a Story time;
  - not later than the clock now: "The clock only moves on.";
  - a weekday that is not a weekday.
- **Taste:**
  - rewording a line that is not there: "Taste has no such line.";
  - rewording it to blank: "Say the lesson, or delete it.".

**3. The clock moved on (host).** `clock_set` changes `clock` and nothing else. What follows comes from what already
reads the clock:
- At the Day View, its time, countdowns and choices are read from the clock, so Happenings before the new time drop
  away.
- The next choice's Gap (`gapAsk`) runs from where the World stood to the time chosen, so the Weaver moves the World
  over the time skipped. A Landmark in it happens.
- Mid-Scene, the Writer reads the new clock, and may not set the next Reply before it. The Scene's end span covers
  the time skipped.
- **Considered:** weaving at once when the clock moves. Rejected: it would add a second way into the Weaver, and the
  span is woven anyway by the next end or choice, as a Gap is.

**4. The Story view and the link (protocol, host).** Contract 16:
- `GET /stories/{id}/story` returns `StoryView`:
  - `title`, `premise`, `style`, `reply_length`, `arcs`;
  - `landmarks`: each with `name`, `at`, `at_label`, `what`, and `passed` (true when it is not after where the World
    stands, so the phone shows it without Edit);
  - `world {summary, history}`, `places`, `institutions`;
  - `clock {at, at_label, day_one_weekday}`, and `world_stands` (the earliest time a Landmark may be set to);
  - `head_entry_id`, `trace_id`.
- **The edits.** Each takes `after`, the head the phone saw, and answers with `StoryView` as it now stands:
  - `PUT /stories/{id}/premise` `{after, premise}`;
  - `PUT …/style` `{after, style}`;
  - `PUT …/reply-length` `{after, length}`;
  - `PUT …/arcs` `{after, arcs}`;
  - `PUT /stories/{id}/landmarks/{name}` `{after, at, what, create}`;
  - `POST …/landmarks/{name}/drop` `{after}`;
  - `PUT /stories/{id}/places/{name}` `{after, description, institution, create}`;
  - `PUT …/world` `{after, summary, history}`;
  - `PUT …/clock` `{after, at, day_one_weekday}`;
  - `POST …/taste/reword` `{after, line, text}`, beside the existing `taste/remove`.
- `StoryView` is not kept for reading without the Mac: editing needs the Mac.

**5. The Mac's commands (host, `cli/commands.ts`, `cli/main.ts`).** Each writes on the current Path through the
engine, says what changed in a sentence, and refuses with the engine's reason. Phones learn of it through
`watchStore`.
- `fantasia premise <story> <words…>`
- `fantasia style <story> [<words…>] [--add <line>]`: replace the Style, or add a line to it
- `fantasia length <story> short|medium|full`
- `fantasia arc <story>`: list them numbered; then `add <words…>`, `rewrite <n> <words…>`, or `drop <n>`
- `fantasia landmark <story> <name> [--at "Day N HH:MM"] [--what <words>] [--drop]`
- `fantasia place <story> <name> <description…> [--institution]`
- `fantasia world <story> [--summary <words>] [--history <words>]`
- `fantasia clock <story> "Day N HH:MM" [--weekday <day>]`
- `fantasia taste <story>`: list the lines numbered; then `reword <n> <words…>` or `drop <n>`. This also gives
  deleting a lesson the Mac command it lacked, as the parity requirement asks.

**6. The phone (android), built to `docs/design/Story.dc.html` and `StoryEdit.dc.html`.** Both are drawn in this
change for the player's approval, before any phone code.
- **Entry.** Tapping the Story's title in the Scene's header opens The Story. The header has no room for a fifth
  word, and the title names what opens. The title gains a small chevron so it reads as a button. In the compact
  header, it shows the Scene's title.
- **The Story** scrolls through sections, each with its eyebrow label:
  - **PREMISE** and **STYLE**, in Literata as the player wrote them, each with Edit. Below the Style, the reply
    length as three chips (Short, Medium, Full), sent when tapped.
  - **ARCS**: each Arc a row that opens its editor, then "Add an Arc".
  - **LANDMARKS**: name, when (for example "Wednesday 10:00 am · Day 40"), and what. A Landmark that has passed is
    shown dimmed, with "Happened", and does not open. Then "Add a Landmark".
  - **THE WORLD**: the summary and history, with Edit.
  - **PLACES** and **INSTITUTIONS**: name and description rows that open their editor, then "Add a place".
  - **THE TIME**: "Saturday 8:10 am · Day 3", with "Move the clock on".
- **The editor** is one bottom sheet (`StoryEdit.dc.html`), shaped by what it edits:
  - text fields with their labels;
  - for a Landmark, a Day field showing its weekday beside it, and a Time field;
  - Save, or "Add to the Story" when creating, and Drop for a Landmark or an Arc.

  A refusal shows in the sheet with what was written kept, as in the person editor.
- **Backstage**: tapping a Taste line opens the same sheet, holding the line.
- **When edits are off.** Every edit is off while a Reply is written or the Mac is unreachable, as Paths are
  (`canChangePath`).

**7. No new ADR.** The decisions that matter here are already recorded:
- edits as Path entries (docs/adr/0003);
- the Mac owning the Story (docs/adr/0001);
- editing everything (docs/adr/0002).

The forward-only clock follows from the World's record of time, not from a new trade-off.

## Risks / Trade-offs

- **[A Director's plan names an Arc that has since been rewritten or dropped.]** The plan reaches the Writer until
  the next plan, as the long-run requirement says plans change only at a stretch's end or a peak. The Writer reads
  the Arcs as they now stand beside the plan, and the plan's own words for that Arc. The next plan uses the new
  Arcs.
- **[Moving the clock far past several Landmarks.]** Each happens in the next span, as over any long Gap. The Gap
  screen asks what the Player Character did in it as it does now.
- **[A long Style.]** Every call reads the whole Style, as now. The editor does not shorten it.
- **[A Landmark set to a time the World passes in the very next span.]** It happens then, as any Landmark in a span
  does.
