# Proposal

## Why

After 19 Scenes of The Malfoy Problem the characters had forgotten most of their history. The latest Reply was
written with 7 of 48 continuity items intact (docs/research/malfoy-memory-audit.md), and between the Landmarks the
Director, with no plan for the year, filled the time with strangers and threats that led nowhere. The Story had no
big picture to steer by and no memory to steer from. This change gives every Story a mind: an Outline it builds
toward, people with Lives of their own, a truth that keeps everything that happened, and a check on every Reply.
It builds the design decided with the player in docs/research/design.md, against docs/goal.md.

## What Changes

- **The Outline.** Every Story has a direction to its end, in **Acts**, woven from the World's direction and
  everyone's **Lives**: the current Act in detail, the next outlined, the rest sketched. The **Director** writes it
  with research in many steps when a Story starts, revises it after every Scene (a focused pass, or deep re-planning
  when the Scene turned the Story, an Act ends, or the player steers), and plans each **Stretch** as the next step of
  the current Act.
- **Nothing enters without a payoff.** A new person, threat or mystery enters only as a setup the Outline means to pay
  off. **BREAKING**: "Something new every Stretch" is removed.
- **Lives of their own.** People who matter live for their own sake, in tiers by relevance worked out from play: Close
  people and the World's Movers have full Lives; anyone can rise. Who a person is now is recorded; where they are
  heading is planned.
- **The truth keeps everything.** Six kinds of record: each person now (with what they know and believe), between any
  two people (with turning points and keepsakes in their own words), what is true now (agreements with every term,
  promises with deadlines, secrets with who knows each), **Rules**, names invented on the page, and what happened.
  Each points to the passage it came from; nothing is deleted, what ends is closed.
- **The Story So Far folds along Acts.** The current Act keeps every Scene; a finished Act becomes one checked account.
  Keepsakes never fold.
- **The Actor writes as a novelist** (docs/adr/0017): shown everything about the people present, with each person's
  knowledge and beliefs stated plainly. **BREAKING**: the Actor is no longer blinded.
- **The Editor reads every Reply first** (docs/adr/0019): written whole, checked, then shown. **BREAKING**: Replies
  no longer stream word by word.
- **Agents look things up** (docs/adr/0018): the Writer, Chronicler, Director and Weaver can search the Story, read
  past Scenes and research on the web.
- **Long Scenes are recorded as they go**, past a size limit.
- **The player steers the Outline** in Backstage, with notes that win over the Director's own reading of play.
- **Taste survives a Redo**: a Story's Taste belongs to the Story, not to a Path; the player's own Taste follows them
  into every Story.
- **New default models**: the Director on Fable 5.1, and the Editor as a new job.
- **The Malfoy Problem is rebuilt from its own text**, the skipped month rewritten, and the audit's 48 items checked.

## Capabilities

### New Capabilities
- `the-outline`: the Story's direction to its end in Acts, woven from Lives; how it is written, revised after each
  Scene, planned into Stretches, shown in Backstage and steered by the player.
- `the-truth`: what the Story keeps of what happened and what is true now: each person now, between any two people,
  what is true, Rules, names invented on the page, what happened; sources; nothing deleted; The Story So Far folded
  along Acts; rebuilding a Story's truth from its own text.

### Modified Capabilities
- `living-world`: Lives become people's own stories in tiers by relevance; characters act only on what they know,
  stated rather than hidden; where things stand is kept between any two people; Every agent knows the Story So Far
  changes to fold along Acts; off-screen time is lived out for the people who matter.
- `long-run`: the Director works from the Outline; Something new every Stretch is removed; the player steers with
  notes as well as the brief and reactions; Taste at two levels.
- `scenes`: a long Scene is recorded as it goes; the Editor checks every Reply against what is established.
- `presence`: Replies arrive checked and whole instead of streaming; the Scene's end shows when the Director is
  rethinking an Act.
- `outside-the-scene`: Backstage shows the Outline, the Lives and the player's steering notes; the Models screen has
  the Editor and new defaults.
- `story-file`: a Story File may set the World's starting Rules.

## Impact

- host: the State and its records, the agents (all seven, the Editor new), agents running in many steps with tools,
  the Scene's end, the prompts, the Story's rebuild, Taste storage outside the Path.
- protocol: a new contract version for checked Replies, the Outline and steering notes, the player's Taste, the Editor
  job.
- android: the Scene (Writing… then Checking…), the Scene's end (rethinking), Backstage (the Outline, Lives, steering
  notes), Models (the Editor), Taste. Drawings first.
- The Malfoy Problem's store: rebuilt from its own text; its current records replaced.
