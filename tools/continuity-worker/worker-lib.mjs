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

  const castIds = state.cast_roster.map(member => member.cast_id);
  const castNames = state.cast_roster.map(member => member.canonical_name?.trim().toLocaleLowerCase());
  if (!castIds.length) throw new Error("Missing Cast Roster");
  if (castIds.some(id => !id) || castIds.length !== new Set(castIds).size) throw new Error("Duplicate or missing cast ID");
  if (castNames.some(name => !name) || castNames.length !== new Set(castNames).size) throw new Error("Duplicate or missing cast name");
  if (state.cast_roster.some(member => member.player_controlled)) throw new Error("Player persona cannot enter Cast Roster");
  const rosterById = new Map(state.cast_roster.map(member => [member.cast_id, member]));
  for (const seed of request.cast_seeds ?? []) {
    const member = rosterById.get(seed.cast_id);
    if (!member) throw new Error(`Cast Roster dropped seed ${seed.canonical_name}`);
    for (const field of seed.manual_locks ?? []) {
      if (JSON.stringify(member[field]) !== JSON.stringify(seed[field])) {
        throw new Error(`Locked cast field changed: ${seed.canonical_name}.${field}`);
      }
    }
  }

  if (!Array.isArray(response.timeline_events)) throw new Error("Missing timeline_events");
  if (response.timeline_events.length > 7) throw new Error("Too many timeline events");
  const exchangeTurnIds = new Set((request.exchanges ?? []).map(exchange => exchange.turn_id));
  const relationshipIds = new Set(state.relational_state.map(relationship => relationship.relationship_id));
  for (const event of response.timeline_events) {
    if (!exchangeTurnIds.has(event.turn_id)) throw new Error("Invalid timeline turn reference");
    if (!Number.isInteger(event.importance) || event.importance < 1 || event.importance > 5) {
      throw new Error("Invalid timeline importance");
    }
    if (event.affected_entity_ids.some(id => !entityIdSet.has(id))) throw new Error("Invalid timeline entity reference");
    if (event.affected_relationship_ids.some(id => !relationshipIds.has(id))) throw new Error("Invalid timeline relationship reference");
  }
}

export function requestRevision(request) {
  return `${request.request_id}:${request.attempt_count ?? 0}`;
}
