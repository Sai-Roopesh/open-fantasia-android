import { spawn, type ChildProcess } from "node:child_process";
import { Engine } from "../engine/engine.js";
import { advertise } from "../link/bonjour.js";
import { Pairing } from "../link/pairing.js";
import { buildLink } from "../link/server.js";
import { ensureCertificate } from "../link/tls.js";
import type { Mac } from "../mac.js";
import { Catalog } from "../models/catalog.js";
import { scriptedRunners, subscriptionRunners } from "../models/runners.js";
import { FakeModels, fakeReply } from "../models/fake.js";
import { Models } from "../models/model-call.js";
import { identity } from "./identity.js";

/** Keeps the Mac awake while work is under way, and lets it sleep again when there is none. */
function keepAwake(): (busy: boolean) => void {
  let caffeinate: ChildProcess | null = null;
  return busy => {
    if (busy && !caffeinate) caffeinate = spawn("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" });
    if (!busy && caffeinate) {
      caffeinate.kill();
      caffeinate = null;
    }
  };
}

/** `fantasia serve`: the Mac's link, its engine and its Bonjour advertisement, until stopped. */
export async function serve(mac: Mac, options: { port?: number; fakeModels: boolean }): Promise<void> {
  const me = identity(mac.home, options.port);
  const certificate = await ensureCertificate(mac.home);
  // Scripted models play the app without spending quota: the Writer keeps every rule and each Reply quotes its Move.
  const runners = options.fakeModels ? scriptedRunners(new FakeModels({}, fakeReply)) : subscriptionRunners(mac.home);
  const engine = new Engine(mac, new Models(mac.db, runners), keepAwake());
  // What each provider offers, asked now and every hour; the last list each gave is kept for when it cannot be asked.
  const catalog = new Catalog(mac.home, {
    claude: () => runners.claude.listModels(), codex: () => runners.codex.listModels(), antigravity: () => runners.antigravity.listModels()
  });
  const stopCataloguing = catalog.start();
  const app = buildLink({ mac, engine, pairing: new Pairing(mac.db), catalog, hostId: me.hostId, hostName: me.hostName, https: certificate });
  await app.listen({ port: me.port, host: "0.0.0.0" });
  // Every Scene's end left unfinished when the host last stopped goes on from its next step, in the background.
  engine.resumeAll();
  // What the Mac's commands change in the store reaches the phones watching (openspec stories).
  const stopWatching = engine.watchStore();
  const stopAdvertising = advertise(me.hostId, me.hostName, me.port);
  console.log(`Open Fantasia is serving on port ${me.port} as ${me.hostName}${options.fakeModels ? ", with scripted models" : ""}.`);

  const stop = async () => {
    stopAdvertising();
    stopWatching();
    stopCataloguing();
    await app.close();
    runners.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
