# Design

## Context

See proposal.md for why. A person in the State has `whoTheyAre` (their backstory, secrets included), `knows` (what
*they* know), `appearance`, `after`, `voice`, `portrait` and `group`. Nothing records what the Player Character knows
of them. The Story File is embedded whole in the Story's first entry (`story_set_up`); a Story already imported keeps
the Story File it was imported with.

The Chronicler runs after every Scene and every twelve exchanges. It reads the Scene's Moves and Replies, with the
Story's people (and their backstories) in its system prompt so it can name them. It writes a background record:
Moments, who was told what, and a summary (docs/adr/0006, 0007).

The Weaver writes Meanwhile: one line for each thing the Player Character learned off-screen, `seen`, `told` or
`rumour`, linked to what happened (`happened`, whose `known_to` lists who knows). Meanwhile does not say who a line
is about.

The Day View already works out:
- countdowns to the Landmarks (`views/scene.ts countdown`);
- the Happenings ahead he knows of (`story/day.ts onAhead`);
- Portrait URLs.

The phone's Scene header has Journal, Paths and Backstage. The phone keeps a copy of the Stories, the Scenes and the
Journal for reading without the Mac. World.dc.html draws People: the Leads, then everyone else, a Group as one
entry, each with a Portrait and a short line. Person.dc.html draws the person page: the Portrait, the name and other
names, Lead and Group, then "WHAT YOU KNOW" with "From Scene 3 · The station", then "WHAT YOU'VE HEARD" with a tag
on each line. Places and Calendar are tabs in World.dc.html, with no content drawn.

## Goals / Non-Goals

**Goals:**
- A World screen that shows only what the Player Character knows, and stays current as he plays.
- A secret reaches it only through something he sees or is told in the Story.
- The World screen readable with the Mac asleep.

**Non-Goals:**
- Editing people, Leads, Groups or Portraits on the person page. That is the editing change, which adds Edit and
  Replace Portrait to the page this change builds.
- A separate "known" account of places. A place's description is public by the Story File's own rule.

## Decisions

**1. What he knows of someone (host, protocol).**
- **The start.** The Story File gains `known` on each person, optional: what the Player Character knows of them when
  the Story begins. The reducer keeps it as `Person.known`.
- **Setting it on a Story being played.** `known_set {person, text}` is an entry on the Path, written by
  `fantasia known`. Like `taste_set` it moves the head, and only between Replies, so a phone reads the Scene again.
- **After a Scene.** The Chronicler's record gains `known: [{who, now}]`, one row for each person in the Scene that it
  has something to say of (decision 2).
- **What he knows now** is the newest of these on the Path, by when it was written: a Chronicle row, a `known_set`,
  or the Story File's line. The Scene it came from is shown as "From Scene N · Title"; the Story File's line has none.

**2. The Chronicler keeps it (host).**
- The task gives each person in the Scene with what the Player Character knew of them before it. It asks for what he
  knows of them now: the earlier line, with what this Scene showed him added, at most three sentences.
- CHRONICLER.md says the line is written only from what he saw, heard or was told: in this Scene, or before it as the
  earlier line says. Never from the people list, which holds what nobody knows.
- The check refuses:
  - a row for someone not in the Scene;
  - two rows for one person;
  - a row for the Player Character.
- A person whose line this Scene did not change gets no row. Their line stays as it was.

**3. What he has heard (host).**
- Meanwhile items gain `about`: who the line is about, by their names in the Story. It is optional in the Weaver's
  answer, as `quiet` is, and the Weaver's task asks for it.
- The person page lists every Meanwhile line on the Path about them, newest first, each with its `how` (`seen`,
  `told`, `rumour`).
- A line woven before `about` existed counts as about everyone it names.

**4. Who is listed (host).** Anyone he knows something of: a `known` line from any source, or a Meanwhile line about
them. The Leads come first, in the Story's order; then everyone else, by name. Each Group is one entry, under its
name, with its description, which is public as a place's is; a member he knows on their own is listed as well.

**5. Places and the Calendar (host).**
- **Places** are the Story File's places and institutions, with their descriptions, each marked when a Scene on the
  Path has been there (by its place name).
- **The Calendar** has, ordered by time:
  - the Landmarks still ahead;
  - the Happenings ahead he knows of, from the Day View's `onAhead`.

  Each has its time said as people say it, and a countdown worked out as the Day View's are.

**6. The link (protocol, host).** Contract 14: `GET /stories/{id}/world` returns `WorldView`.
- **People**, each with:
  - name, other names, Portrait URL;
  - Lead, Group;
  - what he knows, and the Scene it came from (number and title, or none);
  - what he has heard: text and how.
- **Places**: name, description, been.
- **Calendar**: name, what, when, countdown, kind (Landmark or Happening).
- `trace_id`.

**7. The phone (android).**
- `WorldScreen.kt` to World.dc.html: People / Places / Calendar tabs. On People, "LEADS" then "EVERYONE ELSE", each
  row a Portrait (or its letters) with the name and the first two lines of what he knows; a Group is marked
  "· Group". Places and Calendar follow the same row style, since nothing is drawn for them.
- Tapping a person opens the person page to Person.dc.html, without Edit or Replace Portrait.
- The Scene header gains World, first, as the README orders it.
- `MacConnection` keeps the World as it keeps the Journal (presence: The Mac is asleep).

**8. Filling in the Night Train (examples, host).**
- Claude writes `known` for Ishaan's view of Meera and Uncle Bhalla in `examples/night-train/story.yaml`; the test
  Story Files get theirs.
- For the Night Train already being played on this Mac, Claude runs `fantasia known` once per person, with the
  player's OK, since it writes to their Story.

## Risks / Trade-offs

- [A secret in the Chronicler's line] → The Chronicler is sent the people's names only, never their backstories
  (`chroniclerPrompt`), so it can know only what the Scene shows. CHRONICLER.md says the line comes from the Scene and
  the earlier line, and a live test plays a Scene with Quirrell and has a judge look for his secret in the line.
- [Lines grow long over many Scenes] → At most three sentences; the Chronicler rewrites the line, never appends to it.
- [A Group known as one] → Its description is the Story File's, so it must be what anyone would know, like a place's;
  a member he comes to know on their own is listed as well.
- [Old Meanwhile lines without `about`] → Read by the names in them, which can miss a line said with "she". New lines
  say who they are about.
