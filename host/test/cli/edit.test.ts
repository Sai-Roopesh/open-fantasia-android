import { describe, expect, it } from "vitest";
import { edit } from "../../src/cli/commands.js";
import { Engine } from "../../src/engine/engine.js";
import { openMac } from "../../src/mac.js";
import { FakeModels } from "../../src/models/fake.js";
import { Models } from "../../src/models/model-call.js";
import { playable } from "../support/play.js";
import { hogwartsStoryFile } from "../support/story-files.js";

function captured() {
  const lines: string[] = [];
  return { lines, out: (line: string) => lines.push(line), text: () => lines.join("\n") };
}

async function until(done: () => boolean, ms = 2000): Promise<void> {
  for (let waited = 0; !done(); waited += 10) {
    if (waited > ms) throw new Error(`Not done within ${ms} ms`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

/** The Mac's command line: its own connection to the same store, as a second process has, with its own engine. */
function commandLine(home: string) {
  const mac = openMac(home);
  return { mac, engine: new Engine(mac, new Models(mac.db, { claude: new FakeModels() })) };
}

describe("fantasia edit", () => {
  // GIVEN the phone is showing a Scene whose latest Reply reads "Hermoine"
  // WHEN Claude edits that Reply to read "Hermione" through the Mac's commands
  // THEN the phone shows the Reply reading "Hermione" without the player doing anything, and no new Path exists
  it("stories › Claude can edit a Story as the player can › Claude fixes a typo through the Mac", async () => {
    const serving = playable(hogwartsStoryFile(), { actor: [{ answer: "Hermoine folds the note in half." }] });
    await serving.play("I pass her the note.");
    const stop = serving.engine.watchStore(20);
    try {
      await new Promise(resolve => setTimeout(resolve, 60));
      const reply = serving.view().exchanges.at(-1)!.reply!;
      const cli = commandLine(serving.mac.home);
      const output = captured();
      expect(await edit(cli.mac, cli.engine, serving.storyId, reply.entry_id, "Hermione folds the note in half.", output.out)).toBe(true);
      expect(output.text()).toMatch(/Edited in place/);

      await until(() => serving.events.some(event => event.event.kind === "path_changed"));
      expect(serving.view().exchanges.at(-1)!.reply!.text).toBe("Hermione folds the note in half.");
      expect(serving.mac.tree.paths(serving.storyId)).toHaveLength(1);
    } finally {
      stop();
    }
  });

  it("starts a Path from an earlier Move, waits for its Reply and prints it", async () => {
    const serving = playable(hogwartsStoryFile());
    await serving.play("I count to one.");
    await serving.play("I count to two.");
    const first = serving.mac.tree.pathTo(serving.head()).find(entry => entry.payload.kind === "move")!;
    const cli = commandLine(serving.mac.home);
    const output = captured();
    expect(await edit(cli.mac, cli.engine, serving.storyId, first.id, "I count backwards.", output.out)).toBe(true);
    expect(output.text()).toMatch(/Edited on a new Path: FROM SCENE 1 · EDITED/);
    expect(output.text()).toMatch(/She looks at you, and waits\./);
    expect(serving.mac.tree.paths(serving.storyId)).toHaveLength(2);
  });

  it("says why an edit was refused, and changes nothing", async () => {
    const serving = playable(hogwartsStoryFile());
    await serving.play("I wave.");
    const reply = serving.view().exchanges.at(-1)!.reply!;
    const cli = commandLine(serving.mac.home);
    const output = captured();
    expect(await edit(cli.mac, cli.engine, serving.storyId, reply.entry_id, reply.text, output.out)).toBe(false);
    expect(output.text()).toMatch(/already says/);
    expect(await edit(cli.mac, cli.engine, "no-such-story", reply.entry_id, "Words.", output.out)).toBe(false);
  });
});
