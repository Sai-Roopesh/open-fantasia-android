import { Engine, type OutgoingEvent } from "../../src/engine/engine.js";
import { FakeModels } from "../../src/models/fake.js";
import { Models } from "../../src/models/model-call.js";
import { scriptedRunners } from "../../src/models/runners.js";
import type { Script } from "../../src/models/scripted.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { sceneView } from "../../src/views/scene.js";
import { freshHome } from "./host.js";
import { hogwartsStoryFile, writeStoryFile } from "./story-files.js";

/** A Director that never plans: for a Story whose World is scripted without a Stretch to follow. */
export const NEVER_PLANS: Script[] = Array.from({ length: 50 }, () => ({ fail: "This Story is played without a plan." }));

type Scripts = { writer?: Script[]; actor?: Script[]; chronicler?: Script[]; weaver?: Script[]; director?: Script[] };

/**
 * A Story ready to play on scripted models, with every event it sends kept. [unplanned] plays it with no Director's
 * plan, as before the first plan or after the Director fails: the Weaver then picks freely, so a test can script the
 * World without a Stretch to follow (docs/adr/0010).
 */
export function playable(storyFile: StoryFile = hogwartsStoryFile(), scripts: Scripts & { unplanned?: boolean } = {}, actorFallback?: ConstructorParameters<typeof FakeModels>[1]) {
  const mac = freshHome();
  const result = importStoryFile(writeStoryFile(storyFile), mac);
  if (!result.ok) throw new Error(`import failed: ${JSON.stringify(result.problems)}`);
  const { unplanned, ...scripted } = scripts;
  const models = new FakeModels(unplanned ? { ...scripted, director: NEVER_PLANS } : scripted, actorFallback);
  // The same scripted models stand in for every provider; the Mac's record of each call says which it went to.
  const engine = new Engine(mac, new Models(mac.db, scriptedRunners(models)));
  const events: OutgoingEvent[] = [];
  const storyId = result.storyId;
  engine.subscribe(storyId, event => events.push(event));
  const head = () => mac.tree.currentPath(storyId)!.headEntryId;
  const path = () => mac.tree.pathTo(head()).map(entry => entry.payload);
  const state = () => mac.states.at(head());
  const view = () => sceneView(mac, engine, storyId, "trace-view");
  let turns = 0;
  const play = async (move: string) => {
    engine.move(storyId, move, head(), `trace-${++turns}`);
    await engine.settled(storyId);
  };
  return { mac, engine, models, storyId, events, head, path, state, view, play };
}

