# The Malfoy Problem: continuity audit

A read-only audit of one real Story, written as the test case for the new memory design. It answers four questions. How big is the Story? What would a careful reader have to remember? How much of that did the system keep, and did it reach the agents? Where has the Story already contradicted itself?

**Source.** Story `4b126b7c-d999-45b0-aad9-5f0defa36a65`, Path "Main" (`is_current=1`), head entry `b949e92a…` (seq 1272). The database was opened with `?mode=ro`, so nothing was written. The current Path holds 557 entries: 19 Scenes, 151 Moves, 151 Replies, 18 chronicles, 26 world moves, 7 director plans and 2 folds. Another 35 entries sit off the Path; they are the Replies that Redos replaced, and they are used here as evidence. Scene 19 is still open. Story time runs from Friday 6 September 1991 (Day 6) to Friday 15 November 1991 (Day 76).

**What "the State" means here.** No State is cached for the head entry. The newest cached State is at entry 1261, a Move in Scene 19. Nothing after it touches facts, bonds, known, storySoFar, threads, lives or calendar, so it is the current memory. The "latest prompts" are the newest `calls` rows: Actor call `984ee7fc` (02:51:44) and Writer call `50692519` (02:51:32), both for the final Reply of Scene 19.

**Notation.** S7 means Scene 7. **K** = kept, **G** = garbled (present but wrong or too vague to act on), **L** = lost. Quotes are trimmed to a line or less.

---

## 1. Size

Tokens are characters divided by 4. The Day View Move that ends a Scene is counted in that Scene. "Chronicle" is the paragraph, the Moments, the Bond lines and the "known" lines. "World" is facts, Meanwhile, Lives and Threads.

| Scene | Date (Day) | Moves | Moves tok | Replies tok | Chronicle tok | World tok | Plan tok | Fold tok |
|---|---|---|---|---|---|---|---|---|
| 1 Freshers' Friday | Fri 6 Sep (D6) | 3 | 0.3k | 1.9k | 1.1k | 0.0k | 3.2k | – |
| 2 The path past the Shrieking Shack | Fri 6 Sep (D6) | 5 | 0.2k | 4.7k | 1.3k | 1.7k | – | – |
| 3 The price of a life | Sat 7 Sep (D7) | 7 | 0.4k | 6.0k | 1.1k | 1.0k | – | – |
| 4 The searched trunk | Sat 7 Sep (D7) | 10 | 0.8k | 8.5k | 1.4k | 0.8k | – | – |
| 5 Pumpkins and claims | Tue 29 Oct (D59) | 6 | 0.5k | 5.7k | 1.6k | 0.8k | 4.0k | – |
| 6 The conversation he owes her | Tue 29 Oct (D59) | 15 | 0.7k | 13.7k | 0.8k | 2.2k | 3.9k | – |
| 7 The feast and the troll | Thu 31 Oct (D61) | 16 | 1.7k | 14.7k | 1.4k | 0.7k | 4.3k | – |
| 8 One bed, two claims | Thu 31 Oct (D61) | 9 | 0.4k | 8.3k | 0.9k | 1.1k | – | – |
| 9 Survivors' party | Thu 31 Oct (D61) | 7 | 0.5k | 6.5k | 1.0k | 0.0k | – | – |
| 10 Early Friday | Thu 31 Oct (D61) | 13 | 0.5k | 11.4k | 0.8k | 2.1k | – | 0.3k |
| 11 The Malfoys at the gates | Fri 1 Nov (D62) | 8 | 0.5k | 7.3k | 1.1k | 0.4k | – | – |
| 12 Match day | Sat 9 Nov (D70) | 11 | 0.7k | 10.2k | 1.8k | 1.7k | 3.5k | – |
| 13 Two o'clock, alone | Sat 9 Nov (D70) | 7 | 0.3k | 6.3k | 1.1k | 0.9k | – | – |
| 14 Gryffindor ground | Sat 9 Nov (D70) | 1 | 0.0k | 0.9k | 0.8k | 0.0k | – | – |
| 15 Behind the locked door | Sat 9 Nov (D70) | 4 | 0.3k | 3.6k | 0.9k | 0.0k | – | – |
| 16 A visitor after hours | Sat 9 Nov (D70) | 4 | 0.1k | 3.5k | 0.8k | 0.0k | – | – |
| 17 Under the cliff | Sun 10 Nov (D71) | 8 | 1.4k | 7.4k | 1.0k | 2.9k | 3.8k | 0.2k |
| 18 Dressed as hers | Fri 15 Nov (D76) | 6 | 0.5k | 5.5k | 0.7k | 0.3k | 3.7k | – |
| 19 Over tea, under supervision (open) | Fri 15 Nov (D76) | 11 | 0.4k | 10.9k | – | – | – | – |
| **Total** | 70 story days | **151** | **10.2k** | **137.0k** | **19.7k** | **16.6k** | **26.4k** | **0.5k** |

**Raw play.** 151 Moves come to 40,860 chars (10.2k tokens) and 151 Replies to 547,984 chars (137.0k tokens), so the Story so far is about 147k tokens. That is 7.7k tokens a Scene on average, with a range of 0.9k (S14) to 16.4k (S7), or 2.1k tokens per story day. Replies are 93% of it. Writer Beat Notes add another 192k chars (48k tokens) of JSON that is not memory.

