import { LinkError } from "../errors.js";
import type { Mac } from "../mac.js";
import type { StoryLandmark, StoryView } from "../protocol/generated/link.js";
import { passed, worldStands } from "../engine/story.js";
import { minutesOf, parseStoryTime, sayDate, sayTime } from "../time.js";
import { countdown, sayClock } from "./scene.js";

/**
 * Everything The Story screen shows, as it stands on the current Path (editing-the-story design decision 4): what the
 * Story is built on, each Landmark with whether the World has reached it, and where the World stands.
 */
export function storyView(mac: Mac, storyId: string, traceId: string): StoryView {
  const path = mac.tree.currentPath(storyId);
  if (!path) throw new LinkError("not_found", "That Story is not on this Mac.");
  const head = path.headEntryId;
  const state = mac.states.at(head);
  const stands = worldStands(state, state.clock);
  const now = parseStoryTime(state.clock);
  const landmarks: (StoryLandmark & { minutes: number })[] = state.landmarks.map(landmark => {
    const at = parseStoryTime(landmark.at);
    const gone = passed(landmark.at, stands);
    return {
      name: landmark.name,
      at: landmark.at,
      at_label: at ? `${sayDate(at, state.dayOne, true)}, ${sayTime(at)}` : landmark.at,
      when: !gone && at && now ? countdown(now, at, landmark.name).when : null,
      what: landmark.what,
      passed: gone,
      minutes: at ? minutesOf(at) : 0
    };
  });
  return {
    story_id: storyId,
    title: state.title,
    premise: state.premise,
    style: state.style,
    reply_length: state.replyLength,
    arcs: state.arcs,
    landmarks: landmarks.sort((left, right) => left.minutes - right.minutes).map(({ minutes: _minutes, ...landmark }) => landmark),
    world_summary: state.world.summary,
    world_history: state.world.history,
    places: state.world.places.map(place => ({ name: place.name, description: place.description })),
    institutions: state.world.institutions.map(place => ({ name: place.name, description: place.description })),
    clock: { at: state.clock, at_label: sayClock(state, state.clock), day_one: state.dayOne },
    world_stands: stands,
    head_entry_id: head,
    trace_id: traceId
  };
}
