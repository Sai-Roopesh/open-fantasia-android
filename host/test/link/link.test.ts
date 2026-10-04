import { afterEach, describe, expect, it } from "vitest";
import { ScriptedRunner } from "../../src/models/scripted.js";
import { CONTRACT_VERSION } from "../../src/protocol/generated/contract.js";
import type { SceneView } from "../../src/protocol/generated/link.js";
import { Traces } from "../../src/trace.js";
import { GatedRunner, openStream, runningMac, type ReceivedEvent } from "../support/link.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function mac(actor?: ConstructorParameters<typeof ScriptedRunner>[0] | GatedRunner) {
  const running = await runningMac(actor instanceof GatedRunner ? actor : new ScriptedRunner(actor ?? []));
  closers.push(running.close);
  return running;
}

/** What the phone ends up showing as the Reply, from the events it received. */
function shownReply(events: ReceivedEvent[]): string {
  let writing = "";
  let finished: string | null = null;
  for (const { event } of events) {
    if (event.kind === "reply_started") writing = "";
    if (event.kind === "reply_delta") writing += event.text;
    if (event.kind === "reply") finished = event.passage!.text;
  }
  return finished ?? writing;
}

describe("mac-link", () => {
  // WHEN the player runs the pairing command on the Mac and scans the QR code it shows with the phone
  // THEN the phone lists the Mac's Stories
  it("mac-link › Pairing happens once, by QR code › First pairing", async () => {
    const { call } = await mac();
    const response = await call("/stories");
    expect(response.status).toBe(200);
    expect((await response.json() as { stories: { title: string }[] }).stories.map(story => story.title)).toEqual(["The Malfoy Problem"]);
  });

  // WHEN a device that never paired sends a Move to the Mac
  // THEN the Mac refuses it and nothing changes
  it("mac-link › Pairing happens once, by QR code › An unpaired phone", async () => {
    const { base, storyId, mac: store, headers } = await mac();
    const before = store.db.prepare("SELECT COUNT(*) AS n FROM entries").get();
    const response = await fetch(`${base}/stories/${storyId}/moves`, {
      method: "POST",
      headers: { ...headers, authorization: "Bearer not-a-token" },
      body: JSON.stringify({ text: "I wave.", after: store.tree.currentPath(storyId)!.headEntryId })
    });
    expect(response.status).toBe(401);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("unpaired");
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM entries").get()).toEqual(before);
  });

  // WHEN the Mac starts writing a Reply
  // THEN the phone shows its words as they are written, in order
  it("mac-link › A Story's changes reach the phone live and in order › A Reply arrives live", async () => {
    const { base, headers, storyId, call } = await mac([{ answer: "She sets down her glass and does not look at you." }]);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    const stream = openStream(base, storyId, headers, String(scene.seq));
    closers.push(stream.close);
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I raise my glass.", after: scene.head_entry_id }) });
    await stream.until(events => events.some(event => event.event.kind === "reply"));
    const kinds = stream.received.map(event => event.event.kind);
    expect(kinds[0]).toBe("move");
    expect(kinds[1]).toBe("reply_started");
    expect(kinds.filter(kind => kind === "reply_delta").length).toBeGreaterThan(3);
    expect(kinds.at(-1)).toBe("reply");
    const deltas = stream.received.filter(event => event.event.kind === "reply_delta").map(event => event.event.text).join("");
    expect(deltas).toBe("She sets down her glass and does not look at you.");
  });

  // GIVEN the connection drops while a Reply is being written and returns after the Reply is finished
  // THEN the phone shows the whole finished Reply and everything after it, with nothing missing or repeated
  it("mac-link › A dropped connection loses nothing › Wi-Fi drops mid-Reply", async () => {
    const words = ["She ", "turns ", "the ", "glass ", "in ", "her ", "fingers."];
    const actor = new GatedRunner(words);
    const { base, headers, storyId, call, engine } = await mac(actor);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    const first = openStream(base, storyId, headers, String(scene.seq));
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I wait.", after: scene.head_entry_id }) });
    await actor.ready();
    actor.release(3);
    await first.until(events => events.filter(event => event.event.kind === "reply_delta").length === 3);
    await first.close();

    // The Reply finishes while the phone is away.
    for (let index = 3; index < words.length; index++) {
      await actor.ready();
      actor.release();
    }
    await engine.settled(storyId);

    const second = openStream(base, storyId, headers, first.received.at(-1)!.id);
    closers.push(second.close);
    await second.until(events => events.some(event => event.event.kind === "reply"));
    const all = [...first.received, ...second.received];
    expect(new Set(all.map(event => event.id)).size).toBe(all.length);
    expect(shownReply(all)).toBe(words.join(""));
  });

  it("resumes a Reply still being written from the word the phone last saw", async () => {
    const words = ["One ", "two ", "three ", "four ", "five."];
    const actor = new GatedRunner(words);
    const { base, headers, storyId, call, engine } = await mac(actor);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    const first = openStream(base, storyId, headers, String(scene.seq));
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "Count.", after: scene.head_entry_id }) });
    await actor.ready();
    actor.release(2);
    await first.until(events => events.filter(event => event.event.kind === "reply_delta").length === 2);
    await first.close();
    await actor.ready();
    actor.release();
    await actor.ready();

    const second = openStream(base, storyId, headers, first.received.at(-1)!.id);
    closers.push(second.close);
    await second.until(events => events.filter(event => event.event.kind === "reply_delta").length === 1);
    actor.release(2);
    await engine.settled(storyId);
    await second.until(events => events.some(event => event.event.kind === "reply"));
    const all = [...first.received, ...second.received];
    expect(new Set(all.map(event => event.id)).size).toBe(all.length);
    expect(all.filter(event => event.event.kind === "reply_delta").map(event => event.event.text).join("")).toBe(words.join(""));
  });

  // GIVEN the Mac speaks a newer contract than the app
  // WHEN the app connects
  // THEN the app says it needs updating to match the Mac
  it("mac-link › The phone and the Mac agree on what they speak › An old app", async () => {
    const { call } = await mac();
    const response = await call("/stories", { headers: { "fantasia-contract": "0" } });
    expect(response.status).toBe(426);
    const body = await response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe("version_mismatch");
    expect(body.error.message).toMatch(/Update the app to match your Mac/);
    expect(response.headers.get("fantasia-contract")).toBe(String(CONTRACT_VERSION));
  });

  // GIVEN the app showed a failure with its trace id
  // WHEN that trace id is looked up on the Mac
  // THEN the Mac shows what was asked, what happened, and any model call involved
  it("mac-link › Every request is answered or refused with a reason › Looking up a failure", async () => {
    const { call, storyId, engine, mac: store } = await mac([{ fail: "Claude is overloaded" }]);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    const accepted = await (await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I wave.", after: scene.head_entry_id }) })).json() as { trace_id: string };
    await engine.settled(storyId);
    const failed = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    expect(failed.turn.trace_id).toBe(accepted.trace_id);
    const described = new Traces(store.db).describe(failed.turn.trace_id!)!;
    expect(described).toContain(`POST /stories/${storyId}/moves`);
    expect(described).toContain("I wave.");
    expect(described).toContain("Failed: Claude is overloaded");
    expect(described).toContain("System prompt:");
  });

  it("refuses a Move while a Reply is being written, with a reason and a trace id", async () => {
    const actor = new GatedRunner(["Slowly."]);
    const { call, storyId, engine } = await mac(actor);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I wave.", after: scene.head_entry_id }) });
    const refused = await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I wave again.", after: scene.head_entry_id }) });
    expect(refused.status).toBe(409);
    const body = await refused.json() as { error: { message: string; trace_id: string } };
    expect(body.error.message).toMatch(/still being written/);
    expect(body.error.trace_id).toMatch(/\w+/);
    await actor.ready();
    actor.release();
    await engine.settled(storyId);
  });

  it("ends a Scene, sets Focus and Linger, and redoes a Reply, each change reaching the phone live", async () => {
    const { base, headers, storyId, call, engine } = await mac([{ answer: "Draconia laughs." }, { answer: "Hermione does not laugh." }]);
    const post = async (path: string, body: unknown) => {
      const response = await call(`/stories/${storyId}/${path}`, { method: "POST", body: JSON.stringify(body) });
      expect(response.status, path).toBe(200);
      return await response.json() as { head_entry_id: string; trace_id: string };
    };
    const view = async () => await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    const stream = openStream(base, storyId, headers, String((await view()).seq));
    closers.push(stream.close);

    await post("moves", { text: "I raise my glass.", after: (await view()).head_entry_id });
    await engine.settled(storyId);
    const focused = await post("focus", { after: (await view()).head_entry_id, on: "Hermione Granger" });
    expect(focused.head_entry_id).toBe((await view()).head_entry_id);
    await post("linger", { after: (await view()).head_entry_id, on: true });
    expect(await view()).toMatchObject({ focus: "Hermione Granger", linger: true, day_view: null });

    await post("redo", { after: (await view()).head_entry_id, direction: "less Draconia", remember: false });
    await engine.settled(storyId);
    expect((await view()).exchanges.at(-1)!.reply!.text).toBe("Hermione does not laugh.");

    await post("end-scene", { after: (await view()).head_entry_id });
    expect((await view()).day_view).toMatchObject({ place: "The Three Broomsticks" });
    await stream.until(events => events.some(event => event.event.kind === "scene_closed"));
    const kinds = stream.received.map(event => event.event.kind).filter(kind => kind !== "reply_delta");
    expect(kinds).toEqual(["move", "reply_started", "reply", "focus_set", "linger_set", "redo", "reply_started", "reply", "scene_closed"]);
    expect(stream.received.find(event => event.event.kind === "focus_set")!.event.focus).toBe("Hermione Granger");
    expect(stream.received.find(event => event.event.kind === "scene_closed")!.event.day_view).toMatchObject({ place: "The Three Broomsticks" });
  });

  it("refuses End scene, Focus, Linger and Redo while a Reply is being written, with the reason", async () => {
    const actor = new GatedRunner(["Slowly."]);
    const { call, storyId, engine } = await mac(actor);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "I wave.", after: scene.head_entry_id }) });
    for (const [path, body] of [["end-scene", {}], ["focus", { on: "Hermione Granger" }], ["linger", { on: true }], ["redo", { direction: null, remember: false }]] as const) {
      const refused = await call(`/stories/${storyId}/${path}`, { method: "POST", body: JSON.stringify({ after: scene.head_entry_id, ...body }) });
      expect(refused.status, path).toBe(409);
      expect((await refused.json() as { error: { message: string } }).error.message, path).toMatch(/still being written/);
    }
    await actor.ready();
    actor.release();
    await engine.settled(storyId);
  });

  it("refuses a command that does not match the contract", async () => {
    const { call, storyId } = await mac();
    for (const [path, body] of [["end-scene", {}], ["focus", { after: "x" }], ["linger", { after: "x", on: "yes" }], ["redo", { after: "x", direction: "less" }]] as const) {
      const refused = await call(`/stories/${storyId}/${path}`, { method: "POST", body: JSON.stringify(body) });
      expect(refused.status, path).toBe(400);
    }
  });

  it("says in the Scene view how far into a Reply it is, so reading it mid-Reply repeats no word", async () => {
    const words = ["One ", "two ", "three ", "four."];
    const actor = new GatedRunner(words);
    const { base, headers, storyId, call, engine } = await mac(actor);
    const scene = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    await call(`/stories/${storyId}/moves`, { method: "POST", body: JSON.stringify({ text: "Count.", after: scene.head_entry_id }) });
    await actor.ready();
    actor.release(2);
    await actor.ready();
    const midway = await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
    expect(midway.turn).toMatchObject({ kind: "writing", text_so_far: "One two " });
    expect(midway.last_event_id).toMatch(/^\d+\.2$/);
    actor.release();
    await actor.ready();
    const stream = openStream(base, storyId, headers, midway.last_event_id);
    closers.push(stream.close);
    await stream.until(events => events.some(event => event.event.kind === "reply_delta"));
    actor.release();
    await engine.settled(storyId);
    await stream.until(events => events.some(event => event.event.kind === "reply"));
    expect(stream.received.filter(event => event.event.kind === "reply_delta").map(event => event.event.text).join("")).toBe("three four.");
    expect(stream.received.some(event => event.event.kind === "reply_started")).toBe(false);
  });
});
