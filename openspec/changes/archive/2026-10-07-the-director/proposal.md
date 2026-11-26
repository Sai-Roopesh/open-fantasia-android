# Proposal

## Why

Nothing shapes the Story beyond one Scene. The Writer plans each Scene against the Premise and the Arcs, but it sees
only the Scene in front of it, so nothing decides when a stretch builds, when it peaks, or when the Story rests.
Four `long-run` scenarios are unbuilt:
- The Premise keeps returning;
- A slow burn stays slow;
- The plan stays Backstage;
- A quiet pick after a peak.

Backstage has a place for the Director that has stayed empty since journal-and-backstage. The Models screen already
lists the Director's model. With the player about to play for real, a long Story needs something that keeps the
Premise coming back without fixating on it, and keeps a slow burn slow.

## What Changes

- **The Director (host)**, a new agent on the Director's model from the Models screen. It runs when a Scene ends,
  beside the Chronicler and the Weaver (docs/adr/0004). It writes a plan whenever the stretch it planned has run out
  or a Scene peaked; otherwise it does nothing. A plan says:
  - what this stretch builds toward, an Arc moment or a Landmark;
  - whether it builds, peaks or rests, and for about how many Scenes;
  - for each Arc, where it stands and the one small step this stretch may take, never past it;
  - how the Premise comes in: in some Scenes of the stretch, not every one.
- **The plan reaches the Story only through the Writer (host)**, as one more part of what the Writer reads when it
  plans a Scene: the stretch, its aim, and each Arc's next step and how far is too far. Nothing of the plan is shown
  in the Scene, the Day View, the World screen or the Journal.
- **Rest after a peak (host)**:
  - A Scene peaked when the Writer rated it 4 or 5: a confrontation, a revelation, or a change that cannot be undone.
  - After such a Scene the Weaver's pick for the Day View must be a quiet Happening, and its answer is checked for
    that.
  - Happenings gain `quiet`, the Weaver's word on whether each one is.
- **Backstage's Director section (host, android)**, as drawn in Backstage.dc.html: what he is building toward, and
  whether this stretch builds, peaks or rests.
- **Contract 13**: `BackstageView.director`, the plan as the phone shows it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `long-run`:
  - The Director shapes the long run around Arcs and Landmarks: when it plans, and that the Writer follows the
    plan's steps.
  - Rest is deliberate: what makes a Scene a peak, and how a Happening is quiet.
- `outside-the-scene`: Backstage's Director section, a scenario for reading it.

## Impact

- Host:
  - `agents/director.ts` and `agents/DIRECTOR.md` (the Director), and a `director_plan` background record in
    `story/entries.ts` (docs/adr/0007);
  - `engine/engine.ts` (running it at a Scene's end) and `engine/directing.ts` (when a plan is due, what it is asked);
  - `agents/writer.ts` and `WRITER.md` (the plan in the Writer's task), `agents/weaver.ts` and `WEAVER.md` (quiet
    Happenings and the rest check);
  - `views/backstage.ts`.
- Protocol: `link.schema.json` and `contract.json` to 13.
- Android: Backstage's Director section in `OutsideScreens.kt`.
- Tests:
  - scripted engine tests for when the Director runs, what reaches the Writer, the Weaver's rest check, and the plan
    in Backstage only;
  - live tests (`npm run test:real`) for the two scenarios only a model can show: ten Scenes for the Premise, twenty
    for the slow burn, played as Scene openings with the Director planning between them, and a judge;
  - a shared check of Backstage on the JVM and the device.
