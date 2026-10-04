import { spawn, type ChildProcess } from "node:child_process";
import { Engine } from "../engine/engine.js";
import { advertise } from "../link/bonjour.js";
import { Pairing } from "../link/pairing.js";
import { buildLink } from "../link/server.js";
import { ensureCertificate } from "../link/tls.js";
import type { Mac } from "../mac.js";
import { ClaudeRunner } from "../models/claude.js";
import { Models, type ModelRunner } from "../models/model-call.js";
import { ScriptedRunner } from "../models/scripted.js";
import { CLAUDE_TOKEN, readSecret } from "../secrets.js";
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

/**
 * A model for playing the app without spending quota: it answers every Move with a line that quotes it, so the
 * phone's end-to-end tests can see which Move a Reply answers.
 */
function fakeModels(): ModelRunner {
  return new ScriptedRunner([], request => {
    const move = /<move by="[^"]*">\n([\s\S]*?)\n<\/move>\n\nWrite what happens next\.$/.exec(request.prompt)?.[1] ?? "";
    return { answer: `(A scripted Reply.) They hear you say: ${move.slice(0, 80)}` };
  });
}

/** `fantasia serve`: the Mac's link, its engine and its Bonjour advertisement, until stopped. */
export async function serve(mac: Mac, options: { port?: number; fakeModels: boolean }): Promise<void> {
  const me = identity(mac.home, options.port);
  const certificate = await ensureCertificate(mac.home);
  const runners = options.fakeModels ? { claude: fakeModels() } : { claude: new ClaudeRunner(mac.home, () => readSecret(CLAUDE_TOKEN)) };
  const engine = new Engine(mac, new Models(mac.db, runners), keepAwake());
  const app = buildLink({ mac, engine, pairing: new Pairing(mac.db), hostId: me.hostId, hostName: me.hostName, https: certificate });
  await app.listen({ port: me.port, host: "0.0.0.0" });
  const stopAdvertising = advertise(me.hostId, me.hostName, me.port);
  console.log(`Open Fantasia is serving on port ${me.port} as ${me.hostName}${options.fakeModels ? ", with scripted models" : ""}.`);

  const stop = async () => {
    stopAdvertising();
    await app.close();
    if ("claude" in runners && runners.claude instanceof ClaudeRunner) runners.claude.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
