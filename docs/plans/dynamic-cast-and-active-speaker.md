# Dynamic Cast and Active Speaker Plan

## Outcome

Turn any established story character into a reliable selectable speaker. Continuity Updates discover and maintain branch-valid Cast Profiles. Composer exposes sticky Active Speaker selection plus explicit Ensemble mode. Player Persona remains exclusively user-controlled.

Prompt-cache reuse must improve. Cast changes cannot rewrite static system prefix. Historical model inputs must remain byte-identical.

## Locked Domain Rules

- Primary Character originates from Character Sheet and remains default speaker.
- Cast Roster unifies Primary Character, manual Cast Seeds, Discovered Cast Members.
- Cast Member = named established person eligible to speak. Continuity Entity remains broader.
- Manual seeds exist from thread root. Discovered members belong to branch lineage that established them.
- Rewind removes discoveries unsupported by retained lineage. Forks inherit roster valid at fork.
- HCE promotes named people who speak, act meaningfully, form relationships, recur, or clearly remain relevant.
- Unnamed extras, groups, objects, casual mentions stay Continuity Entities, not Cast Members.
- Player Persona never becomes selectable.
- Active Speaker sticky per branch. Ensemble never automatic.
- Single-speaker reply allows selected member's dialogue/action/reaction/interiority plus neutral environment narration. Other members remain silent.
- Off-scene members selectable with warning; model cannot teleport them.
- Regeneration retains original speaker. Fork/Rewind restore latest valid selection or Primary Character fallback.
- Old replies keep stored speaker ID and display-name snapshot.
- Profiles archive instead of delete. Uncertain duplicates require manual merge.
- No old-schema compatibility layer. Preserve user story data through one-way transformation.

## Cast Profile

Each profile contains:

- stable cast ID and linked continuity entity ID;
- canonical name and aliases;
- role/background;
- personality and behavioral traits;
- voice and writing style;
- appearance;
- goals and boundaries;
- provenance: primary, manual seed, or continuity discovery;
- first-seen exchange and evidence summary;
- active/archived state;
- field-level ownership and manual locks.

HCE may enrich generated fields only from evidence. Unknown stays unknown. Manual locks win.

## Continuity Contract

1. Checkpoint request supplies complete baseline snapshot, source window, Primary Character, player Persona, Cast Seeds, current Cast Roster, field ownership.
2. HCE returns complete replacement world state, complete replacement Cast Roster, timeline events.
3. HCE preserves stable identities and valid older profiles, adds evidenced members, archives unsupported members only when story truth requires it.
4. Rewind request contains no deleted prose. Replacement roster derives only from retained baseline, retained exchanges, pruning metadata.
5. Host and phone validate unique IDs, alias conflicts, entity links, Primary Character presence, player exclusion, field locks, first-seen references, branch validity, profile ceilings.
6. Snapshot, roster, timeline accepted in one DB transaction. Any invalid component rejects whole result and keeps checkpoint blocked.

## Prompt-Cache Invariants

### Static prefix

Contains only byte-stable thread instructions:

- roleplay engine contract;
- Primary Character sheet;
- user Persona;
- story setting;
- director rules;
- examples and response contract.

No Cast Roster, Active Speaker, present-character list, world state, timeline, reply length, or checkpoint data enters static prefix.

### Immutable per-exchange model input

Before generation, render one canonical model-input message containing:

1. continuity roleplay view;
2. Active Speaker ID, name, full relevant Cast Profile;
3. concise profiles for other present Cast Members;
4. single-speaker or Ensemble contract;
5. pins/timeline/style directives;
6. visible user text.

Persist exact rendered bytes with Roleplay Exchange. Every future request reconstructs history from persisted model-input bytes, never from visible user text alone. Result: request N becomes exact prefix of request N+1 through prior assistant reply.

Use deterministic field order, stable whitespace, stable list sorting, stable serialization. Never include timestamps, random IDs, reachability status, or other needless churn in rendered prompt.

### Suffix minimization

- Send selected speaker's full profile.
- Send concise profiles only for present relevant members.
- Never send full archived/off-scene roster to roleplay model.
- Full roster remains available to HCE and UI.
- Capture provider-reported cache metrics when available; compare cached-input ratio before/after migration.

One upgrade request may cold-start because static role contract changes once. Subsequent automatic cast discoveries must not invalidate prefix.

## Persistence Shape

Replace thread `supporting_cast` JSON with normalized cast storage and snapshot roster data. Exact schema may optimize reads, but must provide:

- manual thread-root Cast Seeds;
- branch-lineage complete roster in accepted snapshots;
- per-branch sticky Active Speaker preference;
- per-exchange requested speaker ID, display-name snapshot, mode;
- per-exchange exact rendered model input;
- manual field locks and provenance;
- deterministic merge/archive history.

Existing Supporting Cast JSON transforms once into manual Cast Seeds. Existing replies receive Primary Character speaker identity. No downgrade or dual-read path.

## UI

- Composer chip: `Reply as: Yunxi`.
- Picker sections: Present now, Elsewhere, Ensemble, Manage cast, Update cast now.
- Search aliases and canonical names.
- Off-scene selection shows warning, remains allowed.
- `@Name` at message start selects speaker for that exchange; natural prose never changes selection.
- Streaming and committed reply headers show recorded speaker.
- Cast Manager shows origin, presence, archive state, first-seen exchange, evidence, editable fields, locks, merge/archive controls.
- Raw JSON paste UI and eight-member cap removed.

## Verification

- New named recurring person becomes selectable at next checkpoint.
- One-off unnamed person never pollutes picker.
- Player Persona never appears.
- Same person under alias reuses stable ID; ambiguous duplicate stays separate.
- Discovered member does not leak to sibling branch.
- Fork inherits valid roster and speaker.
- Rewind prunes member introduced later and restores speaker fallback.
- Manual locked fields survive HCE replacement.
- Yunxi single-speaker reply contains no Ananya dialogue/interiority.
- Ensemble permits both.
- Regenerate/edit keep original speaker.
- Historical headers survive rename/archive.
- Invalid roster keeps strict checkpoint blocked and uses one correction.
- Static prompt bytes unchanged across cast discovery and speaker switch.
- Persisted prior user model-input bytes exactly match previous request.
- Cached-input ratio improves under repeated DeepSeek roleplay exchanges.

Before schema or device work: reconnect phone over USB, create fresh full app-data backup, verify SQLite integrity/checksum. Use isolated DB tests; never destructive instrumentation against live data.
