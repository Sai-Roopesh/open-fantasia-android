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
