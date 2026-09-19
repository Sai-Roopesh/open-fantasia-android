import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const SERVICE = "com.openfantasia.continuity-host";
const ACCOUNT = "host-auth-pepper";
const CLAUDE_TOKEN_ACCOUNT = "claude-oauth-token";

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

/**
 * Stores a secret without ever putting it on the command line.
 *
 * `security add-generic-password -w` with no inline value prompts twice — the password and a retype —
 * and reads both from stdin, so the value has to be sent twice or the write fails with "passwords
 * don't match" and silently stores nothing. Passing the value inline via `-w <value>` would work but
 * leak it into the process list. This answers both prompts instead.
 */
function storeSecret(account, label, value) {
  return runSecurity([
    "add-generic-password", "-U", "-a", account, "-s", SERVICE,
    "-l", label, "-T", "/usr/bin/security", "-w"
  ], `${value}\n${value}`);
}

export async function getHostAuthPepper() {
  return runSecurity(["find-generic-password", "-a", ACCOUNT, "-s", SERVICE, "-w"]);
}

export async function ensureHostAuthPepper() {
  try {
    return await getHostAuthPepper();
  } catch {
    const secret = randomBytes(32).toString("base64url");
    await storeSecret(ACCOUNT, "Open Fantasia Continuity Host", secret);
    return secret;
  }
}

/**
 * The long-lived Claude subscription token (`claude setup-token`), if one has been stored.
 *
 * An interactive `claude auth login` session expires every few days and cannot refresh unattended,
 * which took Claude continuity and every Claude roleplay model down twice. A setup-token is minted for
 * exactly this — a headless subscription that does not expire on the session clock. The host injects
 * it as CLAUDE_CODE_OAUTH_TOKEN, the one auth variable `subscriptionOnlyEnvironment` deliberately
 * keeps. Returns null when none is stored, so the host falls back to the interactive login.
 */
export async function getClaudeOAuthToken() {
  try {
    const token = await runSecurity(["find-generic-password", "-a", CLAUDE_TOKEN_ACCOUNT, "-s", SERVICE, "-w"]);
    return token || null;
  } catch {
    return null;
  }
}

export async function setClaudeOAuthToken(token) {
  const value = String(token ?? "").trim();
  if (!value) throw new Error("Refusing to store an empty Claude token");
  await storeSecret(CLAUDE_TOKEN_ACCOUNT, "Open Fantasia Claude Token", value);
}
