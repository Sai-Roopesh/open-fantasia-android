# The screens

The approved design for the phone, agreed with the player on 5 October 2026. Every change that touches the phone
builds its screens to these, and a Codex brief for phone work names the files it builds.

Each `*.dc.html` is one screen at 390 × 844 points (taller where the screen scrolls), written as plain HTML with
inline styles: read it for layout, spacing, type and colour. The live canvas, where the player can comment, is
https://claude.ai/artifact/1NJ5WcNY1hK4riyDxepwA2 (private to the player). Portraits are drawn as lettered
placeholders; the app shows the real images (openspec stories: Portraits are real images).

## Decisions

- A Reply is one passage of prose, never split into speakers: the Actor writes close narration, and a Scene with
  three people talking would read like a chat log.
- The Writer's plan, its call included ("the Scene is landing"), shows only in Backstage, never in the Scene.
- Things that change the Story are words, not icons alone: End scene, Linger, Copy, Redo, Edit, Try another way.
- An entry point appears only once what it opens exists: the Scene's header gains World, Journal, Paths and
  Backstage as those screens are built.
- The Story opens from the Story's title in the Scene's header, marked with a chevron: the header has no room for a
  fifth word, and the title names what opens (7 October 2026, drawn for the player's approval).

## Look

- Ground `#141218`; surfaces `#1E1B24` (raised `#2A2632`, Backstage `#100E13`); lines `#2E2A36` and `#3A3544`.
- Text `#EEEAF4`; secondary `#B3ACC0`; captions `#8E879C`; prose `#E2DDEA`.
- Accent `#7552DD` for filled buttons with white text; accent text `#B9A4FF`; pressed accent `#D6C9FF`.
- Amber `#E9B95C` for waiting, expected and rumoured things; teal `#63CDB5` for seen; blue `#8EB8FF` for told.
- Literata for the Story's own words (prose, titles of Stories and Scenes, Portraits' letters); Manrope for
  everything else. Prose 16/1.6; body 15; captions 12–13; eyebrow labels 11–12 bold with wide tracking.
- Corners: cards 16–18, chips and buttons fully round, sheets 24 at the top. Touch targets at least 44.

## Screens

| File | Screen | Built in |
|---|---|---|
| `Main.dc.html` | Home: every Story with where it stands; the Mac's status | screens-to-design |
| `Pair.dc.html` | Pairing | screens-to-design |
| `Scene.dc.html` | A Scene: earlier Scenes folded, the title card with Portraits and Focus, Moves and Replies, the latest Reply's actions, Linger and End scene, the composer | screens-to-design |
| `SceneWriting.dc.html` | A Reply arriving, with the composer still open | screens-to-design |
| `SceneFailed.dc.html` | A Reply that failed: the reason, Retry, another model, the trace | screens-to-design (another model: the Models screen) |
| `Redo.dc.html` | Redo with a Direction, Remember this, and the model for this Reply | screens-to-design (the model: the Models screen) |
| `SceneReturn.dc.html` | Back after a night away: the Previously card | the Chronicler |
| `LongPress.dc.html` | An earlier Reply's menu: Copy, Rewind to here, Try another way from here, Edit | Paths, editing |
| `MovingOn.dc.html` | Between Scenes: one line while the Scene is recorded and the World moves on | the Chronicler, the Weaver |
| `DayView.dc.html` | The Day View: the day, the place, countdowns, Meanwhile, the Story's pick with its day, Happenings and a weekly Engagement, the other choices, your own Move | screens-to-design (first form); the Weaver; story in stretches; engagements |
| `Gap.dc.html` | What did you do in the Gap? | the Weaver |
| `World.dc.html`, `Person.dc.html` | The World screen and a person, with Between you | the World screen, editing, lasting records |
| `Journal.dc.html` | The Journal | the Journal |
| `Backstage.dc.html` | Backstage, Taste, The record and the Director's Stretch included | Backstage, lasting records, story in stretches |
| `Paths.dc.html` | Paths | Paths |
| `Models.dc.html` | Models | the Models screen |
| `Story.dc.html`, `StoryEdit.dc.html` | The Story: its Premise, Style and reply length, Arcs, Landmarks, World, places and institutions, and the time; and the sheet that edits each, Taste's lines included | editing the Story |
