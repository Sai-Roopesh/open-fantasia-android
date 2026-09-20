---
status: accepted
---

# A voice is shown, not described, and the request is written the way the reply should sound

Measured on 919 spoken lines from one long thread: 11% carried a contraction, 0.4% a hedge, none a
self-correction, and the median line was six words. That is not how people talk. It is how a request
written like a contract, carrying a hundred rules and a JSON world state, ending on a word count and a
schema, gets read back.

Six things were wrong at once, and each had been treated separately with another rule.

**Prohibition density.** PromptBuilder and the turn policies rendered ~2,400 words of standing
instruction with 89 negations — one every 27 words — including 30 separate warnings against echoing and
13 mentions of "epigram", "clever", "quotable" and "machine". Naming a thing to avoid raises its
frequency (Castricato et al. 2024), and adherence falls as instructions multiply (IFScale, 2025). The
voice rules were the last added and the last read, so they were the ones that lost.

**Register.** "authoritative" ×3, "constraint(s)" ×3, "rule(s)" ×5, "control" ×4, "exclusively owns",
"bound absolutely", tags called `<response_contract>` and `<reply_control>`, and a world state serialized
as `{"primary_emotion": "guarded", "emotion_intensity": 7}`. The formatting of a prompt is contagious
into the reply. A model handed a spreadsheet writes like one.

**Position.** The voice guidance sat mid-system-prompt, above 30,000 characters of state, and again in
the user message *before* the player's prose. The last two things read before generation were a word
count and `{"present": [...], "scene_ended": false}`.

**The transcript.** Fifteen exchanges of the thread's own machine-voiced replies arrived as real
assistant turns — the strongest style signal in the request — followed by a block titled "THE
TRANSCRIPT IS NOT A STYLE GUIDE". You cannot instruct your way past a few-shot.

**Contradiction.** "Advance the plot by at least one concrete NEW beat in every reply" sat in the
response contract beneath a Dwell policy that said "Do NOT introduce a new event". ADR-0019 had made the
policies exclusive; the standing order they were meant to replace was still there.

**Sampling and delivery.** `presence_penalty` and `frequency_penalty` of 0.4 taxed exactly the tokens
speech is made of — *I, you, okay, don't,* a repeated word, the other person's name. On the Mac Host,
the system prompt was demoted into a user turn under a heading called "Roleplay Generation Contract",
inside a coding agent's harness, with a three-sentence system prompt announcing a "stateless Roleplay
Model".

## Decision

The fix is subtraction and demonstration, not another block.

1. **The standing instruction text is about 200 words, and it says what to do.** `<you>` is three
   sentences. The turn policy is one. The per-turn steer is one `<whisper>` of ~100 words, after the
   player's prose, in the register the reply should have. `role_objective`, `core_directives`,
   `response_contract`, `show_not_tell`, `continuity_and_variation`, `reply_control`, `style_override`
   and `variation_rules` are gone as blocks.

2. **The voice is the character's own lines.** Every speaker — Character, Cast Member, Persona — has
   `voice_samples`: things they have actually said. They appear in the voice card, in the dossier, and
   quoted in the whisper; and the character's sample exchanges ride as *real dialogue turns* ahead of
   the transcript (RoleLLM measured dialogue-as-turns beating the same examples as prompt text 63% to
   30%). A description of speech is not speech.

3. **The Continuity Snapshot arrives as prose.** `DossierRendering` turns the same data into sentences:
   *"Vera is very guarded, since the letter. Knows: that Dan saw the bank letter."* Identifiers,
   version numbers, edge flags and the integer behind an emotion never reach the model (ADR-0008
   already said they should not). Presence is stated by section, not by a boolean, and only when it was
   actually read.

4. **Sampling stops fighting the prose.** Penalties are zero. `min_p` is recorded as the intention and
   sent where the backend is known to accept it (Ollama; OpenRouter models that advertise it).

5. **The Mac Host delivers the request as a request.** The Claude lane passes the app's system prompt
   through `--system-prompt` and the transcript, with the speakers' names, as the task. The
   "Generation Contract" heading, the `<system_instruction>` wrapper and the `<generation_preferences>`
   block are gone on every lane.

6. **It is measured.** `VoiceMetrics` is computed on every accepted reply and stored beside the request
   in `roleplay_generation_jobs.voice_metrics`. `VoiceLint` finds the antithesis family ("not X, but
   Y") and stock phrases after the fact — never before, because listing them for the model would name
   them. A prompt change is judged by what it did to the numbers.

## What is preserved

- The cache split (ADR-0007). The system prompt is byte-stable per thread and per checkpoint interval;
  the whisper is volatile. The voice anchor is always the Primary Character's and sits at the head of
  the messages, inside any prefix cache; a Cast Member speaker gets their lines from the volatile whisper
  and, when off-stage, a `<speaker_profile>` block there.
- Total context (ADR-0014). `PromptCastMember`, `PromptCharacter` and `PromptPersona` gain
  `voiceSamples` with no default. The completeness test now asserts field *values* through the dossier
  rather than field *names* through reflection, which is the stronger property.
- One turn policy (ADR-0019), now genuinely alone. Length as a name (ADR-0020), one sentence. The scene
  report (ADR-0021), two lines, with the codec unchanged. Revision (ADR-0022), inside the whisper with
  the rejected prose still tagged. Player direction (ADR-0023), two sentences.
- Stored column names. `style_rules`, `definition` and `negative_guidance` keep their spelling, the way
  `fork_turn_id` does. What changed is what they mean to the prompt: the author's notes on the story,
  extra lore, and the hard limits — and how the UI labels them.

## Consequences

- Existing long threads keep their fifteen-exchange window of machine-voiced history for fifteen more
  exchanges after upgrade. The plan's "re-voice recent replies" tool (docs/plans/human-speech-refactor.md
  §5.3) is the remedy and is not in this change.
- `roleplay_generation_jobs` rows frozen before the upgrade hash differently once `min_p` and the zero
  penalties are in `settings`; a job caught mid-processing at upgrade fails its hash check and is
  regenerated by the player. Pending-export jobs have a blank hash and pass.
- The Codex and Antigravity lanes still run inside a coding agent's harness with no system-prompt
  channel. They receive the cleaner task text, but their results are not attributable to the prompt
  alone and should be excluded from voice A/Bs until that changes.
- Every measurement in this ADR is from before the change. The replay harness in the plan (§6.6) is
  what turns the after into a number; until it runs, the targets in §6.5 are targets.
