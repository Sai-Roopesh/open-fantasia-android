import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { group, lead, person, portrait } from "../../src/cli/commands.js";
import { playable } from "../support/play.js";
import { hogwartsWorldStoryFile } from "../support/story-files.js";

const capture = () => {
  const lines: string[] = [];
  return { out: (line: string) => { lines.push(line); }, text: () => lines.join("\n") };
};

/** A Portrait image on the Mac, as Claude would have curated it. */
function image(): string {
  const file = join(mkdtempSync(join(tmpdir(), "fantasia-portrait-")), "luna.png");
  writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("Luna")]));
  return file;
}

describe("editing people through the Mac's commands", () => {
  // GIVEN the player is in Scene 20 of a Story
  // WHEN Claude adds Luna Lovegood with a Portrait through the Mac's commands
  // THEN she is among the Story's people on the phone from Scene 20 onward on that Path
  // AND she is absent from earlier moments and from other Paths
  it("stories › Claude can edit a Story as the player can › Claude adds a person mid-Story", async () => {
    const { mac, engine, storyId, head, state, play, events } = playable(hogwartsWorldStoryFile());
    await play("I go looking for a book on charms.");
    const earlier = head();
    const other = mac.tree.createPath(storyId, "Elsewhere", earlier, false);
    const done = capture();
    const ok = await person(mac, engine, storyId, "Luna Lovegood", {
      who: "A Ravenclaw who sees what others miss.", known: "A dreamy Ravenclaw.", alias: ["Loony"], voice: ["You're just as sane as I am."], portrait: image()
    }, done.out);
    expect(ok, done.text()).toBe(true);
    expect(done.text()).toBe("Luna Lovegood is in the Story now, from here on this Path.\nLuna Lovegood's Portrait is set.");
    expect(state().people["Luna Lovegood"]).toMatchObject({ whoTheyAre: "A Ravenclaw who sees what others miss.", aliases: ["Loony"], portrait: expect.stringMatching(/\.png$/) });
    expect(events.at(-1)!.event.kind).toBe("path_changed");
    expect(mac.states.at(earlier).people["Luna Lovegood"]).toBeUndefined();
    expect(mac.states.at(other.headEntryId).people["Luna Lovegood"]).toBeUndefined();
    await play("I ask Luna what she is reading.");
    expect(state().people["Luna Lovegood"]).toBeDefined();
  });

  it("changes only the fields given, makes a Lead, adds a Group, and replaces a Portrait", async () => {
    const { mac, engine, storyId, state } = playable(hogwartsWorldStoryFile());
    const run = async (attempt: (out: (line: string) => void) => Promise<boolean> | boolean) => { const said = capture(); const ok = await attempt(said.out); return { ok, said: said.text() }; };
    expect(await run(out => person(mac, engine, storyId, "Hermione Granger", { after: "The truth about the inkwell." }, out))).toEqual({ ok: true, said: "Hermione Granger is changed, from here on this Path." });
    expect(state().people["Hermione Granger"]).toMatchObject({ after: "The truth about the inkwell.", whoTheyAre: "Muggle-born, Gryffindor, top of every class." });
    expect(await run(out => lead(mac, engine, storyId, "Neville", "on", out))).toEqual({ ok: true, said: "Neville Longbottom is a Lead now." });
    expect(await run(out => group(mac, engine, storyId, "The library regulars", "Always in the library after supper.", out))).toEqual({ ok: true, said: "The Group The library regulars is set." });
    expect(await run(out => portrait(mac, engine, storyId, "Hermione Granger", image(), out))).toEqual({ ok: true, said: "Hermione Granger's Portrait is set." });
    expect(await run(out => person(mac, engine, storyId, "Gilderoy Lockhart", { appearance: "Teeth." }, out))).toEqual({ ok: false, said: "Say who Gilderoy Lockhart is with --who: they are not in the Story yet." });
    expect(await run(out => lead(mac, engine, storyId, "Neville", "maybe", out))).toEqual({ ok: false, said: "Say on or off." });
  });
});
