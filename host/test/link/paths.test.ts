import { afterEach, describe, expect, it } from "vitest";
import { ScriptedRunner } from "../../src/models/scripted.js";
import type { PathsView, SceneView } from "../../src/protocol/generated/link.js";
import { GatedRunner, openStream, runningMac } from "../support/link.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function mac(actor: ConstructorParameters<typeof ScriptedRunner>[0] | GatedRunner = []) {
  const running = await runningMac(actor instanceof GatedRunner ? actor : new ScriptedRunner(actor));
  closers.push(running.close);
  const { call, storyId } = running;
  const view = async () => await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
  const post = async (path: string, body: unknown = {}) => await call(`/stories/${storyId}/${path}`, { method: "POST", body: JSON.stringify(body) });
  const message = async (response: Response) => (await response.json() as { error: { message: string } }).error.message;
  return { ...running, view, post, message };
}

describe("Paths over the link", () => {
  // GIVEN a Reply is being written
  // WHEN the player Rewinds to an earlier Reply
  // THEN the Story says a Reply is being written and stays where it is
  it("paths › A Path changes only between Replies › Rewinding while a Reply is written", async () => {
    const actor = new GatedRunner(["Slowly."]);
    const { storyId, engine, mac: home, view, post, message, call } = await mac(actor);
    const opening = await view();
    const reply = opening.exchanges[0]!.reply!.entry_id;
    await post("moves", { text: "I wave.", after: opening.head_entry_id });
    const before = home.tree.paths(storyId);
    const main = before[0]!;
    const attempts: [string, () => Promise<Response>][] = [
      ["rewind", () => post("rewind", { to: reply, after: opening.head_entry_id })],
      ["try another way", () => post("paths", { from: reply, after: opening.head_entry_id })],
      ["start again", () => post("paths", { from: null, after: opening.head_entry_id })],
      ["open", () => post(`paths/${main.id}/open`)],
      ["delete", () => call(`/stories/${storyId}/paths/${main.id}`, { method: "DELETE", body: "{}" })],
      ["clear", () => post("paths/clear")]
    ];
    for (const [name, attempt] of attempts) {
      const refused = await attempt();
      expect(refused.status, name).toBe(409);
      expect(await message(refused), name).toMatch(/still being written/);
    }
    expect(home.tree.paths(storyId)).toEqual(before);
    await actor.ready();
    actor.release();
    await engine.settled(storyId);
  });

  it("refuses a Path change from a stale head, from anything but a Reply or a Move on the Path, and a Rewind with nothing after it", async () => {
    const { view, post, message, call, storyId, engine, mac: home } = await mac([{ answer: "Draconia laughs." }]);
    const opening = await view();
    await post("moves", { text: "I wave.", after: opening.head_entry_id });
    await engine.settled(storyId);
    const played = await view();
    const note = home.tree.pathTo(played.head_entry_id).find(entry => entry.payload.kind === "beat_note")!.id;
    const latest = played.exchanges.at(-1)!.reply!.entry_id;

    const stale = await post("rewind", { to: opening.exchanges[0]!.reply!.entry_id, after: opening.head_entry_id });
    expect(stale.status).toBe(409);
    expect(await message(stale)).toMatch(/moved on/);
    const notAReply = await post("paths", { from: note, after: played.head_entry_id });
    expect(notAReply.status).toBe(400);
    expect(await message(notAReply)).toMatch(/not a Reply or a Move on this Path/);
    const nothingAfter = await post("rewind", { to: latest, after: played.head_entry_id });
    expect(nothingAfter.status).toBe(400);
    expect(await message(nothingAfter)).toMatch(/Nothing comes after/);
    const current = (await (await call(`/stories/${storyId}/paths`)).json() as PathsView).rows[0]!.path!;
    const deleteCurrent = await call(`/stories/${storyId}/paths/${current.id}`, { method: "DELETE", body: "{}" });
    expect(deleteCurrent.status).toBe(400);
    expect(await message(deleteCurrent)).toMatch(/You are on this Path/);
    expect((await post("paths", { after: played.head_entry_id })).status).toBe(400);
  });

  it("tells every phone the Path changed, and tells a phone that comes back on another Path first", async () => {
    const running = await mac([{ answer: "Draconia laughs." }]);
    const { view, post, call, storyId, base, headers, engine } = running;
    const opening = await view();
    await post("moves", { text: "I wave.", after: opening.head_entry_id });
    await engine.settled(storyId);
    const played = await view();
    const stream = openStream(base, storyId, headers, String(played.seq));
    closers.push(stream.close);

    const tried = await post("paths", { from: opening.exchanges[0]!.reply!.entry_id, after: played.head_entry_id });
    expect(tried.status).toBe(200);
    await stream.until(events => events.some(event => event.event.kind === "path_changed"));
    const changed = stream.received.find(event => event.event.kind === "path_changed")!;
    expect(changed.event.seq).toBe(played.seq);
    const now = await view();
    expect(now.path_id).not.toBe(played.path_id);
    expect(now.head_entry_id).toBe(opening.exchanges[0]!.reply!.entry_id);

    // A phone still showing Main, back after the change, reads the Scene again before anything else.
    const back = openStream(`${base}`, storyId, headers, String(played.seq), played.path_id);
    closers.push(back.close);
    await back.until(events => events.length > 0);
    expect(back.received[0]!.event).toEqual({ kind: "path_changed", seq: played.seq });

    const paths = await (await call(`/stories/${storyId}/paths`)).json() as PathsView;
    expect(paths.rows.filter(row => row.kind === "path").map(row => row.path!.label)).toEqual(["FROM SCENE 1 · TRIED ANOTHER WAY · YOU ARE HERE", "MAIN"]);
  });
  it("tells a phone whose head was edited away or rewound past to read the Scene again, though the Path is the same", async () => {
    const running = await mac([{ answer: "Draconia laughs." }, { answer: "She shrugs." }]);
    const { view, post, storyId, base, headers, engine } = running;
    const opening = await view();
    await post("moves", { text: "I wave.", after: opening.head_entry_id });
    await engine.settled(storyId);
    const played = await view();
    const reply = played.exchanges.at(-1)!.reply!;
    await post("edit", { entry: reply.entry_id, text: "Draconia laughs at him.", after: played.head_entry_id });
    const edited = await view();
    expect(edited.path_id).toBe(played.path_id);

    const stale = openStream(base, storyId, headers, String(played.seq), played.path_id, played.head_entry_id);
    closers.push(stale.close);
    await stale.until(events => events.length > 0);
    expect(stale.received[0]!.event).toMatchObject({ kind: "path_changed" });

    const current = openStream(base, storyId, headers, edited.last_event_id, edited.path_id, edited.head_entry_id);
    closers.push(current.close);
    await post("moves", { text: "I bow.", after: edited.head_entry_id });
    await current.until(events => events.some(event => event.event.kind === "move"));
    expect(current.received.map(event => event.event.kind)).not.toContain("path_changed");
    await engine.settled(storyId);

    await post("rewind", { to: opening.exchanges[0]!.reply!.entry_id, after: (await view()).head_entry_id });
    const rewound = openStream(base, storyId, headers, edited.last_event_id, edited.path_id, edited.head_entry_id);
    closers.push(rewound.close);
    await rewound.until(events => events.length > 0);
    expect(rewound.received[0]!.event).toMatchObject({ kind: "path_changed" });
  });
});
