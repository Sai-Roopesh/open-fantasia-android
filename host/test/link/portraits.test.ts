import { afterEach, describe, expect, it } from "vitest";
import type { PeopleView, SceneView, WorldView } from "../../src/protocol/generated/link.js";
import { runningMac } from "../support/link.js";

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("an image of Daphne")]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("an image of Draconia")]);

async function mac() {
  const running = await runningMac();
  closers.push(running.close);
  const { call, storyId, engine, mac: home } = running;
  const view = async () => await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
  const upload = async (name: string, body: Buffer, type: string) =>
    await call(`/stories/${storyId}/people/${encodeURIComponent(name)}/portrait?after=${(await view()).head_entry_id}`, { method: "PUT", body, headers: { "content-type": type } });
  const message = async (response: Response) => (await response.json() as { error: { message: string } }).error.message;
  return { ...running, view, upload, message, engine, home };
}

describe("Portraits uploaded from the phone", () => {
  // WHEN the player uploads an image from the phone for Daphne Greengrass
  // THEN it is her Portrait everywhere she appears
  it("stories › Portraits are real images › Uploading a Portrait", async () => {
    const { engine, storyId, call, view, upload } = await mac();
    engine.setPerson(storyId, { name: "Daphne Greengrass", aliases: [], whoTheyAre: "A Slytherin who keeps her own counsel.", known: "A Slytherin girl.", appearance: "", after: "", knows: [], voice: [], group: null }, (await view()).head_entry_id, "t", true);
    const uploaded = await upload("Daphne Greengrass", PNG, "image/png");
    expect(uploaded.status).toBe(200);
    const people = await (await call(`/stories/${storyId}/people`)).json() as PeopleView;
    const url = people.people.find(person => person.name === "Daphne Greengrass")!.portrait_url!;
    expect(url).toMatch(/\.png$/);
    // He knows of her, so she is on the World screen too, with the same Portrait.
    const world = await (await call(`/stories/${storyId}/world`)).json() as WorldView;
    expect(world.people.find(person => person.name === "Daphne Greengrass")?.portrait_url).toBe(url);
    const image = Buffer.from(await (await call(url)).arrayBuffer());
    expect(image.equals(PNG)).toBe(true);
  });

  it("replaces a Portrait from that moment onward, the earlier one still there at earlier moments", async () => {
    const { view, upload, home } = await mac();
    const before = (await view()).head_entry_id;
    const old = (await view()).scene.people.find(person => person.name === "Draconia Malfoy")!.portrait_url;
    expect((await upload("Draconia Malfoy", JPEG, "image/jpeg")).status).toBe(200);
    const now = (await view()).scene.people.find(person => person.name === "Draconia Malfoy")!.portrait_url;
    expect(now).not.toBe(old);
    expect(now).toMatch(/\.jpg$/);
    expect(home.states.at(before).people["Draconia Malfoy"]!.portrait).toBe(old!.split("/").at(-1));
  });

  it("refuses a type it does not take, an image over 10 MB, bytes that are not the type they say, and someone not in the Story", async () => {
    const { upload, message } = await mac();
    const gif = await upload("Draconia Malfoy", Buffer.from("GIF89a..."), "image/gif");
    expect(gif.status).toBe(400);
    expect(await message(gif)).toBe("A Portrait is a JPEG, PNG or WebP image.");
    const lying = await upload("Draconia Malfoy", Buffer.from("not really a png"), "image/png");
    expect(await message(lying)).toBe("That file is not the PNG image it says it is.");
    const big = await upload("Draconia Malfoy", Buffer.concat([PNG, Buffer.alloc(10 * 1024 * 1024)]), "image/png");
    expect(big.status).toBe(400);
    expect(await message(big)).toBe("A Portrait can be at most 10 MB.");
    const nobody = await upload("Gilderoy Lockhart", PNG, "image/png");
    expect(await message(nobody)).toBe("Gilderoy Lockhart is not in the Story.");
  }, 20_000);
});
