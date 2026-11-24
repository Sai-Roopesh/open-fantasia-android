# Open Fantasia

A roleplay app where the player lives a second life inside a story world, as their own character, beside the
characters they came for.

## Language

### The Story

**Story**:
One life the player lives in a World: its World, its Premise, its Leads and the Player Character.
_Avoid_: Thread, chat, campaign, game

**World**:
Where a Story happens: its places, people, institutions and history, which go on living whether or not the
player is there.
_Avoid_: Setting, universe, scenario

**Rule**:
Something established about how this World works, such as what Roopesh's power can do and who has seen it, a room
behind the Gryffindor dorms, or the Duelling Statute of 1792. Once established, in the Story File or in play, it holds
for the rest of the Story unless the Story changes it on the page.
_Avoid_: Lore, canon, fact, world-building

**Premise**:
What the player came to the Story to experience, such as an enemies-to-lovers romance or being a superhero. The
Story serves it without fixating on it.
_Avoid_: Brief, element, goal, theme

**Style**:
How the Story is written, in the player's own words: genre, tone, era, language, how dark, how explicit, how
slow the slow burns are. Everything that writes for the Story reads the same Style.
_Avoid_: Notes, director style, tone, prompt

**Arc**:
A journey the player wants the Story to build toward, with no fixed end, such as "Draconia comes round to Roopesh,
slowly, against everything she was raised to be". Every Scene moves at least one Arc a little, and none is
resolved on a schedule.
_Avoid_: Milestone, goal, destination, brief item, plotline

**Landmark**:
An event with a time that the World brings about whether or not the Arcs are ready, such as the Triwizard
Tournament in Year 3.
_Avoid_: Milestone, spine event, calendar entry, deadline

**Lead**:
A character the player most wants to spend time with. The player makes anyone a Lead, or stops them being one, at
any time, including someone who arrives during the Story.
_Avoid_: Primary character, main character, love interest

**Player Character**:
The character the player plays, and the only one whose words, choices, thoughts and feelings are the player's.
What other people do to him is theirs, and lands (docs/adr/0024).
_Avoid_: Persona, protagonist, user, you

**Cast**:
Everyone in the World who is neither a Lead nor the Player Character.
_Avoid_: NPCs, extras, background characters

**Portrait**:
The one picture of a person: a real image curated when the Story is made, or one the player uploads later.
Never drawn by the app.
_Avoid_: Avatar, generated image, character art

**Group**:
Several of the Cast whose life the World follows together, as one, such as Crabbe and Goyle. The player decides
who is in which Group; everyone else in the Cast is followed one by one.
_Avoid_: Crowd, extras, faction

**Story File**:
A portable document that sets a Story up: its World, people and Groups, Leads, Player Character, Premise, Arcs,
Landmarks, Style and opening. Stories are written as Story Files outside the app (see `docs/story-authoring.md`) and taken in whole.
_Avoid_: Export, prompt pack, template, preset

### Playing

**Move**:
What the player writes on their turn: anything at all, from their own character's words and thoughts to what
others do, what happens, a time skip or going somewhere else. What a Move says has happened.
_Avoid_: Message, prompt, input, user turn

**Reply**:
What the Story writes back after a Move: the people there and the world around them, never the Player
Character's words, choices or feelings.
_Avoid_: Response, generation, bot message, AI turn

**Scene**:
One thing happening between its people, played Move by Reply. It may move from place to place while that thing goes
on, as when Draconia and the Player Character argue all the way up the lane. Only the player's End Scene action
ends it. A change of place, activity or time keeps it open, with the place, people and clock updated.
_Avoid_: Chapter, session, segment

**Outline**:
Where the whole Story is going, from now to its end, in Acts: what each Act is about, what it builds toward, the turns
along the way, and where each Arc and main relationship should stand by its end. It is reconsidered after every Scene,
so it follows wherever the player takes the Story; nothing new enters the Story except as a setup it means to pay off.
_Avoid_: Spine, roadmap, master plan, script

