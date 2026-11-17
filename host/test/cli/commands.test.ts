import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importCommand, models, moments, pair, prompts, record, show, stories, trace, world } from "../../src/cli/commands.js";
import { Engine } from "../../src/engine/engine.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { jobModels, storyActor } from "../../src/models/jobs.js";
import { freshHome } from "../support/host.js";
import { offeredCatalog } from "../support/link.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile, minimalStoryFile, writeStoryFile } from "../support/story-files.js";

function capture() {
  const lines: string[] = [];
  return { lines, out: (line: string) => lines.push(line), text: () => lines.join("\n") };
}

describe("the fantasia command", () => {
  it("imports a Story File and lists it", () => {
    const mac = freshHome();
    const imported = capture();
    expect(importCommand(mac, writeStoryFile(minimalStoryFile()), imported.out)).toBe(true);
    expect(imported.text()).toMatch(/Imported "A Small Story" as /);
    const listed = capture();
    stories(mac, listed.out);
    expect(listed.text()).toMatch(/A Small Story {2}\(Scene 1 · The night train\)/);
  });

  it("names every problem when it refuses a Story File", () => {
    const mac = freshHome();
    const refused = capture();
    expect(importCommand(mac, writeStoryFile({ ...minimalStoryFile(), leads: ["Ginny"], player_character: "Nobody" }), refused.out)).toBe(false);
    expect(refused.lines[0]).toBe("Nothing was imported. 2 problems:");
    expect(refused.text()).toContain("leads[0]: \"Ginny\" is a Lead but not one of the people");
    expect(refused.text()).toContain("player_character: \"Nobody\" is the Player Character but not one of the people");
  });

  it("shows a Story's Path, and one entry in full", () => {
    const mac = freshHome();
    importCommand(mac, writeStoryFile(minimalStoryFile()), () => {});
    const storyId = (mac.db.prepare("SELECT id FROM stories").get() as { id: string }).id;
    const path = capture();
    expect(show(mac, storyId, undefined, path.out)).toBe(true);
    expect(path.text()).toMatch(/story_set_up\s+A Small Story/);
    expect(path.text()).toMatch(/scene_opened\s+Scene 1: The night train/);
    const head = mac.tree.currentPath(storyId)!.headEntryId;
    const entry = capture();
    expect(show(mac, storyId, head, entry.out)).toBe(true);
    expect(JSON.parse(entry.text()).payload.title).toBe("The night train");
  });

  it("prints the combined writing request and saved-draft Editor request without calling a model", async () => {
    const story = playable();
    await story.play("I sit down beside Hermione.");
    const writes = story.models.writer.requests.length;
    const printed = capture();
    expect(prompts(story.mac, story.storyId, "I ask her what she is reading.", printed.out)).toBe(true);
    const text = printed.text();
    expect(text).toContain("== Writing, for the Move: I ask her what she is reading.");
    expect(text).toContain("I ask her what she is reading.");
    expect(text).toContain("== The Editor, for the latest saved draft: I sit down beside Hermione.");
    expect(text.indexOf("== Writing")).toBeLessThan(text.indexOf("== The Editor"));
    expect(story.models.writer.requests).toHaveLength(writes);
    expect(prompts(story.mac, "no-such-story", "Hello.", capture().out)).toBe(false);
  });

  it("looks up a trace", async () => {
    const mac = freshHome();
    importCommand(mac, writeStoryFile(minimalStoryFile()), () => {});
    const storyId = (mac.db.prepare("SELECT id FROM stories").get() as { id: string }).id;
    const engine = new Engine(mac, new Models(mac.db, { claude: new ScriptedRunner([{ fail: "Claude is overloaded" }]) }));
    engine.move(storyId, "I offer her my seat.", mac.tree.currentPath(storyId)!.headEntryId, "abc12345");
    await engine.settled(storyId);
    const looked = capture();
    expect(trace(mac, "abc12345", looked.out)).toBe(true);
    expect(looked.text()).toContain("Failed: Claude is overloaded");
    expect(trace(mac, "nope", capture().out)).toBe(false);
  });

  it("shows a pairing QR code and keeps its one-time code", async () => {
    const mac = freshHome();
    const shown = capture();
    await pair(mac, shown.out);
    expect(shown.text()).toMatch(/Scan this with Open Fantasia on your phone within 10 minutes/);
    expect((mac.db.prepare("SELECT COUNT(*) AS n FROM pairing_codes").get() as { n: number }).n).toBe(1);
  });

  // A new process compiles the CLI before it runs, which takes seconds when the machine is busy.
  it("runs from its launcher", () => {
    const home = mkdtempSync(join(tmpdir(), "fantasia-cli-"));
    const output = execFileSync(process.execPath, [join(import.meta.dirname, "..", "..", "bin", "fantasia.mjs"), "stories"], { env: { ...process.env, FANTASIA_HOME: home }, encoding: "utf8" });
    expect(output).toContain("No Stories yet.");
  }, 30_000);

  it("shows the model for each job, each Story's Actor and what each provider offers, and a change reaches the next Writer call", async () => {
    const { mac, play, models: scripted, storyId } = playable();
    await offeredCatalog(mac.home);
    const shown = capture();
    expect(models(mac, [], shown.out)).toBe(true);
    expect(shown.text()).toBe([
      "editor  claude  claude-sonnet-5-5  (default)",
      "chronicler  claude  claude-opus-5-5  effort medium  (default)",
      "director  claude  claude-fable-5-1  effort high  (default)",
      "weaver  claude  claude-opus-5-5  (default)",
      "folder  claude  claude-opus-5-5  (default)",
      `actor  "After Curfew" (${storyId})  claude  claude-opus-5-5  effort high  (its Story File's)`,
      "claude offers  claude-opus-5-5 (low medium high xhigh max), claude-fable-5-1 (low medium high xhigh max), claude-sonnet-5-5 (low medium high xhigh max), claude-haiku-4-5-20251001",
      "codex offers  gpt-6.1-sol (low medium high xhigh max ultra), gpt-6-luna (low medium high xhigh max)",
      "antigravity offers  gemini-3.8-flash (low medium high)"
    ].join("\n"));

    const set = capture();
    expect(models(mac, ["editor", "claude", "claude-opus-5-5", "high"], set.out)).toBe(true);
    expect(set.text()).toBe("The Editor now uses claude claude-opus-5-5 (effort high), from its next call.");
    await play("I sit down.");
    expect(scripted.editor.requests[0]!.model).toEqual({ provider: "claude", model: "claude-opus-5-5", effort: "high" });
    const after = capture();
    models(mac, [], after.out);
    expect(after.text().split("\n")[0]).toBe("editor  claude  claude-opus-5-5  effort high");
  });

  it("sets the Director, and any job on any provider the Mac knows", () => {
    const mac = freshHome();
    const director = capture();
    expect(models(mac, ["director", "antigravity", "gemini-3.1-pro", "high"], director.out)).toBe(true);
    expect(director.text()).toBe("The Director now uses antigravity gemini-3.1-pro (effort high), from its next call.");
    const weaver = capture();
    expect(models(mac, ["weaver", "codex", "gpt-6.1-sol"], weaver.out)).toBe(true);
    expect(jobModels(mac.home).weaver).toEqual({ provider: "codex", model: "gpt-6.1-sol" });
  });

  it("sets a Story's own Actor by its title or id, and puts it back to its Story File's", async () => {
    const { mac, storyId } = playable();
    await offeredCatalog(mac.home);
    const set = capture();
    expect(models(mac, ["actor", "After Curfew", "codex", "gpt-6.1-sol", "high"], set.out)).toBe(true);
    expect(set.text()).toBe("The Actor of \"After Curfew\" now uses codex gpt-6.1-sol (effort high), from its next Reply.");
    expect(storyActor(mac.home, storyId)).toEqual({ provider: "codex", model: "gpt-6.1-sol", effort: "high" });
    const back = capture();
    expect(models(mac, ["actor", storyId, "reset"], back.out)).toBe(true);
    expect(back.text()).toBe("The Actor of \"After Curfew\" is its Story File's again: claude claude-opus-5-5 (effort high).");
    expect(storyActor(mac.home, storyId)).toBeNull();
  });

  it("refuses a job, a provider, a model, an effort or a Story it does not know", async () => {
    const mac = freshHome();
    await offeredCatalog(mac.home);
    const job = capture();
    expect(models(mac, ["narrator", "claude", "claude-opus-5-5"], job.out)).toBe(false);
    expect(job.text()).toMatch(/No job "narrator"\. The jobs are: editor, chronicler, director, weaver, folder, or actor "<Story>"/);
    const provider = capture();
    expect(models(mac, ["editor", "openai", "gpt-6.1-sol"], provider.out)).toBe(false);
    expect(provider.text()).toMatch(/No provider "openai"\. The providers are: claude, codex, antigravity/);
    const model = capture();
    expect(models(mac, ["editor", "codex", "gpt-9"], model.out)).toBe(false);
    expect(model.text()).toBe("Codex does not offer gpt-9.");
    const effort = capture();
    expect(models(mac, ["editor", "claude", "claude-haiku-4-5-20251001", "max"], effort.out)).toBe(false);
    expect(effort.text()).toBe("Haiku 4.5 has no effort max.");
    const story = capture();
    expect(models(mac, ["actor", "Nowhere", "claude", "claude-opus-5-5"], story.out)).toBe(false);
    expect(story.text()).toBe("No Story \"Nowhere\" on this Mac.");
  });

  it("lists a Story's Moments with their Scene, who knows each, and their words", async () => {
    const moment = { what: "Hermione watched him sit down, and said nothing.", quotes: [{ entry: "P2", text: "I sit down at the other end of the sofa." }], there: ["Hermione Granger"], weight: 3 };
    const recorded = { summary: "He sat down.", paragraph: "He sat down at the other end of the sofa.", moments: [moment], told: [], known: [], bonds: [], engagements: [], changed: [] };
    const { mac, play, engine, storyId, head } = playable(undefined, { chronicler: [{ answer: JSON.stringify(recorded) }] });
    const nothing = capture();
    expect(moments(mac, storyId, nothing.out)).toBe(true);
    expect(nothing.text()).toBe("No Moments recorded yet.");
    await play("I sit down at the other end of the sofa.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const listed = capture();
    expect(moments(mac, storyId, listed.out)).toBe(true);
    expect(listed.lines).toEqual([
      "Scene 1 · After curfew · weight 3",
      "  Hermione watched him sit down, and said nothing.",
      "  Known to: Roopesh Gantasala, Hermione Granger",
      "  Roopesh Gantasala: \"I sit down at the other end of the sofa.\""
    ]);
    const none = capture();
    expect(moments(mac, "no-such-story", none.out)).toBe(false);
  });

  it("shows The record: each Scene recorded with parts left out, and why", async () => {
    // The Chronicler quotes words that are not on the page, so that Moment is left out of the record.
    const recorded = { summary: "They talked about the essay.", paragraph: "He asked Hermione about the essay.", moments: [{ what: "Hermione promised to help.", quotes: [{ entry: "P2", text: "I promise I will help you." }], there: ["Hermione Granger"], weight: 3 }], told: [], known: [], bonds: [], engagements: [], changed: [] };
    const story = hogwartsWorldStoryFile({ title: "The library", place: "The library", at: "Day 3 15:00", who: ["Hermione Granger"] });
    const { mac, play, engine, storyId, head } = playable(story, { chronicler: [{ answer: JSON.stringify(recorded) }] });
    const empty = capture();
    expect(record(mac, storyId, empty.out)).toBe(true);
    expect(empty.text()).toBe("Nothing was left out of the record.");
    await play("I ask Hermione about the essay.");
    engine.endScene(storyId, head(), "t-end");
    await engine.ended(storyId);
    const listed = capture();
    expect(record(mac, storyId, listed.out)).toBe(true);
    expect(listed.lines[0]).toBe("Scene 1 · The library");
    expect(listed.lines).toContain("  left out: moments[0]: none of its words are on the page");
    expect(record(mac, "no-such-story", capture().out)).toBe(false);
  });

  it("shows a Story's World: the Lives, the Threads, and what happened with who knows each", async () => {
    const night = { lives: [{ who: "Crabbe and Goyle", where: "the Slytherin common room", doing: "running Draconia's errands", after: "Draconia's errands" }], threads: [{ name: "Quirrell and the third-floor door", now: "The door is scorched" }],
      happened: [{ id: "H1", what: "Quirrell scorched the third-floor door.", at: "Day 4 02:00", where: "the third-floor corridor", known_to: ["Quirinus Quirrell"], landmark: null, move: null, missed: null }], meanwhile: [], on: [] };
    const { mac, play, engine, storyId, head } = playable(hogwartsWorldStoryFile({ at: "Day 3 22:40" }), { weaver: [{ answer: JSON.stringify(night) }] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end");
    await engine.ended(storyId);
    const shown = capture();
    expect(world(mac, storyId, shown.out)).toBe(true);
    expect(shown.text()).toContain("It is Day 4 07:30 (Saturday 7:30 am).");
    expect(shown.text()).toContain("Crabbe and Goyle: the Slytherin common room; running Draconia's errands; after: Draconia's errands");
    expect(shown.text()).toContain("Quirrell and the third-floor door: The door is scorched");
    expect(shown.text()).toContain("Day 4 02:00 · the third-floor corridor · Quirrell scorched the third-floor door. · known to: Quirinus Quirrell");
    expect(world(mac, "no-such-story", capture().out)).toBe(false);
  });
});
