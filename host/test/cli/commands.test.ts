import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importCommand, models, moments, pair, record, show, stories, trace, world } from "../../src/cli/commands.js";
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
      "writer  claude  claude-sonnet-5-5  (default)",
      "chronicler  claude  claude-sonnet-5-5  (default)",
      "weaver  claude  claude-sonnet-5-5  (default)",
      "director  claude  claude-opus-5-5  (default)",
      `actor  "After Curfew" (${storyId})  claude  claude-opus-5-5  (its Story File's)`,
      "claude offers  claude-opus-5-5 (low medium high xhigh max), claude-sonnet-5-5 (low medium high xhigh max), claude-haiku-4-5-20251001",
      "codex offers  gpt-6.1-sol (low medium high xhigh max ultra), gpt-6-luna (low medium high xhigh max)",
      "antigravity offers  gemini-3.8-flash (low medium high)"
    ].join("\n"));

    const set = capture();
    expect(models(mac, ["writer", "claude", "claude-opus-5-5", "high"], set.out)).toBe(true);
    expect(set.text()).toBe("The Writer now uses claude claude-opus-5-5 (effort high), from its next call.");
    await play("I sit down.");
    expect(scripted.writer.requests[0]!.model).toEqual({ provider: "claude", model: "claude-opus-5-5", effort: "high" });
    const after = capture();
    models(mac, [], after.out);
    expect(after.text().split("\n")[0]).toBe("writer  claude  claude-opus-5-5  effort high");
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
    expect(back.text()).toBe("The Actor of \"After Curfew\" is its Story File's again: claude claude-opus-5-5.");
    expect(storyActor(mac.home, storyId)).toBeNull();
  });

  it("refuses a job, a provider, a model, an effort or a Story it does not know", async () => {
    const mac = freshHome();
    await offeredCatalog(mac.home);
    const job = capture();
    expect(models(mac, ["narrator", "claude", "claude-opus-5-5"], job.out)).toBe(false);
    expect(job.text()).toMatch(/No job "narrator"\. The jobs are: writer, chronicler, weaver, director, or actor "<Story>"/);
    const provider = capture();
    expect(models(mac, ["writer", "openai", "gpt-6.1-sol"], provider.out)).toBe(false);
    expect(provider.text()).toMatch(/No provider "openai"\. The providers are: claude, codex, antigravity/);
    const model = capture();
    expect(models(mac, ["writer", "codex", "gpt-9"], model.out)).toBe(false);
    expect(model.text()).toBe("Codex does not offer gpt-9.");
    const effort = capture();
    expect(models(mac, ["writer", "claude", "claude-haiku-4-5-20251001", "max"], effort.out)).toBe(false);
    expect(effort.text()).toBe("Haiku 4.5 has no effort max.");
    const story = capture();
    expect(models(mac, ["actor", "Nowhere", "claude", "claude-opus-5-5"], story.out)).toBe(false);
    expect(story.text()).toBe("No Story \"Nowhere\" on this Mac.");
  });

  it("lists a Story's Moments with who was there, who was told, and their words", async () => {
    const { mac, play, engine, storyId, head } = playable();
    await play("I sit down at the other end of the sofa.");
    engine.endScene(storyId, head(), "end");
    await engine.chronicled(storyId);
    const listed = capture();
    expect(moments(mac, storyId, listed.out)).toBe(true);
    expect(listed.text()).toContain("Scene 1 · After curfew · weight 2");
    expect(listed.text()).toContain("What the player's character did.");
    expect(listed.text()).toContain("Roopesh Gantasala: \"I sit down at the other end of the sofa.\"");
    const none = capture();
    expect(moments(mac, "no-such-story", none.out)).toBe(false);
  });

  it("shows The record, and marks a Scene given up to be tried again by the Mac that serves the phone", async () => {
    const story = hogwartsWorldStoryFile({ title: "The library", place: "The library", at: "Day 3 15:00", who: ["Hermione Granger"] });
    const { mac, play, engine, storyId, head } = playable(story, { chronicler: Array.from({ length: 6 }, () => ({ fail: "Sonnet is overloaded" })) });
    const empty = capture();
    expect(record(mac, storyId, undefined, empty.out)).toBe(true);
    expect(empty.text()).toBe("Nothing is missing from the record.");
    await play("I ask Hermione about the essay.");
    engine.endScene(storyId, head(), "t-end");
    await engine.chronicled(storyId);
    for (let start = 0; start < 2; start++) { engine.chronicleAll(); await engine.chronicled(storyId); }
    const listed = capture();
    expect(record(mac, storyId, undefined, listed.out)).toBe(true);
    expect(listed.lines[0]).toMatch(/^Scene 1 · The library · given up after three tries: .*Sonnet is overloaded/);
    const retried = capture();
    expect(record(mac, storyId, "1", retried.out)).toBe(true);
    expect(retried.text()).toBe("Scene 1 will be recorded again by the Mac serving the phone, after the next Scene or when it starts.");
    expect(mac.tree.recordsOn(head(), "record_gap").at(-1)?.payload).toMatchObject({ attempts: 0, givenUp: false });
    const refused = capture();
    expect(record(mac, storyId, "9", refused.out)).toBe(false);
    expect(refused.text()).toBe("There is no Scene 9 on this Path.");
  });

  it("shows a Story's World: the Lives, the Threads, and what happened with who knows each", async () => {
    const night = { lives: [{ who: "Crabbe and Goyle", where: "the Slytherin common room", doing: "running Draconia's errands", after: "Draconia's errands" }], threads: [{ name: "Quirrell and the third-floor door", now: "The door is scorched" }],
      happened: [{ id: "H1", what: "Quirrell scorched the third-floor door.", at: "Day 4 02:00", where: "the third-floor corridor", known_to: ["Quirinus Quirrell"], landmark: null }], meanwhile: [], happenings: [] };
    const { mac, play, engine, storyId, head } = playable(hogwartsWorldStoryFile({ at: "Day 3 22:40" }), { weaver: [{ answer: JSON.stringify(night) }] });
    await play("I say goodnight.");
    engine.endScene(storyId, head(), "end");
    await engine.woven(storyId);
    const shown = capture();
    expect(world(mac, storyId, shown.out)).toBe(true);
    expect(shown.text()).toContain("The World stands at Day 4 07:30 (Saturday 7:30 am)");
    expect(shown.text()).toContain("Crabbe and Goyle: the Slytherin common room; running Draconia's errands; after: Draconia's errands");
    expect(shown.text()).toContain("Quirrell and the third-floor door: The door is scorched");
    expect(shown.text()).toContain("Day 4 02:00 · the third-floor corridor · Quirrell scorched the third-floor door. · known to: Quirinus Quirrell");
    expect(world(mac, "no-such-story", capture().out)).toBe(false);
  });
});