**Act**:
One part of the Outline, such as a school year: the question it asks, the Landmark it builds to, and how it hands on
to the next.
_Avoid_: Season, book, chapter, arc

**Stretch**:
About a week of story time, planned as a whole: the few Scenes in it that matter, each with its day, place, people
and what it is for, and what each Lead does about the Player Character that week, on screen or off. Between the
Scenes that matter, the days pass as Meanwhile.
_Avoid_: Chapter, episode, arc, week

**Happening**:
Something going on in the World at a time and place that the Player Character could be at, such as McGonagall
taking accounts at 9:00 or the twins' round at the Three Broomsticks. Some the Player Character is expected at,
and their absence is noticed; any Happening they are not at goes on without them.
_Avoid_: Opportunity, event, quest, storylet, option

**Engagement**:
Something the Player Character knows is on at a time and place, because it was arranged in front of him or reached
him: a summons, a lesson, an invitation, a session he agreed to, once or every week. It is on the Day View until it
is kept, missed, called off or past. He is expected at one he agreed to or was summoned to; missing it is noticed.
_Avoid_: Appointment, plan, event, reminder

**Gap**:
The time between where the Player Character is and the Happening the player chose next. The Player Character
spends it however the player says, or quietly if they say nothing, and everything else in it goes on without
them.
_Avoid_: Time skip, downtime, idle time

**Calendar**:
The date of a Story's first day, from which every day of the Story is a date with its weekday. Agents and the player
read Story time as dates; day numbers are only the Story's bookkeeping.
_Avoid_: Day N, timestamp, epoch

**Day View**:
Where the player chooses what to do next after a Scene they ended: what their character
knows has happened meanwhile, and what is happening that they could go to. A Move that goes somewhere else
skips it.
_Avoid_: Menu, hub, map, interlude screen

**Focus**:
The one person a Scene's Replies stay close beside, in their words, actions and thoughts, while nobody new enters
unless a Move brings them in. A Scene that opens with one other person starts focused on them, and Focus
clears when the Scene ends.
_Avoid_: Active speaker, speaker picker, single mode

**Linger**:
The player's hold on a particular beat: while it is on, the Story lets the moment breathe. It is optional;
Scenes stay open without it. It clears when the Scene ends.
_Avoid_: Stay here, pace, dwell

**Redo**:
Writing the latest Reply again, optionally with a Direction.
_Avoid_: Regenerate, reroll, retry

**Direction**:
An out-of-character instruction, saved exactly when the player gives it with a Redo or in Backstage. Every later
Reply and planning pass reads all active Directions, across Paths and restarts. A Direction applies within its
original scope; a correction to one encounter does not restage it everywhere. The player can edit, archive and
restore Directions in Backstage. They never enter the Story as events or character knowledge.
_Avoid_: Feedback, guidance, instruction, OOC note

**Brief**:
What the player wants more of and less of in a Story, which the Director plans by.
_Avoid_: Preferences, settings, prompt

**Reaction**:
The player's word on a Scene that ended: more like this, or less.
_Avoid_: Rating, feedback, like

**Routine**:
The Player Character's ordinary week (classes, meals, practice) that the Director builds on.
_Avoid_: Schedule, timetable, calendar

**Taste**:
Lasting preferences explicitly maintained by the player: a Story's own Taste belongs to the Story rather than
one Path, and the player's Taste is shared across Stories. Exact Directions are kept separately; writing a Reply
does not turn them into model-inferred global rules. Earlier automatic paraphrases remain archived as history
when their original Directions are recovered.
_Avoid_: Preferences, profile, memory

### Paths

**Path**:
One way the Story has gone, from its opening to its latest moment. A Story is a tree of Paths; the clock, the
World, what everyone knows and the Arcs all belong to the Path the player is on.
_Avoid_: Branch, timeline, fork, save

**Try another way**:
Starting a new Path from any Reply, leaving the Path the player was on exactly as it was.
_Avoid_: Fork, branch off

