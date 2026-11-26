# Memory for a Story that runs for years (research, 15 October 2026)

What other long-running character and story systems do about memory, for the design of Open Fantasia's. For each
system: how it works, what it gets right, what fails in practice, and what it suggests here. Papers and official docs
were read directly where they could be fetched. Claims that rest only on third-party blogs or reviews are marked
**[secondary]**. Inferences of mine, not findings of a source, are marked **(inference)**.

## Where Open Fantasia stands now

As of commit 893a0ef:

- **The Path is the only truth** (docs/adr/0015). The State is a reducer over it, so Rewind, Try another way, Redo and
  edits re-derive everything with no clean-up.
- **What the State keeps** (`host/src/story/state.ts`):
  - **Facts**: each one dated, with `what`, `where`, `knownTo` and a `weight` from 1 to 5. Moments
    (`source: "page"`) also carry quotes in their original words; off-screen facts (`source: "world"`) come from
    the Weaver.
  - **Bonds**: the Player Character's view only, a few lines of standing plus dated turns.
  - **Known**: what he knows of each person.
  - **Lives**: where each person is, what they are doing and what they are after.
  - **Threads**: a name and a single `now` line each.
  - **Meanwhile**: lines tagged seen, told or rumour.
  - **The Story So Far**: the newest six Scenes a paragraph each, then week recaps of about 120 words, then chapters
    of four weeks at about 150 words once there are more than eight weeks (`host/src/agents/folder.ts`).
- **What each agent reads** is picked by lenses (`host/src/context/lens.ts`) within fixed counts (`BUDGET`): 14
  recent off-screen facts, 5 Moments, 6 facts per person and 8 recent Scenes.
- **How Moments are recalled.** `recallFacts` scores each one as 3 × (people present who know it) + weight +
  scene/1000 and takes the top five. Nothing in the score is about what the Scene is about.
- **The Actor's long memory** comes to four things:
  - the Story So Far's Scene paragraphs for Scenes the people present were in. Only the newest few exist as
    paragraphs, because week recaps carry no list of who was there;
  - each Bond's standing and its last three turns;
  - the five recalled Moments;
  - the last six off-screen facts the people present know.
- **How agents are called.** Every agent runs with `tools: []` and `maxTurns: 1` (docs/research/models.md), so no
  agent can look anything up for itself. The Mac must choose everything before the call.

The current Path of *The Malfoy Problem*, read from the store on 15 October 2026 without writing anything, is at
Scene 19, Day 76. It holds:
- 86 Moments with 191 quotes, plus 104 off-screen facts;
- 56 people, 15 Bonds with 55 turns between them, and 15 Threads;
- The Story So Far at 976 words, and a State of about 245,000 characters of JSON.

Recorded requests so far, at roughly 4 characters a token:

| Agent | Average | Largest |
|---|---|---|
| Writer | 73k characters (about 18k tokens) | 136k (about 34k tokens) |
| Weaver | 57k | 116k |
| Chronicler | 49k | 181k |
| Actor | 31k | 97k |

The Story grows by about 4.5 Moments and 5.5 off-screen facts a Scene. At 500 Scenes that is about 2,300 Moments and
2,700 facts: far too much for any prompt, but tiny for an index. Chapters grow without a level above them, at about
13 a story-year, or roughly 2,000 words a year given to every agent.

The research below bears on these gaps:
- recall ignores the topic, so the same heaviest Moments win every Scene with a given person;
- a fact can only be true: nobody can hold a false belief;
- Bonds exist only between the Player Character and others;
- a Thread keeps only its latest line, and the Director's new things are not followed up once the plan is replaced;
- the Folder is recursive summarisation, and its known errors are covered in section 4;
- nothing tests continuity beyond the truth checks on each record.

---

## 1. Generative Agents (Park et al., 2023)

