import { Engine, type OutgoingEvent } from "../../src/engine/engine.js";
import { FakeModels } from "../../src/models/fake.js";
import { setEditsEveryReply } from "../../src/models/jobs.js";
import { Models } from "../../src/models/model-call.js";
import { scriptedRunners } from "../../src/models/runners.js";
import type { Script } from "../../src/models/scripted.js";
import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import type { Entry, Payload } from "../../src/story/entries.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { sceneView } from "../../src/views/scene.js";
import { freshHome } from "./host.js";
import { hogwartsStoryFile, writeStoryFile } from "./story-files.js";

/** What each job's scripted model answers, in turn; a job with nothing scripted answers by itself, keeping every rule. */
type Scripts = { writer?: Script[]; actor?: Script[]; editor?: Script[]; chronicler?: Script[]; weaver?: Script[]; director?: Script[]; outline?: Script[]; folder?: Script[] };

/** A Story ready to play on scripted models, with every event it sends kept. */
export function playable(storyFile: StoryFile = hogwartsStoryFile(), scripts: Scripts = {}, actorFallback?: ConstructorParameters<typeof FakeModels>[1]) {
  const mac = freshHome();
  // These scenarios were written for every Reply being edited; a Mac's default no longer does that (docs/adr/0024).
  setEditsEveryReply(mac.home, true);
  const result = importStoryFile(writeStoryFile(storyFile), mac);
  if (!result.ok) throw new Error(`import failed: ${JSON.stringify(result.problems)}`);
  const models = new FakeModels(scripts, actorFallback);
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
  /** Writes [payload] at the head of the Path, as play or a Scene's end would have written it, without the models. */
  const write = (payload: Payload): Entry => {
    const current = mac.tree.currentPath(storyId)!;
    const entry = mac.tree.append(storyId, current.headEntryId, payload);
    mac.tree.moveHead(current.id, current.headEntryId, entry.id);
    return entry;
  };
  return { mac, engine, models, storyId, events, head, path, state, view, play, write };
}

