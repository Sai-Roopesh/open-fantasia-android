# Human Speech Refactor

## Why characters talk like machines, and what to change so they stop

Status: **phases 0–4 implemented** (see ADR-0024); phase 5 (Transcript Hygiene) and phase 6 (Voice
Pass, deterministic presence, director/actor) remain. Scope: the Roleplay Generation path (everything a
Roleplay Model reads, how it is delivered, how it is sampled, what happens to the reply). The Continuity
Engine is touched only where it manufactures the inputs that cause the problem.

**Implementation notes, where the code departs from the proposal below:**

- Stored column names are kept (`style_rules`, `definition`, `negative_guidance`), the way `fork_turn_id`
  is. What changed is what they mean to the prompt and how the UI labels them: the author's notes on
  the story, extra lore, and the hard limits. `voice_samples` is added to characters, personas, cast
  seeds and cast overrides (migration 15→16), and `voice_metrics` to roleplay jobs.
- The Voice Anchor is always the Primary Character's, so it stays inside the prefix cache. A Cast
  Member speaker gets their lines quoted in the whisper and, when off-stage, a `<speaker_profile>`
  block in the volatile message.
- `<earlier>` (recall) rides in the volatile user message, not the system prompt: it depends on the
  player's prose and would otherwise break the cache on every turn it fired.
- The primary's `voice_style` and `goals` come from the primary Cast Seed (the fields the sheet does not
  lock); its persona, appearance and limits come from the Character Sheet in the voice card, and the
  dossier says "Described above" rather than printing them twice.
- The scene-report instruction stays in the whisper as two lines; the deterministic name-scan
  replacement (§6.3) is not yet built.
- `min_p` is sent to Ollama always and to OpenRouter models whose discovered `supported_parameters`
  include it (`ModelCatalogEntry.supportsMinP`). DRY/XTC are not sent anywhere yet.

This document is organised so it can be executed top to bottom. Section 1 is the diagnosis with
evidence from the code. Section 2 is the target architecture. Section 3 rewrites every prompt block
the model currently reads, one by one, with the current text, the defect, and the replacement.
Sections 4 through 7 cover sampling, delivery, post-processing, measurement and the character sheet.
Section 8 is the phased plan with acceptance criteria. Section 9 lists the tests that pin wording and
must move. The appendix shows one complete assembled request under the new design.

---

## 0. Summary

The characters sound like machines because the request that produces them is written like a machine,
argues with itself, spends most of its instruction budget on prohibitions, puts its voice guidance
where the model attends to it least, feeds the model fifteen exchanges of its own machine-voiced
history as the strongest style signal in the prompt, and then samples with penalties that mechanically
suppress the exact tokens human speech is made of.

The author's own measurement (commit `66d4add`) makes the symptom concrete: on 919 spoken lines,
**11% contain a contraction, 0.4% a hedge, 0.0% a self-correction, median line six words.** Casual
human dialogue runs the other way on every one of those. The commit fixed several causes and correctly
identified that "register is contagious", but then treated the disease with more of the same medicine:
a further ~600 words of rules, nine of them negative, appended in a block titled `style_override`
that opens by telling the model the transcript it is about to read is wrong.

The fix is not another rule. It is:

1. **Cut the standing instruction text by about 80%** and rewrite what remains in the register the
   output should have. Today PromptBuilder + SceneIntent alone render ~2,400 words of instruction with
   89 negations, 30 separate warnings about echoing/recapping/repeating, and 13 mentions of
   "machine", "epigram", "clever", "quotable" — the very things the model is told not to produce.
2. **Move the voice into the character, not the rules.** A voice card with 6–10 sample lines in the
   character's own mouth, delivered as real dialogue turns rather than as description.
3. **Render world state as prose, not JSON.** A model asked to write from `{"primary_emotion":
   "guarded", "emotion_intensity": 7}` writes like a spreadsheet.
4. **Put one short, positive "director's whisper" as the last thing before generation**, and stop
   ending the request with a word count and a JSON contract.
5. **Fix sampling.** Drop `presence_penalty`/`frequency_penalty` 0.4 for roleplay; adopt `min_p` and
   DRY/XTC where the provider supports them.
6. **Fix Mac Host delivery**, which flattens the system prompt into a user message inside a coding
   agent's harness and tells the model it is a "stateless Roleplay Model" executing a "generation
   contract".
7. **Measure.** Turn the author's one-off contraction count into a permanent `VoiceMetrics` module
   and an A/B replay harness over the requests already stored in `roleplay_generation_jobs`.

Everything here is compatible with the ADRs that matter (0006 one pipeline, 0007 cacheable prefix,
0014 total context, 0019 one turn policy, 0020 length as a name, 0021 scene report, 0022 revision,
0023 player direction). Where a change touches an ADR, the section says which and how.

---

## 1. Diagnosis

### 1.1 The request as it stands

`PromptBuilder.render()` (`domain/reducer/PromptBuilder.kt:463`) produces two strings. Delivered through
a direct provider they become a true system message plus real multi-turn history
(`RoleplayContextAssembler.assemble`, `domain/model/RoleplayContext.kt:37`).

```
SYSTEM (cacheable prefix)
  <role_objective>              ~130 words, 4 negations, "ANTI-ECHO RULE"
  <story_setting>               character.story
  <character_persona>           Personality / Appearance / Writing style / Behavior rules / Boundaries
  <user_persona>
  <director_notes>              wrapper: "authoritative instructions you must follow"
  <core_directives>             8 bullets, "bound absolutely", "Under no circumstances"
  <example_conversations>       "USER: ... / NAME: ..." uppercase script format
  <response_contract>           9 bullets, 6 negative, "COMPLETION RULE"
  <show_not_tell>               4 ❌ BAD / ✅ GOOD pairs + 2 meta-paragraphs about the examples
  <continuity_and_variation>    "off-limits to repeat", "never restate"
  --- continuity (cacheable until next checkpoint) ---
  <durable_state>               raw JSON: metadata, spatial_state, entity_state[], relational_state[], narrative_state
  <off_stage>
  <cast_roster>                 "ID: cast_xxx / Name / Aliases / ... / Status: active / Speaks: eligible to speak / World entity: ent_xxx"
  <recalled_exchanges>          "do not treat them as recent, do not continue from them, and do not repeat them back"
  <pins_timeline>

MESSAGES
  user / assistant × up to 15   raw prose (the previous machine-voiced replies)
  user (current):
    <reply_control>             "Mode: SINGLE SPEAKER / Active Speaker: X (cast_id) / exclusively owns dialogue..."
    <speaker_profile>           (when off-stage)
    <style_override>            ~330 words: "THE TRANSCRIPT IS NOT A STYLE GUIDE", "HOW PEOPLE TALK", 6 bullets
    <this_turn>                 TurnPolicy, 4–5 bullets, mostly "Do NOT"
    <story_direction>           wants + 3 paragraphs of hedging
    <variation_rules>           4 shared "Do NOT" + 2 intent-specific
    {player's prose}
    <revision>                  (on regenerate)
    <length_target>             "Write roughly 256-384 words of visible prose, around 320..."
    <scene_report>              JSON tail contract: <scene_state>{"present": [...], "scene_ended": false}</scene_state>
```

One thread reached 96,500 tokens per request, 88% of it accumulated state and 2.3% describing how to
write (`Stage.kt:21-23`). The Stage projection fixed the ratio; it did not fix what the 2.3% says.

### 1.2 Root cause A — prohibition density (the pink elephant, at scale)

Counting only the triple-quoted prompt literals in `PromptBuilder.kt` and `SceneIntent.kt`:

| Measure | Value |
|---|---|
| Words of standing instruction | ~2,400 |
| Negations (never / do not / not / avoid / forbidden / off-limits / under no circumstances / nothing) | **89** — one every 27 words |
| Warnings about echo / recap / restate / repeat / paraphrase / re-stage / remix | **30** |
| Mentions of machine / epigram / clever / quotable / polished / written | **13** |

Add the string literals in `Revision.kt` (12), `StoryDirection.kt` (8), `RecalledExchange.kt` (5),
`ReplyLength.kt` (2) and `SceneReport.kt` and a single request carries on the order of 110 negations.

Three findings apply directly:

