# the-truth Specification

## Purpose
Keeps everything that happened and everything that is true now, for every person, so that nothing is forgotten and
every Reply is written from where things really stand.

## Requirements

### Requirement: Who each person is now is kept

After every **Scene**, the Story SHALL keep, for each person who matters in it, who they are now: how they feel about
each person around them, what they want, and what they hide. Who they are now SHALL be what everything that writes
them reads first; who the Story File said they were SHALL stay as their beginning.

#### Scenario: Not her first-week self
- **GIVEN** Draconia declared herself taken in front of the school in Scene 12 and kissed him on the road in Scene 18
- **WHEN** a Scene with her opens
- **THEN** she is written as who she is now, and does not hide that she wants him as she did in the first week

### Requirement: What each person knows and believes is kept

The Story SHALL keep what each person knows and what each believes, including beliefs that are wrong, and every Reply
SHALL keep to them: a person SHALL act on what they believe, and never on what they could not know.

#### Scenario: Who knows his secret
- **GIVEN** Roopesh told Hermione in Scene 6 that he can stop time, and Draconia believes only her parents and
  Dumbledore know
- **WHEN** both are in a Scene with him
- **THEN** Hermione acts knowing it, and Draconia acts as if Hermione does not

#### Scenario: A wrong belief held
- **GIVEN** Pansy took the page from Draconia's diary, and Draconia believes Hermione did
- **WHEN** Draconia and Hermione meet
- **THEN** Draconia blames Hermione, until she learns otherwise on the page

### Requirement: Where things stand between any two people is kept

The Story SHALL keep where things stand between any two people who have history, not only with the **Player
Character**: where it stands now, the turning points that brought it there, and its keepsakes, the moments they would
remember for life, in their own words. A keepsake SHALL never fade, however long the Story runs.

#### Scenario: Two rivals
- **GIVEN** Draconia and Hermione have fought over him since Scene 1 and signed a contract in Scene 8
- **WHEN** they meet in Scene 40
- **THEN** they act from where things stand between them, with the contract and how it came about

#### Scenario: The first kiss, years later
- **GIVEN** Draconia first kissed him in Scene 18
- **WHEN** they kiss in a Scene in Year Four
- **THEN** the first kiss is with them in its own words, and the Reply can call back to it

### Requirement: What is true now is kept

The Story SHALL keep what is true now: agreements with every term, promises with their deadlines, debts, threats,
secrets with who knows each, and how things stand, such as a betrothal. Everything true that touches the people in a
Scene SHALL reach those who write it.

#### Scenario: The contract's clauses
- **GIVEN** the contract says nobody comes second and Saturdays are Hermione's
- **WHEN** Draconia claims him on a Saturday
- **THEN** the Scene knows the clause, and Hermione holds him to it unless it is changed on the page

#### Scenario: A deadline coming
- **GIVEN** Hermione wrote that Draconia must say it back by Christmas
- **WHEN** December comes
- **THEN** the people who know of it remember it, and the deadline counts

### Requirement: Rules hold

What is established about how the **World** works, in the Story File or in play, SHALL be kept as a **Rule** and hold
for the rest of the Story unless it is changed on the page.

#### Scenario: A power's limits
- **GIVEN** it was established that his doubles last only minutes
- **WHEN** a later Reply has him doubled
- **THEN** the double does not last an hour

### Requirement: What is named stays named

A person, place or thing named on the page for the first time SHALL become part of the World from then on, with what
was said of it, and SHALL keep its name.

#### Scenario: The Auror's name
- **GIVEN** an Auror introduced himself in Scene 16 as Silas Penhallow of Madam Bones's office
- **WHEN** he comes back in a later Scene
- **THEN** he is Silas Penhallow of Madam Bones's office, and nobody calls him by another name

### Requirement: Nothing is deleted

What stops being true SHALL be kept as true until the Scene that ended it, and never deleted. Everything the Story
keeps SHALL point to the passage it came from.

#### Scenario: A betrothal broken
- **GIVEN** Draconia's betrothal to Selwyn was broken in Scene 30
- **WHEN** a Scene in Scene 40 mentions it
- **THEN** it is spoken of as broken, and the Story still knows it held from its making until Scene 30

#### Scenario: Where it came from
- **WHEN** the player opens what the Story keeps of the contract in Backstage
- **THEN** it shows the passage where the contract was made

### Requirement: A Story's truth can be rebuilt from its own text

A Story's truth SHALL be rebuildable from what was played: reading its **Scenes** in order and writing everything
afresh, after which the player SHALL carry on from where they were.

#### Scenario: Rebuilt from the page
- **GIVEN** a Story played for nineteen Scenes
- **WHEN** its truth is rebuilt
- **THEN** the player carries on from Scene 19 with nothing replayed, and the people in the next Scene act from
  everything that happened in the nineteen
