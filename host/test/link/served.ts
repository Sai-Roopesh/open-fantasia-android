import type { AddressInfo } from "node:net";
import { buildLink } from "../../src/link/server.js";
import { Pairing } from "../../src/link/pairing.js";
import { CONTRACT_VERSION } from "../../src/protocol/generated/contract.js";
import type { SceneView } from "../../src/protocol/generated/link.js";
import { offeredCatalog } from "../support/link.js";
import type { playable } from "../support/play.js";

/**
 * A playable Story served over the link to a paired phone: its scripted models answer every agent, the Folder too,
 * and each agent's answers can be scripted (playable's), where `runningMac` scripts only the Actor and the Writer.
 * Call `close` when done.
 */
export async function served(story: ReturnType<typeof playable>) {
  const { mac, engine, storyId } = story;
  const pairing = new Pairing(mac.db);
  const catalog = await offeredCatalog(mac.home);
  const app = buildLink({ mac, engine, pairing, catalog, hostId: "mac-1", hostName: "Test Mac" });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  const invite = pairing.invite({ hostId: "mac-1", hostName: "Test Mac", addresses: ["127.0.0.1"], port: 0, fingerprint: "test" });
  const paired = await fetch(`${base}/pair`, { method: "POST", headers: { "content-type": "application/json", "fantasia-contract": String(CONTRACT_VERSION) }, body: JSON.stringify({ code: invite.code, device_name: "Pixel" }) });
  const { device_token: token } = await paired.json() as { device_token: string };
  const headers = { "content-type": "application/json", "fantasia-contract": String(CONTRACT_VERSION), authorization: `Bearer ${token}` };
  const call = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  const scene = async () => await (await call(`/stories/${storyId}/scene`)).json() as SceneView;
  /** POSTs to the Story, answering with the status and the body. */
  const post = async <T = Record<string, unknown>>(path: string, body: unknown) => {
    const response = await call(`/stories/${storyId}/${path}`, { method: "POST", body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as T };
  };
  return { ...story, catalog, app, base, headers, call, scene, post, close: () => app.close() };
}
