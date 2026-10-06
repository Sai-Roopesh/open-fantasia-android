import { afterEach, describe, expect, it } from "vitest";
import { ScriptedRunner } from "../../src/models/scripted.js";
import type { SceneView } from "../../src/protocol/generated/link.js";
import { GatedRunner, runningMac } from "../support/link.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function mac(actor: ConstructorParameters<typeof ScriptedRunner>[0] | GatedRunner = []) {
  const running = await runningMac(actor instanceof GatedRunner ? actor : new ScriptedRunner(actor));
  closers.push(running.close);
  const { call, storyId } = running;
  const view = async () => await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
  const edit = async (body: unknown) => await call(`/stories/${storyId}/edit`, { method: "POST", body: JSON.stringify(body) });
  const message = async (response: Response) => (await response.json() as { error: { message: string } }).error.message;
  return { ...running, view, edit, message };
}

describe("Editing over the link", () => {
  it("edits a Scene's opening prose as a Reply, in place while nothing has followed it", async () => {
    const { view, edit, mac: home, storyId } = await mac();
    const opening = await view();
    const prose = opening.exchanges[0]!.reply!;
    const edited = await edit({ entry: prose.entry_id, text: `${prose.text} The candles gutter.`, after: opening.head_entry_id });
    expect(edited.status).toBe(200);
    const now = await view();
    expect(now.exchanges[0]!.reply!.text).toBe(`${prose.text} The candles gutter.`);
    expect(now.scene).toMatchObject({ number: opening.scene.number, title: opening.scene.title });
    expect(home.tree.paths(storyId)).toHaveLength(1);
  });

  it("refuses an edit mid-Reply, from a stale head, with no words or the same words, and of anything but a Move or a Reply", async () => {
    const actor = new GatedRunner(["Slowly."]);
    const { view, edit, message, call, storyId, engine, mac: home } = await mac(actor);
    const opening = await view();
    const prose = opening.exchanges[0]!.reply!;
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I wave.", after: opening.head_entry_id }) });
    const busy = await edit({ entry: prose.entry_id, text: "Something else.", after: opening.head_entry_id });
    expect(busy.status).toBe(409);
    expect(await message(busy)).toMatch(/still being written/);
    await actor.ready();
    actor.release();
    await engine.settled(storyId);

    const played = await view();
    const stale = await edit({ entry: prose.entry_id, text: "Something else.", after: opening.head_entry_id });
    expect(stale.status).toBe(409);
    expect(await message(stale)).toMatch(/moved on/);
    const reply = played.exchanges.at(-1)!.reply!;
    const empty = await edit({ entry: reply.entry_id, text: "  ", after: played.head_entry_id });
    expect(empty.status).toBe(400);
    expect(await message(empty)).toMatch(/needs the words/);
    const same = await edit({ entry: reply.entry_id, text: reply.text, after: played.head_entry_id });
    expect(same.status).toBe(400);
    expect(await message(same)).toMatch(/already says/);
    const note = home.tree.pathTo(played.head_entry_id).find(entry => entry.payload.kind === "beat_note")!;
    const notAPassage = await edit({ entry: note.id, text: "A plan.", after: played.head_entry_id });
    expect(notAPassage.status).toBe(400);
    expect(await message(notAPassage)).toMatch(/Only a Move or a Reply/);
    expect((await edit({ entry: reply.entry_id, after: played.head_entry_id })).status).toBe(400);
  });
});