- **Mentioning what to avoid increases its frequency.** Castricato et al., *Suppressing Pink Elephants
  with Direct Principle Feedback* (2024, https://arxiv.org/abs/2402.07896): "mentioning that topic in
  the LLM's prompt makes the model more likely to mention it even when instructed not to." Measured on
  OpenHermes-7B: 33% → 36% *with* the avoidance instruction. Frontier models obey better but the
  gradient is the same, and this prompt names its pink elephants — "epigram", "clever", "quotable",
  "machine", "stacked negations" — thirteen times, then supplies four worked ❌ examples of them.
- **Adherence degrades with instruction count.** Jaroslawicz et al., *How Many Instructions Can LLMs
  Follow at Once?* (IFScale, 2025, https://arxiv.org/abs/2507.11538): best frontier models reach 68%
  at 500 simultaneous instructions, with a "bias towards earlier instructions". This prompt carries on
  the order of 80–100 discrete instructions per request. The voice instructions are among the last
  added and the last read, so they are the ones that lose.
- **Positive framing outperforms negative.** Anthropic's current guidance (verbatim): *"Tell Claude
  what to do instead of what not to do — Instead of: 'Do not use markdown in your response' — Try:
  'Your response should be composed of smoothly flowing prose paragraphs.'"* SillyTavern's prompt
  documentation says the same independently: *"The AI will more easily follow instructions about what
  it should do than what it should not do."*

### 1.3 Root cause B — register contagion

The prompt is written in the register of an architecture document. In the rendered
PromptBuilder + SceneIntent literals: "authoritative" ×3, "constraint(s)" ×3, "rule(s)" ×5,
"control" ×4, "mode" ×4, "eligible" ×4, "contract" ×2, "exclusively" ×2, "resolved" ×2, "bound
absolutely", "hard constraint", "eligible to speak". The tag names the model reads carry the same
register: `<response_contract>`, `<reply_control>`, `<core_directives>`, `<variation_rules>`,
`<durable_state>`, `<length_target>`, `<style_override>`. The model is told it is "bound absolutely by
the constraints in `<durable_state>`" and that the Active Speaker "exclusively owns dialogue".

Anthropic (verbatim): *"Match your prompt style to the desired output. The formatting style used in
your prompt may influence Claude's response style."* Commit `66d4add` already observed this
("Register is contagious") and removed "high-fidelity simulation engine" and "COGNITIVE BOUNDARY".
It left the contract/policy/control vocabulary intact and added a block whose first sentence is
"Earlier assistant replies in this transcript may echo or recap the user's actions — that pattern is
wrong".

The world state compounds it. `<durable_state>` is `Json.encodeToString(PromptWorldState)`
(`PromptBuilder.kt:211`): snake_case keys, `emotion_intensity: 7`, `knowledge_boundary: [{"id":
"fact_abc", "body": ...}]`, `is_bidirectional: true`, `micro_position`. The cast roster renders
`ID: cast_3f9a`, `Status: active`, `Speaks: eligible to speak`, `World entity: ent_77c1`. The Stanford
Generative Agents paper (Park et al., 2023, https://arxiv.org/abs/2304.03442) records the same
symptom from a similar architecture: agents "inherited overly formal speech or behavior from the
language model", and "the conversational style of these agents can feel overly formal". Their memory
was natural-language; this one is JSON with integer emotions.

### 1.4 Root cause C — position

Liu et al., *Lost in the Middle* (2023, https://arxiv.org/abs/2307.03172): performance is highest for
information at the beginning or end of a long context and "significantly degrades when models must
access relevant information in the middle". Li et al., *Measuring and Controlling Instruction
(In)Stability in Language Model Dialogs* (COLM 2024, https://arxiv.org/abs/2402.10962): "significant
instruction drift within eight rounds of conversations", attributed to "attention decay over long
exchanges".

Where the voice guidance sits today:

- `<show_not_tell>` and `<continuity_and_variation>` — the middle of a system prompt that is then
  followed by up to 38,000 characters of state and roster. The worst position.
- `<style_override>` — inside the current user message, but *before* the player's prose, before the
  turn policy, before story direction, before variation rules, before the revision block.
- **The last two things the model reads before it writes are a word-count range and a JSON schema.**
  `buildOutputContract` (`PromptBuilder.kt:417`) renders `<length_target>` then `<scene_report>` after
  the player's prose — a position the ADR-0020 comment correctly calls "the position with the most
  force" — and spends it on bookkeeping.

SillyTavern's Author's Note documentation states the operating rule plainly: *"The closer the
Author's Note is to the bottom of the prompt, the more impact it has on the next AI response."* Its
Prompts page adds that post-history instructions "can override the main prompt's instructions". The
request spends that slot on `{"present": [...], "scene_ended": false}`.

### 1.5 Root cause D — the transcript is the strongest few-shot in the room, and it is wrong

Fifteen exchanges of prior assistant prose are delivered as real `assistant` turns. That is the
correct architecture and by far the strongest style signal in the request. RoleLLM (Wang et al.,
2023, https://arxiv.org/abs/2310.00746, Table 7) measured it: dialogue placed as real turns won 63.3%
against zero-shot description at 9.3%. SillyTavern's docs describe the mechanism: *"the AI assumes
that all the messages in history were generated according to the rules in the current main prompt,
and that it should continue to generate messages in the same way."*

So when those fifteen turns are clipped six-word epigrams, the model continues clipped six-word
epigrams, and no paragraph titled "THE TRANSCRIPT IS NOT A STYLE GUIDE" will outweigh fifteen
demonstrations. The `style_override` block is an admission that the history is the problem, followed
by a request to the model to please not notice. You cannot instruct your way past a few-shot. You have
to change the shots. (Section 2.4 and 5.3.)

### 1.6 Root cause E — the request argues with itself

These pairs are rendered in the same request:

| Says | Also says |
|---|---|
| `response_contract`: "Advance the plot by at least one concrete, NEW beat in every reply — ... The scene must end somewhere meaningfully different from where it began." | `this_turn` (Dwell): "Do NOT introduce a new event ... End inside the scene ... Do not manufacture a hook." |
| `response_contract`: "End on an actionable narrative handoff that gives the user a clear opening to respond." | `this_turn` (Close): "You do not need a hook. This scene is allowed to end." |
| `response_contract`: "no reply may echo the sentence structures, rhetorical devices, gestures, or emotional beats of the one before it." | `continuity_and_variation`: "A character's own verbal habits ... repeating those is correct." |
| `response_contract`: "Prefer acting over asking" | same bullet, next sentence: "Questions are still part of how people talk, so ask when a person would" |
| `variation_rules`: "never stack short parallel/staccato sentences into the same cadence more than once" | `style_override`: "Vary length hard. A three-word line next to a rambling one." |
| `role_objective`: "Play the selected Active Speaker as a proactive co-protagonist" | `reply_control`: "Other characters remain silent and may not act. Neutral environmental events are allowed." |
| `example_conversations` renders `NAME:` in uppercase script format | `style_override`: "Spoken lines are speech, not prose" |

ADR-0019 fixed exactly this class of conflict for turn policy ("a note asking for calm, appended
beneath a standing order to escalate, is one more instruction competing in a prompt that already
contradicts itself. This one does not compete. It replaces."). The standing order to escalate is
still in `response_contract` line 119. The replacement never happened; the addition did.

### 1.7 Root cause F — the sampler is fighting the instructions

`KtorLLMClient.kt:326-327` sends `presence_penalty: 0.4, frequency_penalty: 0.4` on every roleplay
request to Groq, Mistral, DeepSeek and OpenRouter. `RoleplayGeneration.kt:23-24` hardcodes the same
defaults; nothing reads them. The comment says "discourage echoing/repetition".

OpenAI's definition (verbatim): *frequency_penalty* — "Positive values penalize new tokens based on
their existing frequency in the text so far". *presence_penalty* — "penalize new tokens based on
whether they appear in the text so far".

What appears most frequently in human dialogue: *I, you, it's, don't, yeah, okay, just, like, I
mean, the character's name, the other character's name.* What appears most frequently in a stalled,
self-correcting, repeating line — "Okay. Okay, water." — is the repeated token. A frequency penalty
is a tax on exactly the surface features the `style_override` block asks for. The author of the DRY
sampler describes classic penalties as "rather blunt instruments that distort the grammar of standard
language" and notes that "Prompting the model to avoid looping has little or no effect"
(https://github.com/oobabooga/text-generation-webui/pull/5677).

Also: temperature 0.92 / top_p 0.94 (`DbRecords.kt:71-72`) is fine, but `top_p` is the wrong
truncation for high-temperature creative writing; Nguyen et al., *Min-p Sampling* (ICLR 2025,
https://arxiv.org/abs/2407.01082): "top-p ... often struggle[s] to balance quality and diversity,
especially at higher temperatures". And on the Mac Host lanes none of these are applied at all
(`RoleplayGenerationCoordinator.kt:130-139`) — they are rendered as *text* in the prompt
(`antigravity-runner.mjs:187-192`: "Requested temperature: 0.92 ... never mention these
preferences"), which is one more machine-register block.

### 1.8 Root cause G — Mac Host delivery demotes the system prompt into a coding agent's task

`renderRoleplayTask` (`antigravity-runner.mjs:126-200`), shared by all three CLI lanes, flattens the
entire request — system prompt and fifteen exchanges — into one text blob headed:

```
# Open Fantasia Roleplay Generation Contract
Generate exactly one new assistant reply for the conversation below.
The content inside <system_instruction> is authoritative and mandatory.
...
<system_instruction>{system prompt}</system_instruction>
<generation_preferences>Requested temperature: ...</generation_preferences>
<conversation><message index="1" role="user">...</message>...</conversation>
Write the next assistant reply now.
```

- **Claude lane** replaces the system prompt with a three-sentence meta (`claude-runner.mjs:23-27`):
  *"You are Open Fantasia's stateless Roleplay Model. The user prompt contains the complete
  authoritative generation contract ... Obey that contract exactly."* The real system prompt is user
  content. The transcript is XML, not turns. RoleLLM's 63% vs 30% result is the cost of that.
- **Codex lane** (`codex-runner.mjs:145-148`): `codex exec ... --sandbox workspace-write ... task`.
  No system prompt argument. Codex's own software-engineering-agent system prompt is active above the
  roleplay. The reply is whatever the agent's last message was.
- **Antigravity lane**: same shape; the runner's own comments describe a CLI that "reaches for tools
  it cannot be granted".

The character is being played by a coding agent that has been handed a contract.

### 1.9 Root cause H — character sheet inputs breed the defect

- `CharacterScreen.kt` labels: "Writing Style / Style Rules", "Behavior Rules / Definition",
  "Negative Guidance / Boundaries". No placeholders, no hints (`grep` for `placeholder`/`supportingText`
  returns nothing). "Writing style" solicits *prose* descriptors — "concise", "economical",
  "measured" — which is how 13 of 15 cast voices came to prescribe epigrams (commit `66d4add`).
- `PromptBuilder.kt:56` renders `core_persona` (UI: "Core Persona / Backstory") under the label
  `Personality`.
- `example_conversations` render as `USER: ... / AYUSHI: ...` — uppercase, script format, one line
  each, inside the system prompt. Ali:Chat's principle (https://rentry.org/alichat): *"What you put
  in, is what you get out. Interesting dialogue in, interesting dialogue out."* One-line zingers in,
  one-line zingers out.
- There is no field anywhere — Character, CastProfile, Persona — for *sample lines*: things this
  person has actually said, at length, in their own mouth. `voice_style` is a description of speech;
  it is not speech.
- The prompt packs (`PortableJsonCodec.kt:300-469`) now warn against "concise"/"economical" (a
  negative list — pink elephant again) and ask for example conversations "as the person actually
  talks", but still ask for `style_rules` as "Writing style directives — tone, vocabulary, mannerisms".

### 1.10 Root cause I — the scene report is the last thing on the model's mind

ADR-0021 is right that the model should report the room. Placing the JSON contract as the final
block before generation (`PromptBuilder.kt:510`) means the model plans structured output while
writing prose. It is also the block most likely to leak register (`"scene_ended": false` is not how
anyone talks). The report belongs either before the prose instruction (so it is read, then displaced
by the whisper), or in a separate cheap call, or replaced by a deterministic name-scan over the reply
against the roster (which is what the Stage does with it anyway — `observedPresence` is matched by
name, `Stage.kt:109-117`).

---

## 2. Target architecture

### 2.1 Principle

**Separate what is true from how to write, and let how-to-write be shown, not told.**

Today one call is asked to be a plot engine, a continuity validator, a presence reporter, a
length-calibrated prose generator and a person, under ~100 rules. The person loses. The redesign puts
truth in a prose dossier the model reads once, puts voice in demonstrations (sample lines and clean
history) the model imitates, and puts the per-turn steer in one short block in the same register as
the output.

### 2.2 The six layers

```
┌──────────────────────────────────────────────────────────────────────────┐
│ F. MEASUREMENT   VoiceMetrics per reply · A/B replay over stored jobs    │
├──────────────────────────────────────────────────────────────────────────┤
│ E. OUTPUT        sampler (min_p · DRY · XTC, no freq/presence penalty)   │
│                  → scene-report split → slop/antithesis lint            │
│                  → optional Voice Pass (small model, dialogue-only edit) │
├──────────────────────────────────────────────────────────────────────────┤
│ D. TURN          one <whisper>, ≤120 words, positive, post-history       │
│                  speaker · scene intent · length · 2–3 voice reminders   │
├──────────────────────────────────────────────────────────────────────────┤
│ C. TRANSCRIPT    15 exchanges as real turns (unchanged) + Voice Anchor:  │
│                  character's sample dialogue injected as the FIRST turns │
│                  + Transcript Hygiene tool to re-voice a robotic history │
├──────────────────────────────────────────────────────────────────────────┤
│ B. WORLD         Stage → PROSE dossier (deterministic renderer)          │
│                  "Vera is in the kitchen. She is guarded, and it started │
│                   when..." — not {"primary_emotion":"guarded",...}       │
├──────────────────────────────────────────────────────────────────────────┤
│ A. VOICE         Voice Card per Character / Cast Member:                  │
│                  how they sound (positive) + 6–10 sample lines           │
│                  + up to 5 hard limits (facts, not prohibitions)         │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Request layout under the new design

Position is a design input, not an afterthought. Read this against §1.4.

```
SYSTEM  (byte-stable per thread; cacheable — ADR-0007 preserved)
  <you>                 3 sentences. Who is writing, whose story, whose turn it isn't.
  <setting>             character.story, as written.
  <voice_card:Primary>  how they sound + sample lines + hard limits
  <player>              persona, brief
  <notes>               director notes, as written, with a one-line frame
  --- continuity (byte-stable until next checkpoint) ---
  <where_things_stand>  PROSE dossier: place, who is here and how they are, what each knows,
                        what is between them, the story so far, the scene now, the last beat
  <who_else>            reachable people, one line each; also-established names
  <earlier>             recalled exchanges (when any), framed as memory
  <pinned>              pins + timeline beats

MESSAGES
  [voice anchor]        user/assistant × 2–4: the character's sample exchanges as REAL turns
  user/assistant × ≤15  the transcript (real turns)
  user                  {player's prose}
  user (or system)      <whisper>  ← the last thing read. ≤120 words. Same register as output.
                          who speaks · what this scene is for · about how long · 2–3 voice lines
                          · (revision, when any) · (report the room, one line)
```

Two things moved and one thing vanished. The voice moved from rules to demonstrations. The per-turn
steer moved to the end and shrank by ~85%. `style_override`, `variation_rules`, `show_not_tell`,
`core_directives`, `response_contract`, `continuity_and_variation` and `reply_control` are gone as
blocks; the three or four sentences worth keeping from them live in `<you>` and `<whisper>`.

### 2.4 Alternatives considered, and which to build in which order

| # | Architecture | What it buys | Cost | Verdict |
|---|---|---|---|---|
| 1 | **Restructure the single call** (§2.3): cut rules, prose dossier, whisper at depth 0, sampler fix | The bulk of the gain; addresses A, B, C, E, F, I | Days. Prompt + renderer + tests | **Do first.** |
| 2 | **Dialogue engineering / Voice Anchor**: sample exchanges as real turns at the head of the transcript | Attacks D at the source; RoleLLM's largest measured effect | Small. Assembler change + a `voice_samples` field | **Do second.** |
| 3 | **Transcript Hygiene**: a one-shot tool that re-voices the last N assistant turns of an existing robotic thread using the new prompt, with player approval | Existing long threads otherwise stay poisoned for 15 exchanges after the fix | Medium. New flow + UI | Do third, for existing threads only. |
| 4 | **Voice Pass**: second, cheap call that edits *dialogue lines only* in the draft (Self-Refine pattern, Madaan et al. 2023, https://arxiv.org/abs/2303.17651) | Model-independent floor on speech quality; can also enforce slop/antithesis lint | +latency (~30–50%), +cost; must not touch action prose or facts | Optional, behind a thread setting. Measure before shipping. |
| 5 | **Director/Actor split**: tiny planning call ("what happens; what the speaker wants; what they won't say") then the actor writes | Removes the plot-engine burden from the voice call; resolves E structurally | +1 call/turn; planning register can leak if plan is shown verbatim | Consider after 1–3 if plot-drive still dominates voice. |
| 6 | **Fine-tune / LoRA per character** (Character-LLM, Shao et al. 2023, https://arxiv.org/abs/2310.10158) | Strongest possible voice fidelity; they note tuned models "generate shorter text, which is more natural" | Not viable for a BYO-API Android app | No. |
| 7 | **Sampler-only fix** (min_p, DRY, XTC, antislop) | Real, but bounded by provider support | Trivial where supported | Do alongside 1; see §4. |

### 2.5 Relationship to existing ADRs

- **ADR-0007 / caching.** The system prompt stays byte-stable across turns and speaker changes. The
  whisper is in the volatile user message, as `reply_control` is today. The voice anchor turns are
  static per thread and sit at the head of `messages`, so they are inside any provider prefix cache.
- **ADR-0014 / total context.** Nothing is dropped. `RoleplayContext` gains `voiceSamples` (per cast
  member). The completeness test's reflection over `PromptWorldState` field names must change,
  because a prose dossier does not print `emotion_intensity` literally — replace with per-field
  sentinel tests as already done for hand-rendered types (§9).
- **ADR-0019 / one turn policy.** Preserved and strengthened: the standing "advance the plot every
  reply" in `response_contract` is deleted, so the policy really is the only source of drive.
- **ADR-0020 / length as a name.** Preserved; the directive moves inside the whisper and drops from
  three sentences to one.
- **ADR-0021 / scene report.** Preserved as a mechanism; the *instruction* moves earlier and shrinks,
  or is replaced by a deterministic name-scan (§6.3). Codec unchanged.
- **ADR-0022 / revision.** Preserved; rendered inside the whisper, shorter, and the rejected prose
  keeps its own tag.
- **ADR-0023 / player direction.** Preserved; rendering loses two of its three hedging paragraphs.

---

## 3. Prompt rewrites, block by block

Conventions for every rewrite below:

- Written in the register wanted back: plain, spoken, second person, present tense.
- A limit is stated as a fact about the world ("Vera does not know about the loan") rather than a
  prohibition about writing ("NEVER reference information absent from the knowledge_boundary").
- No block names another block. The model does not need to know there is a `<reply_control>`.
- No block mentions "the model", "the prompt", "the transcript", "instructions", or "the user"
  as a role. The player is *the player* or by persona name; the writer is *you*.
- Where a negative is unavoidable (safety, boundaries) it is short and stated once.

### 3.1 `<role_objective>` → `<you>`

**Current** (`PromptBuilder.kt:39-45`, ~130 words):

> You are writing a character in an ongoing story. $charName is the story's primary character, but
> the latest turn's <reply_control> selects who owns the reply. Play the selected Active Speaker as a
> proactive co-protagonist with personal goals, opinions, and agency. In Ensemble mode, follow the
> listed ensemble contract. NEVER speak, act, decide, think, feel, or narrate for the user, and never
> write from the user's point of view. The user controls their own character exclusively — end your
> reply at the point where it is their turn to act, and never put words, choices, or reactions in
> their mouth. The recent transcript already contains the exact last scene beats. Build on them
> instead of re-summarizing them. ANTI-ECHO RULE: The user's turn is already visible in the
> transcript — the reader saw it. NEVER repeat, paraphrase, recap, quote, or verbally acknowledge what
> the user just said or did. [...]

**Defects.** Four NEVERs in 130 words. Names three other blocks. "ANTI-ECHO RULE" in caps. "owns the
reply", "Ensemble contract", "controls their own character exclusively" — legal register. The
anti-echo instruction appears here and in five other places.

**Rewrite** (~55 words):

```
<you>
You're writing {charName}'s side of a story that {playerName} is writing the other side of.
Whoever the note at the end names is the one you're playing this turn — their words, their
choices, what they notice and feel. {playerName} writes {playerName}. Stop where it's their
move.

What they just did has landed. Pick up from the effect of it, not the description of it.
</you>
```

If there is no persona, `{playerName}` renders as "the player". That single last sentence is the
whole of the anti-echo rule; §3.13 shows where it is reinforced once more, positively, at the end.

### 3.2 `<story_setting>` → `<setting>`

Unchanged content. Rename the tag; tags are read too.

### 3.3 `<character_persona>` → `<voice_card>`

**Current** (`PromptBuilder.kt:55-63`):

```
Personality: {core_persona}
Appearance: {appearance}
Writing style: {style_rules}
Behavior rules: {definition}
Boundaries: {negative_guidance}
```

**Defects.** "Writing style" solicits prose adjectives. "Behavior rules" and "Boundaries" solicit
prohibitions. `core_persona` (UI: "Core Persona / Backstory") mislabelled. No sample speech at all.

**Rewrite.** New shape, new fields (§7 has the schema and migration):

```
<voice_card name="{name}">
{core_persona}

How {name} sounds:
{how_they_talk}

Things {name} has said, in {their} own words:
- "{sample_line_1}"
- "{sample_line_2}"
- ...  (6–10 lines; some short, some rambling, at least one that trails off or restarts)

What's true about {name} that the story can't contradict:
- {hard_limit_1}
- ...  (≤5, each a fact — "has never been to the coast", "won't say her father's name aloud")

{appearance, one paragraph, only if non-empty}
</voice_card>
```

`how_they_talk` replaces `style_rules` and is prompted in the UI with a placeholder (§7). The sample
lines are the load-bearing part. They are also delivered a second time as real turns (§3.7 / §5.3),
which is where they do most of their work; here they serve as reference so a mid-thread speaker
switch has something to read.

For the primary character, `definition` (UI: "Behavior Rules / Definition") is folded into
`core_persona` on migration — the prompt packs describe it as "Additional lore, abilities,
relationships, or world-building details", which is persona content. `negative_guidance` becomes
`hard_limits`, and the migration splits it on newlines/semicolons and keeps the first five.

### 3.4 `<user_persona>` → `<player>`

**Current**: label/value list. Fine content, wrong labels.

**Rewrite:**

```
<player name="{persona.name}">
{persona.identity}. {persona.backstory}
They talk like this: {persona.voiceStyle}
They want: {persona.goals}
{persona.boundaries → "They won't: ..." only if non-empty}
</player>
```

### 3.5 `<director_notes>` → `<notes>`

**Current** wrapper: "Out-of-character directions the user has set for THIS thread. Treat them as
authoritative instructions you must follow (tone, pacing, length, focus, content). They override
default stylistic choices, but never the hard constraints in <durable_state> or the rule that you
never act, speak, or decide for the user."

**Rewrite:**

```
<notes>
From {playerName}, about how they want this story written:
{directorNotes}
</notes>
```

The precedence sentence is deleted. A player's standing notes and a world fact almost never collide;
when they do, the fact is in the dossier where the model reads it as true, and adjudication text in
the wrapper has never been what decided it.

### 3.6 `<core_directives>` — delete

All eight bullets are either (a) meta about other blocks, (b) prohibitions restating what the dossier
already makes true, or (c) the anti-echo rule again. "WHAT THEY KNOW: Under no circumstances may an
entity act upon, reference, or hint at information absent from their specific knowledge_boundary in
the state JSON" becomes, in the dossier, "Vera doesn't know about the loan." That sentence is a
constraint a person can hold in their head while talking. The bullet is not.

### 3.7 `<example_conversations>` → Voice Anchor turns

**Current** (`PromptBuilder.kt:104-114`): rendered in the system prompt as

```
Example 1
USER: {user_line}
AYUSHI: {character_line}
```

**Defects.** Uppercase script labels. In the system prompt, so weakest position and weakest form.
RoleLLM Table 7: description 9.3% / few-shot-in-prompt 29.8% / few-shot-as-dialogue 63.3%.

**Rewrite.** Remove from the system prompt. In `RoleplayContextAssembler.assemble`, prepend the
populated examples as real turns *before* the transcript window:

```kotlin
// Voice anchor: the character's own sample exchanges, as dialogue, ahead of the story so far.
// They are demonstrations, and a demonstration in the assistant's own turn slot is worth more than
// the same words quoted in a system prompt (RoleLLM, Table 7). Static per thread, so cacheable.
voiceAnchor.forEach { ex ->
    add(RoleplayMessage("user", ex.user_line))
    add(RoleplayMessage("assistant", ex.character_line))
}
```

Rules for the anchor:

- Include only examples where both lines are non-blank.
- Cap at 4 exchanges / 1,200 characters of assistant text, so a thread's first fifteen exchanges are
  not crowded out.
- They precede the fifteen-exchange window and do not count toward it. They are excluded from
  `transcript_exchange_ids` so nothing downstream mistakes them for story.
- The anchor is always the *primary character's*, and it is static per thread. A Cast Member
  selected as Active Speaker gets their voice from two places that are already volatile: their
  `<voice_card>` fragment in `speaker_profile` and the two or three sample lines quoted in the
  whisper. Swapping the anchor per speaker was considered and rejected: the anchor sits at the head
  of `messages`, so changing it invalidates the provider prefix cache from that point on every
  speaker switch, where today's `speaker_profile` in the final user message costs nothing.
- When the anchor and the first real exchange would be adjacent, insert nothing between them. A
  separator line ("— the story begins —") was considered and rejected: it is one more thing in the
  request that is not story.

### 3.8 `<response_contract>` — delete

Nine bullets. Six negative. The three positive ones ("Advance the plot by at least one concrete NEW
beat", "End on an actionable narrative handoff", "COMPLETION RULE") each contradict a turn policy
(§1.6). Everything worth keeping is one sentence in `<you>` and one line in the whisper.

### 3.9 `<show_not_tell>` — delete the ❌ examples; retire the block

The ✅ examples are now in a better voice (commit `66d4add`) but they demonstrate *one* nameless
woman in *one* kitchen, four times, and they sit in the system prompt. They compete with the
character's own voice rather than supporting it. The ❌ examples are four fully-written demonstrations
of the failure mode, which the pink-elephant result says the model will partly imitate. The two
meta-paragraphs ("THE ✅ LINES ARE ALSO SHOWING YOU HOW PEOPLE TALK", "LENGTH IS NOT PART OF THE
LESSON") are instructions about instructions.

Replacement: the character's own sample lines (§3.3, §3.7). If a character has no sample lines yet,
the prompt pack (§7.3) generates them; the app never falls back to generic examples.

### 3.10 `<continuity_and_variation>` and `<variation_rules>` — delete

"Every reply must read as a genuinely new beat, never a remix of your own last one ... treat their
content and their narrative shape as off-limits to repeat." Then a paragraph explaining that this
"governs beats, not voice". Then, per turn, four more "Do NOT reuse / Do NOT repeat / Do NOT reuse /
Do NOT lean on" bullets plus two intent-specific ones.

Repetition of *structure* across replies is a sampling problem before it is a prompting problem. The
DRY PR is explicit that prompting against loops "has little or no effect". XTC addresses the
non-verbatim kind ("paraphrased/structural repetition, which repetition penalties cannot detect").
Section 4 configures both where available. Where they are not available, the one line in the
whisper — "Start somewhere other than where the last reply started" — is the entire retained rule,
and only when `SceneIntent != Dwell`.

### 3.11 `<durable_state>` (JSON) → `<where_things_stand>` (prose)

**Current** (`PromptBuilder.kt:210-221`): `json.encodeToString(PromptWorldState.serializer(), ...)`.

**Rewrite.** A deterministic renderer, `DossierRendering.render(world, stage)`, that produces prose
from the same `PromptWorldState`. No model, no summarising, nothing omitted — the same data in
sentences. Template, per section:

```
<where_things_stand>
It's {narrative_timestamp}. {transition_type→ "This continues straight on from the last exchange." |
"The scene has changed since the last exchange." | "Time has passed since the last exchange."}

WHERE
{current_location.name}: {description}. {environmental_modifiers joined as a sentence, if any}
From here you can get to {adjacent_locations names}.
{For each other known_location: one line "— {name}: {description}"}

WHO'S HERE
{For each OnStage entity, ordered cast-first then salience:}
{canonical_name}{ (also called aliases)} — {entity_type unless "character"}.
  {account, if non-empty — this already IS prose; use as-is}
  Right now: {primary_emotion}{intensity→ adverb: 1-3 "faintly", 4-6 "", 7-8 "very", 9-10 "overwhelmingly"},
  since {emotion_catalyst}.
  {Where in the room: micro_position from entity_placements, if any}
  Knows: {knowledge_boundary bodies joined "; "}
  {Traits: ...}  {Wants: ...}  {Keeping to themself: secrets ...}  {Can: abilities ...}  {Has: possessions ...}
  (each bucket one line; empty buckets omitted)

BETWEEN THEM
{For each relationship among present entities:}
{source_name} and {target_name}: {relationship_type, lowercased} — {dynamic_status}.

THE STORY SO FAR
{story_summary}

THE SCENE
{scene_summary}

WHAT JUST CHANGED
{last_turn_beat}
</where_things_stand>
```

Design notes:

- `emotion_intensity: 7` becomes "very guarded". The integer never reaches the model.
- `entity_id`, `fact.id`, `relationship_id`, `edge_id`, `location_id`, `is_bidirectional`,
  `version`, `current_turn_id` never reach the model. ADR-0008 already established the model never
  needs identifiers; the roleplay model has been receiving them anyway. `is_present` is implied by
  which section the entity appears in.
- "Knows:" is the knowledge boundary stated as what the person knows. The "may not reference
  information absent from" rule is now unnecessary; a reader who is told what Vera knows writes Vera
  knowing that.
- The `<off_stage>` block becomes `<who_else>` with the same content: "Not here right now but could
  be: {name} (also {alias}) — {type}. {account}" and "Also in this story: {names}".
- `<cast_roster>` merges into WHO'S HERE for present members. Its current fields `ID`, `Origin`,
  `Evidence`, `Status`, `Speaks`, `World entity` are dropped from the model-visible render. `Voice`
  → "Sounds like: {voice_style}" and, when `voice_samples` exist, two of them quoted. Absent members
  keep the one-line form.
- Character budget: the same `StageBudget` applies to the rendered prose length. Prose is ~10–20%
  shorter than the equivalent JSON.

### 3.12 `<recalled_exchanges>` → `<earlier>`

**Current**: "Earlier moments this turn seems to be reaching for, quoted exactly. They already
happened and are long past — do not treat them as recent, do not continue from them, and do not
repeat them back. The conversation below is still where the scene is."

**Rewrite:**

```
<earlier>
Something {playerName} just said reaches back to these moments. They're memory now — what they
left behind is what matters.

— {n} exchanges ago —
{playerName}: {playerProse}
{speakerName}: {assistantProse}
</earlier>
```

`RecallRendering`'s own comment says two A/Bs failed to show this block moving a reply. The rewrite
is cheaper and not worse; if a third A/B also shows nothing, drop the block and keep the retrieval
for the Continuity Engine only.

### 3.13 The current user message: seven blocks → one `<whisper>`

**Current** (built by `buildReplyControlContext` + `buildOutputContract` + revision): `reply_control`,
`speaker_profile`, `style_override`, `this_turn`, `story_direction`, `variation_rules`, then prose,
then `revision`, `length_target`, `scene_report`. Roughly 700–900 words wrapped around the player's
prose, of which the last thing read is a JSON schema.

**Rewrite.** Player's prose first, then exactly one block, last:

```
{player's prose}

<whisper>
You're {speakerName} now.{ if off-stage: " {They're} {where they are}; that's where you write from."}
{ if ensemble: "Anyone in the room can speak this time — {names}. Keep them sounding like themselves." }

{TurnPolicy line — one sentence, see §3.14}
{StoryDirection line — zero or one sentence, see §3.15}
{Revision — see §3.16, when present}

Talk like {speakerName} talks: {two or three of their sample lines, quoted}. Contractions.
Sentences that don't all come out the same length. It's fine to say something plain.
{ if SceneIntent != Dwell: "Start somewhere other than where the last reply started." }

About {low}–{high} words. Finish the thought and stop.
{ ReplyLength.Unbounded: "As long as it needs. Stop when it's done." }

Then, on its own last line, who's in the room when you stop and whether the scene ended:
<scene_state>{"present": ["{name1}", "{name2}"], "scene_ended": false}</scene_state>
</whisper>
```

Word count: 90–130 depending on options. Compare ~800 today.

Design notes:

- **Position.** After the prose. This is the ADR-0020 "position with the most force". It is also
  what SillyTavern calls the post-history instruction: "the final instructions that the AI receives
  before generating a response. The AI usually gives them a higher priority than the main prompt".
- **Register.** Read it aloud. It sounds like someone leaning over to a writer, which is what it is.
- **The sample lines are quoted again here.** This is deliberate redundancy at the point of maximum
  attention. Two or three, rotated by turn index so the model does not see the same two every time.
- **The scene report stays**, in one sentence, with the schema shown once. It is no longer the last
  thing — the whisper's voice lines and the length are. If §6.3's deterministic name-scan proves
  adequate, delete these two lines entirely.
- **`speaker_profile`** (full profile for an off-stage speaker) stays as a separate block *before*
  the whisper when needed; it is a dossier fragment, not a steer. Rendered in the §3.11 prose form.
- **Nothing in the whisper mentions the transcript, previous replies, echoing, recapping, or
  machines.**

### 3.14 `TurnPolicy.directive` → one sentence each

**Current**: 4–5 bullets per intent, mostly "Do NOT".

**Rewrite** (`SceneIntent.kt`, `TurnPolicy.directive`):

| Intent | Line |
|---|---|
| Dwell | `Stay in this moment. Nobody arrives, nothing rings; go further into what's already here — what it costs, what isn't being said.` |
| Develop | `Move it along from inside the room: a decision, an admission, a shift — from someone who's already here.` |
| Escalate | `Push. Do something {playerName} didn't hand you — a choice, a revelation, someone at the door, a move to {an adjacent place by name}.` |
| Close | `Let this scene land. Settle what it raised; it's allowed to just end.` |

`variationRules()` is deleted. The one Dwell-specific variation rule ("A feeling already shown may be
returned to and taken further") is now the Dwell line itself.

### 3.15 `StoryDirectionRendering.render` → at most two sentences

**Current**: heading + two lists + three hedging paragraphs.

**Rewrite:**

```
{ if ahead non-empty: }
Where {playerName} wants this to get to, eventually: {ahead bodies joined "; "}. Not this reply
necessarily — when it fits.
{ if reached non-empty: }
Already happened, don't stage again: {reached bodies joined "; "}.
```

The "(asked for N exchanges ago)" stamps stay; they are one token each and they tested useful.

### 3.16 `RevisionRendering.render` → shorter, same structure

**Current**: ~120 words with "KEEP EVERYTHING ELSE" in caps.

**Rewrite** (inside the whisper, after the turn policy line):

```
{ if rejected prose exists: }
The reply below didn't land and never happened:
<rejected_reply>
{rejected}
</rejected_reply>
{ if direction: }
Write it again — same scene, same people, same moment, same speaker, about the same length — and
change just this: {direction}. Everything the note doesn't touch was fine.
{ else: }
Write it again with a different choice about what happens — same scene, same people, same
moment, same speaker, about the same length. Don't open the way that one opened.
{ if no rejected prose (fresh brief): }
Fresh attempt. {playerName} asked for this, out of character: {direction}. It shapes the reply;
nobody in the story said it.
```

### 3.17 `ReplyLengthCalibration.directive` → one sentence

**Current**: three sentences. **Rewrite**: `About {low}–{high} words. Finish the thought and stop.`
Unbounded: `As long as it needs. Stop when it's done.`

### 3.18 `SceneReportCodec.outputContract` → two lines (or gone)

**Current**: seven lines including two bullets of field definitions and "If you are unsure of any
field, omit it or leave the block out entirely — nothing depends on it being there."

**Rewrite**: the two lines shown in §3.13. The codec is unchanged.

### 3.19 Mac Host `renderRoleplayTask` and runners

**Current** (§1.8): flattened blob, "Roleplay Generation Contract" heading, `<system_instruction>`
wrapper, `<generation_preferences>` block, `<message index= role=>` XML.

**Rewrite:**

- **Claude lane.** Pass the *actual* system prompt through `--system-prompt`. Delete
  `ROLEPLAY_SYSTEM_PROMPT` ("You are Open Fantasia's stateless Roleplay Model ..."). Deliver the
  messages as a plain chat transcript in `-p`:

  ```
  {playerName}: {user_text}

  {speakerName}: {assistant_text}

  ...

  {playerName}: {current prose}

  <whisper>...</whisper>
  ```

  No heading, no "Generate exactly one new assistant reply", no `<message index="7" role="assistant">`.
  The names carry the roles. If `-p` argv length becomes a problem, pipe via stdin (the CLI reads
  stdin when `-p` is given no argument; verify against the installed version before relying on it).
- **`<generation_preferences>`** is deleted on every lane. Telling a model its requested temperature
  is 0.92 and "never mention these preferences" is pure machine register with no effect on sampling.
- **Codex lane.** `codex exec` runs a software-engineering agent; there is no system-prompt flag in
  the invocation used. Investigate whether the installed Codex supports a custom-instructions file
  or model-instructions override via `-c`; if it does, deliver the system prompt there and the chat
  transcript as the task. If it does not, this lane should be labelled in the UI as "experimental,
  coding-agent harness" and excluded from voice A/Bs — its results will not be attributable to the
  prompt.
- **Antigravity lane.** Same as Codex.
- **`validateRoleplayOutput`** stays as-is. Add the slop lint (§6.2) as a *warning* logged with the
  job, not a rejection.

### 3.20 Prompt packs (`PortableJsonCodec.kt:300-469`)

- Character pack: replace `style_rules` guidance ("Writing style directives — tone, vocabulary,
  mannerisms") with `how_they_talk`: *"How this person sounds when they speak. Where they're from in
  their vowels, what they say when they're stalling, the word they lean on, whether they finish
  sentences, how they swear or don't. Write it about a person, not about prose."* Replace
  `negative_guidance` with `hard_limits`: *"Up to five things that are simply true about them and
  the story can't contradict — places they've never been, names they won't say, things they don't
  know. Facts, not rules."* Add `voice_samples`: *"Eight to ten things they've said, in quotes, on
  different days about different things. Make them uneven: a two-word one, a rambling one, one that
  restarts, one that's flat and ordinary. This is what the roleplay model imitates most, so write
  them the way the person actually talks, not the way a novel would polish them."*
- Cast pack: add `voice_samples` with the same guidance. Drop the sentence listing forbidden words
  ("Avoid 'concise', 'economical' ..."); the positive description above makes it unnecessary and the
  list is a pink elephant.
- Persona pack: same `voice_samples` addition; same deletion.
- `example_conversations` guidance is good as written; keep, and note that these become the voice
  anchor turns (§3.7) so each `character_line` should run 2–6 sentences with at least one spoken
  line.

### 3.21 Continuity Engine `PROMPT.md`

The `voice_style` guidance ("describe speech habits rather than efficiency ... Avoid 'concise',
'economical', 'precise', 'measured' and 'controlled'") is correct in intent and negative in form.
Rewrite to the positive version in §3.20 and add a `voice_samples` operation: when a Discovered Cast
Member has spoken in the evidence transcript, the engine may copy up to six of their actual lines
verbatim into `voice_samples` (an `add_voice_sample` op in `draft.schema.json`; the Compiler dedupes
and caps at ten). Real lines the model itself wrote in a good turn are the best possible anchor for
that character's future turns.

---

## 4. Sampling and decoding

### 4.1 Changes

| Parameter | Today | Change | Why |
|---|---|---|---|
| `presence_penalty` | 0.4 hardcoded (`KtorLLMClient.kt:326`) | **0.0** for roleplay | Penalises names, "I", "you", "okay", repeated fillers — the surface of speech (§1.7). |
| `frequency_penalty` | 0.4 hardcoded (`:327`) | **0.0** for roleplay | Same. If a provider offers nothing better and loops appear, cap at 0.1. |
| `temperature` | 0.92 per character | keep; default 0.95 | — |
| `top_p` | 0.94 per character | **1.0 when `min_p` is available**; else keep | min-p paper: top-p degrades at high temperature. |
| `min_p` | absent | **0.05** where supported (OpenRouter passes it to many backends; Ollama `min_p`; llama.cpp servers) | Dynamic truncation that preserves coherence at temp ≥ 0.9. |
| DRY | absent | `dry_multiplier 0.8, dry_base 1.75, dry_allowed_length 2, dry_sequence_breakers ["\n", ":", "\"", "*", {speaker names}]` where supported (llama.cpp-based servers via OpenRouter/Ollama; check current Ollama option list) | Penalises *sequences* that extend a prior sequence, exponentially in length; leaves short incidental repeats (speech) untouched. |
| XTC | absent | `xtc_threshold 0.1, xtc_probability 0.5` where supported | Removes the *most* probable token when several are viable — the slop token — while leaving single-choice tokens (grammar, names) alone. |
| `repetition_penalty` | absent | leave absent | Blunt; same failure as frequency penalty. |

### 4.2 Provider capability matrix (to be encoded in `RoleplayProviderCapabilities`)

| Provider | temp | top_p | min_p | presence/freq | DRY | XTC | Notes |
|---|---|---|---|---|---|---|---|
| Google (Gemini API) | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | `topK` available; leave default |
| Groq | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | set penalties to 0 |
| Mistral | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | set penalties to 0 |
| DeepSeek | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | set penalties to 0 |
| OpenRouter | ✓ | ✓ | per-model | ✓ | per-model | per-model | read `supported_parameters` from `/models` (already fetched, `KtorLLMClient.kt:168`) and send only what is listed |
| Ollama | ✓ | ✓ | ✓ | ✗ | version-dependent | version-dependent | send `min_p`; probe for `dry_*`/`xtc_*` acceptance once per connection |
| Mac Host CLIs | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | unchanged; the prose does the work |

Implementation: extend `RoleplayGenerationSettings` with nullable `min_p`, `dry`, `xtc` fields; the
adapter sends a field only when the capability row says so. Remove the two hardcoded `put(...)` lines
at `KtorLLMClient.kt:326-327`. Persist the *sent* settings on the job row so A/Bs can stratify.

### 4.3 Anti-slop at decode time (optional, local backends)

The Antislop sampler (Paech, https://github.com/sam-paech/antislop-sampler; paper
https://arxiv.org/abs/2510.15061) backtracks on multi-token slop phrases and regex patterns such as
"not X, but Y". It exists for llama.cpp-family servers (`antislop-vllm` for API endpoints exposing
logprobs). Not reachable from the Android adapter for most providers; note it as the recommended
configuration for a self-hosted Ollama/KoboldCpp backend and move on.

---

## 5. Transcript layer

### 5.1 Real turns everywhere

Direct providers already send real turns. The Mac Host Claude lane must (§3.19). Codex/Antigravity
cannot until they expose a system-prompt override; label them.

### 5.2 Voice Anchor

Specified in §3.7. Implementation touches `RoleplayContextAssembler.assemble` (new parameter
`voiceAnchor: List<ExampleConversation>`), `ChatViewModel` (supply from character or active speaker),
`RoleplayGenerationRequest` (carry it so a frozen request replays identically).

### 5.3 Transcript Hygiene (existing threads)

A thread with 300 machine-voiced exchanges will keep producing machine voice for fifteen exchanges
after the prompt changes, because the window is the few-shot. Offer, once per thread after upgrade, a
"Re-voice recent replies" action:

1. For the last *k* (default 6) committed assistant replies on the current branch, run a **Voice Pass**
   (§6.4) with the new prompt — dialogue lines only, actions and facts untouched.
2. Show each before/after; the player accepts or keeps the original per reply.
3. Accepted rewrites replace `assistant_text` in place. No new exchange, no checkpoint owed
   (ADR-0015: an edit owes an update only when it moves the baseline; this does not).

This is the only way the existing long threads recover in less than fifteen turns.

---

## 6. Output layer

### 6.1 Scene report split — unchanged

`SceneReportCodec.split` stays.

### 6.2 Slop lint (warning, not rejection)

A pure `VoiceLint` object applied to committed prose, results stored beside the job for metrics and
optionally surfaced as a subtle UI marker. Initial pattern set (extend from the EQ-Bench slop list,
https://github.com/sam-paech/slop-score):

```
antithesis:   \bnot\s+(?:just\s+|only\s+|merely\s+)?[^.,;—–-]{2,40}?[,—–-]\s*(?:but|it's|it was|rather)\b
              \bit(?:'s| is| was) not\s+[^.,;—–-]{2,40}?[.;,—–-]\s*it(?:'s| is| was)\b
              \bno\s+\w+,\s+no\s+\w+,\s+(?:just|only)\b
slop phrases: a testament to | shivers? (?:ran |run )?down | the weight of (?:it|that|the) |
              something (?:shifted|flickered|unspoken) | a beat\. | let out a breath (?:s?he )?didn't know |
              barely above a whisper | the silence stretched | eyes (?:searching|scanning) (?:his|her) face |
              couldn't help but | found (?:him|her)self | in that moment | a mix(?:ture)? of \w+ and \w+
dash density: em/en dashes per 100 words > 3
epigram end:  final sentence of a spoken line ≤ 8 words AND previous sentence ≥ 15 words AND no contraction
```

Wikipedia's *Signs of AI writing* page names the antithesis family ("Not just X, but also Y", "Not X,
but Y", "Y rather than X") as the canonical tell; EQ-Bench weights "not-x-but-y patterns" at 25% of
its slop score. The lint does not reject — a false positive rejecting a good reply is worse than a
slop line getting through — but it feeds §6.5 and, when the Voice Pass is on, tells it what to fix.

### 6.3 Deterministic presence (candidate replacement for the JSON tail)

`observedPresence` is already matched by *name* against entities (`Stage.kt:109-117`). A scan of the
committed prose for each roster name/alias, plus the player persona name, yields the same set in most
cases. Prototype: run both for 200 stored replies; if the name-scan agrees with the model's report on
≥ 90% of `present` sets, drop the `<scene_state>` instruction and derive `scene_ended` from a small
set of closers or leave it false. This removes the last piece of machine register from the request.

### 6.4 Voice Pass (optional second call)

Behind a per-thread toggle. A small, fast model (Haiku-class / Flash-class / 8B local). Input: the
draft reply, the speaker's voice card, the whisper's voice lines, and the lint findings. Prompt:

```
<voice_pass>
Below is a reply written for {speakerName}. Keep every action, every fact, every beat, and the
length. Change only what's inside quotation marks — the spoken lines — so they sound like
{speakerName} actually talking:

{two or three sample lines}

Contractions. Uneven sentence lengths. A plain line is fine. Where the lint below flagged
something, rewrite that line.

{lint findings, one per line, or "Nothing flagged."}

Return the whole reply with only the spoken lines changed.
</voice_pass>
```

Guard: diff the output against the draft; if more than 40% of non-quoted characters changed, discard
the pass and commit the draft. Measure before enabling by default (§8).

### 6.5 VoiceMetrics

A pure Kotlin object computed on every committed reply and stored on the job row. This is the
author's `66d4add` measurement made permanent.

```kotlin
data class VoiceMetrics(
    val spokenLines: Int,            // segments inside quotation marks
    val contractionRate: Double,     // lines containing 're|'s|'t|'ll|'ve|'d|'m / spokenLines
    val hedgeRate: Double,           // lines containing (i mean|i guess|sort of|kind of|maybe|i think|well,|um|uh|like,) / spokenLines
    val restartRate: Double,         // lines containing (—|–|\.\.\.) mid-line or a repeated word "X, X" / spokenLines
    val medianLineWords: Double,
    val lineWordsCV: Double,         // coefficient of variation of words-per-line (lumpiness)
    val antithesisPer1k: Double,     // §6.2 antithesis matches per 1,000 words
    val slopHitsPer1k: Double,
    val dashPer100: Double,
    val epigramEndRate: Double,      // §6.2 definition
    val questionRate: Double         // lines ending in ? / spokenLines
)
```

Baseline from the author's measurement: contraction 0.11, hedge 0.004, restart 0.00, median 6.

Initial targets (calibrate against a human sample — e.g. the *player's own* lines in the same
threads, which are the closest available register reference, and one published film script):

| Metric | Baseline | Target after Phase 1–2 |
|---|---|---|
| contractionRate | 0.11 | ≥ 0.50 |
| hedgeRate | 0.004 | ≥ 0.05 |
| restartRate | 0.00 | ≥ 0.03 |
| medianLineWords | 6 | 8–14 |
| lineWordsCV | (unmeasured) | ≥ 0.8 |
| antithesisPer1k | (unmeasured) | ≤ 0.5 |
| epigramEndRate | (unmeasured) | ≤ 0.10 |

### 6.6 A/B replay harness

`roleplay_generation_jobs` already stores every frozen request beside its reply. Build a host-side
script (`tools/continuity-worker/replay.mjs`, or a Kotlin test-scoped tool) that:

1. Loads N stored requests (stratified by model and by thread age).
2. Re-renders the same `RoleplayContext` under the new `PromptBuilder` (the context is total, so this
   is a pure function of stored inputs — ADR-0014 pays off here).
3. Generates both variants with identical sampler settings.
4. Computes `VoiceMetrics` on both; runs a blind pairwise judge with a fixed rubric ("Which reply
   sounds more like a person talking? Which is more in character? Which advances the scene
   appropriately for its intent?"), randomising order.
5. Reports metric deltas with bootstrap CIs and judge win-rate with a binomial CI.

The RecallRendering comment shows the author already does this by hand and correctly refuses to ship
on p≈0.26. Make it a script so every prompt change pays for itself or is reverted.

---

## 7. Character sheet, schema and UI

### 7.1 Schema (Room migration N → N+1)

`CharacterEntity`:
- rename `style_rules` → `how_they_talk` (data migrated as-is)
- rename `negative_guidance` → `hard_limits` (migrated: split on `\n|;`, first 5, joined `\n`)
- `definition` → appended to `core_persona` with a blank line; column dropped
- add `voice_samples: List<String>` (empty)

`CastProfile` (and `draft.schema.json`, `compiler.mjs`, portable JSON `version` bump):
- add `voice_samples: List<String> = emptyList()`

`PersonaEntity`:
- add `voice_samples: List<String>` (empty)

`ExampleConversation` unchanged.

### 7.2 UI labels and placeholders (`CharacterScreen.kt`, `PersonaScreen.kt`)

| Field | Current label | New label | Placeholder (new) |
|---|---|---|---|
| core_persona | Core Persona / Backstory | Who they are | "Their history, what they want, what they're afraid of, the contradictions. Prose." |
| how_they_talk | Writing Style / Style Rules | How they talk | "Not adjectives about prose — habits of a person. Where they're from in their vowels, what they say when stalling, the word they overuse, whether they finish sentences." |
| voice_samples | — | Things they've said | "One per line, in quotes. 8–10. Make them uneven: a two-word one, a rambling one, one that restarts, one that's just ordinary." |
| hard_limits | Negative Guidance / Boundaries | Hard limits (up to 5) | "Facts the story can't contradict. 'Has never left the valley.' 'Won't say her father's name.'" |
| example_conversations | Example Conversations | Sample exchanges | (card) "These are played back to the model as real dialogue, so write the character's line the way they'd really say it — a few sentences, at least one spoken." |
| appearance | Physical Appearance (for portrait generation) | Appearance | unchanged |

Add a live `VoiceMetrics` readout under "Things they've said" (contraction rate, median words, CV)
so the author sees when their samples are all zingers before the model does.

### 7.3 Prompt packs

Per §3.20. Bump `openfantasia.character` format version; codec accepts the old version and migrates
on import.

---

## 8. Phased plan

Each phase ends with the replay harness run on ≥ 100 stored requests across ≥ 3 models. A phase
ships only if `contractionRate` and `lineWordsCV` improve with CIs excluding zero and the blind judge
win-rate is ≥ 0.55 with CI excluding 0.5. Otherwise it is reverted and the doc updated with what was
learned.

| Phase | Work | Touches | Est. |
|---|---|---|---|
| **0. Measure** | `VoiceMetrics`, `VoiceLint`, replay harness; compute baseline on all stored jobs | new `domain/model/VoiceMetrics.kt`, `VoiceLint.kt`; `tools/.../replay.mjs`; job row columns | 2–3 d |
| **1. Restructure the call** | §3.1–3.6, 3.8–3.10, 3.13–3.18: new system prompt shape, delete six blocks, whisper at depth 0; §4.1 sampler (penalties → 0, `min_p` where supported) | `PromptBuilder.kt`, `SceneIntent.kt`, `Revision.kt`, `StoryDirection.kt`, `ReplyLength.kt`, `SceneReport.kt`, `RecalledExchange.kt`, `KtorLLMClient.kt`, `RoleplayGeneration.kt`; tests in §9 | 4–5 d |
| **2. Prose dossier** | §3.11–3.12: `DossierRendering`; JSON leaves the prompt | new `domain/reducer/DossierRendering.kt`; `PromptCompletenessTest` sentinels | 2–3 d |
| **3. Voice** | §3.3, 3.7, 3.20, §7: schema + migration, voice card, voice anchor turns, UI, prompt packs; §3.21 engine op | `RoomEntities.kt`, `DbRecords.kt`, `OpenFantasiaDatabase.kt` (migration), `RoleplayContext.kt`, `RoleplayPromptContext.kt`, `CharacterScreen.kt`, `PersonaScreen.kt`, `PortableJsonCodec.kt`, `PROMPT.md`, `draft.schema.json`, `compiler.mjs` | 4–5 d |
| **4. Delivery** | §3.19: Claude lane real system prompt + chat-shaped transcript; delete `generation_preferences`; label Codex/Antigravity | `claude-runner.mjs`, `antigravity-runner.mjs`, `codex-runner.mjs`, `host-server.mjs`, `ChatScreen.kt` model picker | 1–2 d |
| **5. Hygiene** | §5.3 Re-voice recent replies | `ChatViewModel.kt`, `ChatScreen.kt`, `ChatDao.kt` | 2–3 d |
| **6. Optional** | §6.4 Voice Pass behind a toggle; §6.3 deterministic presence trial; §2.4 #5 director/actor if drive still dominates | — | 1 w, measured |

Phases 1 and 2 are where the effect is expected; 3 is where it becomes durable across new
characters; 4 is where the Mac Host lanes stop being a confound; 5 rescues existing threads.

---

## 9. Tests that pin current wording and must move

From `PromptBuilderTest.kt`, `PromptCompletenessTest.kt`, `SceneIntentPromptTest.kt`,
`RevisionPromptTest.kt`, `ReplyLengthTest.kt`, `StoryDirectionTest.kt`, `ExchangeRecallTest.kt`,
`SceneReportTest.kt`:

| Test | Pins | Change |
|---|---|---|
| `PromptBuilderTest:68-71` | ordered tags `<role_objective>`, `<character_persona>`, `<core_directives>`, `<example_conversations>`, `<response_contract>`, `<continuity_and_variation>`, `<durable_state>`, `<cast_roster>` | new order: `<you>`, `<setting>`, `<voice_card`, `<player>`, `<notes>`, `<where_things_stand>`, `<who_else>`, `<pinned>` |
| `PromptBuilderTest:97-107` | `<reply_control>`, `<length_target>`, `<this_turn>`, `<variation_rules>` in user message | `<whisper>` in user message; none of the old tags anywhere |
| `PromptBuilderTest:127-128` | `"USER: EX-USER"`, `"AYUSHI: EX-CHAR"` | examples absent from system prompt; present as turns in `AssembledRoleplayContext.messages[0..1]` |
| `PromptBuilderTest:138-145` | `"words of visible prose"`, `<length_target>` after prose | `"About "` + range inside `<whisper>`, whisper after prose |
| `PromptBuilderTest:152,159` | `"No world state has been materialized yet"`, `"No cast has been established"` | `"This is the beginning of the story."`, `"Nobody else has been established yet."` |
| `PromptBuilderTest:172-178` | `"Pinned branch facts:"`, `"Beats of this story so far, oldest first:"` | `"Pinned:"`, `"What's happened, oldest first:"` |
| `PromptCompletenessTest:150-158` | reflection: every `PromptWorldState` field *name* appears literally | replace with per-field **value** sentinels through `DossierRendering` (the field `emotion_intensity` must not appear; its sentinel value's adverb must) |
| `PromptCompletenessTest:164-165, 211-212` | cast sentinels incl. `-entityId`, `-evidence`; `Arjun-personality` exactly once | drop `-entityId`, `-evidence`, `-origin`, `-status` (deliberately withheld; record in ADR); add `-voiceSamples` |
| `SceneIntentPromptTest` | `"an event that intrudes on the scene"`, `"Do NOT introduce a new event"`, `"Introduce something the user did not supply"`, `"may be returned to and taken further"`, `THIS TURN — ` ×1 | new one-line directives (§3.14); assert Escalate contains `"Push."`, Dwell contains `"Stay in this moment"`, exactly one policy line per intent |
| `RevisionPromptTest` | `"KEEP EVERYTHING ELSE"`, `"not a new idea for the same turn"`, `"NOT part of the story"`, `"nothing you write may refer to it"`, `"genuinely different reply"`, `"nothing to revise"`, `"not an event in the story"` | `"never happened"`, `"change just this"`, `"Everything the note doesn't touch was fine"`, `"different choice about what happens"`, `"Fresh attempt"`, `"nobody in the story said it"` |
| `ReplyLengthTest:17-59` | `"words of visible prose"`, `"whatever length this beat genuinely needs"` | `"About "`, `"As long as it needs"` |
| `StoryDirectionTest` | `"Still ahead"`, `"Already reached"`, `"Do not stage it a second time"`, hedging sentences | `"wants this to get to, eventually"`, `"Already happened, don't stage again"`; stamps unchanged |
| `ExchangeRecallTest:130-132` | `"do not treat them as recent"`, `"do not continue from them"` | `"They're memory now"` |
| `SceneReportTest:83` | `"leave the block out entirely"` | `"who's in the room when you stop"` |
| `prompt.test.mjs` (worker) | `PROMPT.md` guards | add `voice_samples` op presence; positive `voice_style` guidance |

Add: `VoiceMetricsTest`, `VoiceLintTest`, `DossierRenderingTest` (renders every field, prints no
identifier, prints no integer intensity), `VoiceAnchorAssemblyTest` (anchor precedes window, excluded
from `transcript_exchange_ids`, capped).

---

## 10. Sources

Verified during this review (fetched, title and claim confirmed):

- Castricato et al., *Suppressing Pink Elephants with Direct Principle Feedback*, 2024 — https://arxiv.org/abs/2402.07896
- Liu et al., *Lost in the Middle: How Language Models Use Long Contexts*, TACL 2023 — https://arxiv.org/abs/2307.03172
- Jaroslawicz et al., *How Many Instructions Can LLMs Follow at Once?* (IFScale), 2025 — https://arxiv.org/abs/2507.11538
- Li et al., *Measuring and Controlling Instruction (In)Stability in Language Model Dialogs*, COLM 2024 — https://arxiv.org/abs/2402.10962
- Wang et al., *RoleLLM*, 2023 — https://arxiv.org/abs/2310.00746 (Table 7: dialogue engineering 63.3% vs few-shot prompting 29.8% vs zero-shot 9.3%)
- Shao et al., *Character-LLM: A Trainable Agent for Role-Playing*, EMNLP 2023 — https://arxiv.org/abs/2310.10158
- Park et al., *Generative Agents: Interactive Simulacra of Human Behavior*, UIST 2023 — https://arxiv.org/abs/2304.03442
- Madaan et al., *Self-Refine*, NeurIPS 2023 — https://arxiv.org/abs/2303.17651
- Nguyen et al., *Turning Up the Heat: Min-p Sampling*, ICLR 2025 — https://arxiv.org/abs/2407.01082
- Paech et al., *Antislop*, 2025 — https://arxiv.org/abs/2510.15061; sampler https://github.com/sam-paech/antislop-sampler; slop list https://github.com/sam-paech/slop-score
- DRY repetition penalty — https://github.com/oobabooga/text-generation-webui/pull/5677
- XTC sampler — https://github.com/oobabooga/text-generation-webui/pull/6335
- Anthropic, *Prompting best practices* — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- OpenAI, Chat Completions API reference (penalty definitions) — https://platform.openai.com/docs/api-reference/chat/create
- SillyTavern docs: Prompts — https://docs.sillytavern.app/usage/prompts/ ; Author's Note — https://docs.sillytavern.app/usage/core-concepts/authors-note/ ; Character Design — https://docs.sillytavern.app/usage/core-concepts/characterdesign/
- Ali:Chat — https://rentry.org/alichat ; kingbri's MinimALIstic guide — https://rentry.org/kingbri-chara-guide
- EQ-Bench Creative Writing v3 and Slop Score — https://eqbench.com/creative_writing.html , https://eqbench.com/slop-score.html
- Wikipedia, *Signs of AI writing* (WikiProject AI Cleanup) — https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing

Not verifiable to a live source and therefore not relied on: OpenAI's former "reasonable penalty
range 0.1–1.0" guidance (legacy page removed).

---

## Appendix A — One complete request under the new design

Illustrative, with a fictional character. Braces show where data lands.

```
═══════════════════════════ SYSTEM ═══════════════════════════
<you>
You're writing Vera Okonkwo's side of a story that Dan is writing the other side of. Whoever the
note at the end names is the one you're playing this turn — their words, their choices, what
they notice and feel. Dan writes Dan. Stop where it's his move.

What he just did has landed. Pick up from the effect of it, not the description of it.
</you>

<setting>
{character.story}
</setting>

<voice_card name="Vera Okonkwo">
{core_persona}

How Vera sounds:
Lagos in the vowels when she's tired, London the rest of the time. Says "right" to buy a second.
Starts a sentence, hears herself, starts it again shorter. Swears exactly once when it counts.
Does not do speeches.

Things Vera has said, in her own words:
- "Right. Okay. No, hang on — say that again, slower."
- "I'm not angry. I'm — okay, I'm a bit angry."
- "You want tea? I'm making tea anyway, so."
- "That's… yeah. That's a lot."
- "Don't. Just — don't, tonight."
- "It's fine. It's fine, I said it's fine, why are you still looking at me like that."
- "My mum would've liked you. She'd have hated that she liked you."
- "Mm."

What's true about Vera that the story can't contradict:
- Has not told her brother the flat loan is in his name.
- Has never been back to Lagos since the funeral.
- Won't say the word "divorce" out loud.

{appearance}
</voice_card>

<player name="Dan">
{identity}. {backstory}
He talks like this: {voiceStyle}
He wants: {goals}
</player>

<notes>
From Dan, about how he wants this story written:
{directorNotes}
</notes>

<where_things_stand>
It's a little after midnight, the same night. This continues straight on from the last exchange.

WHERE
Vera's kitchen: narrow, one strip light, the good chair by the radiator. The extractor fan clicks.
From here you can get to the hallway and the balcony.
— The balcony: two chairs, an ashtray she pretends isn't hers.
— The hallway: coats, the boxes she hasn't unpacked.

WHO'S HERE
Vera Okonkwo.
  {account}
  Right now: very guarded, since Dan mentioned her brother.
  Leaning on the counter, back to the kettle.
  Knows: that Dan saw the bank letter; that Tunde is flying in on Thursday.
  Wants: for tonight to not become a conversation about money.
  Keeping to herself: the loan.

Dan.
  {account}
  Right now: careful, since he realised he'd said too much.
  At the table, hasn't sat down.

BETWEEN THEM
Vera and Dan: romantic — three months in; first real argument two nights ago, unresolved.
Vera and Tunde: familial — she is covering for him and he doesn't know how much.

THE STORY SO FAR
{story_summary}

THE SCENE
{scene_summary}

WHAT JUST CHANGED
{last_turn_beat}
</where_things_stand>

<who_else>
Not here right now but could be: Tunde Okonkwo (also "T") — Vera's brother. {account}
Also in this story: Mrs Adebayo, Priya, the letting agent.
</who_else>

<pinned>
Pinned:
- {pin}
What's happened, oldest first:
- [4/5] {title}: {detail}
- ...
</pinned>

═══════════════════════════ MESSAGES ═════════════════════════
user:      {example_conversations[0].user_line}
assistant: {example_conversations[0].character_line}
user:      {example_conversations[1].user_line}
assistant: {example_conversations[1].character_line}
user:      {exchange -14 player prose}
assistant: {exchange -14 reply}
...
user:      {exchange -1 player prose}
assistant: {exchange -1 reply}
user:      *I put the letter face-down on the table between us.* "I'm not going to ask. I just
           didn't want to pretend I hadn't seen it."

           <whisper>
           You're Vera now.

           Stay in this moment. Nobody arrives, nothing rings; go further into what's already
           here — what it costs, what isn't being said.

           Talk like Vera talks: "Right. Okay. No, hang on — say that again, slower." "It's fine.
           It's fine, I said it's fine, why are you still looking at me like that." Contractions.
           Sentences that don't all come out the same length. It's fine to say something plain.

           About 256–384 words. Finish the thought and stop.

           Then, on its own last line, who's in the room when you stop and whether the scene ended:
           <scene_state>{"present": ["Vera Okonkwo", "Dan"], "scene_ended": false}</scene_state>
           </whisper>
```

Total standing instruction text in this request (everything that is not character data, world
data, or story): roughly 200 words, against ~2,400 today. The only negations left are the two in the
Dwell line ("Nobody arrives, nothing rings") — which is a statement about the scene, not about
writing — and "Stop where it's his move."
