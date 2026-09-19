#!/usr/bin/env node
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { DeviceRegistry, DurableJobStore } from "./host-lib.mjs";
import { ensureHostAuthPepper, setClaudeOAuthToken } from "./keychain.mjs";

const root = process.env.OPEN_FANTASIA_HOST_ROOT || join(homedir(), "Library", "Application Support", "OpenFantasia", "continuity-host", "v1");
const command = process.argv[2] ?? "status";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function runQr(program, args, value) {
  return new Promise(resolve => {
    const child = spawn(program, args, { stdio: ["pipe", "inherit", "ignore"] });
    child.on("error", () => resolve(false));
    child.on("close", code => resolve(code === 0));
    child.stdin.on("error", () => {});
    child.stdin.end(value);
  });
}

async function printQr(value) {
  if (await runQr("qrencode", ["-t", "ANSIUTF8"], value)) return;
  const script = "import sys,qrcode; q=qrcode.QRCode(border=1); q.add_data(sys.stdin.read()); q.make(); q.print_ascii(invert=True)";
  if (await runQr("python3", ["-c", script], value)) return;
  console.log("QR display is unavailable; enter the address and pairing code in Android Settings.");
}

async function registry() {
  const pepper = await ensureHostAuthPepper();
  const value = new DeviceRegistry(join(root, "auth"), () => Date.now(), pepper);
  await value.init();
  return value;
}

async function main() {
  if (command === "init") {
    await ensureHostAuthPepper();
    console.log("Mac Host credentials initialized in macOS Keychain.");
    return;
  }
  if (command === "pair") {
    const endpoint = option("--endpoint");
    if (!endpoint?.startsWith("https://")) throw new Error("pair requires --endpoint https://<tailscale-host>");
    const pairing = await (await registry()).createPairing({ endpoint });
    const uri = `openfantasia://continuity/pair?endpoint=${encodeURIComponent(endpoint)}&code=${encodeURIComponent(pairing.code)}`;
    console.log(`Pairing code: ${pairing.code}`);
    console.log(`Expires: ${new Date(pairing.expires_at).toISOString()}`);
    console.log(`Pairing link: ${uri}`);
    await printQr(uri);
    return;
  }
  if (command === "devices") {
    const devices = await (await registry()).listDevices();
    if (devices.length === 0) console.log("No paired phones.");
    else devices.forEach(device => console.log(`${device.id}\t${device.revoked_at ? "revoked" : "active"}\t${device.name}`));
    return;
  }
  if (command === "set-claude-token") {
    // Reads the token on stdin so it never appears in the process list. Stored in the Keychain and
    // injected by the host as CLAUDE_CODE_OAUTH_TOKEN — a long-lived subscription that does not expire
    // on the interactive-session clock the way `claude auth login` does.
    const token = await new Promise(resolve => {
      let value = "";
      process.stdin.on("data", chunk => { value += chunk; });
      process.stdin.on("end", () => resolve(value.trim()));
    });
    if (!token) throw new Error("No token on stdin. Run `claude setup-token` and pass its token in.");
    await setClaudeOAuthToken(token);
    console.log("Stored the long-lived Claude token. Restart the host to use it: fantasia-host on");
    return;
  }
  if (command === "revoke") {
    const deviceId = process.argv[3];
    if (!deviceId) throw new Error("revoke requires a device id");
    const revoked = await (await registry()).revokeDevice(deviceId);
    if (!revoked) throw new Error("Unknown device id");
    console.log(`Revoked ${deviceId}`);
    return;
  }
  if (command === "status") {
    const store = new DurableJobStore(join(root, "spool"));
    // This process is an observer, not a replacement host. Recovering "interrupted" work here
    // would relabel jobs that are still running in the launch-agent process.
    await store.init({ recoverInterrupted: false });
    const summary = await store.summary();
    console.log(`Queue: ${summary.queue_depth} (${summary.continuity_queue_depth} continuity, ${summary.roleplay_queue_depth} roleplay, ${summary.portrait_queue_depth} portrait)`);
    if (summary.active_jobs.length === 0) console.log("Active: idle");
    else summary.active_jobs.forEach(job => {
      const elapsed = job.started_at ? `, ${Math.max(0, Math.round((Date.now() - job.started_at) / 1000))}s` : "";
      console.log(`Active: ${job.job_type} ${job.request_id} (${job.status}${elapsed})`);
    });
    return;
  }
  throw new Error("Usage: host-cli.mjs {init|pair --endpoint URL|devices|revoke ID|set-claude-token|status}");
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
