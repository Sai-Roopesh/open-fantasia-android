import type { StoryFile } from "../../src/protocol/generated/story-file.js";
import { emptyUpdate } from "../../src/story/truth.js";
import type { BeatNote, Chronicle, DirectorPlan, Entry, Payload, StoryFolded, WorldMoved } from "../../src/story/entries.js";
import type { ModelChoice, State } from "../../src/story/state.js";
import { importStoryFile } from "../../src/storyfile/import.js";
import { freshHome } from "../support/host.js";
import { hogwartsWorldStoryFile, writeStoryFile } from "../support/story-files.js";

export const SONNET: ModelChoice = { provider: "claude", model: "claude-sonnet-5-5" };

/**
 * A Story imported on a throwaway Mac, written to entry by entry as play and the Scene end would write it, so each
 * agent can be asked from a State the reducer folded from the Path (docs/adr/0015).
 */
export function ledger(file: StoryFile = hogwartsWorldStoryFile()) {
  const mac = freshHome();
  const imported = importStoryFile(writeStoryFile(file), mac);
  if (!imported.ok) throw new Error(`import failed: ${JSON.stringify(imported.problems)}`);
  const storyId = imported.storyId;
  let head = mac.tree.currentPath(storyId)!.headEntryId;
  const add = (payload: Payload): Entry => {
    const entry = mac.tree.append(storyId, head, payload);
    head = entry.id;
    return entry;
  };
  const state = (): State => mac.states.at(head);
  const number = () => state().scene?.number ?? 0;
  return {
    mac, storyId, add, state,
    head: () => head,
    /** The Scene's entries, from its opening to the head. */
    scene: (): Entry[] => {
      const path = mac.tree.pathTo(head);
      return path.slice(Math.max(0, path.findIndex(entry => entry.id === state().scene?.startsAt)));
    },
    open: (title: string, place: string, at: string, who: string[], prose: string | null = null) =>
      add({ kind: "scene_opened", number: number() + 1, title, place, at, who, prose, startsAt: null, purpose: null, exit: null }),
    move: (text: string, choice?: Extract<Payload, { kind: "move" }>["choice"]) => add(choice ? { kind: "move", text, choice } : { kind: "move", text }),
    note: (changes: Partial<BeatNote> = {}) => add({
      kind: "beat_note", plan: null, here: state().scene?.here ?? [], goes: [], beats: [], note: "Someone answers.", call: "continue",
      intensity: 2, arcMoved: true, clock: state().clock, inPlay: [], callId: "c", model: SONNET, ...changes
    }),
    reply: (text: string) => add({ kind: "reply", text, callId: "c", model: SONNET }),
    close: () => add({ kind: "scene_closed", by: "story" }),
    chronicle: (changes: Partial<Omit<Chronicle, "kind">> = {}) => add({
      kind: "chronicle", truth: emptyUpdate(), scene: number(), summary: "The Scene was played.", paragraph: "The Scene was played.", moments: [], told: [], known: [],
      bonds: [], engagements: [], changed: [], dropped: [], callId: "c", model: SONNET, ...changes
    }),
    plan: (changes: Partial<Omit<DirectorPlan, "kind">> = {}) => {
      const day = Number(/^Day (\d+)/.exec(state().clock)?.[1] ?? 1);
      return add({
        kind: "director_plan", from: day, until: day + 4, toward: "what comes next", landmark: null, phase: "build", scenes: [], leads: [], arcs: [],
        roadmap: [], premise: "", newThings: [], people: [], reason: "A plan is due.", afterScene: number(), dropped: [], callId: "c", model: SONNET, ...changes
      });
    },
    world: (changes: Partial<Omit<WorldMoved, "kind">> = {}) => add({
      kind: "world_moved", truth: emptyUpdate(), scene: number(), gap: false, from: state().clock, until: state().clock, lives: [], threads: [], happened: [], meanwhile: [],
      on: [], dropped: [], callId: null, model: null, ...changes
    }),
    fold: (changes: Partial<Omit<StoryFolded, "kind">> = {}) => add({ kind: "story_folded", into: "week", count: 1, from: state().clock, until: state().clock, text: "A week.", callId: "c", model: SONNET, ...changes })
  };
}

export type Ledger = ReturnType<typeof ledger>;
