# Open Fantasia continuity reconstruction

Read the complete request supplied with these instructions. Return only one JSON object matching the response envelope described below. Do not use markdown fences.

Produce a complete new `world_state`, not a mutation list. `exchanges` is the complete retained branch transcript through `target_turn_id`; use it together with the previous complete snapshot. `checkpoint_turn_ids` identifies the exact post-baseline exchanges whose changes must be incorporated in this update.

`world_state.cast_roster` is the complete branch-valid roster of named, speakable characters. Start from `current_cast_roster`, preserve every `cast_seed`, then rewrite the complete roster atomically with the rest of world state.

- Add a discovered cast member only when exchanges establish a named person with meaningful participation, recurring dialogue, or a consequential relationship. Do not add unnamed extras, crowds/groups, objects, casual name-drops, or the player persona.
- Reuse a stable existing `cast_id` and `entity_id` when identity matches. Every Cast Member must reference exactly one entry in `world_state.entity_state`. For a genuinely new person, create both the world entity and a `cast_id` of `cast:<normalized-name>:<short-unique-suffix>`. Set `first_seen_turn_id` to the `exchange_index` of the exchange that introduced them, written as `"#12"`. Never transcribe a turn UUID; the host resolves the ordinal. If you genuinely cannot tell which exchange introduced them, use `null` and the host will date them from the transcript. Never silently merge uncertain duplicates; preserve both until a person can resolve them.
- Build a useful roleplay profile only from evidence: role/background, personality, voice style, appearance, goals, and boundaries. Empty is better than invention.
- Preserve seed provenance and all `manual_locks`. Every locked field must remain byte-for-byte equal to the corresponding seed value. Preserve `first_seen_turn_id` for existing cast.
- `evidence` must be short grounded paraphrases, never fabricated quotations. Archived cast stays in the complete roster with `status: archived`.

When `trigger_reason` is `rewind`, later exchanges were deliberately pruned. They are absent from the retained transcript and must remain completely unknowable: rebuild continuity only from the retained baseline and retained exchanges. Use `old_head_turn_id` and `discarded_exchange_count` only as proof that pruning occurred; never infer or recreate discarded events.

- Preserve stable IDs and all still-valid older facts, entities, relationships, locations, edges, and narrative threads.
- Apply every change evidenced by the supplied exchanges. Never invent names or merge distinct people.
- Rewrite `story_summary` into one coherent causal account; never append the prior text. Maximum 20,000 characters.
- Rewrite `scene_summary` as the situation after the final exchange. Maximum 8,000 characters.
- Replace `last_turn_beat` with the change caused by the final exchange. Maximum 4,000 characters.
- Set `metadata.current_turn_id` to `target_turn_id`, and version to `baseline_version + 1`.
- Ensure all relationship, placement, location-edge, and fact references point to objects present in the complete snapshot.
- Return `timeline_events` only for genuinely notable beats whose turn IDs appear in `checkpoint_turn_ids`: reveals, betrayals, discoveries, combat, scene changes, time skips, major relationship shifts, significant emotional turns, or meaningful movement. Routine dialogue gets no event; do not repeat older timeline events from the rest of the transcript.
- Each timeline event must set `turn_id` to the `exchange_index` where it occurred, written as `"#12"`, importance 1–5, and only entity/relationship IDs present in the completed `world_state`. The ordinal must appear in `checkpoint_exchange_indexes`. Return at most seven events in chronological order. Never transcribe a turn UUID; an event whose reference cannot be resolved is discarded, and the beat is preserved in `story_summary` regardless.

Response envelope keys: `protocol_version`, `request_id`, `attempt_count`, `thread_id`, `branch_id`, `target_turn_id`, `baseline_hash`, `world_state`, `timeline_events`. Copy every identity value exactly from the request.
