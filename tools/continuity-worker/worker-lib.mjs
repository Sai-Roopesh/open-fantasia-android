function cloneJsonValue(value) {
  if (value === undefined || value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Cast Seeds own their provenance, lineage identity, lock declaration, and every manually locked
 * field. The Continuity Engine owns discovered/derived state only. Project authoritative seed data
 * over model output before semantic validation so a model is never responsible for reproducing
 * long manually authored text byte-for-byte.
 */
export function applyAuthoritativeCastLocks(request, response) {
  const canonical = cloneJsonValue(response);
  const roster = canonical?.world_state?.cast_roster;
  if (!Array.isArray(roster)) return canonical;

  const rosterById = new Map(roster.map(member => [member.cast_id, member]));
  for (const seed of request.cast_seeds ?? []) {
    const member = rosterById.get(seed.cast_id);
    if (!member) continue;

    member.provenance = seed.provenance;
    member.first_seen_turn_id = seed.first_seen_turn_id;
    member.manual_locks = cloneJsonValue(seed.manual_locks ?? []);
    for (const field of seed.manual_locks ?? []) {
      if (Object.prototype.hasOwnProperty.call(seed, field)) {
        member[field] = cloneJsonValue(seed[field]);
      }
    }
  }
  return canonical;
}

function mentionsName(text, needle) {
  const haystack = (text ?? "").toLocaleLowerCase();
  const name = (needle ?? "").trim().toLocaleLowerCase();
  if (!haystack || !name) return false;
  const isWordChar = ch => Boolean(ch) && /[\p{L}\p{N}]/u.test(ch);
  for (let i = haystack.indexOf(name); i !== -1; i = haystack.indexOf(name, i + 1)) {
    if (!isWordChar(haystack[i - 1]) && !isWordChar(haystack[i + name.length])) return true;
  }
  return false;
}

/**
 * Resolves lineage provenance for discovered Cast Members deterministically.
 *
 * `first_seen_turn_id` must be a turn UUID copied exactly out of the retained transcript, and a
 * model asked to reproduce a 36-character identifier will eventually get one wrong — which failed
 * the whole checkpoint after a full engine run and left the lineage blocked. Identity is host-owned
 * data, so the host resolves it rather than asking the engine to transcribe it:
 *
 *   1. a member already on the authoritative roster keeps its established first-seen exchange;
 *   2. a genuinely new member is dated to the earliest retained exchange whose prose names them;
 *   3. anything still unresolved falls back to the first post-baseline checkpoint exchange, since a
 *      newly discovered member must have appeared within the window under review.
 *
 * A value the engine supplied is kept whenever it is already reachable, so a correct answer is
 * never overwritten. This only ever assigns a reachable turn id, so it cannot mask a real
 * violation: validateResponse still rejects anything this cannot ground.
 */
export function repairDiscoveredCastLineage(request, response) {
  const canonical = cloneJsonValue(response);
  const roster = canonical?.world_state?.cast_roster;
  const exchanges = request.exchanges ?? [];
  if (!Array.isArray(roster) || !exchanges.length) return canonical;

  const reachable = new Set(exchanges.map(exchange => exchange.turn_id));
  const established = new Map(
    (request.current_cast_roster ?? [])
      .filter(member => member.first_seen_turn_id && reachable.has(member.first_seen_turn_id))
      .map(member => [member.cast_id, member.first_seen_turn_id])
  );
  const checkpointTurnIds = (request.checkpoint_turn_ids ?? []).filter(id => reachable.has(id));
  const fallbackTurnId = checkpointTurnIds[0] ?? exchanges[exchanges.length - 1].turn_id;

  for (const member of roster) {
    if (member.provenance !== "continuity_discovered") continue;
    if (member.first_seen_turn_id && reachable.has(member.first_seen_turn_id)) continue;

    const carried = established.get(member.cast_id);
    if (carried) {
      member.first_seen_turn_id = carried;
      continue;
    }

    const names = [member.canonical_name, ...(Array.isArray(member.aliases) ? member.aliases : [])];
    const firstMention = exchanges.find(exchange =>
      names.some(name => mentionsName(exchange.user, name) || mentionsName(exchange.assistant, name))
    );
    member.first_seen_turn_id = firstMention?.turn_id ?? fallbackTurnId;
  }
  return canonical;
}

/**
 * Discards timeline events that cannot be grounded, instead of failing the checkpoint over them.
 *
 * A timeline event names the exchange it occurred in, so it carries the same transcription hazard
 * as cast lineage — but unlike lineage it has no deterministic correct answer. The host cannot know
 * which exchange a betrayal happened in without interpreting prose, and inventing one would write a
 * false beat into the story record. So these are dropped rather than repaired.
 *
 * The snapshot is the product; timeline events are at most seven optional highlights, and the beat
 * itself survives in the rewritten story summary. Losing one highlight is strictly better than
 * losing a full engine run and leaving the lineage blocked. Only per-event grounding is forgiving:
 * a malformed or oversized `timeline_events` array is still a protocol violation and still throws.
 *
 * Importance is clamped rather than dropped, because there the correct value is unambiguous.
 */
export function dropUngroundedTimelineEvents(request, response) {
  const canonical = cloneJsonValue(response);
  if (!Array.isArray(canonical.timeline_events)) return canonical;

  const state = canonical.world_state;
  const entityIds = new Set((state?.entity_state ?? []).map(entity => entity.entity_id));
  const relationshipIds = new Set((state?.relational_state ?? []).map(rel => rel.relationship_id));
  const groundedTurnIds = new Set(request.checkpoint_turn_ids ?? (request.exchanges ?? []).map(e => e.turn_id));

  const kept = canonical.timeline_events.filter(event => {
    if (!groundedTurnIds.has(event?.turn_id)) return false;
    const entities = event.affected_entity_ids;
    const relationships = event.affected_relationship_ids;
    if (!Array.isArray(entities) || entities.some(id => !entityIds.has(id))) return false;
    if (!Array.isArray(relationships) || relationships.some(id => !relationshipIds.has(id))) return false;
    return true;
  });

  for (const event of kept) {
    event.importance = Number.isInteger(event.importance)
      ? Math.min(5, Math.max(1, event.importance))
      : 3;
  }

  const droppedCount = canonical.timeline_events.length - kept.length;
  // Diagnostics carry counts only, never story prose.
  if (droppedCount > 0) {
    console.warn(`continuity: dropped ${droppedCount} ungrounded timeline event(s) for request ${request.request_id}`);
  }
  canonical.timeline_events = kept;
  return canonical;
}

/**
 * One canonicalization pass over model output before semantic validation: authoritative seed data
 * is projected back over the roster, discovered lineage is grounded in a reachable exchange, and
 * timeline events that cannot be grounded are discarded. Everything validateResponse checks after
 * this is a genuine protocol violation rather than a transcription slip.
 */
export function canonicalizeResponse(request, response) {
  return dropUngroundedTimelineEvents(
    request,
    repairDiscoveredCastLineage(request, applyAuthoritativeCastLocks(request, response))
  );
}

export function validateResponse(request, response) {
  if (response.protocol_version !== request.protocol_version) throw new Error("Response protocol version mismatch");
  if (response.attempt_count !== request.attempt_count) throw new Error("Response attempt mismatch");
  for (const key of ["request_id", "thread_id", "branch_id", "target_turn_id", "baseline_hash"]) {
    if (response[key] !== request[key]) throw new Error(`Response identity mismatch: ${key}`);
  }
  const state = response.world_state;
  if (
    !state?.metadata ||
    !state?.narrative_state ||
    !state?.spatial_state ||
    !Array.isArray(state?.entity_state) ||
    !Array.isArray(state?.relational_state) ||
    !Array.isArray(state?.cast_roster)
  ) throw new Error("Incomplete world_state");
  if (state.metadata.current_turn_id !== request.target_turn_id) throw new Error("Wrong current_turn_id");
  if (state.metadata.version !== request.baseline_version + 1) throw new Error("Wrong snapshot version");
  if (
    state.narrative_state.story_summary.length > 20_000 ||
    state.narrative_state.scene_summary.length > 8_000 ||
    state.narrative_state.last_turn_beat.length > 4_000
  ) throw new Error("Summary safety ceiling exceeded");

  const entityIds = state.entity_state.map(entity => entity.entity_id);
  if (entityIds.length !== new Set(entityIds).size) throw new Error("Duplicate entity IDs");
  const locationIds = state.spatial_state.known_locations.map(location => location.id);
  if (locationIds.length !== new Set(locationIds).size) throw new Error("Duplicate location IDs");
  const entityIdSet = new Set(entityIds);
  const locationIdSet = new Set(locationIds);
  if (state.spatial_state.current_location && !locationIdSet.has(state.spatial_state.current_location.id)) {
    throw new Error("Invalid current location reference");
  }
  if (state.spatial_state.adjacent_locations.some(location => !locationIdSet.has(location.id))) {
    throw new Error("Invalid adjacent location reference");
  }
  if (state.spatial_state.edges.some(edge => !locationIdSet.has(edge.from_location_id) || !locationIdSet.has(edge.to_location_id))) {
    throw new Error("Invalid location edge reference");
  }
  if (state.spatial_state.entity_placements.some(placement => !entityIdSet.has(placement.entity_id) || !locationIdSet.has(placement.location_id))) {
    throw new Error("Invalid placement reference");
  }
  if (state.relational_state.some(relationship => !entityIdSet.has(relationship.source_entity_id) || !entityIdSet.has(relationship.target_entity_id))) {
    throw new Error("Invalid relationship reference");
  }
  const relationshipIds = state.relational_state.map(relationship => relationship.relationship_id);
  if (relationshipIds.length !== new Set(relationshipIds).size) throw new Error("Duplicate relationship IDs");

  const castIds = state.cast_roster.map(member => member.cast_id);
  const castNames = state.cast_roster.map(member => member.canonical_name?.trim().toLocaleLowerCase());
  if (!castIds.length) throw new Error("Missing Cast Roster");
  if (castIds.some(id => !id) || castIds.length !== new Set(castIds).size) throw new Error("Duplicate or missing cast ID");
  if (castNames.some(name => !name) || castNames.length !== new Set(castNames).size) throw new Error("Duplicate or missing cast name");
  if (state.cast_roster.some(member => member.player_controlled)) throw new Error("Player persona cannot enter Cast Roster");
  if (state.cast_roster.some(member => !member.entity_id || !entityIdSet.has(member.entity_id))) {
    throw new Error("Every Cast Member must reference a world entity");
  }
  const reachableTurnIds = new Set((request.exchanges ?? []).map(exchange => exchange.turn_id));
  if (state.cast_roster.some(member =>
    member.provenance === "continuity_discovered" &&
    (!member.first_seen_turn_id || !reachableTurnIds.has(member.first_seen_turn_id))
  )) throw new Error("Discovered Cast Member has invalid lineage provenance");
  const rosterById = new Map(state.cast_roster.map(member => [member.cast_id, member]));
  for (const seed of request.cast_seeds ?? []) {
    const member = rosterById.get(seed.cast_id);
    if (!member) throw new Error(`Cast Roster dropped seed ${seed.canonical_name}`);
    if (member.provenance !== seed.provenance) {
      throw new Error(`Cast seed provenance changed: ${seed.canonical_name}`);
    }
    if (member.first_seen_turn_id !== seed.first_seen_turn_id) {
      throw new Error(`Cast seed first-seen identity changed: ${seed.canonical_name}`);
    }
    if (JSON.stringify(member.manual_locks) !== JSON.stringify(seed.manual_locks ?? [])) {
      throw new Error(`Cast seed lock declaration changed: ${seed.canonical_name}`);
    }
    for (const field of seed.manual_locks ?? []) {
      if (JSON.stringify(member[field]) !== JSON.stringify(seed[field])) {
        throw new Error(`Locked cast field changed: ${seed.canonical_name}.${field}`);
      }
    }
  }

  if (!Array.isArray(response.timeline_events)) throw new Error("Missing timeline_events");
  if (response.timeline_events.length > 7) throw new Error("Too many timeline events");
  const exchangeTurnIds = new Set(request.checkpoint_turn_ids ?? (request.exchanges ?? []).map(exchange => exchange.turn_id));
  const relationshipIdSet = new Set(relationshipIds);
  for (const event of response.timeline_events) {
    if (!exchangeTurnIds.has(event.turn_id)) throw new Error("Invalid timeline turn reference");
    if (!Number.isInteger(event.importance) || event.importance < 1 || event.importance > 5) {
      throw new Error("Invalid timeline importance");
    }
    if (event.affected_entity_ids.some(id => !entityIdSet.has(id))) throw new Error("Invalid timeline entity reference");
    if (event.affected_relationship_ids.some(id => !relationshipIdSet.has(id))) throw new Error("Invalid timeline relationship reference");
  }
}

export function requestRevision(request) {
  return `${request.request_id}:${request.attempt_count ?? 0}`;
}
