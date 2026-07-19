import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const SERVICE = "com.openfantasia.continuity-host";
const ACCOUNT = "host-auth-pepper";

function runSecurity(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/security", args, { stdio: ["pipe", "pipe", "ignore"] });
    let stdout = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`macOS Keychain operation failed (${code})`)));
    child.stdin.end(input === undefined ? "" : `${input}\n`);
  });
}

export async function getHostAuthPepper() {
  return runSecurity(["find-generic-password", "-a", ACCOUNT, "-s", SERVICE, "-w"]);
}

export async function ensureHostAuthPepper() {
  try {
    return await getHostAuthPepper();
  } catch {
    const secret = randomBytes(32).toString("base64url");
    await runSecurity([
      "add-generic-password", "-U", "-a", ACCOUNT, "-s", SERVICE,
      "-l", "Open Fantasia Continuity Host", "-T", "/usr/bin/security", "-w"
    ], secret);
    return secret;
  }
}
