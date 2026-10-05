import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importCommand, models, moments, pair, show, stories, trace, world } from "../../src/cli/commands.js";
import { Engine } from "../../src/engine/engine.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { freshHome } from "../support/host.js";
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

  it("shows the model for each job, and a change reaches the next Writer call", async () => {
    const { mac, play, models: scripted } = playable();
    const shown = capture();
    expect(models(mac, [], shown.out)).toBe(true);
    expect(shown.text()).toBe("writer  claude  claude-sonnet-5-5  (default)\nchronicler  claude  claude-sonnet-5-5  (default)\nweaver  claude  claude-sonnet-5-5  (default)");

    const set = capture();
    expect(models(mac, ["writer", "claude", "claude-opus-5-5", "high"], set.out)).toBe(true);
    expect(set.text()).toBe("The Writer now uses claude claude-opus-5-5 (effort high), from its next call.");
    await play("I sit down.");
    expect(scripted.writer.requests[0]!.model).toEqual({ provider: "claude", model: "claude-opus-5-5", effort: "high" });
    const after = capture();
    models(mac, [], after.out);
    expect(after.text()).toBe("writer  claude  claude-opus-5-5  effort high\nchronicler  claude  claude-sonnet-5-5  (default)\nweaver  claude  claude-sonnet-5-5  (default)");
  });

  it("refuses a job or a provider it does not know", () => {
    const mac = freshHome();
    const refused = capture();
    expect(models(mac, ["director", "claude", "claude-opus-5-5"], refused.out)).toBe(false);
    expect(refused.text()).toMatch(/No job "director"\. The jobs are: writer, chronicler, weaver/);
    const provider = capture();
    expect(models(mac, ["writer", "openai", "gpt-6.1-sol"], provider.out)).toBe(false);
    expect(provider.text()).toMatch(/No provider "openai"\. The providers are: claude, codex, antigravity/);
    const unreachable = capture();
    expect(models(mac, ["writer", "codex", "gpt-6.1-sol"], unreachable.out)).toBe(false);
    expect(unreachable.text()).toMatch(/codex models cannot be reached from this Mac yet/);
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
