import { describe, expect, it } from "vitest";
import { checkFold, folderPrompt, foldDue, KEEP_SCENES, KEEP_WEEKS, writeFold } from "../../src/agents/folder.js";
import { storySoFarPart } from "../../src/context/lens.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import type { Entry, Payload } from "../../src/story/entries.js";
import { apply } from "../../src/story/reducer.js";
import type { State, Told } from "../../src/story/state.js";
import { freshHome } from "../support/host.js";
import { hogwartsStoryFile } from "../support/story-files.js";
import { SONNET } from "./ledger.js";

const words = (count: number, word: string) => Array.from({ length: count }, () => word).join(" ");
const paragraph = (number: number, day: number): Told => ({ from: `Day ${day} 10:00`, until: `Day ${day} 11:00`, text: `Scene ${number} happened.`, scene: { number, title: `Scene ${number}` }, who: [] });
const week = (from: number): Told => ({ from: `Day ${from} 08:00`, until: `Day ${from + 6} 22:00`, text: `The week from Day ${from}.`, scene: null, who: [] });

/** A State whose Story So Far holds [scenes] paragraphs, [weeks] recaps and no chapters. */
function told(scenes: Told[], weeks: Told[] = []): State {
  let seq = 0;
  const state = apply(null, { seq: ++seq, id: "e1", storyId: "s", parentId: null, payload: { kind: "story_set_up", storyFile: hogwartsStoryFile(), portraits: {} }, createdAt: "" });
  return { ...state, storySoFar: { chapters: [], weeks, scenes } };
}

describe("when the Folder folds (one-truth design decision 2)", () => {
  it("folds nothing while the Story So Far has six Scene paragraphs or fewer", () => {
    expect(foldDue(told([1, 2, 3, 4, 5, 6].map(day => paragraph(day, day))))).toBeNull();
  });

  it("folds the oldest week whole, once all its Scenes are older than the newest six", () => {
    // Days 1 to 5 are one week; days 8 to 14 the next.
    const scenes = [1, 3, 5, 8, 9, 10, 11, 12, 13].map((day, index) => paragraph(index + 1, day));
    expect(foldDue(told(scenes))).toEqual({ into: "week", parts: scenes.slice(0, 3) });
    // While part of the oldest week is still among the newest six, it waits, so a week is told in one recap.
    expect(foldDue(told(scenes.slice(0, 7)))).toBeNull();
  });

  it("folds a crowded week's Scenes older than the newest six once it holds more than twice the six kept", () => {
    const crowded = Array.from({ length: 13 }, (_, index) => paragraph(index + 1, 1 + Math.floor(index / 3)));
    expect(foldDue(told(crowded))).toEqual({ into: "week", parts: crowded.slice(0, 7) });
    expect(foldDue(told(crowded.slice(0, 12)))).toBeNull();
  });

  it("folds the oldest four weeks into a chapter, before any Scene, past eight weeks", () => {
    const weeks = Array.from({ length: KEEP_WEEKS + 1 }, (_, index) => week(1 + index * 7));
    const scenes = Array.from({ length: 9 }, (_, index) => paragraph(index + 1, 70 + index * 3));
    expect(foldDue(told(scenes, weeks))).toEqual({ into: "chapter", parts: weeks.slice(0, 4) });
    expect(foldDue(told(scenes, weeks.slice(0, KEEP_WEEKS)))).toMatchObject({ into: "week" });
  });
});

describe("the Folder's call", () => {
  it("asks for a week's recap from its Scenes, and a chapter from its weeks, inventing nothing", () => {
    const state = told([]);
    const scenes = [paragraph(4, 2), paragraph(5, 3)];
    const recap = folderPrompt(state, { into: "week", parts: scenes });
    expect(recap.system).toContain("Fold the Scenes below into one recap of their week, about one hundred and twenty words");
    expect(recap.system).toContain("Invent nothing. Tell each thing you keep as the parts tell it");
    expect(recap.system).toContain("a near miss stays a near miss");
    expect(recap.prompt).toContain("Scene 4, Scene 4: Scene 4 happened.\n\nScene 5, Scene 5: Scene 5 happened.");
    const chapter = folderPrompt(state, { into: "chapter", parts: [week(1), week(8)] });
    expect(chapter.system).toContain("Fold the weeks below into one chapter, about one hundred and fifty words");
    expect(chapter.prompt).toContain("Wednesday 4 September 1991, 8:00 am to Tuesday 10 September 1991, 10:00 pm: The week from Day 1.");
  });

  it("takes a fold that is text, and sends back one that is not", () => {
    expect(checkFold({ text: "  A week in which things turned. " })).toEqual({ ok: true, value: "A week in which things turned." });
    expect(checkFold({ recap: "A week." }).ok).toBe(false);
    expect(checkFold({ text: "" }).ok).toBe(false);
  });

  it("is one step: its own model, then the second", async () => {
    const mac = freshHome();
    const runner = new ScriptedRunner([{ answer: JSON.stringify({ words: "no" }) }, { answer: JSON.stringify({ text: "A week in which she owed him." }) }]);
    const folded = await writeFold(new Models(mac.db, { claude: runner }), [SONNET], told([]), { into: "week", parts: [paragraph(1, 1)] }, "story", "trace-f", new AbortController().signal);
    expect(folded.value).toBe("A week in which she owed him.");
    expect(runner.requests.map(request => request.agent)).toEqual(["folder", "folder"]);
  });
});