**Derived records, as written** (each Scene's own writes, totalled):

| Record | Count | Chars | Tokens |
|---|---|---|---|
| Chronicle paragraphs | 18 | 10,388 | 2.6k |
| Moments (what + quotes) | 86 | 28,425 | 7.1k |
| Bond lines (standing + turn) | 55 | 20,829 | 5.2k |
| "Known" lines | 101 | 19,075 | 4.8k |
| World facts ("happened") | 104 | 28,213 | 7.1k |
| Meanwhile lines | 31 | 4,535 | 1.1k |
| Lives (cumulative rewrites) | – | 21,905 | 5.5k |
| Threads (cumulative rewrites) | – | 11,632 | 2.9k |
| Director plans | 7 | 105,572 | 26.4k |
| Folds (week texts) | 2 | 1,874 | 0.5k |

**The State now (entry 1261)** is 254,623 chars of JSON, about 64k tokens. The large parts are facts (119,594 chars for 86 Moments and 104 world facts), people (26,415), bonds (16,304: 15 people, 55 turns), the plan plus recent plans (26,542), Meanwhile (9,339), storySoFar (7,728), known (7,602 for 25 people), calendar (6,841 for 15 Engagements, 13 of them past), Lives (5,006 for 18) and Threads (3,099 for 15). The Story So Far has 0 chapters, 2 weeks and 7 Scene paragraphs (S12–S18).

**How much reaches the agents**

| Agent | Request size | Scene so far | Memory (all else in the prompt) | Static Story File text |
|---|---|---|---|---|
| Actor | 70,500 chars | 41,635 | ~12.7k chars, ~3.2k tokens (2% of the Story) | ~9k chars of people_here profiles |
| Writer | 119,575 chars | 41,635 | ~38k chars, ~9.6k tokens (6.5%) | 33k-char system prompt |

The Actor's memory is broken down as lived 2,615, between 1,454, remembered 2,586, lately 3,874, taste 681 and in_play 465 chars. The Writer's is story_so_far 6,627, cast_now 7,699, lately 8,043, long_run 4,435, calendar 2,939, threads 2,798 and remembered 2,602.

**Growth**

- **Raw text** grows about 7.7k tokens a Scene. Over four real days (11–15 October) the player wrote 70 story days.
- **The State** grows about 3.5k tokens a Scene, from roughly 10.5 new facts a Scene.
- **The Actor's memory section stays flat** at about 12–13k chars, held there by the budgets in `lens.ts`.
- **The Writer's memory section keeps rising**, from 3.8k chars on its first call to 38k now.
- **Projection.** The Story File runs to Day 1706 (the Battle of Hogwarts). At this pace (about 3.7 story days a Scene) that is around 460 Scenes and around 3.5M tokens of Moves and Replies. At the current rate the State would hold about 4,800 facts. A fixed 3k-token Actor memory would then cover about 0.1% of the Story.

---

## 2. Ground truth: what a careful reader keeps

### 2.1 Who each major person is now, and how they changed

**Draconia Malfoy**
- **Then.** At S1 she was the jeering heiress: "Is the charity fund paying for that round, Stray?"
- **Lovers.** She is now Roopesh's lover. He bedded her in S10, where she cried his real name ("Not *Stray*. The real one… *Roopesh*"), and twice more at the inn in S19. The S8→S9 Day View Move, "i fuck both hermoine and draconia thoroughly", came first.
- **Her public claim.** She claims him in public as "*Taken*" (S12) and as "mine since the *first of September*" (S11). She marks him with her ribbon "lease" (S8) and dressed him in green at Gladrags on her own account (S18).
- **What it cost her.** She gave up seven Nimbus 2000s and the Reserve Seeker's place rather than give him up (S11: "Cancel all seven"). She refused the Selwyn match in writing, several times. Off the page she lost her chair in the Slytherin common room to Daphne, and the Ouroboros circle closed ranks against her (Weaver, D72).
- **What she still holds back.** She still denies jealousy ("I'm not jealous. I'm *organised*", S19). She has never said "I love you" back, and the contract says she must by Christmas.
- **Pansy.** She has taken Pansy into "the middle. Under supervision. *Mine*" (S18) and laid down Rules 1–5 for it (S19).
- **His power.** She has known it since the train ("I've known since September. I never told a soul", S6). She does not know he teleported her while she slept ("I don't know how I got back to my own bed tonight", S10).
- **Her father.** She thinks he "*invests*", not cares (S10), and believes he looked "*disappointed*" when she survived the train.

**Hermione Granger**
- **Then.** Shy and probing at S2: "Nobody gets *brought*, Roo."
- **Lovers.** She is now Roopesh's lover too. By the player's count she has been with him three times: the S8→S9 Move, S10 on the page, and S19, which the player confirmed with "this is the third time".
- **His power.** She knows it: shown in stopped time in S6 ("look around you that's my secret") and told "my powers are spacetime" in S10. She swore secrecy: "Not McGonagall, not Harry, not Ron, *nobody*" (S6).
- **The contract.** She wrote it and keeps it in her satchel, with a separate copy of the Saturday clause (Weaver).
- **Off the page.** She hexed Draconia's hair scarlet outside Transfiguration, lost her wand to McGonagall until detention, and collected legal extracts on witness questioning (Weaver, D71–73).
- **S19.** She found out about Pansy and the inn, slapped him in the street, hit him, demanded her "now", got it with Draconia supervising, and then co-wrote Rule 5.

**Pansy Parkinson**
- **Her mother's spy.** She spied for her mother Odile. She stole Dumbledore's Bangalore letter from his trunk (S4).
- **The train.** She gave out where Draconia would sit on the train: "My instructions came on the third. The ones about the train… Who sat where" (S18).
- **The diary page.** She stole a page of Draconia's diary and left it in his Charms book with her price, an hour alone (S18).
- **Now.** She has stopped spying ("I want to stop being a spy") and wants him. She slept with him while Draconia slept ("It was an hour and four minutes", S19). She now calls him "Roo" for the first time and calls Draconia "Connie".
- **Off the page.** She told McGonagall "the train part" and later handed over Odile's August instructions (S18, Weaver D73).

**Harry Potter**
- **A friend.** He is Gryffindor's Seeker and won his first match in three minutes, 160–0 (S12). He is a sworn mate ("Mates, then", S9) and is becoming a brother.
- **His power.** He has seen it: the stopped boathouse and a doorway in the air at S17. He decided "he would think about all of that some other time. Possibly never" and says "I'm not asking."
- **Off the page.** On the Weaver's account he went down the Astronomy stair after the leash (D74).

**Others who matter**

| Person | Where things stand now |
|---|---|
| Narcissa Malfoy | An ally. She overrules Lucius (S3, S11) and backed Roopesh in public with "I want my daughter in safe hands" (S12). She holds him to "my life" (S11). Her letter, which Lucius has not seen, gives the Graphorn receipt and her blessing: "Closer than is proper. I should rather like to meet him properly" (S18). |
| Lucius Malfoy | An enemy who keeps raising his price. He offered 1,000 Galleons (S3), cancelled the brooms (S11), gave the Selwyns "my word", and lodged a formal complaint asking that Roopesh be "*examined*" (S13). |
| Evander Selwyn | Draconia's would-be husband, humiliated twice: turned pink and danced in S5, and wept before a dementor in front of the school in S12. Roopesh saved his life, and Selwyn swore "*Useless*… I'll remember the word". He also warned "My father will be *fascinated*" by the corporeal Patronus. His family's kennelman bought the Graphorn chain. He collects a frosted parcel at the Hog's Head every Friday. |
| McGonagall | She knows everything Roopesh told her (S13) and covers for him on terms. She suspects his "That's about it" about who else knows. |
| Dumbledore | He knows all of it. He gave Roopesh the secret suite (S7), cut Voldemort's link through Yaxley, and holds Vane. |
| Mortimer Vane | Ran the cliff dementors and tried to frame Roopesh. Caught by Roopesh (S17). His public hearing is on Wednesday 20 November. His solicitor is challenging the extracted memory (Weaver). |
| Snape | Suspicious twice over: "Where did a scholarship first-year learn to unpick a curse…" (S5) and the troll frozen "*Through*" (S7). |
| Daphne Greengrass | Draconia's rival. Her hair was turned to eels (S11) and covered in boils (Weaver). She now has Draconia's chair. |
| Corban Yaxley | Owl Animagus and the masked man on the train. He was a "door" for Voldemort, is now damaged, and was released into private care. |
| Silas Penhallow | An Auror who wanted Roopesh as a witness. His Monday request was withdrawn (Weaver). |
| Odile Parkinson | Pansy's mother, brought in by the Director. She wants to sell what Roopesh is. She has never appeared on the page. |

### 2.2 Standing facts that are true now

**Relationships.**
- Draconia and Hermione are both his lovers and both claim him.
- Pansy is in "the middle" under Draconia's supervision.
- Roopesh has said "i love you both truly" (S8). To Draconia he said "i love you sooo much" (S10), and to Hermione "i love you" (S10), "just like you hermoine".
- He wants "a big family… a harem" (S8).

**Agreements**

1. **The contract** (S8). Hermione wrote it; Roopesh and "D. L. Malfoy" signed it. Hermione keeps it.
   - (1) Nobody is second.
   - (2) Saturdays are Hermione's.
   - (3) Library hours stay, and he turns up to them.
   - (4) No more secrets; tell her *before* stopping the world.
   - (5) Malfoy never hexes Hermione again and says *please*.
   - Clause the last (Draconia): "Humiliation of R. Gantasala is the sole and exclusive privilege of D. Malfoy."
   - Clause the last but one (Hermione): "D. Malfoy will say it back. Out loud. By Christmas."
   - Hermione also noted in the margin that the missed Saturday is a day owed (Weaver D63).
2. **Hermione's power clauses** (S10). "You don't use it on me without asking. You don't use it in front of anyone else, ever." He must tell her in advance wherever he moves Draconia. He owes her one "clause-break", which she "*will* collect".
3. **Draconia's terms for "anything"** (S8).
   - Stand on the Gryffindor table at breakfast and say he belongs to Draconia Malfoy. Missed on D62, so "He owes me one", and by S11 "*two* declarations… or you'll owe me three".
   - At Christmas, come to Malfoy Manor and tell Lucius so over dinner, and eat the fish course properly.
   - Draconia's own clause: Roopesh is never to deal with her father ("If anyone deals with Father, it's me. That's a clause", S10).
4. **Draconia's Rules** (S19).
   - (1) She goes first, always.
   - (2) Nothing below the collar unless she says so.
   - (3) Nobody tells Granger.
   - (4) She supervises Hermione's turn.
   - (5) "Nobody takes him anywhere with a bed in it without telling the other two first. *In writing*."
   - Hermione's addition: two hours at most, or the others get "*Compensation*".
5. **Narcissa's escort arrangement** (S3). He walks Draconia beyond the gates, never after dark, and never down the Shack lane. Draconia writes to her mother every Sunday. Narcissa again in S11: "Back inside the gates before dark."
6. **McGonagall's terms** (S13). "You do not go to Hogsmeade alone. You do not go *anywhere* off the grounds without telling me first." Every Ministry "good morning" is to be reported within the hour. No more performances "for any young woman". She will not hide it if he harms anyone. In return she will cover "controlled falling" and the Patronus.
7. **The life debt.** Lucius: "It simply waits for a better price" (S3). Draconia: "Your life… It's already mine… it's in the ledger" (S11). Narcissa: "I shall hold you to that."

**Secrets, and exactly who knows**

| Secret | Who knows | Who suspects |
|---|---|---|
| He stops time and folds space | Dumbledore (from Bangalore; told in S3 and S7); Draconia (the train, S6, S7); Hermione (S6, S10); McGonagall (S13); Harry (saw it at S17, unspoken) | Pansy ("Nobody is that fast", S2; "Don't do that in *here*", S7); Ron (saw the duplicate, thinks it "wandless counter-magic"); Snape; Selwyn; Vane (knew of the Shack; Roopesh drew a memory out of him); Penhallow; Voldemort ("You came such a long way", S7) |
| Roopesh told McGonagall that nobody else knows ("That's about it", S13) | Roopesh | McGonagall (her look to Dumbledore "asked a whole question") |
| Pansy was the train informer | Pansy, Draconia, Roopesh, Crabbe and Goyle (S18, said on the road) | – |
| He teleported the sleeping Draconia, twice (S9, S10) | Roopesh, Hermione | Draconia ("whatever you did… I'll *know*") |
| Draconia's unsent letter "*Regarding the Gantasala boy*", scored through twice, which he moved to her desk drawer (S10) | Roopesh, Hermione | Draconia does not know it was moved |
| The diary page "*No Selwyn. Not even if Father takes everything else.*" (S18) | Pansy, Roopesh, Draconia | – |
| Narcissa's letter and the receipt for the chain | Narcissa, Draconia, Roopesh, Pansy, Crabbe and Goyle | Lucius "has not seen this letter, and he will not" |
| Pansy's hour and the inn | The three of them; Hermione since S19, against Rule 3 | The school, through Goyle's "bookshop" story |

**Debts and promises with deadlines**

| Debt or promise | Status |
|---|---|
| Draconia says "I love you" by Christmas (D116) | Open |
| Christmas dinner at the Manor, Wednesday 25 December (D116) | Open |
| Declarations owed to Draconia | Two or three, unpaid |
| Hermione's missed Saturday (D63) | A day owed |
| The clause-break Hermione will collect (S10) | Open |
| Roopesh promised Hermione to tell her before facing Lucius at the gates (S10, "i promise") | Broken in S11; Hermione's note said "Find me before you face him. You promised." |
| Selwyn owes Roopesh his life (S12) | Open |
| Vane's hearing, Wednesday 20 November (D81) | Pending |
| Pansy's price, one hour alone | Paid, in S19 |

**Threats.**
- **Voldemort knows about him and is angry.** Dumbledore: "someone very angry who has just discovered… that he is not the only one… who can hold on" (S7).
- **The black-wax writer**, "an old friend of her family", is unknown and wrote "You have kept us waiting since July" (S7).
- **A second leash-holder is inside the castle.** That person walked the ninth dementor up the Astronomy stair (Weaver D74) and still controls something.
- **The Selwyns.** Their kennelman Thrale bought the chain; Selwyn's Friday parcel "clinks. Small, like links"; the Ouroboros dinner is planned.
- **Lucius's complaint**, asking that Roopesh be "*examined*".
- **Vane's solicitor** is challenging the memory evidence, and the Wizengamot "will ask how a memory came to be drawn so completely, and by whom" (S17).
- **Right now:** frost is coming up "the *inside* of the landing window", it is dark, and they are outside the gates (end of S19).

### 2.3 Beliefs that differ from the truth, and suspicions

- **Draconia** thinks she somehow got back to her own bed. In fact he teleported her (S10).
- **Hermione** believed "She was there and she doesn't know." Draconia had known since September (S6); Hermione "filed that too".
- **McGonagall** half-believes only she and Dumbledore know. Draconia, Hermione and Harry do too.
- **Harry and Ron** were left with "wandless counter-magic" (S7). Harry saw everything at S17 and chose not to ask. Ron still thinks it is magic.
- **Draconia's claimed past.** She said "Jean… In France", "several summers" and a yacht called "*Sylphide*". All invented. Hermione told Roopesh "There was no yacht" (S10). He still sulked by the pond (S11) until "You're not handsome. You're *worse*."
- **Draconia on Lucius.** She says he "doesn't *care*, he *invests*." Roopesh thinks he cares. Hermione thinks "*Liar*" of Draconia.
- **Hermione** believes in clause 1 ("nobody second"). Draconia's "Rule one" says she goes first.
- **The school** thinks Roopesh is a gifted Charms student: "kept feeding" Glacius plus a "Warming Charm" (S9), "controlled falling" (S13). Dean and Flitwick are doubtful.
- **Goyle's cover** was "we were at the bookshop" (S19). Hermione saw the bite.
- **Selwyn** says Lucius "never said your name in his life" (S12), which is false, since Lucius said "Mr Gantasala" in S3. He also tells Slytherin that Draconia attacked him over an absent Gryffindor (Weaver).
- **Vane** called his facility "sanctioned"; the Ministry calls the ten dementors "a paperwork mistake" (S12).
- **Penhallow** suspects Roopesh is either "the best witness I've ever had, or the old man wrote you a crib sheet" (S16).

### 2.4 Relationships between other characters

- **Draconia and Hermione.** War with growing intimacy.
  - They shared his bed in S8 and S10, fingers "tangled together on the coverlet, ink and silver ring" (S8).
  - Hermione rested her hand over Draconia's cold knuckles and tucked her hair back. She found "no triumph" in Draconia's lies (S10).
  - Each saw the other recognise the time-stop: "hated each other with perfect, silent understanding" (S7).
  - Off the page: the library wand-draw that made Hermione cry (D61), the corridor hex fight (D73), and together they pulled Neville back on the Astronomy stair (D74).
  - In S19 Draconia supervises Hermione ("Breathe, Granger") and they co-write Rules 4–5. Both shout "*Nobody asked you!*" at Pansy's keyhole at the same moment.
- **Draconia and Pansy.** Friends "since we were six". Pansy is her lieutenant and a betrayer: the train information, the diary page, and the hour while Draconia slept ("You waited until I was *asleep*"). Draconia pinches her "the way she had been doing it since nursery" and keeps her where she can see her.
- **Hermione and Pansy.** Hostile: "You were in his *trunk*… I've got it in writing" (S19).
- **Draconia and Lucius.** Open defiance. She refuses Selwyn and dares him to cancel the brooms; she says he looked disappointed she survived. Lucius's half-apology: "Higgs flies very badly in rain" (S11).
- **Draconia and Narcissa.** Narcissa protects her and has blessed the match ("Keep the boy close, darling"). Draconia's reply: "we are keeping close" (S18).
- **Narcissa and Lucius.** She outranks him in practice: "You've *paid* for nothing, so you've agreed to nothing" (S3); "Your word, Lucius. Hear her first" (Weaver).
- **The Malfoys and the Selwyns.** The fathers have written since July (S5). Lucius wants "Selwyn's house. Not the boy" (S10). Amelia Selwyn had the east rooms aired (S11).
- **Draconia and Selwyn.** She refuses him. He slurs Roopesh and she hexes his glass: "His name is Roopesh" (Weaver D72).
- **Draconia and Daphne.** Two hexes; Daphne mocks the "Mudblood's knot" (S11) and has taken her chair.
- **Harry and Ron.** Harry shields Ron and keeps the impossible magic from him (Weaver D71). Ron's Sickle bet comes in.
- **Pansy and Odile.** Pansy refuses to arrange introductions and gave Odile's orders to McGonagall.
- **McGonagall and Dumbledore.** "You knew. Since *September*." She covers for him; Dumbledore says "It was not my secret to tell."

### 2.5 Open loops

| Loop | Raised |
|---|---|
| Who sent the black-wax letters (a crestless seal "just a mark pressed in it", S4), and who is the "old friend of her family" | S4, S6, S7 |
| The Shack meeting with "Five chairs". Never held; the cellar the Director planned was never shown | S7 |
| Voldemort's awareness of Roopesh after the loop, and his fury | S7 |
| Who holds the second leash, and where the dressed-stone stair from Vane's room comes out inside the castle | S17, Weaver D74 |
| Who ordered the Graphorn charge; Thrale; the sworn statement from the dealer | S11, S18 |
| Selwyn's Friday parcel and the man in the felt hat with a Selwyn ring turned inward | S18 |
| Penhallow's counter-seal: "I can read it. I'm not going to say it" | S16 |
| Lucius's "examined" complaint; the inquiry he demanded | S12, S13 |
| Vane's hearing; how the memory crystal will be explained | S17 |
| Hermione's breakfast plan to ask Draconia about the "Regarding the Gantasala boy" letter, which never happened | S10 |
| Hermione still holds Draconia's first ribbon ("Evidence") | S2 |
| Pansy's two unread warnings in his Charms book ("Selwyn was in the dark corridor…") | Weaver D60, D61 |
| The cold presence: blue candles and frost in the entrance hall (S5), the suite window (S8), the inn landing (S19) | S5, S8, S19 |
| Snape's suspicion; Selwyn's "My father will be *fascinated*" | S5, S7, S12 |
| Roopesh broke McGonagall's terms (Hogsmeade, off the grounds, past dark) and Narcissa's (back before dark) | S18, S19 |
| Hermione was not told about the power at the cliff (S17) or the duplicate at the pitch beforehand (S12) | S12, S17 |
| His job at Dervish and Banges (S1, S3). Draconia told him to give up Saturdays; never resolved | S1, S3 |
| Duel with Selwyn deferred: "I do expect he will be the one doing it" | S15 |
| Christmas: Hermione's own plan for "which night" versus the Manor dinner | S19 |
| Planned by the Director but not yet shown: Corisande Vyse, the Ouroboros blood bowl, the Selwyn-chained beast at the Forest edge | Plan 7 |
| The Philosopher's Stone (Quirrell released the troll; Snape went to the third floor) | Weaver D61 |

### 2.6 People, places and objects invented on the page

These are not in the Story File's people list or world.

| Invented | First appears | Kept? |
|---|---|---|
| Mortimer Vane | Director, Plan 1; on page S13 | K: a Person, with a Life, a Bond and known |
| Odile Parkinson | Director, Plan 2 | K: Person and Life; never on page |
| Silas Penhallow | Director, Plan 3; on page S16 | K |
| Corisande Vyse | Director, Plan 7 | K as a Person; not yet on page |
| Mordecai Thrale, the Selwyn beast-keeper at Merrow Hall | S18 (Narcissa's letter) | G: in a Thread and a world fact; not a Person; the Moment that held the letter was dropped by the quote check |
| Amelia Selwyn (Evander's mother), Cyrus Greengrass, Evander's grandfather | S11, S18 | L |
| Higgs (Slytherin reserve Seeker) | S11 | L |
| Pansy's uncle in the Dementor Liaison Office, later an aunt in Magical Law Enforcement | S12, S13 | L, and inconsistent |
| The man in the felt hat with a Selwyn ring | S18 | G: in `on` until 13:30, then filtered out of every prompt |
| Madam Primpernelle of Gladrags | S18 | L |
| "Jean" and the yacht *Sylphide* (Draconia's lies) | S10 | L |
| The secret Gryffindor suite (Dumbledore's reward) | S7 (player) | K: named in Scene paragraphs and Lives |
| The cliff boathouse, bay nine, the dementor chamber, Vane's tea room, the stair into the castle | S17 | K for the facility; L for the stair |
| The Hogsmeade inn room | S18–19 | G: "Three Broomsticks' back stairs" against "The Hog's Head's annexe" |
| Merrow Hall, Selwyn House | S18, S12 | L |
| Dumbledore's Bangalore letter | S4 | K, in the Writer's week 1 only |
| Ribbon #1, in Hermione's pocket | S2 | L |
| Ribbon #2, on Roopesh's wrist, the "lease" | S8 | K; provenance garbled (Paris or grandmother's) |
| The contract parchment | S8 | G: clauses partly kept |
| Draconia's green-wax letter to Lucius | S10 | K as a Moment (m10.2); L in prompts |
| The diary page | Weaver D71, S18 | K for the Writer |
| Narcissa's letter and receipt | S18 | G |
| The Ministry key ring, the memory crystal, Form D-Nine | S13, S17 | K for keys and crystal (Weaver); Form L |
| Harry's library book (Penhallow kept it, "Due back Friday") | S16 | L |
| The 1903 Shack survey with its cellar and loose board | S7 | L |
| *Lune de Minuit* perfume; Pansy's Parkinson-crest wrist clasp | S4 | L |
| Selwyn's wand | S5, S12 | G: two descriptions |

### 2.7 Motifs, names, rituals, firsts and keepsakes

- **Names.**
  - "Stray" is Draconia's name for him from S1.
  - "Connie" enrages Draconia; Pansy uses it.
  - "Roo" is used by Harry and Hermione, and by Pansy from S19.
  - "Roopesh" in full from Draconia: first at the S10 climax, then "His name is Roopesh" to Selwyn (Weaver).
  - "Mudblood": the word she said on the train. Draconia polices it: S3 "Nobody uses that word about him"; S8 she stops herself mid-word; S11 "I won't stop at *eels*".
- **Draconia's ledger talk.** "accounting" (S1), debts, "ledger", "acknowledgement" not thanks, "*Taken*". "I'm not jealous, I don't share" recurs with variants: "I'm *thorough* / *organised* / *accurate*".
- **Hermione's counting.** Kisses, minutes (seven, then nine), "four o's", "Twenty days" (S2). Her "Clause…" citations.
- **Recurring props.** The mended left cuff: Draconia tore the stitches in S7, and the last ones gave in S11. The steel watch. The "kettle" noise. Ears flushing. Fred and George's betting book. Dumbledore's lemon and sherbet drops. Narcissa's "excellent records".
- **Saturdays.**
  - Hermione's by clause 2.
  - Hogsmeade's by routine.
  - The escort's by Narcissa's arrangement: Saturdays in the record, but the Chronicler started it on Day 13, a Friday. The Weaver and S18 then made the escort a Friday thing.
- **Rituals.** Draconia's Sunday letters to her mother. Draconia tying or adjusting his collar ("Nobody else touches your collar", S19). Being carried bridal-style: Draconia in S1, S12 and S15; Pansy in S4; Hermione in S7.
- **Firsts.**
  - First kiss with Hermione (S6, "Sealed. Signed. Witnessed.").
  - First kisses with Draconia: S6 ("a seizure of property"), and the first in public through the duplicate (S7).
  - Pansy: a cheek kiss (S4), her kiss under his jaw (S5), and the first on the mouth (S19).
  - First "I love you", to both (S8).
  - First nights together: the threesome (S8→S9 Move), Hermione and Draconia (S10), Pansy (S19).
  - Roopesh first wept (S15). First dragon Patronus (S12). Harry's first match (S12).
- **Keepsakes.** Ribbon #1 in Hermione's pocket. Ribbon #2 on his wrist. The contract in Hermione's satchel. The diary page in Charms chapter nine. Narcissa's letter "over her heart". The green robes. Pansy holding his scarf (S19).

---

## 3. What the system kept

### How the records reach the agents

Read from `actor.ts`, `lens.ts` and `reducer.ts`.

**The Actor gets:**
- Each present person's Story File profile, unchanged since import.
- Their Life.
- "Knows of late": the last 6 facts that person is in `knownTo`.
- `lived`: only `storySoFar.scenes` (Scene paragraphs) that a present person was in. It never gets weeks or chapters.
- `between`: the latest Bond standing plus the last 3 turns.
- `remembered`: 5 Moments ranked by 3 × (present knowers) + weight + scene/1000.
- `lately`: the last 6 world facts known to someone present.
- Taste, `in_play`, and the Scene text.
- **No calendar and no Threads.**

**The Writer gets:**
- The static Story File.
- Weeks and Scene paragraphs.
- `cast_now` (Life, Bond, known for the Leads and anyone present).
- Threads.
- The last 14 world facts.
- The same 5 Moments.
- The calendar, including only those "on" items whose time has not yet passed.
- The plan's `long_run`.

**Limits that matter:**
- At most 5 Moments per Scene (`raw.moments.slice(0, 5)`).
- The quote check drops a Moment whose quotes cite the wrong passage, or whose Reply says what Roopesh did without his Move.
- `known` and Bond `standing` keep only the latest line.
- The Folder replaced S1–4 and S5–11 with two "weeks".

### Item by item

Columns: the State at entry 1261 / the latest Actor prompt (Draconia and Hermione present) / the latest Writer prompt. "n/a" means the person is not in the Scene and the agent would not need it now.

| # | Item (Scene) | State | Actor | Writer | Evidence |
|---|---|---|---|---|---|
| 1 | Hermione and Roopesh are lovers, three times (S8→9, S10, S19) | **G** | **L** | **L** | No Moment records it. m8.2 stops at "both answer yes". Chronicle 10 said "gave him her first time", which contradicts the S8→9 Move, and that paragraph was folded into a week that omits it. Searching both prompts outside the Scene text: "sex" 0, "first time" only "He wept for the first time". |
| 2 | Draconia and Roopesh are lovers (S10, S19) | **G** | **L** | **L** | m10.3 "then takes her; she cries his real name" (w3). Score 9.01 loses to five w5 Moments scoring 11.x, so it never reaches `remembered`. |
| 3 | "I love you" said to both (S8, S10) | **K** | **K** | **K** | m8.1 (w5, both present) is the top `remembered` item and is `in_play`. |
| 4 | Hermione knows his power and swore secrecy (S6, S10) | **K** (m6.1, m6.2, m10.1) | **L** | **K** | The Actor's profile still says she "wants a reason, not circumstances". The only hint is her Life: "Keeping the Ministry away from Roopesh's secret". Writer: Thread "Hermione and Draconia recognised the time distortion" and `long_run` "McGonagall, Dumbledore, Draconia, Hermione and Harry know some of it". |
| 5 | Draconia knows his power (the train) | **K** | **K** (Story File) | **K** | The Story File profile carries it. |
| 6 | Who knows, in full (§2.2 table) | **G** | **L** | **G** | The Thread "What happened on the train" still says Harry and Ron "were left with the explanation of counter-magic", stale since S17. The Actor's Draconia profile says "Only she, Dumbledore and her parents know it was him". Ron, Pansy, Snape and Selwyn as suspects are scattered or missing. |
| 7 | His lie to McGonagall ("That's about it", S13) | **L** | **L** | **L** | Not in Chronicle 13, its Moments or McGonagall's Bond. |
| 8 | The contract: clauses 1, 2 and the two "last" clauses | **K** (m8.3) | **G** | **G** | Writer: the week text lists "nobody second, Saturdays hers", humiliation, and "say it back by Christmas". Actor: only "clause two" and "clause three/four" by number, in `lived` and `between`. |
| 9 | The contract: clause 3 (library), 4 (no secrets, warn before stopping time), 5 (no hex, please) | **L** | **L** | **L** | Chronicle 8 kept "no more secrets" in its paragraph and in known; both were folded or overwritten. |
| 10 | Hermione's power clauses and the owed clause-break (S10) | **G** (m10.1 "draws up new clauses") | **L** | **L** | – |
| 11 | Draconia's breakfast declaration, owed two or three times | **G** (an Engagement now past; world fact h355a9920) | **L** | **L** | Past Engagements are filtered out; the "owed" count is nowhere. |
| 12 | Christmas at the Manor, telling Lucius (D116) | **K** (calendar g-690ad0a2) | **L** | **K** (E2) | The Actor gets no calendar. |
| 13 | "Say it back by Christmas" | **K** (m8.3) | **L** | **K** (week text) | – |
| 14 | Draconia's Rules 1–5 (S19) | – (Scene open) | **K** (Scene text) | **K** (Scene text) | Will depend entirely on the S19 chronicle. |
| 15 | Narcissa's escort terms (never after dark; Sunday letters) | **G** | **L** | **G** | Calendar E1 reads "Friday 22 November… every week… Saturdays to and from Hogsmeade, never after dark". |
| 16 | McGonagall's terms (no Hogsmeade alone, nothing off the grounds) | **K** (m13.5) | **L** | **L** | Both were broken in S18–19 with no mention. |
| 17 | Life debt; "waits for a better price" | **K** | **G** ("owes him a life debt" only) | **K** (week 1) | – |
| 18 | "my life" to Narcissa; "I shall hold you to that" | **K** (m11.3) | **L** | **K** (week 2) | – |
| 19 | Promise to warn Hermione before Lucius, and breaking it | **L** | **L** | **L** | Only the Weaver's note hd8f68c48 ("You promised") survives, buried among world facts. |
| 20 | Brooms and Seeker's place lost (S11) | **K** (m11.2) | **L**, and wrong | **G** | The Actor's Draconia profile still says she "wants the Slytherin Seeker's place her father is buying brooms for". Lucius's Life says "*threatening* to cancel". |
| 21 | Lucius "looked *disappointed*" that she survived (S10) | **L** | **L** | **L** | m10.4 kept "Selwyn's house"; "disappointed" was dropped. |
| 22 | Lucius's complaint asking that he be "examined" | **G** | **L** | **G** | S13 paragraph: "Lucius Malfoy's written complaint"; the word "examined" is gone. |
| 23 | Narcissa's letter: Thrale, the receipt, "meet him properly", Lucius kept out | **G** | **G** | **G** | Thrale and the receipt are kept in a Thread and the S18 paragraph. The Moment was dropped by the quote check ("none of its words are on the page"). "meet him properly" is in neither prompt. |
| 24 | "Say nothing to the Selwyns. Not a word about the wedding" | **L** | **L** | **L** | – |
| 25 | Pansy was the train informer | **G** | **G** | **G** | Pansy's known: "confessed the train plot". It reads as if she merely confessed something. Dumbledore's S3 "somebody close enough to hear her make her plans" is never linked to it. |
| 26 | The diary page and Pansy's price | **K** | **L** (Pansy absent) | **K** | Writer `lately`, fact hcdde7c36, with the quote. |
| 27 | Draconia does not know she was teleported | **G** (m10.1) | **L** | **L** | – |
| 28 | The unsent "Regarding the Gantasala boy" letter | **K** (m10.2) | **L** | **L** | Never followed up. |
| 29 | Voldemort aware and furious after the loop (S7) | **G** | **L** | **L** | The quote "He's watching now, you know" was dropped by the check. m7.5 keeps "a distant scream of pure hatred" but no prompt names Voldemort as aware of Roopesh. Week 2 says only "Yaxley, an Animagus, was caught." |
| 30 | Second leash-holder; ninth dementor at Astronomy | **K** | **K** (`lately`) | **K** | Weaver facts and Threads. |
| 31 | The stair from the cliff into the castle | **G** ("both approaches") | **L** | **L** | – |
| 32 | Selwyn's Friday parcel and the felt-hat man | **G** (`on`) | **L** | **L** | The `on` item at 13:30 is filtered once the clock passed; the S19 exit line still says "Selwyn's half-past-one parcel". |
| 33 | Penhallow's counter-seal | **L** | **L** | **L** | – |
| 34 | Selwyn: "*Useless*"; "My father will be *fascinated*" | **K** (Selwyn's known and Bond) | n/a | **L** | Selwyn appears in `cast_now` only as a one-line Life under "Nearby". |
| 35 | Snape's suspicion | **G** (Bond S5 only) | n/a | **L** | – |
| 36 | Harry: Seeker, mate, saw the power | **K** (Bond "Brothers now… saw his power work") | n/a | **K** | – |
| 37 | Draconia–Hermione intimacy (shared bed, hands, joint care for Neville) | **G** (world facts only) | **L** | **L** | Bonds hold only Roopesh-to-person lines by design. |
| 38 | Draconia's lies (Jean, the yacht) and the reconciliation ("You're *worse*") | **G** (m11.5) | **L** | **L** | – |
| 39 | Ribbon #1 in Hermione's pocket (S2) | **L** | **L** | **L** | Only in Chronicle 2, now folded; Lives at D7 later overwritten. |
| 40 | Ribbon #2, the lease on his wrist | **K** | **K** | **K** | Bond standing, known, `lived` S14 and S18. |
| 41 | First kisses (Hermione S6, Draconia S6/S7) | **G** (m7.1 duplicate kiss only) | **L** | **L** | – |
| 42 | "Stray", "Connie", "Roo" | **K** | **K** | **K** | Story File voice and aliases. |
| 43 | Saturdays as Hermione's | **K** | **G** ("her Saturday", "clause two") | **K** | – |
| 44 | Dervish and Banges job | **G** (m1.1) | **L** | **L** | – |
| 45 | Vane's hearing (D81) and the challenge to the memory | **K** (Vane's Life) | n/a | **K** (`long_run`) | – |
| 46 | Odile; Corisande | **K** | n/a | **K** (`cast_now`, nearby) | – |
| 47 | The off-screen corridor hex fight (Hermione hexed Draconia scarlet) | **K** | **K** | **K** | One of the World's facts the Actor did get. |
| 48 | The cold presence (S5, S8, S19) | **L** | **L** | **L** | Never made a Thread. |

**Tally of the 48 items.**

| | Kept | Garbled | Lost | Open or n/a |
|---|---|---|---|---|
| State | 21 | 18 | 8 | 1 (Scene open) |
| Actor (latest prompt) | 7 | 5 | 31 | 5 (n/a) |
| Writer (latest prompt) | 17 | 7 | 24 | 0 |

What went in: the World's most recent off-screen incidents, 5 old high-weight Moments, recent Scene paragraphs, and the ribbon.

What did not:
- The couple's sexual history.
- Who knows the secret.
- The exact terms of every agreement.
- Every promise with a deadline (the Actor has no calendar).
- Anything Voldemort-related.
- Most of S5–11, which the Actor sees only through 5 Moments and the Writer only through a JSON string (see §5).

**What worked.** The Weaver's off-screen facts did reach later Replies and were used correctly:
- S7: Draconia's "Fifty points… detention with Flitwick" matches the Weaver's Charms incident.
- S12: "don't think I've forgotten eight o'clock… and I was asleep" matches the missed declaration.
- S18: Pansy "followed her out of the common room on Monday", and "Granger's handiwork" (the scarlet hair).

Recent, World-sourced facts travel well. Old, page-sourced facts about the relationship do not.

---

## 4. Contradictions and forgetting already in the Replies

1. **Hermione written as a virgin a week after her first night.**
   - Kept Reply 1260: "I was going to wait until Christmas… I'd worked out which night."
   - Kept Reply 1263, Draconia: "you've only ever read about it, I'll correct you."
   - Abandoned Reply 1266: "I've waited since *August*". The player redid it: "maybe you forgot but this is not mine and hermoine first time rather the third time".
   - Abandoned Reply 1269 overcorrected with Draconia: "*Last time?*… This is the *third*". The player redid again: "the last time when i fucked hermoine it was along with draconia, draconia wouldn't be surprised".
   - The kept Reply 1272 still writes Hermione as "terribly clumsy… the way she went at the first question on an exam" and has Draconia ask about the contraceptive charm, "Who taught *you* that?"
   - Against S10, where Hermione says "Not before tonight" and casts that charm herself.
   - The Writer's lesson from the first Redo ("Track the history: Hermione and Roopesh have been together before… never write her as a first-timer") went into a Beat Note on the abandoned branch (entry 1268), so the current Path never received it.
2. **Midnight came, then the clock went back.** S8: "Midnight came quietly… 'It's twelve. It's *over*.'" S9 (22:30) has Harry: "The letter said midnight… Twenty to eleven." S10: "It was eleven at night."
3. **The month.** S2, Hermione: "Halloween… is on the thirty-first. Of October. It's the *eleventh*." Filch: "*Fog.* In *October*." The Calendar makes it Friday 6 September, and S6 has "Twenty days, I said, back in September." S19, Hermione to Pansy: "You were in his *trunk* in October." The trunk was searched on Saturday 7 September.
4. **Which letter.** S10: "The black-wax letter… where Draconia had flung it down three hours earlier, the one she had found in her own bed." That letter came two days earlier (S6, D59). Tonight's letter was on Roopesh's pillow (S7).
5. **The ribbon's origin.** S11: Narcissa sees "a ribbon she had bought in Paris last spring". S12, Draconia: "it's *silk*, it was my *grandmother's*." Also, S11 ends with the ribbon wound round Draconia's own fist, yet S12 opens with it back on his wrist and no one tying it.
6. **Selwyn's wand.** S5: "pale ash with a gold cap". S12: "black, long, with a silver cap worn bright".
7. **Pansy's Ministry relative.** S12: "My uncle's in the Dementor Liaison Office." S13, McGonagall: Pansy has "an aunt in Magical Law Enforcement".
8. **The Shack attack's weather and hour.** S13, Dumbledore: Crabbe and Goyle "face down in the snow… that afternoon." S1–2 happened at 22:30 in early September, in frost and burning heather.
9. **When Yaxley was released.** S13, Dumbledore: "Last week Corban Yaxley… was released." S16, Penhallow: "Yaxley walked out of Ministry custody last night." Penhallow's "Thursday night… Friday night… Saturday morning… Same week" squeezes nine days (D61–D70) into three.
10. **Vane's props.** S13: Vane "opened it to a clean page, though he held no quill". The page stayed "white". S15, Roopesh's retelling: "the grey bowler… and the little silver quill that had written without being held."
11. **The day of Penhallow's visit.** S17: "Harry had heard the name Vane on Thursday night, in Penhallow's mouth." The visit was Saturday night (S16, D70).
12. **How many dementors.** S17: "a dozen at least, maybe more in the dark corners" plus one in the slip. The World: "recovered eight dementors… the ninth collar" (h10d2f915).
13. **The leash and the chain.** S18, Draconia: "*Selwyn's* kennelman. On a *Graphorn chain.* On the Astronomy stairs, with Longbottom's collar in my hand." The Astronomy dementor came on "a thread of light", not the Graphorn chain.
14. **The contract's clauses drift.**
    - S12: "clause four… nothing in public without telling me first". This is close to S8's clause 4.
    - S15: "Clause three. No more secrets", and Draconia: "Clause four is about him *splitting*."
    - S19: "Clause one… says nobody takes him off on her own without notice to the other signatory." S8's clause 1 was "nobody is second".
15. **The World against the page on the skipped month.**
    - The player asked to "skip a month… have draconia pansy and hermoine feelings for me triple".
    - The Weaver wrote seven weeks of Roopesh never turning up: Draconia waiting at the gates on Days 13, 20, 27, 34, 41, 48 and 55, and "a place for Roopesh at every meal for seven weeks… refused it by his absence".
    - S5's Reply implies daily contact ("the badly mended robes she had mocked every day for a month").
    - Later the Weaver logged "Roopesh did not come" again on D61, D63, D69 and D72.
16. **Two letters for one.** The Weaver: Draconia's letter to *Narcissa* refusing the Selwyns, "left unsent beside her clothes" (h9e2632f0). S10's Reply: a green-wax envelope to "*Lucius Malfoy, Esquire… Not to be opened by Mother*". Both stand, and neither is reconciled.
17. **Two hexes on Daphne in two days.** S11, Lucius: "her hair turned to *eels*… Wednesday night" (D60). The Weaver: "purple boils" in Charms on Thursday (D61). Probably one incident told two ways.
18. **Where the inn is.** S19, Hermione: "come out of the *Three Broomsticks' back stairs*." Pansy: "The Hog's Head's annexe."
19. **Promises forgotten, not contradicted.**
    - S18–19 break McGonagall's "You do not go to Hogsmeade alone… without telling me first" and Narcissa's "Back inside the gates before dark". Only Pansy notices ("It's dark").
    - Hermione never raises the broken promise about Lucius at the gates.
    - Draconia stops collecting her declarations after S11.
20. **Derived record errors.** These are not Replies, but they feed the next ones.
    - Chronicle 14: "A month after the troll". It was nine days.
    - Lucius's Life: "*threatening* to cancel the seven Nimbuses". He cancelled them.
    - The Thread on the train: Harry "left with the explanation of counter-magic". Out of date after S17.

---

## 5. The ten worst continuity failures, worst first

1. **The intimate history is not remembered, and the fix was lost.**
   - The S8→S9 Move ("i fuck both hermoine and draconia thoroughly") was never chronicled.
   - Chronicle 10 recorded S10 as Hermione's "first time", against that Move.
   - The 5-Moment cap and the weight-first recall ranking kept every sex Moment out of the prompts.
   - The fold then erased the S10 paragraph, and the Actor never sees weeks anyway.
   - Result: two Redos in S19. The Writer's corrective Taste line died on the abandoned branch, and the kept Reply still half-treats Hermione as a first-timer.
2. **The fold destroyed the middle of the Story.**
   - The second fold is a raw JSON string: `{"story_so_far": "Roopesh saved Draconia…"}`. It compresses S5–S11, about 70k tokens of play, into about 220 tokens (865 chars).
   - It omits: Hermione's first kiss and her learning the secret; the troll; the duplicate; Voldemort through Yaxley; the suite; every night together; the Graphorn; Lucius's "disappointed"; the green-wax letter; Hermione's clauses.
   - The Actor is never given weeks, so for the Actor S1–S11 now exist only as 5 recalled Moments.
3. **"Who knows the secret" is not state.**
   - The Actor plays Hermione from a profile that says she "wants a reason, not circumstances", and Draconia from one that says "Only she, Dumbledore and her parents know".
   - The Thread is stale on Harry.
   - Roopesh's lie to McGonagall and Draconia's not knowing about the teleports are nowhere.
   - Suspicion from Pansy, Snape, Selwyn, Vane and Voldemort is not tracked.
   - The premise turns on this secret ("when it comes out, it is because the player chose it"), so this is a structural gap.
4. **Agreements lose their terms.**
   - Only clauses 1, 2 and the two "last" clauses of the contract survive, and only for the Writer.
   - The Replies renumber the clauses three different ways (S12, S15, S19).
   - Hermione's power clauses, McGonagall's terms and Narcissa's "before dark" all fail to reach the prompts, and S18–19 break them silently.
   - Draconia's Rules 1–5 exist only in the open Scene.
5. **Promises with deadlines are invisible to the Actor.**
   - The Actor gets no calendar.
   - "Say it back by Christmas", the Manor dinner, the owed declarations, Hermione's owed Saturday, the clause-break she will collect, and the promise about Lucius at the gates are all unknown to it.
   - Past Engagements simply vanish, so a debt that was *missed* stops existing.
6. **The World writes an alternate history and the system treats it as truth.**
   - The Weaver turned the player's "skip a month, feelings triple" into seven weeks of no-shows. Its later facts keep saying "Roopesh did not come".
   - It created major relationship events off the page: Hermione hexing Draconia scarlet; Draconia losing her chair and her circle; the Astronomy dementor.
   - Its Draconia letter differs from the Actor's.
   - These World facts dominate "Knows of late" and `lately` because they are the most recent.
7. **Story time is unreliable.**
   - "It's the *eleventh*. Of October" on 6 September.
   - Midnight narrated at 21:08, then 22:30.
   - The weekly "Saturday" escort scheduled on Fridays.
   - "Snow… that afternoon" for a September night.
   - "Last week" against "last night".
   - "Thursday night" for a Saturday.
   - "A month after the troll" for nine days.
8. **Keepsakes and objects lose provenance and place.**
   - Ribbon #1 in Hermione's pocket is gone.
   - Ribbon #2 is "bought in Paris" or "my grandmother's".
   - Selwyn's wand has two descriptions.
   - The green-wax letter in Draconia's drawer, Pansy's two unread warnings, the 1903 survey and Harry's library book have all dropped out.
   - None of these objects has a record of its own.
9. **"Latest line wins" erases what defines a relationship, and other people's relationships are never recorded.**
   - `known` and Bond `standing` are overwritten each Scene. Hermione's (S15) and Draconia's (S18) no longer mention the secret, the nights, "I love you" or the cost Draconia paid.
   - The Actor sees only the last 3 turns.
   - Draconia–Hermione, Draconia–Pansy and Pansy-as-train-informer have no record at all, beyond scattered World facts.
10. **Threats drop out of the prompts.**
    - Voldemort's awareness ("He's watching now" was dropped by the quote check).
    - Penhallow's counter-seal.
    - Selwyn's parcel and the felt-hat man, filtered once 13:30 passed.
    - The stair into the castle.
    - Snape's suspicion; Selwyn's "My father will be *fascinated*".
    - The recurring cold presence, which arrives again at the end of S19 with no record that it has happened twice before.
    - Actor-invented people (Thrale, Amelia Selwyn, the felt-hat man, Pansy's uncle or aunt) never become Persons, so they drift or vanish.
