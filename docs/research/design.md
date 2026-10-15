# The Story's mind: design decisions

Built question by question with the player, from the goal (docs/goal.md), the research (memory.md, hce.md) and the
audit of The Malfoy Problem (malfoy-memory-audit.md). No backwards compatibility. Terms are in CONTEXT.md.

## Decided

1. **The Actor writes as a novelist** (docs/adr/0017). It is shown everything about the people present, with what each
   knows, believes and does not know stated plainly; leaks are caught by the Editor, not prevented by hiding.
2. **Direction is an Outline, reconsidered after every Scene**, never after every exchange. Within a Scene the Writer
   improvises the moment inside it. The Outline follows wherever the player takes the Story.
3. **The Outline is woven from Lives.** Everyone who matters has a Life of their own, lived for its own sake: who they
   are now, what they want this Act, how they feel about the people around them, where they are heading. The Player
   Character's story is where Lives cross his; the Director arranges the crossings.
4. **Lives come in tiers by relevance**, worked out from play (time with him, how the Bond moved, mentions) and
   promotable by the Director:
   - Close (the Leads and whoever he has grown close to): a full Life, recomputed after each Scene they were in or
     affected by.
   - Movers (who drive the World: Dumbledore, Lucius, Quirrell, Snape, Selwyn, Narcissa): a full Life focused on what
     they pursue, recomputed when the Director plans and when their plot moves.
   - Everyone else: a line or their Group, until something touches them. Anyone can rise.
5. **Agents can look things up** (docs/adr/0018): search and read the Story, and research on the web, with limits. The
   Director, Weaver, Chronicler and the Writer may; the Actor writes from what the Writer gathered.
6. **Seven jobs, none overlapping:**

   | | On the page | Off the page |
   |---|---|---|
   | Past and present (truth) | Chronicler: who everyone in the Scene is now, what they know and believe, how things between any of them moved, what became true, Rules, new names | Weaver: lives out everyone's Lives and the Outline while he is away |
   | Future (direction) | Director: the Outline, each Close person's and Mover's intentions, setups and payoffs, the next Stretch | |
   | The moment | Writer plans the Reply, looking things up; Actor writes it | |
   | Checking | Editor: every Reply against what is established; records and recaps against what they cover | |
   | Keeping it bounded | Folder | |

   A Life is split on purpose: who a person is now is a record (Chronicler, Weaver); where they are heading is a plan
   (Director). A plan never rewrites history, and history is never invented to fit a plan.
7. **The Editor reads every Reply before the player does** (docs/adr/0019): written whole, checked, then shown. Small
   slips set right; real breaks rewritten once with notes, then shown with a note if still wrong.
8. **What the Story learns about the player belongs to the Story, not to a Path**: the brief, reactions and Taste
   survive a Redo and another Path.
9. **Rules** (how the World works, established in the Story File or in play) are their own record, always present for
   whoever writes, and checked by the Editor.
10. **The Outline's detail rolls:** the current Act in detail (its question, the turns roughly week by week, where each
    Close relationship stands by its end, what each Mover does, every setup with its payoff), the next Act outlined,
    the rest sketched with how the Story ends.
11. **Planning is worked, not answered** (docs/adr/0018): writing an Act in detail is on the order of twenty steps of
    reading, research, drafting, testing against Lives and planted setups, and revising.
12. **The Director's depth at a Scene's end follows what the Scene did:** a focused revision of a few steps by default;
    deep re-planning when the Scene turned the Story, an Act ends, the Story starts, or the player steers. The
    focused pass decides whether to go deep, and the Day View says which is happening.

13. **The player sees and steers the Outline in Backstage.** It shows the current Act's question and turns, where each
    relationship is heading, the setups waiting to pay off, and the Acts after it. The player's steering notes are
    orders: the Director re-plans deeply at the next Scene's end, and a note wins over its own reading of play.

14. **Every prompt is four layers, slowest-changing first, in prose, each with a size limit:** (1) the Story: instructions,
    Premise, Style, World, Rules; (2) where things stand, as of the last Scene's end: The Story So Far, the current
    Act, the Lives of the people present, how things stand between each pair of them, what is true now that touches
    them, the calendar in dates, the brief and Taste (for the Actor, each person's knowledge and beliefs spelled out);
    (3) the Scene so far; (4) this moment: the Move, and for the Actor the Writer's plan and the memories it gathered,
    in their original words. The Writer gets tools; the Actor only writes; the Editor gets layers 1 and 2 and the Reply.
15. **The truth is six kinds of record**, written by the Chronicler (on the page) and the Weaver (off it): each person
    now (who they are, how they feel about each person around them, what they know and believe, what they hide);
    between any two people (where it stands, the turning points, the keepsakes in their own words); what is true now
    (agreements with every term, promises with deadlines, debts, threats, secrets with who knows each, statuses);
    Rules; Names, from their first mention; and what happened (a paragraph a Scene, Moments in their own words, what
    happened off the page). Every record points to the passage it came from, so it can be checked and the whole truth
    rebuilt from the text. Nothing is deleted: what stops being true is closed, with the Scene that closed it.

16. **The Story So Far folds along the Acts.** The current Act keeps a paragraph for every Scene (its oldest weeks fold
    only past a size limit, around 10k tokens); a finished Act folds into one account of it, 1,000 to 2,000 words,
    written by a strong model, keeping every turning point, every name and who was there. Keepsakes never fold: they
    live with the two people they belong to. Folding only changes what prompts carry; every paragraph and every word
    stay stored. The Editor checks each fold against what it covers. The Malfoy Problem's current Act is Year One, so
    its 19 Scenes stay whole.

17. **A long Scene stays word for word up to a limit** (around 20k tokens, about thirty exchanges). Past it, the
    Chronicler records the Scene so far as it would a finished one, with one wait the player is told about; the prompt
    then carries that record and the latest exchanges word for word, and the Writer can look up any earlier passage.
    The Writer also closes a Scene that has become another one, as it does for a Move that leaves.

18. **Default models:** Director Fable 5.1 (high); Chronicler Opus 5.5 (high); Weaver Opus 5.5; Writer Opus 5.5
    (medium); Actor Opus 5.5 (high); Editor Sonnet 5.5; Folder Opus 5.5. Every job's second model is GPT 6.1 Sol. All
    can be changed on the Models screen.

19. **The Malfoy Problem is rebuilt from its own text** when the design lands: the new agents read its Scenes in order
    and write everything from scratch (each person now, between every pair, what is true, Rules, Names, Year One's
    Outline with research, everyone's Lives), and the player carries on from where they are. A one-time wait.
    The skipped month is rewritten: the Weaver had written seven weeks of Roopesh never showing up, against what the
    player asked; the new Weaver lives that month out as meant, with him there and the feelings growing. Mentions in
    Scenes 18 and 19 of the old month's events are flagged to the player.

20. **After the rebuild, the audit's 48 continuity items are checked once** against what the Writer and Actor would be
    given for the next Reply; anything still missing is fixed before the player plays on. From then on the Editor's
    check of every Reply is the ongoing proof.

21. **Taste comes at two levels:** each Story's own, and the player's own, a short list about them as a reader that every
    Story starts with. A lesson goes to the player's Taste only when it is clearly about how they like to read, not
    about one World; when in doubt it stays with the Story. Both can be read and edited.

## Still to decide

Nothing; the design questions are answered. Next: the change proposal, then building it.