describe("The Story So Far stays short (openspec living-world)", () => {
  /** Plays [count] Scenes on the reducer, each ended as the Scene end ends it: its paragraph, then a fold when due. */
  function play(count: number): State {
    let seq = 0;
    let state: State | null = null;
    const add = (payload: Payload) => {
      seq += 1;
      const entry: Entry = { seq, id: `e${seq}`, storyId: "s", parentId: seq > 1 ? `e${seq - 1}` : null, payload, createdAt: "" };
      state = apply(state, entry);
      return state;
    };
    add({ kind: "story_set_up", storyFile: hogwartsStoryFile(), portraits: {} });
    // A week of play: two Scenes one day, none the next, one a day after, and so on; about a Scene a day.
    const perDay = [2, 0, 1, 1, 0, 2, 1];
    let day = 3;
    for (let number = 1; number <= count;) {
      for (let index = 0; index < (perDay[day % 7] ?? 1) && number <= count; index++, number++) {
        add({ kind: "scene_opened", number, title: `Scene ${number}`, place: "The library", at: `Day ${day} ${index ? "19" : "10"}:00`, who: ["Hermione Granger"], prose: null, startsAt: null, purpose: null, exit: null });
        add({ kind: "scene_closed", by: "story" });
        // The Chronicler's paragraph is about eighty words.
        add({ kind: "chronicle", scene: number, summary: "s", paragraph: `Scene ${number}: ${words(78, "said")}.`, moments: [], told: [], known: [], bonds: [], engagements: [], changed: [], dropped: [], callId: "c", model: SONNET });
        const due = foldDue(state!);
        if (due) {
          // One fold at each Scene's end, as asked: a week in about one hundred and twenty words, a chapter in one hundred and fifty.
          add({ kind: "story_folded", into: due.into, count: due.parts.length, from: due.parts[0]!.from, until: due.parts.at(-1)!.until, text: words(due.into === "week" ? 120 : 150, "then"), callId: "c", model: SONNET });
        }
      }
      day += 1;
    }
    return state!;
  }

  // GIVEN two hundred Scenes have been played
  // THEN The Story So Far tells the last few Scenes a paragraph each, the weeks before them as recaps, and the rest
  //   as chapters, and stays within a few pages
  it("living-world › Every agent knows the Story So Far › Short after two hundred Scenes", () => {
    const state = play(200);
    const { scenes, weeks, chapters } = state.storySoFar;
    // The last few Scenes, a paragraph each, newest last.
    expect(scenes.length).toBeGreaterThanOrEqual(KEEP_SCENES);
    expect(scenes.length).toBeLessThanOrEqual(KEEP_SCENES * 2);
    expect(scenes.map(part => part.scene?.number)).toEqual(Array.from({ length: scenes.length }, (_, index) => 200 - scenes.length + 1 + index));
    // The weeks before them, each a recap of no more than a week; the rest as chapters.
    expect(weeks.length).toBeGreaterThan(0);
    expect(weeks.length).toBeLessThanOrEqual(KEEP_WEEKS + 1);
    const day = (at: string) => Number(/^Day (\d+)/.exec(at)?.[1]);
    for (const recap of weeks) expect(day(recap.until) - day(recap.from)).toBeLessThan(7);
    expect(chapters.length).toBeGreaterThan(0);
    // In time order: chapters, then weeks, then Scenes.
    const told = [...chapters, ...weeks, ...scenes];
    for (let index = 1; index < told.length; index++) expect(day(told[index]!.from)).toBeGreaterThanOrEqual(day(told[index - 1]!.until));
    // Within a few pages: what two hundred Scene paragraphs would take sixteen thousand words to tell.
    const length = storySoFarPart(state)!.split(/\s+/).length;
    expect(length).toBeLessThan(3_000);
  });
});
