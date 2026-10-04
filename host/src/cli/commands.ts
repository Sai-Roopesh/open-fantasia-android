import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import qrcode from "qrcode-terminal";
import { localAddresses } from "../link/bonjour.js";
import { Pairing, PAIRING_MINUTES } from "../link/pairing.js";
import { ensureCertificate } from "../link/tls.js";
import type { Mac } from "../mac.js";
import { CLAUDE_TOKEN, readSecret, storeSecret } from "../secrets.js";
import { importStoryFile } from "../storyfile/import.js";
import { Traces } from "../trace.js";
import { listStories } from "../views/stories.js";
import { identity } from "./identity.js";

/** Everything a command prints, so tests can read it and the terminal can show it. */
export type Out = (line: string) => void;

/**
 * Shows a pairing QR code, or with [adb], the adb command that hands a debug build the same invite without a camera.
 */
export async function pair(mac: Mac, out: Out, options: { adb?: boolean } = {}): Promise<void> {
  const me = identity(mac.home);
  const certificate = await ensureCertificate(mac.home);
  const invite = new Pairing(mac.db).invite({ hostId: me.hostId, hostName: me.hostName, addresses: localAddresses(), port: me.port, fingerprint: certificate.fingerprint });
  const text = JSON.stringify(invite);
  if (options.adb) {
    out(`adb shell am start -n com.openfantasia/com.openfantasia.app.MainActivity --es invite_b64 ${Buffer.from(text).toString("base64")}`);
    return;
  }
  await new Promise<void>(done => qrcode.generate(text, { small: true }, (code: string) => {
    out(code);
    done();
  }));
  out(`Scan this with Open Fantasia on your phone within ${PAIRING_MINUTES} minutes. It works once.`);
}

export function importCommand(mac: Mac, folder: string, out: Out): boolean {
  const result = importStoryFile(resolve(folder), mac);
  if (result.ok) {
    out(`Imported "${listStories(mac).find(story => story.id === result.storyId)?.title}" as ${result.storyId}.`);
    return true;
  }
  out(`Nothing was imported. ${result.problems.length === 1 ? "One problem" : `${result.problems.length} problems`}:`);
  for (const problem of result.problems) out(`  ${problem.where}: ${problem.message}`);
  return false;
}

export function stories(mac: Mac, out: Out): void {
  const all = listStories(mac);
  if (all.length === 0) out("No Stories yet. Import one with `fantasia import <folder>`.");
  for (const story of all) out(`${story.id}  ${story.title}  (${story.standing})`);
}

export function show(mac: Mac, storyId: string, entryId: string | undefined, out: Out): boolean {
  if (entryId) {
    const entry = mac.tree.entry(entryId);
    if (!entry || entry.storyId !== storyId) return (out(`No entry ${entryId} in that Story.`), false);
    out(JSON.stringify(entry, null, 2));
    return true;
  }
  const path = mac.tree.currentPath(storyId);
  if (!path) return (out(`No Story ${storyId}.`), false);
  out(`Path "${path.name}", head ${path.headEntryId}`);
  for (const entry of mac.tree.pathTo(path.headEntryId)) {
    const payload = entry.payload;
    const text = payload.kind === "move" || payload.kind === "reply" ? payload.text : payload.kind === "scene_opened" ? `Scene ${payload.number}: ${payload.title}` : payload.storyFile.title;
    out(`${String(entry.seq).padStart(5)}  ${entry.id}  ${payload.kind.padEnd(13)}  ${text.replace(/\s+/g, " ").slice(0, 90)}`);
  }
  return true;
}

export function trace(mac: Mac, traceId: string, out: Out): boolean {
  const described = new Traces(mac.db).describe(traceId);
  out(described ?? `No trace ${traceId} on this Mac.`);
  return described !== null;
}

/** Stores the Claude subscription token, from the first Open Fantasia's keychain or from what is pasted. */
export function claudeToken(fromFirstHost: boolean, pasted: string | null, out: Out): boolean {
  const token = fromFirstHost
    ? execFileSync("/usr/bin/security", ["find-generic-password", "-s", "com.openfantasia.continuity-host", "-a", "claude-oauth-token", "-w"], { encoding: "utf8" }).trim()
    : pasted?.trim();
  if (!token) return (out("No token given. Run `claude setup-token`, then paste its token into `fantasia claude-token`."), false);
  storeSecret(CLAUDE_TOKEN, "Open Fantasia Claude token", token);
  out("Stored the Claude token in the keychain.");
  return true;
}

const LAUNCH_AGENT = "com.openfantasia.host";

/** Installs `fantasia serve` as a LaunchAgent: started at login and restarted if it stops. */
export function install(mac: Mac, out: Out): void {
  const plist = join(homedir(), "Library", "LaunchAgents", `${LAUNCH_AGENT}.plist`);
  const logs = join(mac.home, "logs");
  mkdirSync(logs, { recursive: true });
  const bin = resolve(import.meta.dirname, "..", "..", "bin", "fantasia.mjs");
  writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCH_AGENT}</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${bin}</string><string>serve</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${process.env.PATH ?? "/usr/bin:/bin"}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${join(logs, "serve.log")}</string>
  <key>StandardErrorPath</key><string>${join(logs, "serve.log")}</string>
</dict>
</plist>
`);
  const domain = `gui/${process.getuid?.() ?? 501}`;
  try {
    execFileSync("/bin/launchctl", ["bootout", `${domain}/${LAUNCH_AGENT}`], { stdio: "ignore" });
  } catch {
    // Not loaded yet; nothing to stop.
  }
  execFileSync("/bin/launchctl", ["bootstrap", domain, plist]);
  out(`Installed and started ${LAUNCH_AGENT}. Logs: ${join(logs, "serve.log")}`);
}

/** What is right and wrong with this Mac's setup, one line each. */
export function doctor(mac: Mac, out: Out): boolean {
  const checks: [string, boolean, string][] = [];
  const stories = (mac.db.prepare("SELECT COUNT(*) AS n FROM stories").get() as { n: number }).n;
  checks.push(["Story store", true, `${join(mac.home, "fantasia.db")}, ${stories} ${stories === 1 ? "Story" : "Stories"}`]);
  const token = readSecret(CLAUDE_TOKEN);
  checks.push(["Claude token", token !== null, token ? "stored" : "missing: run `fantasia claude-token`"]);
  const plist = join(homedir(), "Library", "LaunchAgents", `${LAUNCH_AGENT}.plist`);
  let running = false;
  try {
    running = execFileSync("/bin/launchctl", ["print", `gui/${process.getuid?.() ?? 501}/${LAUNCH_AGENT}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).includes("state = running");
  } catch {
    running = false;
  }
  checks.push(["Serving", running, existsSync(plist) ? (running ? "the LaunchAgent is running" : "the LaunchAgent is installed but not running") : "not installed: run `fantasia install`"]);
  for (const [name, ok, detail] of checks) out(`${ok ? "ok " : "!! "} ${name}: ${detail}`);
  return checks.every(([, ok]) => ok);
}
