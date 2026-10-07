# Design

## Context

See proposal.md for why. A Story's people, Leads and Groups come from its Story File and are fixed after import
(`story_set_up`). The only edits to the State after import are `taste_set` and `known_set`: entries on the Path that
move its head between Replies and tell phones `path_changed`. The Mac's commands (`fantasia known`, `fantasia edit`)
write through the engine like the phone does, and `watchStore` tells phones of the change.

Portraits are copied into `portraits/<story>/` in the Mac's folder at import. A person's `portrait` names the file,
and `GET /stories/{id}/portraits/{file}` serves it. Every agent reads `state.people`, `state.leads` and `state.groups`
on every call, so a change there reaches the next Scene with nothing else to do. Lives come from `worldOn`, which
gives a person without one an empty Life.

The World screen lists only people the Player Character knows something of. Its person page is read-only. Its "+"
(Add a person in World.dc.html) is not yet built. Person.dc.html draws Edit and Replace Portrait above the Portrait,
a Lead switch ("The Story builds toward her"), and a Group row.

## Goals / Non-Goals

**Goals:**
- Create and change people, Leads, Groups and Portraits from the phone and from the Mac's commands, landing from
  that moment onward on the current Path only.
- Everyone reachable for editing, with the World screen still showing only what the Player Character knows.
- Nothing in the Story ever changes Leads or Groups by itself.

**Non-Goals:**
- Renaming someone. A person's name is how every entry, Moment and Life refers to them. A new name is a new person;
  other names go in `aliases`.
- Removing someone from a Story. No scenario asks it; a person can be left out of Scenes by the Writer as now.
- The Story's settings (Landmarks, Arcs, places, Premise, Style, reply length, time, the Player Character, Taste's
  lines). They are the next change, built on the same entries.

## Decisions

**1. Four entries on the Path (host).** Each moves the head between Replies, against the head the phone saw, and
tells phones `path_changed`:
- `person_set {person}`: the person whole, created or replaced. A Portrait already theirs is kept.
- `lead_set {person, lead}`: added at the end of the Leads, or taken out.
- `group_set {group, description}`: a Group created, or its description changed.
- `portrait_set {person, file}`: a Portrait replaced.

The reducer applies each. Earlier entries and other Paths never see them (docs/adr/0003), so earlier moments read
back as they were. No agent writes these entries: only `engine.setPerson`, `setLead`, `setGroup` and `setPortrait`,
called by the link and the Mac's commands. That is what keeps Leads and Groups the player's.

**2. A person is checked before it is written (host, `engine/people.ts`).** The check refuses:
- a blank name or blank "who they are";
- a name, or any other name, that is already someone else's name or other name;
- a Group the Story does not have;
- making the Player Character a Lead or putting them in a Group;
- a new name for someone who exists, when the edit names a person to change.

The reasons are in words the phone shows.

**3. What the Player Character knows, when edited (host).** The editor carries `known`. A `person_set` whose `known`
differs from what he knows now counts as a known line at its place on the Path, as a `known_set` does, so the World
screen and the Chronicler read it (`story/known.ts`).

**4. Portraits (host, protocol).**
- **The upload.** `PUT /stories/{id}/people/{name}/portrait` takes the image itself (`image/jpeg`, `image/png` or
  `image/webp`, at most 10 MB), with `?after=` for the head the phone saw. Its first bytes are checked to be the type
  it says.
- **The store.** It is saved as `portraits/<story>/<uuid>.<ext>`, then `portrait_set` names it.
- **Earlier files stay.** Earlier moments and other Paths may still show them, and entries never change.

`fantasia portrait <story> <name> <file>` does the same from a file on the Mac.

**5. The link (protocol, host).** Contract 15:
- **Reading:**
  - `GET /stories/{id}/people` returns `PeopleView`: everyone, Leads first then by name, each with Portrait, Lead,
    Group and whether they are the Player Character; and the Groups with their descriptions.
  - `GET /stories/{id}/people/{name}` returns `PersonDetail`: everything the editor shows, who they are included.
- **Writing.** Each takes `after`, and answers with the person or the People view as it now stands:
  - `PUT /stories/{id}/people/{name}` takes `PersonEdit`, creating or changing;
  - `PUT …/lead` takes `{lead}`;
  - `PUT /stories/{id}/groups/{name}` takes `{description}`.

None of these is kept for reading without the Mac: editing needs the Mac.

**6. The Mac's commands (host).**
- `fantasia person <story> <name>` takes `--who`, `--known`, `--appearance`, `--after`, `--alias` (repeatable),
  `--voice` (repeatable), `--group` and `--portrait <file>`. It creates the person, or changes only the fields given.
- `fantasia lead <story> <name> on|off`.
- `fantasia group <story> <name> <description>`.
- `fantasia portrait <story> <name> <file>`.

Each writes on the current Path through the engine. The phone learns of it through `watchStore`.

**7. The phone (android).**
- The World screen's "+" opens **Everyone in the Story**: "Add a person" first, then everyone, Leads first. The
  Player Character is marked "You", and a person's Group shows beside them. No one's "who they are" is on this list.
- Tapping someone opens their person page. From the World screen or from Everyone, it now has:
  - **Edit**, opening `PersonEditor` with who they are and every field;
  - **Replace Portrait**, through `PortraitPicker`, the photo picker in the app (no permission needed);
  - the **Lead** switch, sent at once;
  - the **Group** row, opening a picker: None, each Group, New Group…
- `PortraitPicker` is passed in as `PairingScanner` is, so the shared checks give it an image without the system
  picker.
- Every edit is off while a Reply is written or the Mac is unreachable, as Paths are (`canChangePath`). A refusal is
  shown in the editor, with what was written kept.

## Risks / Trade-offs

- [Who they are is a spoiler] → It shows only on Edit, which the player opens on purpose; the list and the page
  without Edit show nothing more than before. Chosen by the player on 7 October 2026.
- [Large images] → At most 10 MB, refused with the reason; the phone sends what the picker gives, without
  re-encoding.
- [A name an agent already used] → A new person whose name an agent has already written (a Scene's walk-on) is
  refused only if it is someone else's name or other name; otherwise they simply become a person in the Story.
