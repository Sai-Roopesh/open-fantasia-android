# Proposal

## Why

Once a Story is running, nothing about its people can change: nobody can be added, nobody's description fixed, no
Portrait replaced, no Lead or Group moved. ADR 0002 rests on everything being editable in the app and through Claude
on the Mac. Six `stories` scenarios are unbuilt:
- Claude adds a person mid-Story;
- A new person is created in the app;
- A newcomer becomes a Lead;
- The Story never promotes anyone;
- Goyle starts to matter;
- Uploading a Portrait.

The person page and World screen are drawn with Edit, Replace Portrait, a Lead switch, Group, and Add a person, and
the World screen now gives them a home.

This change is the people half of `stories › Anything can be edited or created in the app`. The Story's settings
(Landmarks, Arcs, places, Premise, Style, reply length, time, the Player Character, Taste's lines) follow in the next
change, with `long-run › Changing the Style mid-Story` and `stories › A Landmark is moved on one Path`.

On 7 October 2026 the player chose how to reach people the Player Character does not know. The World screen stays as
he knows it. An edit mode, reached from its Add button, lists everyone in the Story, and editing a person shows who
they really are.

## What Changes

- **Edits are entries on the Path (host).** Each lands from that moment onward on the current Path, between Replies,
  and phones are told as with any change:
  - `person_set`: a person created or changed whole;
  - `lead_set`: a Lead on or off;
  - `group_set`: a Group created or its description changed;
  - `portrait_set`: a Portrait replaced.

  Nothing in the Story ever writes them but the player and Claude: the Story never changes Leads or Groups on its own.
- **The Mac's commands (host).** `fantasia person`, `fantasia lead`, `fantasia group` and `fantasia portrait` make
  the same edits, so Claude can add Luna Lovegood with her Portrait in Scene 20.
- **The link (protocol, host).** Contract 15:
  - **reading:** `GET /stories/{id}/people`, everyone with their Group and Lead; `GET /stories/{id}/people/{name}`,
    a person as the Story keeps them;
  - **writing:** `PUT /stories/{id}/people/{name}`, `PUT …/lead`, `PUT …/portrait` (the image), and
    `PUT /stories/{id}/groups/{name}`.
- **The phone (android):**
  - **Everyone in the Story**, reached from the World screen's Add button (World.dc.html), with "Add a person";
  - **the person page** (Person.dc.html) gains Edit, Replace Portrait from the photo picker, the Lead switch, and the
    Group row with its picker (None, each Group, a new Group);
  - **the person editor**: name, other names, who they are, what the Player Character knows of them, appearance,
    what they are after, how they talk.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `stories`:
  - Anything can be edited or created in the app: says how people are reached to edit, and that editing shows who
    they really are; a scenario for a person edited mid-Story.
  - Portraits are real images: what an upload may be.

## Impact

- Host:
  - `story/entries.ts` and `story/reducer.ts` (four entries);
  - `engine/engine.ts` (the edits) and `engine/people.ts` (checking a person);
  - `views/people.ts`, `link/server.ts` (routes, and an image body for a Portrait);
  - `cli/commands.ts` and `cli/main.ts` (four commands);
  - the Portrait store under the Mac's folder.
- Protocol: `link.schema.json` and `contract.json` to 15.
- Android:
  - `EveryoneScreen.kt`, `PersonEditor.kt`, and the person page in `WorldScreen.kt`;
  - `FantasiaModel.kt`, `FantasiaLink.kt`, `LinkClient.kt` (an image upload), `MacConnection.kt`;
  - the photo picker, which needs no permission.
- Tests: engine, CLI and link tests for every edit and each scenario; shared checks on the JVM and the device; the
  on-phone check done over adb.
