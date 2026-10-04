import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { importCommand, pair, show, stories, trace } from "../../src/cli/commands.js";
import { Engine } from "../../src/engine/engine.js";
import { Models } from "../../src/models/model-call.js";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { freshHome } from "../support/host.js";
import { minimalStoryFile, writeStoryFile } from "../support/story-files.js";

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

  it("runs from its launcher", () => {
    const home = mkdtempSync(join(tmpdir(), "fantasia-cli-"));
    const output = execFileSync(process.execPath, [join(import.meta.dirname, "..", "..", "bin", "fantasia.mjs"), "stories"], { env: { ...process.env, FANTASIA_HOME: home }, encoding: "utf8" });
    expect(output).toContain("No Stories yet.");
  });
});