Paper: [arXiv 2304.03442](https://arxiv.org/abs/2304.03442) (UIST 2023); read in full via
[ar5iv](https://ar5iv.labs.arxiv.org/html/2304.03442).

### How it works

- **Memory stream.** A list of natural-language records, each with a creation time and a last-access time. There are
  three kinds: observations (including the agent's own actions), reflections and plans. An agent's persona paragraph
  is split at semicolons into its first memories.
- **Retrieval score** = recency + importance + relevance. Each term is min-max normalised to [0, 1], and all weights
  are 1.
  - *Recency*: exponential decay, factor 0.995 per sandbox game hour since the record was last *retrieved*.
  - *Importance*: an integer from 1 to 10, asked of the model once, when the record is written ("1 is purely
    mundane", "10 is extremely poignant").
  - *Relevance*: cosine similarity between the record's embedding and the query's.
  - The highest-scoring records that fit the context window go into the prompt.
- **Reflection.** It runs when the summed importance of recent events passes 150, which happened two or three times a
  game day.
  - The 100 most recent records are given to the model, which writes the three most salient high-level questions.
  - Each question becomes a retrieval query.
  - The model then writes five insights, each citing the records it rests on ("insight (because of 1, 5, 3)").
  - Reflections are stored as records and can cite other reflections, so they form trees.
- **Planning.** A day plan in five to eight chunks, broken into hours, then into 5–15 minute actions, each with a
  place, a start and a duration. Plans are stored in the stream, and the plan is redone from the point where the
  agent decides to react to something.
- **Relationships at the moment of meeting.** These are not stored as state. The paper retrieves with "What is
  [observer]'s relationship with the [observed entity]?" and "[Observed entity] is [action status]", and summarises
  the answers together.

### What it gets right

- **Each part earns its place.** In the ablation, 100 raters ranked interview answers (TrueSkill μ):

  | Condition | μ |
  |---|---|
  | Full architecture | 29.89 |
  | No reflection | 26.88 |
  | No reflection or planning | 25.64 |
  | Human crowdworkers | 22.95 |
  | No memory | 21.21 |

- **Information spreads through memory alone.** Over two game days with 25 agents, awareness of Sam's candidacy went
  from 1 agent to 8, and of Isabella's party from 1 to 13. Five of the twelve invited came.
- **Importance is judged once, when a record is written.** Retrieval is then cheap, and the ranking is easy to inspect.

### What fails

- **Retrieval failures.** An agent says he has not followed the election although he heard about it. Another is sure
  of his part in the party but unsure the party exists.
- **Embellishment.** 6 of 453 awareness answers (1.3%) were hallucinated. Isabella added an announcement nobody had
  made, and Yuriko said her neighbour Adam Smith wrote *Wealth of Nations*.
- **Instruction-tuned manners.** Agents were overly formal and overly cooperative.
- **Cost.** Two game days for 25 agents cost "thousands of dollars in token credits".
- **Importance is judged in isolation, at write time (inference).** A line that only matters later, a planted
  setup, stays low. A wrong reflection, once stored, is retrieved like any other record.

### Follow-ups

- **Lyfe Agents** ([arXiv 2310.02172](https://arxiv.org/abs/2310.02172)) report running at 10–100× lower cost. They
  use an option–action framework, asynchronous self-monitoring and a "Summarize-and-Forget" memory.
- **Humanoid Agents** ([arXiv 2310.05418](https://arxiv.org/abs/2310.05418)) add basic needs, emotion and a closeness
  value for each relationship.
- **Generative Agent Simulations of 1,052 People** ([arXiv 2411.10109](https://arxiv.org/abs/2411.10109)) built
  agents from two-hour interviews. They predicted people's survey answers better than agents given only demographics.
  Rich first-person source material beats a short description.

### For Open Fantasia

- **Add relevance.** Open Fantasia has two of the three terms: weight (importance, set by the Chronicler) and a tiny
  recency tie-break. It has no relevance. Without it, the five heaviest Moments a person knows come back in every
  Scene with them, whatever the Scene is about: the fixation that pinned memories show in section 4. A relevance term
  would embed the Moment and query with the Scene's purpose, the latest Move and the last Reply.
- **Choose a clock for recency.** Game hours suit a sandbox where time passes evenly. Open Fantasia skips weeks, so
  story-time decay would make a Scene played yesterday "old" after a skip. Scenes played since the Moment was last
  recalled is an alternative.
- **Be careful with decay from last retrieval.** Generative Agents decays from the last retrieval, which makes what
  was recalled more likely to be recalled again (see also MemoryBank and AI Dungeon in sections 3 and 4).
- **Make derived lines cite their evidence.** Bond standing, Known, a Thread's `now` and the Folder's recaps are
  reflections: higher-level lines made from records. Bond turns already cite their Scene; standing, Known and recaps
  do not cite the turns or Moments they rest on. Citations would let a check confirm each line.
- **Weight may need revising.** A Moment written at weight 2 that a later Scene pays off should be raised then.
- **Keep each person's private view separately.** Bonds deliberately leave out anyone's secret feelings. Generative
  Agents would keep a Lead's private view of the Player Character as reflections in her own memory. In Open Fantasia
  that belongs in the omniscient and character lenses, never in the Bond.
- **The planning levels already match.** Director (Stretch) → Writer (Scene and beats) → Actor (Reply) is the same
  structure.

---

## 2. MemGPT and Letta

Paper: Packer et al., *MemGPT: Towards LLMs as Operating Systems*,
[arXiv 2310.08560](https://arxiv.org/abs/2310.08560) (read via
[ar5iv](https://ar5iv.labs.arxiv.org/html/2310.08560)). Letta is the company and framework built on it.

### How MemGPT works

- **The main context has three parts:**
  - read-only system instructions;
  - **working context**: a fixed-size block of text the model can change only through function calls, holding "key
    facts, preferences, and other important information";
  - a **FIFO queue** of messages, whose first entry is a recursive summary of the messages pushed out.
- **External context has two stores:**
  - **recall storage**: every message, kept "indefinitely" and searchable;
  - **archival storage**: arbitrary text in a vector index (pgvector with HNSW in their document setup).
- **Memory pressure.** At a warning count (for example 70% of the window) a system message tells the model to save
  what matters. At the flush count (100%) the queue manager pushes out a share of messages (for example 50%) and
  rewrites the recursive summary.
- **Chaining.** A function call with `request_heartbeat=true` returns control at once, so lookups can follow one
  another. Editing and retrieval are "entirely self-directed".
- **Results.** On deep memory retrieval, accuracy went from 32.1% to 92.5% with GPT-4, and from 35.3% to 93.4% with
  GPT-4 Turbo. On nested key-value lookup, GPT-4 alone fell to 0% by three levels, and MemGPT was unaffected.
- **Limits, from the results section:**
  - GPT-3.5 could not drive the function calls;
  - the agent "will often stop paging through retriever results before exhausting the retriever database";
  - the right document was often "outside of the first dozen retrieved results".

### How Letta works

- **Memory blocks** ([docs](https://docs.letta.com/guides/agents/memory-blocks),
  [post](https://www.letta.com/blog/memory-blocks)).
  - Each block has a `label`, a `description` telling the agent what it is for, a `value`, a character `limit` and an
    optional `read_only` flag.
  - Blocks are compiled into the prompt with their descriptions and sizes.
  - One block can be shared by several agents, and the last write wins.
- **Sleep-time agents** ([post](https://letta.com/blog/sleep-time-compute)).
  - The primary agent "is not provided with tools to edit its core memory". A background agent edits the blocks.
  - Letta's stated reasons: memory work mid-conversation made the agent slower and less reliable, and memory built
    up a piece at a time becomes "messy and disorganized over time".
  - The two agents may use different models.
  - The paper ([arXiv 2504.13171](https://arxiv.org/abs/2504.13171)) reports:
    - about 5× less test-time compute for the same accuracy;
    - accuracy gains of up to 13% and 18% on its two tasks;
    - 2.5× lower cost per query when several queries share one context.

    It works best when likely questions can be predicted from the context.
- **The filesystem result** ([post](https://www.letta.com/blog/benchmarking-ai-agent-memory), August 2025).
  - GPT-4o mini with `grep`, `search_files`, `open` and `close` over a file holding the whole conversation scored
    74.0% on LoCoMo, against the 68.5% Mem0 reported for its best variant.
  - Letta concludes that "memory is more about how agents manage context than the exact retrieval mechanism used".
    Letta has a commercial interest in this conclusion.

### What it gets right

- It separates a small, bounded, labelled memory that is always present from large stores that are searched.
- A limit on each block stops one part crowding out the rest, and a description tells the model what the block is for.
- Letta's own later design takes memory editing out of the conversation and into a background step.

### What fails

- **Lookups the model directs itself** depend on its skill with tools and stop early. Each lookup is another round
  trip.
- **Independent tests are poor for MemGPT.** In MemoryAgentBench ([arXiv 2507.05257](https://arxiv.org/abs/2507.05257))
  it scored 34.3 on accurate retrieval and 22.4 on long-range understanding. Long-context models scored 54.9–66.2 on
  long-range understanding.
- **Editing memory during the conversation was unreliable enough** that Letta moved it to a background agent.

### For Open Fantasia

- **Open Fantasia already has the sleep-time shape.** The Chronicler, the Weaver and the Folder write memory at a
  Scene's end; the Writer and the Actor never edit it. Letta's move supports that split. Open Fantasia makes the
  player wait for it (docs/adr/0016) where Letta runs it in the background, a choice made deliberately for
  correctness.
- **Bond standing, Known, Life and Taste are memory blocks.** Letta's lessons apply:
  - give each a hard size limit;
  - state in the prompt what each block is for;
  - let exactly one agent write each kind. Today the Chronicler writes Bonds and the Weaver writes Lives.
- **The Path is MemGPT's recall storage, but nothing can search it.** With `tools: []`, the self-directed lookup MemGPT
  relies on is not available. Retrieval has to happen on the Mac before the call.
- **Letta's filesystem result suggests an option** for the Director or the Writer: a few search turns over the Path,
  such as finding a name or phrase and opening a Scene. The costs are extra turns while the player waits, and less
  predictable prompts.
- **The budgets play MemGPT's memory-pressure role**, but statically.

---

## 3. Lorebooks and World Info

### SillyTavern World Info

Source: [docs](https://docs.sillytavern.app/usage/core-concepts/worldinfo/).

**Matching.**
- An entry has keys (plain text or regex) and optional filter keys combined as AND ANY, AND ALL, NOT ANY or NOT ALL.
- Only the entry's content is inserted, never its title or keys, so content must stand on its own.
- *Scan depth* is how many recent messages are searched for keys. At 0, only recursion and the Author's Note are
  scanned.
- Strategies: constant (always in), keyword, or vectorized (embedding similarity). The docs call vectorized results
  not predictable and advise keywords "for deterministic behavior".
- Further matching controls: a probability on each entry, character filters, which kinds of generation trigger it,
  and whether the character description and other fields are scanned too.

**Budget.**
- A share of the context, or a fixed cap. Once it is spent, no further entries go in.
- Constant entries go first, then higher insertion order. Entries triggered by the chat outrank entries triggered by
  other entries.
- An overflow alert exists. One guide says it ships switched off **[secondary]**.

**Where entries go.**
- Before or after the character definitions; before or after the example messages; at the top or bottom of the
  Author's Note; or "@ D", at a given depth in the chat (0 is the bottom), with a role. Named outlets also exist.
- Higher insertion order is placed later and has "more influence".

**Recursion.**
- An entry whose content mentions another entry's keys activates that entry.
- Each entry can be non-recursable, prevent further recursion, or delay until recursion (with levels). A global
  limit caps the number of recursion steps.

**Inclusion groups.** When several entries in a group fire, one is inserted, chosen by weight, priority or number of
key matches.

**Timed effects**, counted in messages:
- *sticky N* keeps an entry active for N messages;
- *cooldown N* blocks it for N messages;
- *delay N* waits until the chat has N messages.

**Sources.** Chat lore, persona lore, character lore and global lore, with a choice of how to sort them.

### NovelAI Lorebook

Source: [docs](https://docs.novelai.net/en/text/lorebook/).

- **Keys**: case-insensitive, with regex and `&` for AND. *Search range* is in story characters, up to 10,000.
- **Activation**: Always On; *cascading activation* lets entries trigger from other entries.
- **Space**: a *token budget* and *reserved tokens* per entry, as a fraction or absolute.
- **Placement**: *insertion order* (higher reserves and inserts first) and *insertion position* (0 is the top,
  negatives count from the bottom); *trim direction* and *maximum trim type*; key-relative insertion; categories that
  can form a subcontext.
- **Steering**: phrase-bias groups, which can apply when an entry is inactive, and a Lore Generator.

### KoboldAI

Source: [wiki](https://github-wiki-see.page/m/KoboldAI/KoboldAI-Client/wiki/Memory,-Author's-Note-and-World-Info).

| Part | Placement | Suggested size | Effect |
|---|---|---|---|
| Memory | Top of the context | About 200 tokens, "like a dust jacket summary" | Seen first, but furthest from the new text |
| World Info | After Memory, before the story | 50 tokens for minor items, 100 for important characters, at most 150 | Moderate |
| Author's Note | "Only a few lines above the new text" | Under 50 tokens | Strongest on the prose being written |

The AI never sees an entry's title or keys, so every entry must be self-contained.

### AI Dungeon: Story Cards and the Memory System

Sources: [Story Cards](https://help.aidungeon.com/faq/story-cards),
[Memory System](https://help.aidungeon.com/faq/the-memory-system).

**Story Cards.**
- Fields: a name the AI never sees, an entry, comma-separated triggers, and notes.
- A trigger in the player's input or the AI's output adds the entry, prefixed "World Lore:", but only from the next
  output on. Cards stay active for a variable number of turns.
- Limits: at most 5,000 cards. They are "among the first elements to be removed from the context when it is full".
- The docs advise:
  - short plain sentences;
  - the most important information at the beginning and end of an entry;
  - the name inside the entry;
  - proper names as triggers;
  - cards that refer to each other;
  - little physical detail, which the AI "may ignore or repeat too often".

**Memory System.**
- *Auto Summarization* rewrites a Story Summary every 15 actions.
- A *Memory* is a dense summary of six actions. The first is formed at action 12; the newest six actions are never
  summarised, so they can still be edited or undone.
- Each Memory is embedded and retrieved by relevance to the latest action, but only once the adventure no longer fits
  in context.
- The bank holds 25 (free) to 400 (top tier). When it is full, the *least-used* Memories are forgotten.
- Plot Essentials and the Author's Note are always included.

### Character cards

The V2 spec ([spec](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md)) packages one
character with its lore:
- description, personality, scenario, first message, example messages, a system prompt and post-history
  instructions;
- an embedded `character_book` with `scan_depth`, `token_budget` and `recursive_scanning`;
- entries with keys, secondary keys, `constant`, `insertion_order`, `position` and `priority`. Lower priority is
  dropped first when the budget is full.

It is the community's counterpart to a Story File.

### What roleplayers find works and fails

**What works:**
- Entries are deterministic and can be inspected (AI Dungeon's Context Viewer, SillyTavern's overflow alert), and an
  author can fix one bad entry.
- Short, self-contained entries.
- Keys covering every name a thing goes by. The *World Info Encyclopedia*
  ([rentry](https://rentry.co/world-info-encyclopedia)) advises "every name a place or thing goes by". It pairs
  "house, home" with possessive pronouns as secondary keys so an entry fires only in a personal context.
- Linked entries that pull in their neighbours.
- **Placement near the end.** The Encyclopedia: "The lower the depth, the more important the information is", but "Do
  not overdo importance!"; too many high-priority entries leak into the prose.

**What fails:**
- **Literal matching.** An entry keyed to a name does not fire on "she" or on an oblique reference ("the night on the
  platform"). Vectorized entries catch paraphrase but are unpredictable.
- **Shallow scan depth.** The Encyclopedia gives the defaults as scan depth 2 and 25% of the context. At those
  settings an entry drops out a message or two after its name was last said, just when a Scene is about someone but
  no longer names them. Sticky timed effects exist to fix this.
- **Silent overflow.** Past the budget, entries are dropped without notice.
- **Entries cannot change over time.** An entry says what was true when it was written. Novelcrafter's Codex adds
  *progressions* ([help](https://novelcrafter.com/help/faq/codex/track-character-changes)): additions attached to a
  scene that the AI sees only when writing at or after that point, and that can replace a detail instead of adding
  to it.
- **Lore gets used because it is there.** AI Dungeon's warning about physical detail, the Encyclopedia's "leakage",
  and the reports of pinned memories dominating (section 4) describe the same thing.
- **Prompt caching breaks.** Inserting retrieved text mid-prompt changes the prefix. SillyTavern's own docs call chat
  vectorization "often counter-productive" with prompt caching and say to choose one or the other
  ([docs](https://docs.sillytavern.app/extensions/chat-vectorization/)).
- **Community extensions arrive at Scene memory.** SillyTavern-MemoryBooks
  ([repo](https://github.com/aikohanasaki/SillyTavern-MemoryBooks)) turns finished scenes into lorebook entries that
  keep "important events, decisions, relationships, discoveries, promises, and unresolved threads". It is reported to
  consolidate them into arc, chapter and book tiers **[secondary]**. That is close to Open Fantasia's Chronicler and
  Folder.

### For Open Fantasia

Open Fantasia already holds a structured lorebook: people with aliases, places and Groups from the Story File, and
Moments recording who knows each one. Lorebooks suggest five additions:

1. **Mentions as a retrieval signal.** Search the latest Move, the Scene so far and the Writer's beats for the names
   and aliases of people, places and Threads, and raise the Moments that involve them. This is cheap and
   predictable, and it complements embeddings, which catch paraphrase.
2. **Stickiness.** A Moment recalled in a Scene stays for the rest of that Scene. Lore stops flickering between
   Replies, and the prompt prefix stays the same for caching (section 6).
3. **Placement.** Put the Moments recalled for this Reply late in the prompt, after the stable material and before the
   Move. That is good for influence and for caching alike.
4. **Truth as of a point on the Path.** The reducer already gives Novelcrafter's progressions for free: the State at a
   point on the Path is what was true then. That holds only while nothing writes "current" descriptions back into the
   Story File's people.
5. **Budgets that report what they dropped.** Today `BUDGET` counts items. A token budget per section that logs what
   was left out would let a review see when memory was squeezed.

Not worth copying: probability triggers and random inclusion groups. Randomness makes continuity impossible to
reproduce and confuses the comparison a Redo invites.

---

## 4. Long-term memory in products and research

### Products (what is public)

Little official documentation exists. Most of what follows comes from third-party sites.

| Product | What is public | Source |
|---|---|---|
| Character.AI | A 400-character "chat memories" box for all users from May 2025. In 2026, "Story Memory", where pinned messages are kept in their original words and managed in a tab. A cap of 15 pins is reported. | [blockchain.news](https://blockchain.news/news/character-ai-enhances-user-experience-with-chat-memories-feature), [roborhythms](https://www.roborhythms.com/character-ai-adds-chat-memories/) **[secondary]** |
| Kindroid | A backstory, "Key Memories" read on every turn, journal entries triggered by keyphrases (reported up to 8 keyphrases each and up to 3 recalled per message), and an automatic "cascaded memory" | [aicompanionpick](https://aicompanionpick.com/ai-companion-memory-kindroid-nomi-replika-long-term-2026) **[secondary]** |
| Replika | A Memory tab listing what it has learned about the user, which the user can read, delete or add to, beside "a deeper system" drawn from the conversation | [help centre](https://help.replika.com/hc/en-us/articles/37208679176077-How-does-Replika-s-memory-work), seen through search results because the page refused direct fetches |
| Nomi | "Shared Notes", and short- and long-term memory across chats (app listing). A "Mind Map" that shows memories as connected people, places and topics, which users edit. | [App Store](https://apps.apple.com/app/id6450270929); Mind Map from [Distractify](https://www.distractify.com/p/people-are-building-entire-fantasy-worlds-with-their-ai-companions-and-the-maps-are-blowing-minds) **[secondary]** |

**The common shape:**
- a small block that is always present and that the user can edit;
- entries that fire on keys;
- automatic extraction from the conversation;
- a memory list the user can see and correct.

**Failures reported** (all **[secondary]**):
- the bot "clings" to pins and ignores newer context;
- facts are forgotten;
- characters get mixed up.

No product publishes an evaluation.

### Summaries and reflections

- **MemoryBank** ([arXiv 2305.10250](https://arxiv.org/abs/2305.10250); [full text](https://ar5iv.labs.arxiv.org/html/2305.10250)).
  - Three layers: timestamped conversation logs, daily then global event summaries, and daily then global personality
    insights. Retrieval is dense (FAISS).
  - Forgetting follows R = e^(−t/S). S starts at 1; each recall adds 1 to S and resets t to 0.
  - The authors call it "exploratory and highly simplified".
- **Recursively summarising dialogue** ([arXiv 2308.15022](https://arxiv.org/abs/2308.15022); [full text](https://ar5iv.labs.arxiv.org/html/2308.15022)).
  - After each session, memory Mᵢ = LLM(sessionᵢ, Mᵢ₋₁), capped at 20 sentences.
  - A manual check of 100 dialogues found fabricated facts in 2.7%, incorrect relationships in 3.2% and missing
    details in 3.9%. The authors put inaccurate content at under 10%.
- **RecurrentGPT** ([arXiv 2305.13304](https://arxiv.org/abs/2305.13304); [full text](https://ar5iv.labs.arxiv.org/html/2305.13304)).
  - Each step writes a 200–400-word paragraph, a 3–5-sentence plan for what comes next, and a short-term memory of
    10–20 sentences, rewritten every step.
  - Long-term memory is every paragraph, embedded and retrieved with the plan as the query. An interactive-fiction
    mode offers three choices each step.
  - Removing either memory mainly hurt coherence. It was evaluated only on texts of about 5,000 words.
- **Think-in-Memory** ([arXiv 2311.08719](https://arxiv.org/abs/2311.08719)) stores the model's conclusions instead of
  raw history, so it does not reason afresh, and inconsistently, each time. Thoughts can be inserted, forgotten and
  merged.
- **Reflexion** ([arXiv 2303.11366](https://arxiv.org/abs/2303.11366)) keeps verbal reflections on past attempts in a
  memory bounded to "1-3" experiences, as "a sliding window". Open Fantasia's Taste (lessons from repeated
  Directions) has this shape.
- **FABLES** ([arXiv 2404.01261](https://arxiv.org/abs/2404.01261)) studied book-length summaries by models:
  - "most unfaithful claims relate to events and character states";
  - no LLM rater correlated strongly with human annotators on unfaithful claims;
  - summaries left out crucial narrative elements and over-weighted events near the end.
- **FlawedFictions** ([arXiv 2504.11900](https://arxiv.org/abs/2504.11900)): summarising a story raised the rate of
  plot holes found by about 50% (GPT-4o's summaries: 0.31 to 0.45). The main cause was omitted events that made later
  events inconsistent.

### Benchmarks

**LoCoMo** ([arXiv 2402.17753](https://arxiv.org/abs/2402.17753); [full text](https://arxiv.org/html/2402.17753)).
- Conversations of about 300 turns and 9K tokens, over up to 35 sessions.

| Measure | Humans | Best model |
|---|---|---|
| Question-answering F1 | 87.9 | 37.8 |
| Temporal questions | 92.6 | 25.0 |

- Long context made adversarial questions worse: GPT-3.5-turbo-16K scored 2.1 at 16K. The paper: "LLMs can be easily
  misled into generating hallucinations".
- What retrieval works on matters:

  | Unit retrieved | Answer F1 |
  |---|---|
  | Observations (short assertions about each speaker), top 5 | 41.4 |
  | Raw turns, top 5 | 31.7 |
  | Raw turns, top 50 | 34.8 |

  Session summaries had the best recall but lower answer F1, which the paper puts down to information lost in
  summarising.

**LongMemEval** ([arXiv 2410.10813](https://arxiv.org/abs/2410.10813); [full text](https://arxiv.org/html/2410.10813)).
- 500 questions over histories of about 115K tokens (S) or about 1.5M tokens (M). It tests five abilities:
  extraction, reasoning across sessions, temporal reasoning, knowledge updates and abstention.
- Against GPT-4o reading the history offline, ChatGPT lost 37% and Coze 64%. Long-context GPT-4o went from 0.870 with
  only the evidence to 0.606 with the full history.
- Its design findings:
  - store individual rounds, not whole sessions. Summaries and extracted facts alone lose information, though
    extracted facts help reasoning across sessions;
  - index each value with the facts extracted from it as its key ("K = V + fact"): +5.4% question answering on
    average;
  - time-aware query expansion adds 11.3% temporal recall for rounds, but needs a strong model;
  - read with Chain-of-Note and JSON. Even with perfect retrieval, a weak reading setup cost GPT-4o up to 10 points;
  - match how much is retrieved to the reader.

**MemoryAgentBench** ([arXiv 2507.05257](https://arxiv.org/abs/2507.05257); [full text](https://arxiv.org/html/2507.05257)).

| Approach | Long-range understanding | Accurate retrieval |
|---|---|---|
| GPT-5-mini (long context) | 66.2 | 74.4 |
| Claude 3.7 Sonnet (long context) | 62.2 | 59.7 |
| Best memory agent (MIRIX) | 40.5 | 63.0 |
| Best plain RAG | about 37 | |
| HippoRAG-v2 (graph RAG) | 36.2 | 65.1 |
| Mem0 | 20.7 | 32.6 |
| MemGPT | 22.4 | 34.3 |

- Long context won at long-range understanding; RAG did better at accurate retrieval.
- On resolving conflicting facts across several hops, "all methods fail", at 28% or below.

### Extraction and graph memory

- **Mem0** ([arXiv 2504.19413](https://arxiv.org/abs/2504.19413); [full text](https://arxiv.org/html/2504.19413)).
  - Candidate facts are extracted from the new exchange, a conversation summary refreshed in the background, and the
    last 10 messages.
  - For each candidate, the 10 most similar memories are retrieved and the model picks ADD, UPDATE, DELETE or NOOP.
  - The graph variant marks contradicted relations "as invalid rather than physically removing them".
  - On LoCoMo (LLM-judged), Mem0 scored 66.88 and the graph variant 68.44; the full conversation scored 72.90. Mem0's
    p95 latency was 1.44 s against 17.1 s for full context, with about 1.8K context tokens against 26K.
  - OpenAI's memory did badly on temporal questions because most of its memories lacked timestamps.
- **Zep / Graphiti** ([arXiv 2501.13956](https://arxiv.org/abs/2501.13956); [full text](https://arxiv.org/html/2501.13956);
  [code](https://github.com/getzep/graphiti)).
  - **Three tiers**: episodes (the raw input, kept "non-lossy"), entities with facts as edges, and communities with
    summaries.
  - **Entity resolution**: entity names are embedded; cosine and full-text search find candidate duplicates; the
    model decides.
  - **Two timelines** on every edge (t_valid and t_invalid for the event; t′_created and t′_expired for the data). A
    contradicting edge sets the old edge's t_invalid; nothing is deleted.
  - **Retrieval**: cosine, BM25 and breadth-first search; then reranking (reciprocal rank fusion, MMR, mention counts,
    distance in the graph, cross-encoder); then formatting, with each fact's validity dates.
  - **LongMemEval with GPT-4o**: 71.2% against 60.2% for full context, 2.58 s against 28.9 s, about 1.6K tokens against
    115K. It was 17.7% worse on questions about what the assistant itself said in one session.
- **A-MEM** ([arXiv 2502.12110](https://arxiv.org/abs/2502.12110)) keeps notes with keywords, tags and a context
  description, links related notes, and lets a new note update old ones.
- **HippoRAG** ([arXiv 2405.14831](https://arxiv.org/abs/2405.14831)) builds a knowledge graph and ranks it with
  Personalized PageRank. It reports up to 20% better multi-hop question answering, and single-step retrieval that
  matches iterative retrieval at 10–30× lower cost.

### The disputes

- **Vendors dispute each other's LoCoMo numbers.** Zep says Mem0 configured Zep wrongly, and reports 75.14% for itself
  ([Zep](https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/)). Letta reports 74.0%
  with plain files.
- **Full context beats the memory layers at this size.** Mem0's own table puts the full conversation at about 73%,
  above every memory layer in it. At LoCoMo's size (about 26K tokens) the whole conversation simply fits.
- **Treat vendor figures as marketing.** One largest Writer request in Open Fantasia (about 34K tokens) is already
  bigger than a LoCoMo conversation.

### For Open Fantasia

- **Moments are the right retrieval unit.** A line saying what happened, its original quotes and who knows it is
  LoCoMo's observation and LongMemEval's "value plus fact" key in one record. Index the line, its names and its date;
  hand the agent the quotes. The Folder's recaps should never replace Moments as what gets recalled.
- **Time is the weakest axis in every benchmark.** Every fact already has `at`, and agents now read dates (893a0ef).
  Two additions follow:
  - time-aware recall: when a Move or a plan names a time ("last Christmas", "the night of the troll"), the Mac
    resolves it to a date range and filters by it;
  - print the date beside every recalled Moment, not only its Scene number. Mem0's finding on OpenAI's undated
    memories is the warning.
- **Separate events from states.** Facts are events: once they happened, they stay true. States (Lives, Bonds, Known)
  are overwritten, and the Path keeps their history. The risk is a Moment that describes a condition, such as "her wand
  is broken", recalled after the condition ended. Zep and Mem0 mark the old fact invalid rather than deleting it.
  Here the Chronicler could link a fact to the later fact that ended it, and recall could print "until …".
  MemoryAgentBench shows models do not reconcile conflicting memories reliably, so this has to be settled in the data,
  not left to the prompt.
- **Long context and retrieval do different jobs.** Long context beat retrieval at long-range understanding. Keep The
  Story So Far as the overall view for the Director and the Writer, and use retrieval for particulars.
- **The Folder's recaps need checking.**
  - Recursive summaries had error rates of 2.7–3.9% per kind, summaries create plot holes mainly by leaving things
    out, and LLM raters miss unfaithful claims.
  - The Folder's prompt already forbids inventing and sharpening. A check could test each recap sentence against the
    parts it came from.
  - Each week and chapter could keep links to its Scenes, so an agent can be given the original Moments for any recap
    line.
- **Forgetting should only mean not being recalled.** MemoryBank and AI Dungeon forget what goes unused. Open Fantasia
  never needs to delete anything, because the Path is cheap. Strength-by-use (MemoryBank's S, AI Dungeon's least-used
  eviction) entrenches whatever came up early.

---

## 5. Problems particular to stories

### Beliefs versus truth

**Research on theory of mind:**
- **FANToM** ([arXiv 2310.15421](https://arxiv.org/abs/2310.15421)): in conversations where participants know
  different things, models score far below humans, even with chain-of-thought. Their answers to questions needing the
  same reasoning disagree, which the authors call "illusory" theory of mind.
- **Perceptions to Beliefs** ([arXiv 2407.06004](https://arxiv.org/abs/2407.06004), EMNLP 2024): models are good at
  inferring *who perceived what*, and weak at turning that into *what they believe*. The authors' method finds who
  perceived each thing first, then gives the model only the context a character perceived. It helps most where a
  belief is false.
- **SymbolicToM** ([arXiv 2306.00924](https://arxiv.org/abs/2306.00924)) keeps explicit belief graphs for each
  character, including what A thinks B believes. It "dramatically enhances" off-the-shelf models on ToMi, with no
  training.
- **SimpleToM** ([arXiv 2410.13648](https://arxiv.org/abs/2410.13648); [full text](https://arxiv.org/html/2410.13648))
  separates inferring a mental state from applying it:

  | Model | Mental state | Predicting behaviour | Judging behaviour |
  |---|---|---|---|
  | GPT-4o | 95.6 | 49.5 | 15.3 |
  | Claude 3.5 Sonnet | 97.9 | 67.0 | 24.9 |
  | Claude 3.5 Sonnet, reminded of the mental state | | 96.9 | 84.1 |

  Reminding the model of its own mental-state answer helped Claude most. Chain-of-thought helped less.

**TimeChara** ([arXiv 2405.18027](https://arxiv.org/abs/2405.18027); [full text](https://arxiv.org/html/2405.18027))
tests whether a character knows only what they could know at their point in the story:
- GPT-4o, zero-shot, was 64.5% consistent overall and 46.0% on questions about the character's future.
- Naive retrieval made future questions worse (33.5 for GPT-4): "indiscriminately providing contexts harms the
  performance". Limiting retrieval to before the character's point helped.
- Their Narrative-Experts method adds two steps: is the question about something after the character's point, and
  was the character present? It reached 82.2, and 87.5 with the time-limited retrieval.

**Talk of the Town** (Ryan et al., 2015; [summary](https://emshort.blog/2019/05/28/curating-simulated-storyworlds-james-ryan-ch-6f/),
[code](https://github.com/james-owen-ryan/talktown)):
- Characters form beliefs from what they observe, what they are told ("truly or falsely"), transference and
  confabulation. Salient traits are noticed more.
- Repeating a belief commits the speaker to it, so "speaking a lie over and over can make a character believe the lie".
- Ryan says the knowledge it produced was mostly mundane, hair and eye colour, "not very prone to generating
  narrative intrigue". His answer was curation: generate more than needed and choose.

**For Open Fantasia:**
- **`knownTo` is the right design.** It is the perception step of Perceptions to Beliefs, done in the data at
  recording time, and the character lens filters by it before the call. The research says models do this filtering
  badly when it is left to the prompt. TimeChara's time-limited retrieval supports the same choice: give each person
  only what came before and reached them.
- **The gap is false beliefs.** A fact records what happened. A lie is recorded as "he lied to her about X", known to
  both. What she now *believes*, the lie's content, appears nowhere in her lens unless she knows it was a lie. What is
  needed is a belief record: "Hermione believes he was in the library on Tuesday (he told her, Scene 4)". It would be
  in her character lens, with the truth in the author's lens. Meanwhile's seen, told and rumour are a start; Talk of
  the Town adds lie and mistaken inference as sources.
- **State beliefs positively.** SimpleToM suggests telling the Actor what a person *does* believe, because leaving a
  fact out does not make a model act on a wrong belief. Negative statements are the risk: telling the Actor "she does
  not know about the egg" tells the Actor about the egg. So positive beliefs belong in the character lens; statements
  of what someone does not know belong only to the author's lens, for the Writer.
- **Canon is a source of leaks (inference).** In a world with a canon, the model already knows the canon future.
  TimeChara's future-question failures are exactly this. A continuity test should ask characters about canon events
  the Story has not reached, or has changed.

### Relationships between people other than the Player Character

- **Generative Agents** stores no relationship state. It retrieves "What is [observer]'s relationship with [observed]?"
  each time two agents meet.
- **Humanoid Agents** keeps an explicit closeness value for each pair that changes as they interact.
- **Prom Week's Comme il Faut** chooses each character's social exchanges (more than 40 kinds) from more than 5,000
  social considerations about how 18 characters stand with each other
  ([Kill Screen interview](https://www.killscreen.com/the-indie-talks-we-chat-with-the-creators-of-prom-week/)).

**For Open Fantasia:**
- Bonds are kept from the Player Character's side by design. Between other people there is nothing but the `after` in
  a Life, Threads and facts.
- A Story of years with rival Leads, such as Draconia and Hermione, needs where things stand between them for the
  Weaver and the Writer. A pair record would hold the same things a Bond does: a standing and turns citing their
  Scenes. Who writes them, which lens sees what and which pairs qualify are open questions below.
- To keep the n² growth down, a pair record would be made only when a Scene or the Weaver shows the two dealing with
  each other.

### Open setups and Chekhov's guns

- **CFPG** ([arXiv 2601.07033](https://arxiv.org/abs/2601.07033), January 2026) observes that models leave setups
  unresolved even when the context holds everything needed to pay them off. It mines foreshadow–trigger–payoff triples
  from BookSum, writes them as executable conditions, and reports better payoff accuracy than prompting.
- **NCP-Bench** ([arXiv 2608.08160](https://arxiv.org/abs/2608.08160), ICML 2026) gives a narrator agent a narrative
  with commitments and facts, checked automatically during play:
  - the best model, GPT-5.2, survived 20 turns 42% of the time;
  - fact conflicts ranged from 40% to 68% across models;
  - "high linguistic quality does not guarantee commitment preservation".
- **Story sifting.** Felt ([code](https://github.com/mkremins/felt)) matches patterns over a history of events. Winnow
  ([AIIDE 2021](https://ojs.aaai.org/index.php/AIIDE/article/view/18903)) does it incrementally, spotting "potentially
  storyful event sequences while they are still playing out".

**For Open Fantasia:**
- **Nothing tracks what was planted.** A Thread keeps one `now` line. The Director's `newThings` (a person, secret,
  threat, mystery or place) leave view when the next plan replaces the old. A promise made on the page is recorded
  only if it is an Engagement, with a time and a place.
- **A setup record would fill this.** It would hold what was planted, the Scene and the quote, who knows it, and a
  status: open, paid off in Scene N, or dropped on purpose by the Director. The Chronicler would open and close setups
  from the page; the Director would answer the oldest open ones each Stretch (pay off, develop or drop); the Writer
  would be given the open ones that touch the people present.
- **It makes commitments checkable**, as NCP-Bench's are.

### Names invented mid-story

- **Zep** extracts entities from every message (with the previous four) and resolves each against existing ones by
  embedding and full-text search, then a model decision.
- **AI Dungeon** generates a Story Card from a name.
- **Novelcrafter** recognises names, aliases and nicknames as you type and lists every mention.
- **Entity tracking** (Kim and Schuster, [arXiv 2305.02363](https://arxiv.org/abs/2305.02363)): models track an
  entity's state through a sequence of changes only unreliably, and "pretraining on text corpora alone does not make
  this capacity surface". Keep entity state in data.

**For Open Fantasia:**
- People the Director brings in are registered (`broughtIn`). People the Actor names in passing (the barman, a cousin,
  a house-elf) are not, unless a Moment happens to name them. The title normalisation in the living-world spec ("named
  with a title") is the resolution step for known people.
- **The Chronicler could register every newly named person, place or object** with the quote that named them, a line
  on who they are, aliases and their first Scene.
- **Resolve in Zep's order**: alias match first, then embedding similarity, then a model check. Without this, a later
  Reply renames the barman, or gives his name to someone else.

### Testing continuity

**Methods in the literature:**
- probe questions by category, as in LoCoMo and LongMemEval: temporal, knowledge updates, abstention;
- natural language inference to catch contradictions with what a speaker said before (Dialogue NLI,
  [arXiv 1811.00671](https://arxiv.org/abs/1811.00671));
- questions about a character's future, and about events they were absent from or present at (TimeChara);
- a ledger of commitments audited during play (NCP-Bench);
- plot-hole detection (FlawedFictions). Claude 3.5 Sonnet matched humans on stories of about 700 words, but on stories
  of about 2,700 words the best model (o1) was barely above always answering "no error";
- claim-level checks of summaries (FABLES), where LLM raters were unreliable.

**For Open Fantasia**, a continuity suite run on a frozen copy of a played Path, never the live Story:

1. **Recall.** Open a Scene with a person and a Move that touches a past Moment. The gold answer is the Moment's
   quotes; the Reply must agree with them and not contradict them.
2. **Knowledge boundaries.** Give a person who does not know X a Move next to X. Any sign of X is a failure, and
   `knownTo` makes this automatic to set up.
3. **The Player Character's facts.** Already covered by the existing truth check.
4. **Time.** "How long ago was…", "what day was…".
5. **Updates.** After a state ends, is an old Moment about it recalled as current?
6. **Rewind.** After going back, nothing from the Path left behind appears.
7. **Folds.** Check each recap sentence against its parts.
8. **Setups.** Count open setups older than N Stretches.

Judges should be a strong model given the gold evidence (in the Chain-of-Note style), plus a sample read by a person,
since FABLES and FlawedFictions show model judges miss subtle story errors. Track the rates at several Story lengths
(Scene 20, 100, 300) to see how memory degrades with size.

---

## 6. Practical matters

### Local embeddings on Apple Silicon

**Scale.** About 5,000 Moments and facts at 500 Scenes. At 768 dimensions in 32-bit floats that is about 15 MB per
Story. A brute-force cosine search over it is about 4 million multiply-adds, a few milliseconds in plain JavaScript
(inference). No approximate index is needed.

**Storage.**
- `better-sqlite3` is already a dependency. Its bundled SQLite (3.53.4 here) includes FTS5, checked by creating and
  querying an FTS5 table, so keyword (BM25) search is built in.
- Vectors can be stored as BLOBs keyed by fact id, model and content hash.
- [sqlite-vec](https://github.com/asg017/sqlite-vec) adds `vec0` vector tables. It is "pre-v1, so expect breaking
  changes!".

**Ways to run a model from the Node host:**
- **Ollama's local HTTP API**: `POST /api/embed` ([EmbeddingGemma on Ollama](https://ollama.com/library/embeddinggemma):
  622 MB on disk, Ollama 0.11.10 or later).
- **transformers.js** runs ONNX models in process, at fp32, fp16, q8 or q4
  ([docs](https://huggingface.co/docs/transformers.js/index)).
- **MLX** (Python) supports EmbeddingGemma, per Google's announcement.
- **Apple's `NLContextualEmbedding`** is Swift-only, and its assets may need downloading
  ([docs](https://developer.apple.com/documentation/naturallanguage/nlcontextualembedding)). A developer-forum report
  says `NLEmbedding` sentence embeddings return nil on iOS 27 devices
  ([thread](https://developer.apple.com/forums/thread/849965)). It does not suit a Node host.

**Models:**

| Model | Size | Context | Dimensions | Notes | Source |
|---|---|---|---|---|---|
| EmbeddingGemma | 308M parameters, under 200 MB RAM quantised | 2K tokens | 768, truncatable to 512, 256 or 128 | 100+ languages; "the highest ranking open multilingual text embedding model under 500M" on MTEB at release | [Google](https://developers.googleblog.com/en/introducing-embeddinggemma/) |
| Qwen3-Embedding-0.6B | 0.6B parameters | 32K tokens | 1024, truncatable | Takes instructions. Reported at about 70.7 on MTEB English v2 against about 68.4 for EmbeddingGemma **[secondary]**. | [Qwen](https://qwenlm.github.io/blog/qwen3-embedding/) |
| Qwen3-Reranker-0.6B | 0.6B parameters | 32K tokens | (scores, not vectors) | MTEB-R 65.80 | [Qwen](https://qwenlm.github.io/blog/qwen3-embedding/) |

Check licences before choosing; some top-ranked embedding models are non-commercial.

**For Open Fantasia:**
- Embeddings would be a derived cache keyed by content hash, so the Path stays the only truth (docs/adr/0015), and
  Rewind needs no re-embedding.
- LongMemEval's finding that the key matters suggests embedding a Moment's line with its names and date, and handing
  back its quotes.
- A Style that writes the Story in another language needs a multilingual model.
- Hybrid retrieval (FTS5 plus one small model), measured on the recall probes above, is a cheap first step.

### Prompt caching and the order of a prompt

**Anthropic** ([docs](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching)):
- The prefix is cached in the order tools → system → messages. A change at one level invalidates that level and
  everything after it, and hits need "100% identical prompt segments".
- At most 4 breakpoints per request; a lookback of 20 blocks; an automatic mode.
- Lifetimes: 5 minutes by default, or 1 hour.
- The minimum cacheable length is 512 tokens on Opus 5.5, Sonnet 5.5 and Fable 5.1.
- Writes cost 1.25× (5 minutes) or 2× (1 hour) the base input price. Reads cost 0.1×, and 0.05× on Opus 5.5 and
  Sonnet 5.5.
- An entry is usable only "after the first response begins".

**OpenAI** ([docs](https://developers.openai.com/api/docs/guides/prompt-caching)):
- Caching is on by default.
- On GPT-5.6 and later: at least 1,024 visible input tokens, a 30-minute lifetime, reads at 0.1× and writes at 1.25×.
- The guidance: stable content first, dynamic content last, append rather than rewrite. It warns that
  "Summarization, compaction, or truncation can change the prefix."

**Through the subscriptions** (docs/research/models.md): Claude caches server-side by exact prefix for one hour, and
different working directories miss each other's cache. Caching on Codex and Antigravity is not documented there.

**Open Fantasia's order today:**
- *The Writer* (`host/src/agents/writer.ts`).
  - The system part is instructions plus `storyPart`, which stays the same until the Story is edited.
  - The prompt opens with `nowPart`, which changes every Move, so nothing after it can be reused from one Move to the
    next.
  - Then come steering, the plan, the calendar (filtered by the clock, so also changing), The Story So Far, the cast,
    Threads, facts, Moments, the Scene, the Scene so far, the Move and the task.
- *The Actor* (`host/src/agents/actor.ts`).
  - The system part holds instructions, Style, World, the Player Character, the people here and the Scene's title,
    place and start time. All of it is stable through a Scene.
  - The prompt is lived Scenes, Bonds, recalled Moments and recent facts, then the Scene's entries. It is stable and
    only grows through a Scene, unless someone enters and recall changes.

**A better order for the Writer.** Sort sections by how often they change, slowest first, and put everything that
changes every Move at the end:

1. the Story;
2. The Story So Far's chapters, then its weeks;
3. the plan;
4. Threads, Lives and Bonds;
5. the recent Scene paragraphs;
6. the Moments recalled for this Scene, kept for the whole Scene;
7. the Scene so far;
8. now, the calendar, the beats' status, the Move and the task.

Retrieved Moments placed early break the cache for everything after them; SillyTavern's warning is this effect. Placed
late and kept for the whole Scene, they cost nothing.

### Long contexts: lost in the middle, and after

| Study | Finding |
|---|---|
| Lost in the Middle ([arXiv 2307.03172](https://arxiv.org/abs/2307.03172); [full text](https://ar5iv.labs.arxiv.org/html/2307.03172)) | GPT-3.5-Turbo with 20 documents: 75.8% with the answer first, 53.8% with it tenth, below its 56.1% with no documents at all. Base models show the same U shape. Going from 20 to 50 documents added about 1–1.5%. |
| RULER ([arXiv 2404.06654](https://arxiv.org/abs/2404.06654)) | Of 17 models claiming at least 32K, "only half of them can maintain satisfactory performance at the length of 32K". Multi-hop tracing and aggregation tasks are hardest. |
| NoLiMa ([arXiv 2502.05167](https://arxiv.org/abs/2502.05167)) | With little word overlap between the question and the needle, 11 of 13 models fall below half their short-context score at 32K. GPT-4o goes from 99.3% to 69.7%. |
| Context Rot ([Chroma, July 2025](https://www.trychroma.com/research/context-rot)) | Across 18 models, reliability falls with length even on simple tasks. One distractor hurts. Coherent haystacks hurt more than shuffled ones ("structural coherence consistently hurts model performance"). On LongMemEval, focused prompts of about 300 tokens beat full prompts of about 113K in every model family. |
| NoCha ([arXiv 2406.16264](https://arxiv.org/abs/2406.16264)) | 1,001 true/false claim pairs about 67 recent novels. The best model (GPT-4o) got 55.8%, and no open-weight model beat chance. Results were worse on speculative fiction with heavy world-building, and explanations were often wrong even when the label was right. |
| Fiction.LiveBench ([Epoch AI](https://epoch.ai/benchmarks/fictionlivebench)) | 36 questions on 30 stories that need theory of mind, chronology and inference. Frontier models now score in the 90s at 16K, and some at 128K, but aggregators' figures disagree **[secondary]**. |

Anthropic's note on context engineering
([post](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)) draws the same lesson. It
recommends:
- compaction and structured notes;
- sub-agents that return condensed summaries "often 1,000–2,000 tokens";
- retrieval "just in time";
- "the smallest possible set of high-signal tokens".

**For Open Fantasia:**
- The Writer averages about 18K tokens, and up to 34K, at Scene 19. Most models degrade past 32K.
- A Story is the worst case in Context Rot's terms: coherent text full of near-distractors (many Scenes with the same
  people in the same places).
- NoLiMa matters for recall: a Move rarely reuses a Moment's words ("when you caught me" for the Hogsmeade station).
  Literal matching and long-context attention both miss that; embeddings catch it.
- Keep each agent's prompt focused, give fewer and more relevant Moments rather than more, and put the decisive
  material at the start or the end.

---

## Patterns that recur

1. **Two tiers.** Every system has a small, bounded core that is always present (MemGPT's working context, Letta's
   blocks, Plot Essentials, Key Memories, Bonds), plus a large store searched each turn (archival memory, AI
   Dungeon's memory bank, journals, lorebooks).
2. **Keep the original words.** Raw episodes, rounds and quotes survive. Summaries and extracted facts lose and distort
   (LoCoMo, LongMemEval, the recursive-summary error counts, FABLES, FlawedFictions). Summaries orient; originals are
   what get recalled.
3. **Index the fact, return the source.** LongMemEval's key = value + fact, LoCoMo's observations and Zep's episodes
   linked to facts are the same idea.
4. **Do the work when writing, not when reading.** Importance is set at creation (Generative Agents), memory is
   extracted after an exchange (Mem0, Letta's sleep-time agents, MemoryBooks), and `knownTo` is set at recording here.
   The agents that read get prepared material.
5. **Mix retrieval signals.** Recency + importance + relevance; BM25 + cosine + graph; keywords + vectors. Each single
   signal fails in its own way: literal matching misses paraphrase, embeddings are noisy, and strength-by-use
   entrenches.
6. **Time is the weak axis everywhere.** The fixes are a date on everything, time-aware filters on queries, and
   validity intervals for facts that change.
7. **Change is marked, not deleted.** Zep's two timelines, Mem0's invalid-not-deleted relations and Novelcrafter's
   progressions all keep history. Models do not reconcile conflicting memories reliably (MemoryAgentBench: 28% at
   best across several hops), so reconcile in data.
8. **Belief needs structure outside the model.** Filter what each character perceived before the call (Perceptions to
   Beliefs, SymbolicToM, TimeChara's cutoff), and state what they believe positively (SimpleToM).
9. **Placement matters, and caching agrees.** The end of a prompt has the most influence, the middle the least, and
   caching needs stable material first. Putting retrieved material last satisfies all three.
10. **More context is not more memory.** Long prompts degrade (Lost in the Middle, RULER, NoLiMa, Context Rot, NoCha)
    and invite hallucination on adversarial questions (LoCoMo). Yet long context beats retrieval for the overall view
    (MemoryAgentBench). Use both, each for its own job.
11. **People want to see and fix memory.** Replika's Memory tab, Character.AI's pins, Kindroid's journal, Nomi's mind
    map and AI Dungeon's Context Viewer all show it. Backstage and the Journal are this here.
12. **Evaluation is unsettled.** Vendors' LoCoMo numbers depend on setup, full-context baselines often beat memory
    products, and model judges miss story errors.

## Open questions for Open Fantasia

1. Should recall add relevance to the current Scene? If so, what is the query (the Move, the Writer's beats, the last
   Reply), and how should relevance weigh against who was there and weight?
2. Which clock should recency use: Scenes played, story days, or none? Should being recalled make a Moment more likely
   to be recalled again, or less, to avoid fixation?
3. Should the Mac do all retrieval before each call, as now with `tools: []`, or may the Director or the Writer search
   the Path in a few tool turns while the player waits?
4. How should a false belief be recorded? A belief record per person, with its source (seen, told by whom, rumour,
   lie) and whether it is true, shown in that person's lens as their belief?
5. Should there be records of where things stand between two people other than the Player Character?
   - For which pairs?
   - Written by whom: the Chronicler on the page, the Weaver off it?
   - Seen by which lenses: all of the pair record for the Director, the Weaver and the Writer, and only each person's
     own side in the character lens?
6. Should planted setups be a ledger with a status that the Director must answer each Stretch?
7. How should a Moment about a state that later ended be marked, so it is not recalled as current: an "until" link
   written by the Chronicler, or left to the reader?
8. What sits above chapters in a Story of seven story-years: a yearly fold, or chapters chosen by relevance instead of
   all of them given?
9. Should the Actor see older history than the newest Scene paragraphs, such as weeks and chapters filtered to what
   the people present lived, and what would that do to the character lens?
10. Should names the Actor invents be registered by the Chronicler, and how should they be resolved against people
    already in the Story?
11. Which embedding route and model (Ollama or in process; EmbeddingGemma or Qwen3), and must it be multilingual?
12. What continuity suite, on which frozen Path, run how often, with what failure rate accepted, and how much read by
    a person?
13. Should prompts be reordered by how often each part changes, putting now and the calendar last? How much waiting
    per Reply would that save on each provider?
14. Should the player be able to pin or correct a Moment or a Bond from Backstage? Would each correction be an entry
    on the Path, as docs/adr/0015 requires of everything else?