**Rewind**:
Going back to an earlier moment on a Path. What came after is set aside as a Path of its own, never destroyed.
_Avoid_: Undo, revert, delete

### Who writes the Story

**Actor**:
Plays everyone in a Scene and writes the Replies. Chosen per Story, with the same selected model and effort
handling both the creative choice and the complete prose in one generation. A Reply goes straight to the player;
the Editor reads it first only when the Mac is set to.
_Avoid_: Roleplay model, bot, character AI

**Writer**:
The responsibility for shaping a Scene: what it is for and what happens next in it. This metadata is produced
in the same call that writes the Reply, rather than passed through a separate model and short instruction.
Only the player ends a Scene, and no reply count forces a beat or an Arc to move.
_Avoid_: Scene planner, screenwriter, director

**Chronicler**:
Records what happened in a Scene, inventing nothing. Long Scenes are recorded repeatedly as they grow: each
checkpoint extends the cumulative account and extracts new Moments only from passages not already recorded.
_Avoid_: Continuity engine, memory, summarizer

**Weaver**:
Moves the World forward off-screen by living out everyone's Lives and the Outline while the Player Character is
elsewhere: what each person does about what they want, how their feelings move, and what is happening that he could
go to.
_Avoid_: World agent, simulator, world turn

**Editor**:
When the Mac is set to (`fantasia editor on`), reads each Reply before the player does, against what the Story has
established: its Rules, what each person knows and believes, the clock, and what only the player may decide; sets
right or sends back what breaks them. Off by default (docs/adr/0024). Checks the records and recaps of what happened
against what they cover.
_Avoid_: Checker, validator, critic, continuity

**Director**:
Keeps the Story's Outline, woven from the world's direction and everyone's Lives, and plans each Stretch as the next
step of the current Act, arranging where Lives cross the Player Character. After every Scene it reconsiders the
Outline in the light of how the Scene went.
_Avoid_: Planner, showrunner, plot manager

**Folder**:
Folds each finished Act of The Story So Far into one account of it, keeping every turning point and name, so it
stays short however long the Story runs.
_Avoid_: Summarizer, compressor

### The living World

**Life**:
A person's own story, lived for its own sake and not only for the Player Character's: who they are now, what they want
this Act and what they are doing about it, how they feel about the people around them, and where they are heading.
The Outline is woven from Lives; the Player Character's story is where they cross his. The Weaver lives them out
while he is elsewhere.
_Avoid_: Agenda, schedule, routine, status, NPC behaviour

**Thread**:
A situation developing in the World on its own, such as who broke Selwyn or a smuggled dragon egg: the World's
counterpart to the player's Arcs.
_Avoid_: Pressure, plotline, subplot, quest

**Meanwhile**:
What the Player Character learns happened while they were elsewhere: what they saw, were told or heard as
rumour, never more.
_Avoid_: Recap, news feed, world events

**Moment**:
A part of the Story that matters, especially one shared with the Player Character, recorded once in its original
words with who was there and who knows of it. Everyone who was there remembers it from that one record.
_Avoid_: Memory, memory entry, recollection, note

**Bond**:
Where things stand between the Player Character and one person he has history with, as he has seen it, and the turns
that brought it there, each one line from the Scene it happened in. Kept once, beside the Moments; nobody's secret
feelings are in it.
_Avoid_: Relationship meter, affinity, affection score, relationship memory

**The Story So Far**:
What has happened in the Story: a paragraph for each Scene of the current Act, and an account of each Act before it.
Every agent is given it.
_Avoid_: Summary, recap, history, context

### What the player sees

**Journal**:
The Story read back Scene by Scene, with what the Player Character heard Meanwhile, as far as they know it.
_Avoid_: History, log, transcript, timeline

**Backstage**:
The place outside the roleplay where the player can see everything the Player Character does not know: what
happened off-screen, everyone's Lives, the Threads, and what the Director and the Writer are building toward.
_Avoid_: Narrator's view, god mode, spoilers
